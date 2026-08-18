const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createStorage } = require("../src/main/storage.cjs");
const Database = require("better-sqlite3");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "notebook-storage-"));
const store = createStorage(userData);
try {
  const note = store.createNote({ title: "Before backup", body: "This stays safe." });
  const skill = store.createSkill({ name: "Terminal helper", category: "Automation", body: "Run this command safely." });
  const slashCommand = store.createSlashCommand({ name: "Deploy", command: "/prompts:deploy", body: "Publish the current build." });
  const project = store.createProject({ name: "Notebook", description: "Project workspace", status: "active", priority: "high", localPath: "C:\\code\\notebook-storage-test", gitRoot: "C:\\code\\notebook-storage-test", tags: ["electron"], nextAction: "Verify Projects" });
  let savedProject = store.createProjectTask(project.id, { title: "Build task board", status: "in_progress", priority: "critical" });
  savedProject = store.setProjectAssignments(project.id, { skillIds: [skill.id], slashCommandIds: [slashCommand.id] });
  assert.equal(savedProject.tasks[0].title, "Build task board");
  assert.deepEqual(savedProject.skill_ids, [skill.id]);
  assert.deepEqual(savedProject.slash_command_ids, [slashCommand.id]);
  assert.ok(store.listSlashCommands().some((item) => item.command === "/prompts:gitpush"));
  assert.ok(store.listSlashCommands().some((item) => item.name === "Markdown, skills, and slash commands"));
  store.setTags(note.id, ["work"]);
  store.updateNote(note.id, { title: "Before backup", body: "This stays safe.", folderId: "inbox", pinned: true });
  assert.equal(store.listNotes()[0].pinned, true, "pinned notes sort first");
  store.createDailyTask({ text: "Carry this forward", bucket: "today", priority: 3, owner: "me" }, "2026-08-13");
  store.createDailyTask({ text: "Planned last night", bucket: "tomorrow", priority: 1, owner: "agent" }, "2026-08-13");
  let daily = store.dailyDashboard("2026-08-14");
  assert.deepEqual(daily.today.map((task) => task.text), ["Planned last night", "Carry this forward"]);
  assert.equal(daily.carriedCount, 1);
  assert.equal(daily.today[0].priority, 1);
  assert.equal(daily.today[0].owner, "agent");
  daily = store.updateDailyTask(daily.today[0].id, { text: "Planned and delegated", priority: 2, owner: "me" }, "2026-08-14");
  assert.equal(daily.today.find((task) => task.text === "Planned and delegated").owner, "me");
  daily = store.completeDailyTask(daily.today[0].id, true, "2026-08-14");
  assert.equal(daily.done[0].text, "Planned and delegated");
  store.createDailyTask({ text: "Set up Friday", bucket: "tomorrow" }, "2026-08-14");
  const backup = store.createBackup();
  assert.equal(store.listBackups()[0].name, backup.name);
  store.updateNote(note.id, { title: "Changed", body: "This should be replaced.", folderId: "inbox" });
  store.updateSkill(skill.id, { name: "Changed skill", category: "Other", body: "This should be replaced." });
  store.updateSlashCommand(slashCommand.id, { name: "Changed command", command: "/prompts:changed", body: "This should be replaced." });
  store.updateProject(project.id, { name: "Changed project", status: "paused" });
  const restored = store.restoreBackup(backup.name);
  assert.equal(restored.notes[0].title, "Before backup");
  assert.equal(restored.notes[0].body, "This stays safe.");
  assert.equal(restored.notes[0].tags[0].name, "work");
  assert.equal(store.listSkills()[0].name, "Terminal helper");
  assert.equal(store.listSkills()[0].category, "Automation");
  assert.equal(restored.slashCommands.find((item) => item.id === slashCommand.id).name, "Deploy");
  assert.equal(restored.slashCommands.find((item) => item.id === slashCommand.id).command, "/prompts:deploy");
  assert.equal(restored.projects.find((item) => item.id === project.id).name, "Notebook");
  assert.equal(restored.projects.find((item) => item.id === project.id).tasks[0].status, "in_progress");
  daily = store.dailyDashboard("2026-08-14");
  assert.equal(daily.done[0].text, "Planned and delegated");
  assert.equal(daily.tomorrow[0].text, "Set up Friday");
  assert.equal(daily.history[0].completed, 1);
  assert.equal(daily.carriedCount, 1);
  assert.equal(store.exportData().version, 9);
  const notebook = store.createFolder("To-do");
  const taskNote = store.createNote({ title: "Launch", body: "- [ ] Ship it", folderId: notebook.id });
  assert.equal(store.listFolders().find((folder) => folder.id === notebook.id).note_count, 1);
  store.renameFolder(notebook.id, "Tasks");
  assert.equal(store.listFolders().find((folder) => folder.id === notebook.id).name, "Tasks");
  store.removeFolder(notebook.id);
  assert.equal(store.getNote(taskNote.id).folder_id, store.inboxId);
  assert.throws(() => store.restoreBackup("..\\not-a-backup.json"), /Invalid backup name/);
  console.log("Storage notes, notebooks, skills, and slash commands backup/restore regression tests passed.");
} finally {
  store.close();
  fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

const legacyUserData = fs.mkdtempSync(path.join(os.tmpdir(), "notebook-storage-legacy-"));
const legacyDb = new Database(path.join(legacyUserData, "hushnote.sqlite"));
legacyDb.exec("CREATE TABLE daily_tasks (id TEXT PRIMARY KEY, task_date TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', completed_at TEXT, completed_on TEXT, carried_from_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
legacyDb.close();
const migratedStore = createStorage(legacyUserData);
try {
  const migrated = migratedStore.createDailyTask({ text: "Migration keeps working", bucket: "today", priority: 1, owner: "agent" });
  assert.equal(migrated.today[0].priority, 1);
  assert.equal(migrated.today[0].owner, "agent");
} finally {
  migratedStore.close();
  fs.rmSync(legacyUserData, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
