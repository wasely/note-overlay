const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ACCOUNT, REPOSITORY, createGithubSync, mergeSnapshots, validRepository } = require("../src/main/github-sync.cjs");

function snapshot(notes, extra = {}) {
  return { version: 9, exportedAt: "2026-08-18T00:00:00.000Z", folders: [], notes, skills: [], slashCommands: [], projects: [], dailyTasks: [], compressions: [], bots: [], ...extra };
}

(async () => {
  assert.equal(ACCOUNT, "blixvip");
  assert.equal(REPOSITORY, "blixvip/notebook-cloud");
  assert(validRepository(REPOSITORY));
  assert(!validRepository("https://github.com/blixvip/notebook-cloud"));
  assert(!validRepository("../repo"));

  const before = snapshot([{ id: "one", title: "Original", body: "Original", updated_at: "2026-08-18T10:00:00.000Z" }]);
  const local = snapshot([
    { id: "one", title: "Local title", body: "Original", updated_at: "2026-08-18T10:02:00.000Z" },
    { id: "local", title: "Local note", body: "", updated_at: "2026-08-18T10:02:00.000Z" },
  ]);
  const remote = snapshot([
    { id: "one", title: "Original", body: "Remote body", updated_at: "2026-08-18T10:01:00.000Z" },
    { id: "remote", title: "Remote note", body: "", updated_at: "2026-08-18T10:01:00.000Z" },
  ]);
  const merged = mergeSnapshots(before, local, remote);
  assert.equal(merged.notes.find((note) => note.id === "one").title, "Local title");
  assert.equal(merged.notes.find((note) => note.id === "one").body, "Remote body");
  assert.deepEqual(merged.notes.map((note) => note.id), ["one", "local", "remote"]);

  const deleted = mergeSnapshots(before, snapshot([]), before);
  assert.equal(deleted.notes.length, 0, "a deletion must propagate when the other device did not edit the item");
  const firstDevice = mergeSnapshots(null, snapshot([]), remote);
  assert.equal(firstDevice.notes.length, 2, "a new device must receive all remote data");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "notebook-github-sync-"));
  const settings = new Map();
  let current = snapshot([{ id: "note", title: "Safe", body: "No tokens", updated_at: "2026-08-18T10:00:00.000Z" }]);
  let signedInAs = null;
  const store = {
    getSetting: (key, fallback) => settings.get(key) || fallback,
    setSetting: (key, value) => settings.set(key, value),
    exportData: () => current,
    createBackup: () => {},
    replaceData: (data) => { current = data; return { notes: data.notes }; },
  };
  const run = async (executable, args, options = {}) => {
    if (executable === "gh.exe" && args[0] === "repo" && args[1] === "view") return { code: 1, stdout: "", stderr: "missing" };
    if (executable === "git.exe" && args[0] === "init") { fs.mkdirSync(path.join(options.cwd, ".git"), { recursive: true }); return { code: 0, stdout: "", stderr: "" }; }
    if (executable === "git.exe" && args[0] === "diff") return { code: 1, stdout: "", stderr: "" };
    if (executable === "git.exe" && args[0] === "rev-parse") return { code: 0, stdout: "test-sha\n", stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  };

  try {
    const cloud = createGithubSync({
      userDataPath: root,
      store,
      run,
      authStatus: async () => ({ available: true, authenticated: true, login: "blixvip" }),
      signIn: async (login) => { signedInAs = login; return { available: true, authenticated: true, login }; },
    });
    const configured = await cloud.configure({ repository: "someone/else", visibility: "public", autoUpload: false });
    assert.equal(configured.repository, REPOSITORY);
    assert.equal(configured.visibility, "private");
    assert.equal(configured.autoSync, true);
    const synced = await cloud.sync({ force: true });
    assert.equal(synced.changed, true);
    assert(fs.existsSync(path.join(root, "github-cloud", "last-synced.json")));
    await cloud.connect();
    assert.equal(signedInAs, "blixvip");

    const wrongAccount = createGithubSync({ userDataPath: root, store, run, authStatus: async () => ({ available: true, authenticated: true, login: "someone-else" }) });
    await assert.rejects(() => wrongAccount.configure(), /belongs to @blixvip/);
    console.log("GitHub account lock, automatic sync, merge, deletion, and first-device tests passed.");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exit(1); });
