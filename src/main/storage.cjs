const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

function now() { return new Date().toISOString(); }
const BACKUP_RETENTION = 21;
const DAY_MS = 24 * 60 * 60 * 1000;
const STARTER_SLASH_COMMANDS = [
  {
    id: "starter-gitpush",
    name: "Git push",
    command: "/prompts:gitpush",
    body: [
      "Run `/prompts:gitpush` inside the Git repository you want to publish.",
      "",
      "## What it does",
      "The script:",
      "",
      "1. Runs `git add .`.",
      "2. Commits with `Update project files`.",
      "3. Runs `git push` on the current tracking branch.",
      "",
      "## Limits",
      "Does not run tests, linters, builds, status, or diff checks.",
      "",
      "## Related skill",
      "`$gitpush`",
      "",
      "Codex CLI does not accept custom top-level commands such as `/gitpush`. Custom prompts use `/prompts:<name>`.",
    ].join("\n"),
  },
  {
    id: "starter-command-guide",
    name: "Markdown, skills, and slash commands",
    command: "",
    body: [
      "## Markdown (`.md`)",
      "A text-file format. Markdown can hold notes or instructions, but the file is not automatically a command.",
      "",
      "## Custom prompt",
      "A Markdown file in `.codex/prompts`. Its filename becomes a namespaced command. Example: `gitpush.md` becomes `/prompts:gitpush`.",
      "",
      "## Skill",
      "A reusable folder containing `SKILL.md` and optional scripts or references. Invoke a skill with `$name`, such as `$gitpush`. Skills can also activate when a request matches their description unless configured as explicit-only.",
      "",
      "## Slash command",
      "A command beginning with `/` that the Codex interface parses before the agent sees it. Built-in commands include `/status` and `/model`. Custom prompt commands use `/prompts:<name>`; Codex CLI does not support arbitrary custom top-level names such as `/gitpush`.",
      "",
      "## Script",
      "The deterministic executable that performs the real work. In this setup, both `/prompts:gitpush` and `$gitpush` lead to the same PowerShell script that stages, commits, and pushes.",
    ].join("\n"),
  },
];

