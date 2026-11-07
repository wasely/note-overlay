const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { normalizeDailyTasks, reconcileConcurrentCompletions } = require("./daily-tasks.cjs");

const SETTINGS_KEY = "githubSync";
const DATA_FILE = "notebook-data.json";
const ACCOUNT = "blixvip";
const REPOSITORY = `${ACCOUNT}/notebook-cloud`;

function validRepository(value) {
  return /^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,38})\/[A-Za-z0-9_.-]{1,100}$/.test(String(value || ""));
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

// Bot health telemetry (check times, failure counters, run/event logs) changes on every monitor
// tick. Counting it as a notebook edit made each 30-second check push, pull, back up, and
// rewrite the whole database, so change detection ignores it. Merging still carries it.
function withoutBotTelemetry(snapshot) {
  delete snapshot.botRuns;
  delete snapshot.botEvents;
  if (!Array.isArray(snapshot.bots)) return;
  for (const bot of snapshot.bots) {
    if (!bot || typeof bot !== "object") continue;
    delete bot.runtime;
    delete bot.derivedState;
    if (Array.isArray(bot.connections)) for (const connection of bot.connections) if (connection && typeof connection === "object") delete connection.credentialVerifiedAt;
    if (Array.isArray(bot.jobs)) for (const job of bot.jobs) if (job && typeof job === "object") delete job.updatedAt;
  }
}

function comparable(value) {
  const copy = clone(value);
  if (copy && typeof copy === "object" && !Array.isArray(copy)) delete copy.exportedAt;
  return copy;
}

// Storage hands rows back in its own order and gives restored tags fresh ids, so for "did the
// data change?" keyed rows compare as sets and note tags compare by name. Merging is unaffected.
// A bare timestamp bump is not an edit either: an older build on another device re-saves
// untouched pages every sync, and treating that as a change rewrote this device every 30s.
const TIMESTAMP_ONLY_FIELDS = new Set(["updated_at", "updatedAt"]);
function orderless(value) {
  if (Array.isArray(value)) {
    const items = value.map(orderless);
    return keyed(items) ? items.sort((left, right) => left.id.localeCompare(right.id)) : items;
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !TIMESTAMP_ONLY_FIELDS.has(key)).map(([key, item]) => [key, orderless(item)]));
}

function changeComparable(value) {
  const copy = comparable(value);
  if (!copy || typeof copy !== "object" || Array.isArray(copy)) return copy;
  if ("bots" in copy || "botRuns" in copy) withoutBotTelemetry(copy);
  // Project "workshop" details are computed from each build's catalog on export, never stored.
  if (Array.isArray(copy.projects)) for (const project of copy.projects) if (project && typeof project === "object") delete project.workshop;
  // Each device creates its own inbox row, so its creation time is not shared data.
  if (Array.isArray(copy.folders)) for (const folder of copy.folders) if (folder?.id === "inbox") delete folder.created_at;
  if (Array.isArray(copy.notes)) {
    for (const note of copy.notes) {
      if (note && Array.isArray(note.tags)) note.tags = [...new Set(note.tags.map((tag) => String(tag?.name || tag).toLowerCase()))].sort();
    }
  }
  return orderless(copy);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(stableValue(comparable(value)));
}

function same(left, right) {
  return stableJson(left) === stableJson(right);
}

// Reads a snapshot the way a device holding `template` stores it: fields it does not keep are
// dropped and fields the snapshot omits fall back to the template's value. Different builds
// write different optional fields and defaults, and those gaps are not edits. New or removed
// rows and changed values still show.
function shapedLike(value, template) {
  if (Array.isArray(value) && Array.isArray(template)) {
    if (!keyed(value) || !keyed(template)) return value;
    const templates = new Map(template.map((item) => [item.id, item]));
    return value.map((item) => templates.has(item.id) ? shapedLike(item, templates.get(item.id)) : item);
  }
  if (!value || !template || typeof value !== "object" || typeof template !== "object" || Array.isArray(value) || Array.isArray(template)) return value;
  return Object.fromEntries(Object.keys(template).map((key) => [key, value[key] === undefined ? template[key] : shapedLike(value[key], template[key])]));
}

