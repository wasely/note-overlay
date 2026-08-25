const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ACCOUNT, REPOSITORY, createGithubSync, mergeSnapshots, validRepository } = require("../src/main/github-sync.cjs");
const { dailyCarryId, normalizeDailyTasks } = require("../src/main/daily-tasks.cjs");

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

  const duplicateProjects = mergeSnapshots(null,
    snapshot([], { projects: [{ id: "local-project", name: "Demo", github_url: "https://github.com/blixvip/demo.git", local_path: "C:\\code\\demo", git_root: "C:\\code\\demo", updated_at: "2026-08-18T10:02:00.000Z", tasks: [{ id: "local-task", title: "Local" }] }] }),
    snapshot([], { projects: [{ id: "remote-project", name: "Demo remote", github_url: "https://github.com/BLIXVIP/demo", local_path: "D:\\projects\\demo", git_root: "D:\\projects\\demo", updated_at: "2026-08-18T10:01:00.000Z", tasks: [{ id: "remote-task", title: "Remote" }] }] }),
  );
  assert.equal(duplicateProjects.projects.length, 1, "the same repository must not restore twice under different device IDs");
  assert.equal(duplicateProjects.projects[0].id, "local-project");
  assert.equal(duplicateProjects.projects[0].local_path, "C:\\code\\demo", "the current device path wins");
  assert.deepEqual(duplicateProjects.projects[0].tasks.map((task) => task.id), ["local-task", "remote-task"]);

  const dailyTask = (id, taskDate, status, source = null, updatedAt = `${taskDate}T12:00:00.000Z`) => ({ id, task_date: taskDate, text: "Carry once", status, priority: 2, owner: "me", completed_at: status === "done" ? updatedAt : null, completed_on: status === "done" ? taskDate : null, carried_from_id: source, created_at: `${taskDate}T06:00:00.000Z`, updated_at: updatedAt });
  const dailyRoot = dailyTask("daily-root", "2026-08-19", "carried");
  const branchedDaily = mergeSnapshots(
    snapshot([], { dailyTasks: [dailyTask("daily-root", "2026-08-19", "open")] }),
    snapshot([], { dailyTasks: [dailyRoot, dailyTask("branch-done", "2026-08-20", "done", "daily-root")] }),
    snapshot([], { dailyTasks: [dailyRoot, dailyTask("branch-carried", "2026-08-20", "carried", "daily-root"), dailyTask("branch-next", "2026-08-21", "open", "branch-carried")] }),
  );
  assert.deepEqual(branchedDaily.dailyTasks.map((task) => [task.task_date, task.status]), [["2026-08-20", "done"], ["2026-08-19", "carried"]], "a completed branch ends the rollover lineage instead of duplicating it");

  const stableCarryId = dailyCarryId("daily-root", "2026-08-20");
  assert.equal(stableCarryId, dailyCarryId("daily-root", "2026-08-20"), "rollover IDs are deterministic across devices");
  const deterministicBase = snapshot([], { dailyTasks: [dailyRoot, dailyTask(stableCarryId, "2026-08-20", "open", "daily-root")] });
  const completionWins = mergeSnapshots(
    deterministicBase,
    snapshot([], { dailyTasks: [dailyRoot, dailyTask(stableCarryId, "2026-08-20", "done", "daily-root", "2026-08-20T17:00:00.000Z")] }),
    snapshot([], { dailyTasks: [dailyRoot, dailyTask(stableCarryId, "2026-08-20", "carried", "daily-root", "2026-08-21T06:00:00.000Z"), dailyTask("should-not-survive", "2026-08-21", "open", stableCarryId)] }),
  );
  assert.equal(completionWins.dailyTasks.find((task) => task.id === stableCarryId).status, "done", "explicit completion beats a concurrent automatic rollover");
  assert.equal(completionWins.dailyTasks.some((task) => task.id === "should-not-survive"), false, "nothing carries past a completed task");
  const orphanedCopies = normalizeDailyTasks([dailyTask("orphan-one", "2026-08-20", "open", "missing-source"), dailyTask("orphan-two", "2026-08-20", "open", "missing-source")]);
  assert.equal(orphanedCopies.length, 1, "orphaned copies from the same rollover still coalesce");
  assert.equal(orphanedCopies[0].carried_from_id, null, "an invalid missing-source link is removed before SQLite restore");

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
      authStatus: async () => ({ available: true, authenticated: true, login: "blixvip", name: "blix", avatarUrl: "https://avatars.githubusercontent.com/u/247529250?v=4" }),
      signIn: async (login) => { signedInAs = login; return { available: true, authenticated: true, login }; },
    });
    const configured = await cloud.configure({ repository: "someone/else", visibility: "public", autoUpload: false });
    assert.equal(configured.repository, REPOSITORY);
    assert.equal(configured.visibility, "private");
    assert.equal(configured.autoSync, true);
    assert.equal(configured.avatarUrl, "https://avatars.githubusercontent.com/u/247529250?v=4");
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