function createStorage(userDataPath) {
  fs.mkdirSync(userDataPath, { recursive: true });
  const db = new Database(path.join(userDataPath, "hushnote.sqlite"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, is_inbox INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', folder_id TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(folder_id) REFERENCES folders(id));
    CREATE TABLE IF NOT EXISTS skills (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'Unsorted', body TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS slash_commands (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', command TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS note_tags (note_id TEXT NOT NULL, tag_id TEXT NOT NULL, PRIMARY KEY(note_id, tag_id), FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE, FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS compressions (id TEXT PRIMARY KEY, note_id TEXT, source_text TEXT NOT NULL, compressed_text TEXT NOT NULL, preset TEXT NOT NULL, rate REAL NOT NULL, origin_tokens INTEGER, compressed_tokens INTEGER, ratio TEXT, created_at TEXT NOT NULL, FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE SET NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  let inbox = db.prepare("SELECT id FROM folders WHERE is_inbox = 1").get();
  if (!inbox) {
    inbox = { id: "inbox" };
    db.prepare("INSERT INTO folders (id, name, is_inbox, created_at) VALUES (?, ?, 1, ?)").run(inbox.id, "Inbox", now());
  }

  function migrateLegacyJson() {
    if (getSetting("legacyJsonMigrated", false)) return;
    const legacy = path.join(userDataPath, "notes.json");
    if (fs.existsSync(legacy)) {
      const backupDir = path.join(userDataPath, "backups");
      fs.mkdirSync(backupDir, { recursive: true });
      fs.copyFileSync(legacy, path.join(backupDir, `notes-legacy-${Date.now()}.json`));
      try {
        const notes = JSON.parse(fs.readFileSync(legacy, "utf8"));
        const insert = db.prepare("INSERT OR IGNORE INTO notes (id, title, body, folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
        const run = db.transaction((items) => items.forEach((note) => {
          const created = note.createdAt || note.updatedAt || now();
          insert.run(note.id || randomUUID(), note.title || "", note.body || "", inbox.id, created, note.updatedAt || created);
        }));
        if (Array.isArray(notes)) run(notes);
      } catch { /* Legacy backup remains available if it was malformed. */ }
    }
    setSetting("legacyJsonMigrated", true);
  }

  function getSetting(key, fallback = null) {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    if (!row) return fallback;
    try { return JSON.parse(row.value); } catch { return fallback; }
  }
  function setSetting(key, value) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));
    return value;
  }

  function hydrateNotes(rows) {
    const tagsFor = db.prepare("SELECT t.id, t.name FROM tags t JOIN note_tags nt ON nt.tag_id = t.id WHERE nt.note_id = ? ORDER BY t.name");
    return rows.map((note) => ({ ...note, pinned: Boolean(note.pinned), archived: Boolean(note.archived), tags: tagsFor.all(note.id) }));
  }
  function listNotes() {
    return hydrateNotes(db.prepare("SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC").all());
  }
  function getNote(id) {
    return hydrateNotes(db.prepare("SELECT * FROM notes WHERE id = ?").all(id))[0] || null;
  }
  function listFolders() {
    return db.prepare(`SELECT f.*, COUNT(n.id) AS note_count FROM folders f LEFT JOIN notes n ON n.folder_id = f.id AND n.deleted_at IS NULL AND n.archived = 0 GROUP BY f.id ORDER BY f.is_inbox DESC, f.name COLLATE NOCASE`).all().map((row) => ({ ...row, is_inbox: Boolean(row.is_inbox) }));
  }
  function listTags() {
    return db.prepare(`SELECT t.*, COUNT(nt.note_id) AS note_count FROM tags t LEFT JOIN note_tags nt ON nt.tag_id = t.id GROUP BY t.id ORDER BY t.name COLLATE NOCASE`).all();
  }
  function createNote(input = {}) {
    const id = randomUUID(); const timestamp = now();
    db.prepare("INSERT INTO notes (id, title, body, folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, input.title || "", input.body || "", input.folderId || inbox.id, timestamp, timestamp);
    return getNote(id);
  }
  function listSkills() {
    return db.prepare("SELECT * FROM skills ORDER BY updated_at DESC").all();
  }
  function getSkill(id) {
    return db.prepare("SELECT * FROM skills WHERE id = ?").get(id) || null;
  }
  function createSkill(input = {}) {
    const id = randomUUID(); const timestamp = now();
    db.prepare("INSERT INTO skills (id, name, category, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, input.name || "", input.category || "Unsorted", input.body || "", timestamp, timestamp);
    return getSkill(id);
  }
  function updateSkill(id, input) {
    const skill = getSkill(id); if (!skill) throw new Error("Skill not found.");
    db.prepare("UPDATE skills SET name = ?, category = ?, body = ?, updated_at = ? WHERE id = ?").run(input.name ?? skill.name, input.category ?? skill.category, input.body ?? skill.body, now(), id);
    return getSkill(id);
  }
  function deleteSkill(id) { db.prepare("DELETE FROM skills WHERE id = ?").run(id); }
  function listSlashCommands() {
    return db.prepare("SELECT * FROM slash_commands ORDER BY updated_at DESC, name COLLATE NOCASE").all();
  }
  function getSlashCommand(id) {
    return db.prepare("SELECT * FROM slash_commands WHERE id = ?").get(id) || null;
  }
  function createSlashCommand(input = {}) {
    const id = randomUUID(); const timestamp = now();
    db.prepare("INSERT INTO slash_commands (id, name, command, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, input.name || "", input.command || "", input.body || "", timestamp, timestamp);
    return getSlashCommand(id);
  }
  function updateSlashCommand(id, input) {
    const slashCommand = getSlashCommand(id); if (!slashCommand) throw new Error("Slash command not found.");
    db.prepare("UPDATE slash_commands SET name = ?, command = ?, body = ?, updated_at = ? WHERE id = ?").run(input.name ?? slashCommand.name, input.command ?? slashCommand.command, input.body ?? slashCommand.body, now(), id);
    return getSlashCommand(id);
  }
  function deleteSlashCommand(id) { db.prepare("DELETE FROM slash_commands WHERE id = ?").run(id); }
  function updateNote(id, input) {
    const note = getNote(id); if (!note) throw new Error("Note not found.");
    db.prepare("UPDATE notes SET title = ?, body = ?, folder_id = ?, pinned = ?, archived = ?, updated_at = ? WHERE id = ?").run(input.title ?? note.title, input.body ?? note.body, input.folderId ?? note.folder_id, input.pinned === undefined ? Number(note.pinned) : Number(input.pinned), input.archived === undefined ? Number(note.archived) : Number(input.archived), now(), id);
    return getNote(id);
  }
  function setTags(noteId, names) {
    const clean = [...new Set(names.map((name) => name.trim()).filter(Boolean))].slice(0, 12);
    const run = db.transaction(() => {
      db.prepare("DELETE FROM note_tags WHERE note_id = ?").run(noteId);
      for (const name of clean) {
        let tag = db.prepare("SELECT id FROM tags WHERE name = ? COLLATE NOCASE").get(name);
        if (!tag) { tag = { id: randomUUID() }; db.prepare("INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)").run(tag.id, name, now()); }
        db.prepare("INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)").run(noteId, tag.id);
      }
    });
    run(); return getNote(noteId);
  }
  function moveToTrash(id) { db.prepare("UPDATE notes SET deleted_at = ?, updated_at = ? WHERE id = ?").run(now(), now(), id); }
  function restoreNote(id) { db.prepare("UPDATE notes SET deleted_at = NULL, archived = 0, updated_at = ? WHERE id = ?").run(now(), id); }
  function deleteForever(id) { db.prepare("DELETE FROM notes WHERE id = ?").run(id); }
  function createFolder(name) {
    const clean = name.trim(); if (!clean) throw new Error("Folder name is required.");
    const id = randomUUID(); db.prepare("INSERT INTO folders (id, name, created_at) VALUES (?, ?, ?)").run(id, clean, now()); return { id, name: clean };
  }
  function renameFolder(id, name) { if (id === inbox.id) throw new Error("Inbox cannot be renamed."); db.prepare("UPDATE folders SET name = ? WHERE id = ?").run(name.trim(), id); }
  function removeFolder(id) { if (id === inbox.id) throw new Error("Inbox cannot be removed."); const run = db.transaction(() => { db.prepare("UPDATE notes SET folder_id = ? WHERE folder_id = ?").run(inbox.id, id); db.prepare("DELETE FROM folders WHERE id = ?").run(id); }); run(); }
  function createCompression(input) {
    const id = randomUUID(); const timestamp = now();
    db.prepare("INSERT INTO compressions (id, note_id, source_text, compressed_text, preset, rate, origin_tokens, compressed_tokens, ratio, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, input.noteId || null, input.sourceText, input.compressedText, input.preset, input.rate, input.originTokens || null, input.compressedTokens || null, input.ratio || null, timestamp);
    return { id, ...input, created_at: timestamp };
  }
  function listCompressions(noteId) { return db.prepare("SELECT * FROM compressions WHERE note_id = ? ORDER BY created_at DESC").all(noteId); }
  function exportData() { return { version: 4, exportedAt: now(), folders: listFolders(), notes: listNotes(), skills: listSkills(), slashCommands: listSlashCommands(), compressions: db.prepare("SELECT * FROM compressions ORDER BY created_at DESC").all() }; }
  function importData(data) {
    if (!data || !Array.isArray(data.notes)) throw new Error("That is not a Notebook JSON backup.");
    const run = db.transaction(() => {
      for (const folder of data.folders || []) if (folder.id !== inbox.id) db.prepare("INSERT OR IGNORE INTO folders (id, name, is_inbox, created_at) VALUES (?, ?, 0, ?)").run(folder.id, folder.name, folder.created_at || now());
      for (const note of data.notes) {
        const folderId = db.prepare("SELECT id FROM folders WHERE id = ?").get(note.folder_id)?.id || inbox.id;
        db.prepare("INSERT OR IGNORE INTO notes (id, title, body, folder_id, pinned, archived, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(note.id || randomUUID(), note.title || "", note.body || "", folderId, Number(Boolean(note.pinned)), Number(Boolean(note.archived)), note.deleted_at || null, note.created_at || now(), note.updated_at || now());
        if (Array.isArray(note.tags)) setTags(note.id, note.tags.map((tag) => tag.name));
      }
      for (const skill of data.skills || []) {
        db.prepare("INSERT OR IGNORE INTO skills (id, name, category, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(skill.id || randomUUID(), skill.name || "", skill.category || "Unsorted", skill.body || "", skill.created_at || now(), skill.updated_at || now());
      }
      for (const slashCommand of data.slashCommands || []) {
        db.prepare("INSERT OR IGNORE INTO slash_commands (id, name, command, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(slashCommand.id || randomUUID(), slashCommand.name || "", slashCommand.command || "", slashCommand.body || "", slashCommand.created_at || now(), slashCommand.updated_at || now());
      }
    }); run(); return listNotes();
  }

  function backupDirectory() {
    const directory = path.join(userDataPath, "backups");
    fs.mkdirSync(directory, { recursive: true });
    return directory;
  }
  function listBackups() {
    return fs.readdirSync(backupDirectory())
      .filter((name) => /^notebook-backup-[\d-]+(?:-[a-z0-9]+)?\.json$/i.test(name))
      .map((name) => {
        const stat = fs.statSync(path.join(backupDirectory(), name));
        return { name, createdAt: stat.mtime.toISOString(), size: stat.size };
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
  function pruneBackups() {
    for (const backup of listBackups().slice(BACKUP_RETENTION)) fs.rmSync(path.join(backupDirectory(), backup.name), { force: true });
  }
  function createBackup() {
    const stamp = now().replace(/[^0-9]/g, "-");
    const name = `notebook-backup-${stamp}-${randomUUID().slice(0, 6)}.json`;
    const destination = path.join(backupDirectory(), name);
    const temporary = `${destination}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(exportData(), null, 2), "utf8");
    fs.renameSync(temporary, destination);
    pruneBackups();
    return { name, createdAt: now(), size: fs.statSync(destination).size };
  }
  function ensureDailyBackup() {
    const newest = listBackups()[0];
    if (!newest || Date.now() - new Date(newest.createdAt).getTime() >= DAY_MS) return createBackup();
    return null;
  }
  function restoreBackup(name) {
    if (!/^notebook-backup-[\d-]+(?:-[a-z0-9]+)?\.json$/i.test(name || "")) throw new Error("Invalid backup name.");
    const backupPath = path.join(backupDirectory(), name);
    if (!fs.existsSync(backupPath)) throw new Error("Backup not found.");
    const data = JSON.parse(fs.readFileSync(backupPath, "utf8"));
    if (!data || !Array.isArray(data.notes)) throw new Error("This backup is not a Notebook backup.");
    const restore = db.transaction(() => {
      db.prepare("DELETE FROM note_tags").run();
      db.prepare("DELETE FROM tags").run();
      db.prepare("DELETE FROM compressions").run();
      db.prepare("DELETE FROM notes").run();
      db.prepare("DELETE FROM skills").run();
      if (Array.isArray(data.slashCommands)) db.prepare("DELETE FROM slash_commands").run();
      db.prepare("DELETE FROM folders WHERE id != ?").run(inbox.id);
      for (const folder of data.folders || []) {
        if (folder.id !== inbox.id) db.prepare("INSERT OR IGNORE INTO folders (id, name, is_inbox, created_at) VALUES (?, ?, 0, ?)").run(folder.id, folder.name, folder.created_at || now());
      }
      for (const note of data.notes) {
        const folderId = db.prepare("SELECT id FROM folders WHERE id = ?").get(note.folder_id)?.id || inbox.id;
        const noteId = note.id || randomUUID();
        db.prepare("INSERT INTO notes (id, title, body, folder_id, pinned, archived, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(noteId, note.title || "", note.body || "", folderId, Number(Boolean(note.pinned)), Number(Boolean(note.archived)), note.deleted_at || null, note.created_at || now(), note.updated_at || now());
        for (const rawTag of Array.isArray(note.tags) ? note.tags : []) {
          const tagName = String(rawTag?.name || "").trim().slice(0, 48);
          if (!tagName) continue;
          let tag = db.prepare("SELECT id FROM tags WHERE name = ? COLLATE NOCASE").get(tagName);
          if (!tag) { tag = { id: randomUUID() }; db.prepare("INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)").run(tag.id, tagName, now()); }
          db.prepare("INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)").run(noteId, tag.id);
        }
      }
      for (const compression of data.compressions || []) {
        const noteId = compression.note_id && db.prepare("SELECT id FROM notes WHERE id = ?").get(compression.note_id)?.id;
        db.prepare("INSERT INTO compressions (id, note_id, source_text, compressed_text, preset, rate, origin_tokens, compressed_tokens, ratio, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(compression.id || randomUUID(), noteId || null, compression.source_text || "", compression.compressed_text || "", compression.preset || "Balanced", compression.rate || 0.6, compression.origin_tokens || null, compression.compressed_tokens || null, compression.ratio || null, compression.created_at || now());
      }
      for (const skill of data.skills || []) {
        db.prepare("INSERT INTO skills (id, name, category, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(skill.id || randomUUID(), skill.name || "", skill.category || "Unsorted", skill.body || "", skill.created_at || now(), skill.updated_at || now());
      }
      for (const slashCommand of data.slashCommands || []) {
        db.prepare("INSERT INTO slash_commands (id, name, command, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(slashCommand.id || randomUUID(), slashCommand.name || "", slashCommand.command || "", slashCommand.body || "", slashCommand.created_at || now(), slashCommand.updated_at || now());
      }
    });
    restore();
    return { notes: listNotes(), skills: listSkills(), slashCommands: listSlashCommands() };
  }

  function seedSlashCommands() {
    if (getSetting("starterSlashCommandsVersion", 0) >= 1) return;
    const timestamp = now();
    const insert = db.prepare("INSERT OR IGNORE INTO slash_commands (id, name, command, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
    const seed = db.transaction(() => STARTER_SLASH_COMMANDS.forEach((item) => insert.run(item.id, item.name, item.command, item.body, timestamp, timestamp)));
    seed();
    setSetting("starterSlashCommandsVersion", 1);
  }

  seedSlashCommands();
  migrateLegacyJson();
  return { listNotes, getNote, listFolders, listTags, createNote, updateNote, setTags, moveToTrash, restoreNote, deleteForever, createFolder, renameFolder, removeFolder, listSkills, createSkill, updateSkill, deleteSkill, listSlashCommands, createSlashCommand, updateSlashCommand, deleteSlashCommand, createCompression, listCompressions, getSetting, setSetting, exportData, importData, createBackup, ensureDailyBackup, listBackups, restoreBackup, close: () => db.close(), userDataPath, inboxId: inbox.id };
}

module.exports = { createStorage };