function changedPaths(left, right, limit = 20) {
  const paths = [];
  const walk = (a, b, at) => {
    if (paths.length >= limit || JSON.stringify(a) === JSON.stringify(b)) return;
    if (a && b && typeof a === "object" && typeof b === "object") {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[key], b[key], `${at}.${key}`);
    } else paths.push(at);
  };
  walk(stableValue(changeComparable(left)), stableValue(changeComparable(right)), "");
  return paths;
}

// Whole-snapshot check for "did the user's data change?"; telemetry alone never counts.
function sameContent(left, right) {
  return JSON.stringify(stableValue(changeComparable(left))) === JSON.stringify(stableValue(changeComparable(right)));
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(changeComparable(value)))).digest("hex");
}

function keyed(array) {
  return Array.isArray(array) && array.every((item) => item && typeof item === "object" && !Array.isArray(item) && typeof item.id === "string");
}

function mergePrimitiveArray(base, local, remote) {
  const baseValues = new Set(Array.isArray(base) ? base.map(stableJson) : []);
  const localValues = new Map(local.map((item) => [stableJson(item), item]));
  const remoteValues = new Map(remote.map((item) => [stableJson(item), item]));
  const removed = new Set([...baseValues].filter((item) => !localValues.has(item) || !remoteValues.has(item)));
  const ordered = [...local, ...remote];
  const seen = new Set();
  return ordered.filter((item) => {
    const value = stableJson(item);
    if (seen.has(value) || removed.has(value)) return false;
    seen.add(value);
    return true;
  }).map(clone);
}

function mergeKeyedArray(base, local, remote) {
  const baseMap = new Map((Array.isArray(base) ? base : []).map((item) => [item.id, item]));
  const localMap = new Map(local.map((item) => [item.id, item]));
  const remoteMap = new Map(remote.map((item) => [item.id, item]));
  const ids = [...local.map((item) => item.id), ...remote.map((item) => item.id).filter((id) => !localMap.has(id))];
  const output = [];
  for (const id of ids) {
    const before = baseMap.get(id);
    const here = localMap.get(id);
    const there = remoteMap.get(id);
    if (!here && !there) continue;
    if (before && !here && same(there, before)) continue;
    if (before && !there && same(here, before)) continue;
    if (!here) { output.push(clone(there)); continue; }
    if (!there) { output.push(clone(here)); continue; }
    output.push(mergeValue(before, here, there));
  }
  return output;
}

function mergeValue(base, local, remote, preference = "local") {
  if (same(local, remote)) return clone(local);
  if (same(local, base)) return clone(remote);
  if (same(remote, base)) return clone(local);
  if (local === undefined) return clone(remote);
  if (remote === undefined) return clone(local);

  if (Array.isArray(local) && Array.isArray(remote)) {
    if (keyed(local) && keyed(remote) && (!Array.isArray(base) || keyed(base))) return mergeKeyedArray(base, local, remote);
    return mergePrimitiveArray(base, local, remote);
  }

  if (local && remote && typeof local === "object" && typeof remote === "object") {
    const localTime = String(local.updated_at || local.updatedAt || "");
    const remoteTime = String(remote.updated_at || remote.updatedAt || "");
    const nextPreference = remoteTime > localTime ? "remote" : localTime > remoteTime ? "local" : preference;
    const before = base && typeof base === "object" && !Array.isArray(base) ? base : {};
    const output = {};
    for (const key of new Set([...Object.keys(before), ...Object.keys(local), ...Object.keys(remote)])) {
      const value = mergeValue(before[key], local[key], remote[key], nextPreference);
      if (value !== undefined) output[key] = value;
    }
    return output;
  }

  return clone(preference === "remote" ? remote : local);
}

