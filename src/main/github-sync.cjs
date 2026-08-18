const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

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

function comparable(value) {
  const copy = clone(value);
  if (copy && typeof copy === "object" && !Array.isArray(copy)) delete copy.exportedAt;
  return copy;
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

function fingerprint(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
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

function mergeSnapshots(base, local, remote) {
  const merged = mergeValue(comparable(base) || {}, comparable(local) || {}, comparable(remote) || {});
  merged.version = Math.max(Number(base?.version) || 0, Number(local?.version) || 0, Number(remote?.version) || 0);
  merged.exportedAt = new Date().toISOString();
  return merged;
}

function supportedSnapshot(value) {
  return Boolean(value && Number.isInteger(value.version) && Array.isArray(value.notes));
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return null; }
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
        remote = readJson(path.join(target, DATA_FILE));
        if (remote && !supportedSnapshot(remote)) throw new Error("The cloud repository contains an unsupported Notebook backup.");
        if (!fs.existsSync(path.join(target, "README.md"))) fs.writeFileSync(path.join(target, "README.md"), "# Notebook cloud\n\nPrivate cross-device data for @blixvip. Account tokens and bot credentials are never stored here.\n", "utf8");
      } else {
        await run("git.exe", ["init", "-b", "main"], { cwd: target, timeout: 30_000, stripGithubTokens: true });
        fs.writeFileSync(path.join(target, "README.md"), "# Notebook cloud\n\nPrivate cross-device data for @blixvip. Account tokens and bot credentials are never stored here.\n", "utf8");
      }

      const merged = mergeSnapshots(base, local, remote);
      if (remote && same(merged, remote)) merged.exportedAt = remote.exportedAt;
      else if (!remote && same(merged, local)) merged.exportedAt = local.exportedAt || merged.exportedAt;
      const changed = await commitSnapshot(target, merged);
      if (!remoteExists) {
        await run("gh.exe", ["repo", "create", REPOSITORY, "--private", "--source", target, "--remote", "origin", "--push", "--description", "Private cross-device data for Notebook"], { timeout: 120_000, stripGithubTokens: true });
      } else if (changed) {
        const pushed = await run("git.exe", ["push", "-u", "origin", "HEAD:main"], { cwd: target, allowFailure: true, timeout: 120_000, stripGithubTokens: true });
        if (pushed.code) return { retry: true, merged };
      }
      const head = await run("git.exe", ["rev-parse", "HEAD"], { cwd: target, timeout: 30_000, stripGithubTokens: true });
      return { retry: false, merged, changed, remoteChanged: !same(local, merged), sha: head.stdout.trim() };
    } finally {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }

  async function performSync(options = {}) {
    const auth = await account({ optional: Boolean(options.automatic) });
    if (!auth) return { ...(await status()), skipped: "not-authenticated", changed: false, remoteChanged: false };

    const config = saved();
    let local = store.exportData();
    const localFingerprint = fingerprint(local);
    const remote = await remoteInfo();
    if (!options.force && remote && localFingerprint === config.lastLocalFingerprint) {
      const remoteHead = await run("gh.exe", ["api", `repos/${REPOSITORY}/commits/main`, "--jq", ".sha"], { allowFailure: true, timeout: 20_000, stripGithubTokens: true });
      if (!remoteHead.code && remoteHead.stdout.trim() === config.lastRemoteSha) return { ...await status(), changed: false, remoteChanged: false };
    }

    const base = readJson(basePath);
    let result;
    let exists = Boolean(remote);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      result = await attemptSync(local, base, exists);
      if (!result.retry) break;
      local = result.merged;
      exists = true;
    }
    if (!result || result.retry) throw new Error("Notebook cloud changed repeatedly while syncing. It will retry automatically.");

    if (result.remoteChanged) {
      store.createBackup();
      store.replaceData(result.merged);
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
      lastPulledAt: result.remoteChanged ? timestamp : config.lastPulledAt,
      lastSyncedAt: timestamp,
      lastRemoteSha: result.sha,
      lastLocalFingerprint: fingerprint(result.merged),
    });
    return { ...await status(), changed: result.changed, remoteChanged: result.remoteChanged };
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
