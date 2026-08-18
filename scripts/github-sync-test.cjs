const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createGithubSync, validRepository } = require("../src/main/github-sync.cjs");

(async () => {
  assert(validRepository("owner/notebook-cloud")); assert(!validRepository("https://github.com/owner/repo")); assert(!validRepository("../repo"));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "notebook-github-sync-")); const settings = new Map(); let restored = null; let backups = 0;
  const store = { getSetting: (key, fallback) => settings.get(key) || fallback, setSetting: (key, value) => settings.set(key, value), exportData: () => ({ version: 8, notes: [{ id: "note", title: "Safe", body: "No tokens" }], bots: [] }), createBackup: () => { backups += 1; }, replaceData: (data) => { restored = data; return { notes: data.notes }; } };
  const run = async (executable, args, options = {}) => {
    if (executable === "gh.exe" && args[0] === "repo" && args[1] === "view") return { code: 1, stdout: "", stderr: "missing" };
    if (executable === "git.exe" && args[0] === "init") { fs.mkdirSync(path.join(options.cwd, ".git"), { recursive: true }); return { code: 0, stdout: "", stderr: "" }; }
    if (executable === "git.exe" && args[0] === "diff") return { code: 1, stdout: "", stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  };
  try {
    const sync = createGithubSync({ userDataPath: root, store, run, authStatus: async () => ({ available: true, authenticated: true, login: "owner" }) });
    await sync.configure({ repository: "notebook-cloud", visibility: "private" });
    const pushed = await sync.push({ repository: "owner/notebook-cloud", visibility: "private" });
    assert.equal(pushed.changed, true); assert(fs.existsSync(path.join(root, "github-cloud", "owner--notebook-cloud", "notebook-data.json")));
    const pulled = await sync.pull({ repository: "owner/notebook-cloud", visibility: "private" });
    assert.equal(backups, 1); assert.equal(restored.notes[0].title, "Safe"); assert.equal(pulled.restored.notes.length, 1);
    console.log("github sync tests passed");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch((error) => { console.error(error); process.exit(1); });
