const fs = require("fs");
const path = require("path");

const SETTINGS_KEY = "githubSync";
const DATA_FILE = "notebook-data.json";

function validRepository(value) {
  return /^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,38})\/[A-Za-z0-9_.-]{1,100}$/.test(String(value || ""));
}

function createGithubSync({ userDataPath, store, run, authStatus }) {
  const root = path.join(userDataPath, "github-cloud");
  function saved() { return { repository: "", visibility: "private", autoUpload: false, lastPushedAt: null, lastPulledAt: null, ...store.getSetting(SETTINGS_KEY, {}) }; }
  function folder(repository) { return path.join(root, repository.replace("/", "--")); }
  async function account() {
    const auth = await authStatus();
    if (!auth.available) throw new Error("GitHub CLI is not installed.");
    if (!auth.authenticated) throw new Error("Sign in to GitHub first.");
    return auth;
  }
  async function normalizeRepository(value) {
    const auth = await account();
    const raw = String(value || "").trim();
    const repository = raw.includes("/") ? raw : `${auth.login}/${raw}`;
    if (!validRepository(repository)) throw new Error("Use a GitHub repository like owner/notebook-cloud.");
    return repository;
  }
  async function status() {
    const auth = await authStatus(); const config = saved();
    let remoteExists = false;
    if (auth.authenticated && validRepository(config.repository)) {
      const result = await run("gh.exe", ["repo", "view", config.repository, "--json", "url", "--jq", ".url"], { allowFailure: true, timeout: 20_000 });
      remoteExists = result.code === 0;
    }
    return { ...auth, ...config, remoteExists, url: validRepository(config.repository) ? `https://github.com/${config.repository}` : null };
  }
  async function configure(input) {
    const repository = await normalizeRepository(input.repository);
    const next = { ...saved(), repository, visibility: input.visibility === "public" ? "public" : "private", autoUpload: Boolean(input.autoUpload) };
    store.setSetting(SETTINGS_KEY, next);
    return status();
  }
  async function ensureCheckout(repository, createRemote, visibility) {
    fs.mkdirSync(root, { recursive: true });
    const target = folder(repository);
    if (fs.existsSync(path.join(target, ".git"))) return { target, created: false };
    if (fs.existsSync(target) && fs.readdirSync(target).length) throw new Error("The local cloud-sync checkout is obstructed. Open the data folder and rename github-cloud.");
    const remote = await run("gh.exe", ["repo", "view", repository, "--json", "url"], { allowFailure: true, timeout: 20_000 });
    if (remote.code === 0) {
      await run("gh.exe", ["repo", "clone", repository, target], { timeout: 120_000 });
      return { target, created: false };
    }
    if (!createRemote) throw new Error("Cloud backup repository does not exist yet. Upload from the device that has your data first.");
    fs.mkdirSync(target, { recursive: true });
    await run("git.exe", ["init", "-b", "main"], { cwd: target, timeout: 30_000 });
    fs.writeFileSync(path.join(target, "README.md"), "# Notebook cloud backup\n\nPrivate, versioned cross-device data created by Notebook. Tokens and secret values are never stored here.\n", "utf8");
    return { target, created: true, visibility };
  }
  async function push(input = {}) {
    await account();
    const config = saved();
    const repository = await normalizeRepository(input.repository || config.repository);
    const visibility = input.visibility === "public" ? "public" : config.visibility === "public" ? "public" : "private";
    const checkout = await ensureCheckout(repository, true, visibility);
    if (!checkout.created) {
      const pull = await run("git.exe", ["pull", "--rebase", "--autostash"], { cwd: checkout.target, allowFailure: true, timeout: 120_000 });
      if (pull.code) throw new Error("Cloud changed on another device. Pull it first, then upload again.");
    }
    const temporary = path.join(checkout.target, `${DATA_FILE}.tmp`);
    fs.writeFileSync(temporary, JSON.stringify(store.exportData(), null, 2), "utf8");
    fs.renameSync(temporary, path.join(checkout.target, DATA_FILE));
    await run("git.exe", ["add", "README.md", DATA_FILE], { cwd: checkout.target, timeout: 30_000 });
    const changed = await run("git.exe", ["diff", "--cached", "--quiet"], { cwd: checkout.target, allowFailure: true, timeout: 30_000 });
    if (changed.code) await run("git.exe", ["-c", "user.name=Notebook Cloud Sync", "-c", "user.email=notebook@local.invalid", "commit", "-m", `Notebook backup ${new Date().toISOString()}`], { cwd: checkout.target, timeout: 30_000 });
    if (checkout.created) await run("gh.exe", ["repo", "create", repository, visibility === "public" ? "--public" : "--private", "--source", checkout.target, "--remote", "origin", "--push", "--description", "Notebook cross-device backup"], { timeout: 120_000 });
    else if (changed.code) await run("git.exe", ["push"], { cwd: checkout.target, timeout: 120_000 });
    const next = { ...config, repository, visibility, lastPushedAt: new Date().toISOString() };
    store.setSetting(SETTINGS_KEY, next);
    return { ...await status(), changed: changed.code !== 0 };
  }
  async function pull(input = {}) {
    await account();
    const config = saved();
    const repository = await normalizeRepository(input.repository || config.repository);
    const checkout = await ensureCheckout(repository, false, config.visibility);
    if (!checkout.created) {
      const result = await run("git.exe", ["pull", "--ff-only"], { cwd: checkout.target, allowFailure: true, timeout: 120_000 });
      if (result.code) throw new Error("Could not fast-forward the cloud backup. Upload or resolve its Git history first.");
    }
    const dataPath = path.join(checkout.target, DATA_FILE);
    let data;
    try { data = JSON.parse(fs.readFileSync(dataPath, "utf8")); } catch { throw new Error("The GitHub repository has no valid Notebook backup yet."); }
    if (!data || !Array.isArray(data.notes) || !Number.isInteger(data.version)) throw new Error("The GitHub file is not a supported Notebook backup.");
    store.createBackup();
    const restored = store.replaceData(data);
    const next = { ...config, repository, lastPulledAt: new Date().toISOString() };
    store.setSetting(SETTINGS_KEY, next);
    return { sync: await status(), restored };
  }
  return { status, configure, push, pull };
}

module.exports = { createGithubSync, validRepository };