const PROJECT_LOCAL_FIELDS = ["local_path", "localPath", "git_root", "gitRoot", "logo_path", "logoPath", "last_device", "lastDevice"];

function normalizedProjectKeys(project) {
  const keys = new Set();
  const github = String(project?.github_url || project?.githubUrl || "").trim().toLowerCase().replace(/\.git\/?$/, "").replace(/\/$/, "");
  if (github) keys.add(`github:${github}`);
  for (const value of [project?.git_root, project?.gitRoot, project?.local_path, project?.localPath]) {
    const normalized = String(value || "").trim().replaceAll("/", "\\").replace(/\\+$/, "").toLowerCase();
    if (normalized) keys.add(`path:${normalized}`);
  }
  return keys;
}

function sameProject(left, right) {
  const leftKeys = normalizedProjectKeys(left);
  return [...normalizedProjectKeys(right)].some((key) => leftKeys.has(key));
}

function mergeProjectCopies(preferred, incoming) {
  const local = Object.fromEntries(PROJECT_LOCAL_FIELDS.filter((key) => preferred[key] !== undefined).map((key) => [key, clone(preferred[key])]));
  const merged = mergeValue({}, preferred, incoming);
  merged.id = preferred.id;
  Object.assign(merged, local);
  return merged;
}

function coalesceProjects(projects) {
  const output = [];
  for (const project of Array.isArray(projects) ? projects : []) {
    const index = output.findIndex((candidate) => sameProject(candidate, project));
    if (index < 0) output.push(clone(project));
    else output[index] = mergeProjectCopies(output[index], project);
  }
  return output;
}

function mergeSnapshots(base, local, remote) {
  const merged = mergeValue(comparable(base) || {}, comparable(local) || {}, comparable(remote) || {});
  if (Array.isArray(merged.projects)) merged.projects = coalesceProjects(merged.projects);
  if (Array.isArray(merged.dailyTasks)) {
    merged.dailyTasks = normalizeDailyTasks(reconcileConcurrentCompletions(
      merged.dailyTasks,
      base?.dailyTasks,
      local?.dailyTasks,
      remote?.dailyTasks,
    ));
  }
  merged.version = Math.max(Number(base?.version) || 0, Number(local?.version) || 0, Number(remote?.version) || 0);
  merged.exportedAt = new Date().toISOString();
  return merged;
}

function supportedSnapshot(value) {
  return Boolean(value && Number.isInteger(value.version) && Array.isArray(value.notes));
}

function readJson(file, { cloudSnapshot = false } = {}) {
  let contents;
  try { contents = fs.readFileSync(file, "utf8"); }
  catch (error) {
    if (!cloudSnapshot || error.code === "ENOENT") return null;
    throw new Error("The cloud Notebook backup could not be read.", { cause: error });
  }
  let value;
  try { value = JSON.parse(contents); }
  catch (error) {
    if (!cloudSnapshot) return null;
    throw new Error("The cloud repository contains invalid Notebook backup JSON.", { cause: error });
  }
  if (cloudSnapshot && !supportedSnapshot(value)) throw new Error("The cloud repository contains an unsupported Notebook backup.");
  return value;
}

function writeJson(file, value) {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
}

