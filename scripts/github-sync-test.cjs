const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ACCOUNT, REPOSITORY, createGithubSync, fingerprint, mergeSnapshots, validRepository } = require("../src/main/github-sync.cjs");
const { dailyCarryId, normalizeDailyTasks } = require("../src/main/daily-tasks.cjs");

function snapshot(notes, extra = {}) {
  return { version: 9, exportedAt: "2026-08-18T00:00:00.000Z", folders: [], notes, skills: [], slashCommands: [], projects: [], dailyTasks: [], compressions: [], bots: [], ...extra };
}

async function syncFixture({ initial, base = initial, remote = initial, onClone, rejectPushes = 0, rawRemote }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "notebook-sync-race-"));
  const settings = new Map();
  let current = structuredClone(initial);
  let remoteData = structuredClone(remote);
  let backups = 0;
  let clones = 0;
  let pushes = 0;
  const basePath = path.join(root, "github-cloud", "last-synced.json");
  fs.mkdirSync(path.dirname(basePath), { recursive: true });
  fs.writeFileSync(basePath, JSON.stringify(base));
  const cloud = createGithubSync({
    userDataPath: root,
    store: {
      getSetting: (key, fallback) => settings.get(key) || fallback,
      setSetting: (key, value) => settings.set(key, value),
      exportData: () => structuredClone(current),
      createBackup: () => { backups += 1; },
      replaceData: (data) => { current = structuredClone(data); },
    },
    authStatus: async () => ({ available: true, authenticated: true, login: ACCOUNT }),
    run: async (executable, args, options = {}) => {
      if (args[0] === "repo" && args[1] === "view") return { code: 0, stdout: JSON.stringify({ visibility: "PRIVATE" }) };
      if (args[0] === "repo" && args[1] === "clone") {
        clones += 1;
        if (onClone) onClone({ current, remote: remoteData, clone: clones });
        fs.writeFileSync(path.join(args[3], "notebook-data.json"), rawRemote === undefined ? JSON.stringify(remoteData) : rawRemote);
      }
      if (args[0] === "diff") return { code: 1, stdout: "" };
      if (args[0] === "push") {
        pushes += 1;
        if (pushes <= rejectPushes) return { code: 1, stdout: "", stderr: "remote changed" };
        remoteData = JSON.parse(fs.readFileSync(path.join(options.cwd, "notebook-data.json"), "utf8"));
      }
      if (args[0] === "rev-parse") return { code: 0, stdout: "remote-sha\n" };
      if (args[0] === "api") return { code: 0, stdout: "remote-sha\n" };
      return { code: 0, stdout: "" };
    },
  });
  return {
    cloud,
    get current() { return current; },
    get remote() { return remoteData; },
    get backups() { return backups; },
    get pushes() { return pushes; },
    get config() { return settings.get("githubSync"); },
    readBase: () => JSON.parse(fs.readFileSync(basePath, "utf8")),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
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

  for (const rejectPushes of [0, 1]) {
    const fixture = await syncFixture({
      initial: before,
      remote,
      rejectPushes,
      onClone: ({ current, clone }) => {
        if (clone !== 1) return;
        current.notes[0].title = "Typed while syncing";
        current.notes[0].updated_at = "2026-08-18T10:03:00.000Z";
        current.notes.push({ id: "in-flight", title: "Created while syncing", body: "" });
      },
    });
    try {
      const result = await fixture.cloud.sync({ force: true });
      assert.equal(fixture.current.notes[0].title, "Typed while syncing", `in-flight edits survive ${rejectPushes} push retries`);
      assert.equal(fixture.current.notes[0].body, "Remote body", "remote edits reach local storage even after a push retry");
      assert(fixture.current.notes.some((note) => note.id === "in-flight"), "in-flight new notes survive sync");
      assert(fixture.current.notes.some((note) => note.id === "remote"), "remote new notes reach local storage");
      assert.equal(result.remoteChanged, true);
      assert.equal(fixture.backups, 1);
      assert.equal(fingerprint(fixture.readBase()), fingerprint(fixture.remote), "the merge base describes only data actually sent to GitHub");
      assert.equal(fixture.config.lastLocalFingerprint, fingerprint(fixture.remote), "unsent local edits remain dirty");
      await fixture.cloud.sync();
      assert.equal(fixture.remote.notes[0].title, "Typed while syncing", "the next automatic sync uploads in-flight edits");
      assert(fixture.remote.notes.some((note) => note.id === "in-flight"));
    } finally { fixture.cleanup(); }
  }

  const deletionFixture = await syncFixture({
    initial: before,
    remote: snapshot([...before.notes, { id: "remote", title: "Remote added", body: "" }]),
    onClone: ({ current, clone }) => { if (clone === 1) current.notes = []; },
  });
  try {
    await deletionFixture.cloud.sync({ force: true });
    assert.deepEqual(deletionFixture.current.notes.map((note) => note.id), ["remote"], "sync cannot resurrect an unchanged note deleted while awaiting GitHub");
    await deletionFixture.cloud.sync();
    assert.deepEqual(deletionFixture.remote.notes.map((note) => note.id), ["remote"], "the pending deletion propagates on the next sync");
  } finally { deletionFixture.cleanup(); }

  const retryDeletion = await syncFixture({
    initial: before,
    remote: snapshot([...before.notes, { id: "temporary-remote", title: "Removed before retry", body: "" }]),
    rejectPushes: 1,
    onClone: ({ remote, clone }) => { if (clone === 2) remote.notes = before.notes; },
  });
  try {
    await retryDeletion.cloud.sync({ force: true });
    assert.deepEqual(retryDeletion.remote.notes.map((note) => note.id), ["one"], "a retry cannot resurrect a remote note removed since the first attempt");
  } finally { retryDeletion.cleanup(); }

  for (const rawRemote of ["{broken json", "null", "false", "[]", '{"version":9}']) {
    const fixture = await syncFixture({ initial: before, rawRemote });
    try {
      await assert.rejects(() => fixture.cloud.sync({ force: true }), /cloud.*(invalid|unsupported|read)/i, "invalid existing cloud data must stop sync");
      assert.equal(fixture.pushes, 0, "invalid cloud data must never be overwritten");
      assert.deepEqual(fixture.current, before, "invalid cloud data leaves local notes untouched");
    } finally { fixture.cleanup(); }
  }

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
    // Bot health telemetry changes every monitor tick. It must survive a sync, and a
    // telemetry-only difference must not back up, rewrite local data, or push.
    const withTelemetry = (checks, runs) => snapshot([{ id: "one", title: "Stable", body: "" }], {
      bots: [{ id: "bot", name: "Bot", runtime: { consecutiveFailures: checks }, derivedState: { observedAt: `2026-08-18T00:00:0${checks}.000Z` }, jobs: [{ id: "job", updatedAt: `2026-08-18T00:00:0${checks}.000Z` }] }],
      botRuns: runs.map((id) => ({ id, botId: "bot" })),
      botEvents: [{ id: `event-${checks}`, botId: "bot" }],
    });
    const telemetryFixture = await syncFixture({ initial: withTelemetry(5, ["r1", "r2", "r3"]), base: withTelemetry(1, ["r1"]), remote: withTelemetry(1, ["r1"]) });
    try {
      const telemetrySync = await telemetryFixture.cloud.sync({ force: true });
      assert.deepEqual(telemetryFixture.current.botRuns.map((run) => run.id), ["r1", "r2", "r3"], "sync keeps local bot run history");
      assert.equal(telemetryFixture.current.bots[0].runtime.consecutiveFailures, 5, "sync keeps local bot runtime");
      assert.equal(telemetrySync.remoteChanged, false, "telemetry-only differences do not rewrite local data");
      assert.equal(telemetryFixture.backups, 0, "telemetry-only differences do not create safety backups");
      assert.equal(telemetryFixture.pushes, 0, "telemetry-only differences do not push");
    } finally { telemetryFixture.cleanup(); }

    // Row order and restored tag ids are storage noise, not edits.
    const noisy = (reverse, tagPrefix) => snapshot([{ id: "one", title: "Tagged", body: "", tags: [{ id: `${tagPrefix}-a`, name: "alpha" }, { id: `${tagPrefix}-b`, name: "beta" }] }], {
      dailyTasks: (reverse ? ["t2", "t1"] : ["t1", "t2"]).map((id) => ({ id, text: id, task_date: "2026-08-18", bucket: "today", status: "open", carried_from_id: null, completed_at: null, completed_on: null })),
    });
    const noiseFixture = await syncFixture({ initial: noisy(false, "local"), base: noisy(true, "remote"), remote: noisy(true, "remote") });
    try {
      const noiseSync = await noiseFixture.cloud.sync({ force: true });
      assert.equal(noiseSync.remoteChanged, false, "row order and tag ids do not read as remote edits");
      assert.equal(noiseFixture.backups, 0, "storage noise does not create safety backups");
      assert.equal(noiseFixture.pushes, 0, "storage noise does not push");
    } finally { noiseFixture.cleanup(); }

    // Another device re-stamping an untouched note must not rewrite this one; a real edit still lands.
    const stamped = (updated, body = "Same") => snapshot([{ id: "one", title: "Stable", body, updated_at: updated }]);
    const stampFixture = await syncFixture({ initial: stamped("2026-08-18T00:00:00.000Z"), remote: stamped("2026-08-18T09:00:00.000Z") });
    try {
      const stampSync = await stampFixture.cloud.sync({ force: true });
      assert.equal(stampSync.remoteChanged, false, "a timestamp-only bump is not a remote edit");
      assert.equal(stampFixture.backups, 0, "a timestamp-only bump creates no safety backup");
    } finally { stampFixture.cleanup(); }
    // A different build omits defaults and adds sections this one cannot store; that is not an edit.
    const localShape = snapshot([{ id: "one", title: "Stable", body: "" }], { skills: [{ id: "s", name: "Skill", body: "", source_url: "", ownership: "mine" }], projects: [{ id: "p", name: "Project", workshop: { tier: "Now" } }] });
    const otherBuild = snapshot([{ id: "one", title: "Stable", body: "" }], { skills: [{ id: "s", name: "Skill", body: "" }], projects: [{ id: "p", name: "Project", workshop: { tier: "Later" } }], botInbox: [], botUsage: [] });
    const shapeFixture = await syncFixture({ initial: localShape, base: otherBuild, remote: otherBuild });
    try {
      const shapeSync = await shapeFixture.cloud.sync({ force: true });
      assert.equal(shapeSync.remoteChanged, false, "fields another build omits or adds are not remote edits");
      assert.equal(shapeFixture.backups, 0, "build differences create no safety backup");
    } finally { shapeFixture.cleanup(); }
    const editFixture = await syncFixture({ initial: stamped("2026-08-18T00:00:00.000Z"), remote: stamped("2026-08-18T09:00:00.000Z", "Edited elsewhere") });
    try {
      const editSync = await editFixture.cloud.sync({ force: true });
      assert.equal(editSync.remoteChanged, true);
      assert.equal(editFixture.current.notes[0].body, "Edited elsewhere", "real remote edits still reach this device");
    } finally { editFixture.cleanup(); }

    console.log("GitHub account lock, automatic sync, merge, in-flight edits/deletions, push retries, malformed cloud data, bot telemetry, and first-device tests passed.");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exit(1); });
