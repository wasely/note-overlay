const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createStorage } = require("../src/main/storage.cjs");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "notebook-storage-"));
const store = createStorage(userData);
try {
  const note = store.createNote({ title: "Before backup", body: "This stays safe." });
  const skill = store.createSkill({ name: "Terminal helper", category: "Automation", body: "Run this command safely." });
  const slashCommand = store.createSlashCommand({ name: "Deploy", command: "/prompts:deploy", body: "Publish the current build." });
  assert.ok(store.listSlashCommands().some((item) => item.command === "/prompts:gitpush"));
  assert.ok(store.listSlashCommands().some((item) => item.name === "Markdown, skills, and slash commands"));
  store.setTags(note.id, ["work"]);
  const backup = store.createBackup();
  assert.equal(store.listBackups()[0].name, backup.name);
  store.updateNote(note.id, { title: "Changed", body: "This should be replaced.", folderId: "inbox" });
  store.updateSkill(skill.id, { name: "Changed skill", category: "Other", body: "This should be replaced." });
  store.updateSlashCommand(slashCommand.id, { name: "Changed command", command: "/prompts:changed", body: "This should be replaced." });
  const restored = store.restoreBackup(backup.name);
  assert.equal(restored.notes[0].title, "Before backup");
  assert.equal(restored.notes[0].body, "This stays safe.");
  assert.equal(restored.notes[0].tags[0].name, "work");
  assert.equal(store.listSkills()[0].name, "Terminal helper");
  assert.equal(store.listSkills()[0].category, "Automation");
  assert.equal(restored.slashCommands.find((item) => item.id === slashCommand.id).name, "Deploy");
  assert.equal(restored.slashCommands.find((item) => item.id === slashCommand.id).command, "/prompts:deploy");
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