function createGithubSync({ userDataPath, store, run, authStatus, signIn }) {
  const root = path.join(userDataPath, "github-cloud");
  const basePath = path.join(root, "last-synced.json");
  let activeSync = null;

  function saved() {
    return {
      lastPushedAt: null,
      lastPulledAt: null,
      lastSyncedAt: null,
      lastRemoteSha: null,
      lastLocalFingerprint: null,
      ...store.getSetting(SETTINGS_KEY, {}),
      repository: REPOSITORY,
      visibility: "private",
      autoUpload: true,
      autoSync: true,
    };
  }

  async function account({ optional = false } = {}) {
    const auth = await authStatus();
    const matches = auth.authenticated && String(auth.login || "").toLowerCase() === ACCOUNT;
    if (optional && (!auth.available || !matches)) return null;
    if (!auth.available) throw new Error("GitHub CLI is required to sign in on this device.");
    if (!auth.authenticated) throw new Error(`Sign in as @${ACCOUNT} to sync Notebook.`);
    if (!matches) throw new Error(`Notebook cloud belongs to @${ACCOUNT}. Sign in with that account.`);
    return { ...auth, accountMatches: true };
  }

  async function remoteInfo() {
    const result = await run("gh.exe", ["repo", "view", REPOSITORY, "--json", "url,visibility,defaultBranchRef"], { allowFailure: true, timeout: 20_000, stripGithubTokens: true });
    if (result.code) return null;
    try { return JSON.parse(result.stdout); }
    catch { return null; }
  }

  async function status() {
    const auth = await authStatus();
    const accountMatches = auth.authenticated && String(auth.login || "").toLowerCase() === ACCOUNT;
    const remote = accountMatches ? await remoteInfo() : null;
    return {
      ...auth,
      ...saved(),
      expectedLogin: ACCOUNT,
      accountMatches,
      remoteExists: Boolean(remote),
      url: `https://github.com/${REPOSITORY}`,
    };
  }

  async function configure() {
    await account();
    const next = saved();
    store.setSetting(SETTINGS_KEY, next);
    return status();
  }

  async function connect() {
    if (typeof signIn !== "function") throw new Error("GitHub sign-in is unavailable.");
    await signIn(ACCOUNT);
    await configure();
    return sync({ force: true });
  }

  async function commitSnapshot(target, snapshot) {
    writeJson(path.join(target, DATA_FILE), snapshot);
    await run("git.exe", ["add", "README.md", DATA_FILE], { cwd: target, timeout: 30_000, stripGithubTokens: true });
    const changed = await run("git.exe", ["diff", "--cached", "--quiet"], { cwd: target, allowFailure: true, timeout: 30_000, stripGithubTokens: true });
    if (!changed.code) return false;
    await run("git.exe", ["-c", "user.name=Notebook Cloud Sync", "-c", "user.email=notebook@local.invalid", "commit", "-m", `Notebook sync ${new Date().toISOString()}`], { cwd: target, timeout: 30_000, stripGithubTokens: true });
    return true;
  }

  async function attemptSync(local, base, remoteExists) {
    fs.mkdirSync(root, { recursive: true });
    const target = fs.mkdtempSync(path.join(root, "session-"));
    try {
      let remote = null;
      if (remoteExists) {
        await run("gh.exe", ["repo", "clone", REPOSITORY, target, "--", "--depth", "1"], { timeout: 120_000, stripGithubTokens: true });
        remote = readJson(path.join(target, DATA_FILE), { cloudSnapshot: true });
        if (!fs.existsSync(path.join(target, "README.md"))) fs.writeFileSync(path.join(target, "README.md"), "# Notebook cloud\n\nPrivate cross-device data for @blixvip. Account tokens and bot credentials are never stored here.\n", "utf8");
      } else {
        await run("git.exe", ["init", "-b", "main"], { cwd: target, timeout: 30_000, stripGithubTokens: true });
        fs.writeFileSync(path.join(target, "README.md"), "# Notebook cloud\n\nPrivate cross-device data for @blixvip. Account tokens and bot credentials are never stored here.\n", "utf8");
      }

      const merged = mergeSnapshots(base, local, remote);
      if (remote && same(merged, remote)) merged.exportedAt = remote.exportedAt;
      else if (!remote && same(merged, local)) merged.exportedAt = local.exportedAt || merged.exportedAt;
      // Telemetry-only differences are not worth a commit; they ride along with the next real edit.
      const telemetryOnly = Boolean(remote) && !same(merged, remote) && sameContent(shapedLike(merged, remote), remote);
      const changed = telemetryOnly ? false : await commitSnapshot(target, merged);
      if (!remoteExists) {
        await run("gh.exe", ["repo", "create", REPOSITORY, "--private", "--source", target, "--remote", "origin", "--push", "--description", "Private cross-device data for Notebook"], { timeout: 120_000, stripGithubTokens: true });
      } else if (changed) {
        const pushed = await run("git.exe", ["push", "-u", "origin", "HEAD:main"], { cwd: target, allowFailure: true, timeout: 120_000, stripGithubTokens: true });
        if (pushed.code) return { retry: true, merged, remote };
      }
      const head = await run("git.exe", ["rev-parse", "HEAD"], { cwd: target, timeout: 30_000, stripGithubTokens: true });
      return { retry: false, merged, changed, sha: head.stdout.trim() };
    } finally {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }

  async function performSync(options = {}) {
    const auth = await account({ optional: Boolean(options.automatic) });
    if (!auth) return { ...(await status()), skipped: "not-authenticated", changed: false, remoteChanged: false };

    const config = saved();
    const initial = clone(store.exportData());
    let local = initial;
    const localFingerprint = fingerprint(local);
    const remote = await remoteInfo();
    if (!options.force && remote && localFingerprint === config.lastLocalFingerprint) {
      const remoteHead = await run("gh.exe", ["api", `repos/${REPOSITORY}/commits/main`, "--jq", ".sha"], { allowFailure: true, timeout: 20_000, stripGithubTokens: true });
      if (!remoteHead.code && remoteHead.stdout.trim() === config.lastRemoteSha) return { ...await status(), changed: false, remoteChanged: false };
    }

    let base = readJson(basePath);
    let result;
    let exists = Boolean(remote);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      result = await attemptSync(local, base, exists);
      if (!result.retry) break;
      local = result.merged;
      // The next fetch must compare against the remote we just merged, so its
      // subsequent deletions and edits are not mistaken for unchanged data.
      base = result.remote;
      exists = true;
    }
    if (!result || result.retry) throw new Error("Notebook cloud changed repeatedly while syncing. It will retry automatically.");

    // Network requests may take minutes. Rebase the synced data onto edits made
    // since this operation started before replacing the local database.
    const current = store.exportData();
    const reconciled = mergeSnapshots(initial, current, result.merged);
    const remoteChanged = !sameContent(current, shapedLike(reconciled, current));
    if (remoteChanged) {
      // Record what arrived, so an unexpected rewrite can be traced to the field that caused it.
      writeJson(path.join(root, "last-remote-change.json"), { at: new Date().toISOString(), paths: changedPaths(current, shapedLike(reconciled, current)) });
      store.createBackup();
      store.replaceData(reconciled);
    }
    writeJson(basePath, result.merged);
    const timestamp = new Date().toISOString();
    store.setSetting(SETTINGS_KEY, {
      ...config,
      repository: REPOSITORY,
      visibility: "private",
      autoUpload: true,
      autoSync: true,
      lastPushedAt: result.changed ? timestamp : config.lastPushedAt,
      lastPulledAt: remoteChanged ? timestamp : config.lastPulledAt,
      lastSyncedAt: timestamp,
      lastRemoteSha: result.sha,
      lastLocalFingerprint: fingerprint(result.merged),
    });
    return { ...await status(), changed: result.changed, remoteChanged };
  }

  function sync(options = {}) {
    if (activeSync) return activeSync;
    activeSync = performSync(options).finally(() => { activeSync = null; });
    return activeSync;
  }

  return {
    status,
    configure,
    connect,
    sync,
    push: () => sync({ force: true }),
    pull: () => sync({ force: true }),
  };
}

module.exports = { ACCOUNT, REPOSITORY, createGithubSync, fingerprint, mergeSnapshots, validRepository };
