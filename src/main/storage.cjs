const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { randomUUID } = require("crypto");
const { createBotRepository } = require("./bot-storage.cjs");
const { enrichProject } = require("./workshop.cjs");
const { dailyCarryId, normalizeDailyTasks } = require("./daily-tasks.cjs");
const { linkKey, wikilinkTargets, linkContext } = require("./wikilinks.cjs");
const CURATED_SKILLS = require("./curated-skills.json");
const CURATED_SKILLS_VERSION = 5;
const DEVICE_NAME = os.hostname();

function now() { return new Date().toISOString(); }
function normalizedLibraryText(value) { return String(value || "").replace(/\r\n?/g, "\n").trim(); }
function normalizedLibraryName(value) { return normalizedLibraryText(value).toLocaleLowerCase("en-US"); }
function localDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function shiftDate(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}
function taskPriority(value) { return [1, 2, 3].includes(Number(value)) ? Number(value) : 2; }
function taskOwner(value) { return value === "agent" ? "agent" : "me"; }
const BACKUP_RETENTION = 21;
const DAY_MS = 24 * 60 * 60 * 1000;
const STARTER_SKILLS = [
  {
    id: "starter-onlyoffice",
    name: "OnlyOffice",
    category: "Apps & Integrations",
    source_url: "https://github.com/ONLYOFFICE/DesktopEditors",
    ownership: "other",
    body: [
      "## Best overall office suite",
      "OnlyOffice is the strongest Microsoft Office-compatible alternative — a full-featured office suite for text, spreadsheets, and presentations with a modern, clean UI.",
      "",
      "## Top-tier compatibility",
      "Works natively with Microsoft Office formats (.docx, .xlsx, .pptx) without conversion, so documents look the same as in Word or Excel.",
      "",
      "## Collaboration",
      "Real-time co-editing, commenting, version history, and built-in chat. Note: live co-editing requires OnlyOffice Document Server (self-hosted) or DocSpace/cloud — the free desktop app alone does not do live collaboration.",
      "",
      "## How to use",
      "The Community Edition is free under the AGPL-3.0 license. Self-host it or use it through integrations like Nextcloud.",
      "",
      "## Caveats",
      "- \"Most feature-rich\" is debatable: LibreOffice has more raw features (macros, Base database). OnlyOffice's real edge is MS Office compatibility plus a modern UI.",
      "- AGPL-3.0 carries network-copyleft obligations if you modify it and serve it publicly.",
      "- Very complex .docx (macros, some charts, OLE objects) can render slightly differently; macros are largely unsupported.",
    ].join("\n"),
  },
];

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

function createStorage(userDataPath, { onChange } = {}) {
  fs.mkdirSync(userDataPath, { recursive: true });
  const db = new Database(path.join(userDataPath, "hushnote.sqlite"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, is_inbox INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', folder_id TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(folder_id) REFERENCES folders(id));
    CREATE TABLE IF NOT EXISTS skills (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'Unsorted', body TEXT NOT NULL DEFAULT '', source_url TEXT NOT NULL DEFAULT '', ownership TEXT NOT NULL DEFAULT 'mine', pinned INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS slash_commands (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', command TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS note_tags (note_id TEXT NOT NULL, tag_id TEXT NOT NULL, PRIMARY KEY(note_id, tag_id), FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE, FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS note_links (source_id TEXT NOT NULL, target_key TEXT NOT NULL, target_title TEXT NOT NULL, PRIMARY KEY(source_id, target_key), FOREIGN KEY(source_id) REFERENCES notes(id) ON DELETE CASCADE);
    CREATE INDEX IF NOT EXISTS note_links_target ON note_links(target_key);
    CREATE TABLE IF NOT EXISTS compressions (id TEXT PRIMARY KEY, note_id TEXT, source_text TEXT NOT NULL, compressed_text TEXT NOT NULL, preset TEXT NOT NULL, rate REAL NOT NULL, origin_tokens INTEGER, compressed_tokens INTEGER, ratio TEXT, created_at TEXT NOT NULL, FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE SET NULL);
    CREATE TABLE IF NOT EXISTS daily_tasks (id TEXT PRIMARY KEY, task_date TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'done', 'carried')), priority INTEGER NOT NULL DEFAULT 2 CHECK(priority BETWEEN 1 AND 3), owner TEXT NOT NULL DEFAULT 'me' CHECK(owner IN ('me', 'agent')), completed_at TEXT, completed_on TEXT, carried_from_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(carried_from_id) REFERENCES daily_tasks(id) ON DELETE SET NULL);
    CREATE INDEX IF NOT EXISTS daily_tasks_date_status ON daily_tasks(task_date, status);
    CREATE INDEX IF NOT EXISTS daily_tasks_completed_on ON daily_tasks(completed_on);
    CREATE TABLE IF NOT EXISTS daily_activities (id TEXT PRIMARY KEY, activity_date TEXT NOT NULL, text TEXT NOT NULL, start_minute INTEGER NOT NULL CHECK(start_minute BETWEEN 0 AND 1439), duration_minutes INTEGER NOT NULL CHECK(duration_minutes IN (1, 5)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS daily_activities_date_time ON daily_activities(activity_date, start_minute, created_at);
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'blocked', 'completed', 'archived')), priority TEXT NOT NULL DEFAULT 'none' CHECK(priority IN ('critical', 'high', 'medium', 'low', 'none')), manual_rank INTEGER NOT NULL DEFAULT 0, category TEXT NOT NULL DEFAULT 'Uncategorized', tier INTEGER NOT NULL DEFAULT 4 CHECK(tier BETWEEN 1 AND 4), tier_order INTEGER NOT NULL DEFAULT 0, local_path TEXT UNIQUE, git_root TEXT, github_url TEXT, primary_language TEXT NOT NULL DEFAULT '', tags_json TEXT NOT NULL DEFAULT '[]', next_action TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', push_after_commit INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_worked_at TEXT, last_device TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS project_tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'blocked', 'done', 'archived')), priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('critical', 'high', 'medium', 'low', 'none')), manual_order INTEGER NOT NULL DEFAULT 0, due_date TEXT, tags_json TEXT NOT NULL DEFAULT '[]', related TEXT NOT NULL DEFAULT '', completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE);
    CREATE INDEX IF NOT EXISTS project_tasks_project_status ON project_tasks(project_id, status, manual_order);
    CREATE TABLE IF NOT EXISTS project_skills (project_id TEXT NOT NULL, skill_id TEXT NOT NULL, PRIMARY KEY(project_id, skill_id), FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE, FOREIGN KEY(skill_id) REFERENCES skills(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS project_slash_commands (project_id TEXT NOT NULL, slash_command_id TEXT NOT NULL, PRIMARY KEY(project_id, slash_command_id), FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE, FOREIGN KEY(slash_command_id) REFERENCES slash_commands(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS project_skill_installs (project_id TEXT NOT NULL, skill_id TEXT NOT NULL, relative_path TEXT NOT NULL, content_hash TEXT NOT NULL, installed_at TEXT NOT NULL, PRIMARY KEY(project_id, skill_id), FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE, FOREIGN KEY(skill_id) REFERENCES skills(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS project_command_installs (project_id TEXT NOT NULL, slash_command_id TEXT NOT NULL, relative_path TEXT NOT NULL, content_hash TEXT NOT NULL, installed_at TEXT NOT NULL, PRIMARY KEY(project_id, slash_command_id), FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE, FOREIGN KEY(slash_command_id) REFERENCES slash_commands(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS project_activity (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL, summary TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE);
    CREATE INDEX IF NOT EXISTS project_activity_project_time ON project_activity(project_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS project_canvas_items (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT 'yellow' CHECK(color IN ('yellow', 'blue', 'green', 'pink', 'gray')), x INTEGER NOT NULL DEFAULT 24, y INTEGER NOT NULL DEFAULT 24, width INTEGER NOT NULL DEFAULT 220, height INTEGER NOT NULL DEFAULT 150, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE);
    CREATE INDEX IF NOT EXISTS project_canvas_project ON project_canvas_items(project_id, created_at);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  const dailyColumns = new Set(db.pragma("table_info(daily_tasks)").map((column) => column.name));
  if (!dailyColumns.has("priority")) db.exec("ALTER TABLE daily_tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 2 CHECK(priority BETWEEN 1 AND 3)");
  if (!dailyColumns.has("owner")) db.exec("ALTER TABLE daily_tasks ADD COLUMN owner TEXT NOT NULL DEFAULT 'me' CHECK(owner IN ('me', 'agent'))");
  const skillColumns = new Set(db.pragma("table_info(skills)").map((column) => column.name));
  if (!skillColumns.has("pinned")) db.exec("ALTER TABLE skills ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");
  if (!skillColumns.has("source_url")) db.exec("ALTER TABLE skills ADD COLUMN source_url TEXT NOT NULL DEFAULT ''");
  if (!skillColumns.has("ownership")) db.exec("ALTER TABLE skills ADD COLUMN ownership TEXT NOT NULL DEFAULT 'mine'");
  const projectColumns = new Set(db.pragma("table_info(projects)").map((column) => column.name));
  if (!projectColumns.has("last_device")) db.exec("ALTER TABLE projects ADD COLUMN last_device TEXT NOT NULL DEFAULT ''");
  if (!projectColumns.has("logo_path")) db.exec("ALTER TABLE projects ADD COLUMN logo_path TEXT NOT NULL DEFAULT ''");
  if (!projectColumns.has("category")) db.exec("ALTER TABLE projects ADD COLUMN category TEXT NOT NULL DEFAULT 'Uncategorized'");
  if (!projectColumns.has("tier")) {
    db.exec("ALTER TABLE projects ADD COLUMN tier INTEGER NOT NULL DEFAULT 4 CHECK(tier BETWEEN 1 AND 4)");
    db.exec("UPDATE projects SET tier = CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END");
  }
  if (!projectColumns.has("tier_order")) {
    db.exec("ALTER TABLE projects ADD COLUMN tier_order INTEGER NOT NULL DEFAULT 0");
    db.exec("UPDATE projects SET tier_order = manual_rank");
  }
  let inbox = db.prepare("SELECT id FROM folders WHERE is_inbox = 1").get();
  if (!inbox) {
    inbox = { id: "inbox" };
    db.prepare("INSERT INTO folders (id, name, is_inbox, created_at) VALUES (?, ?, 1, ?)").run(inbox.id, "Inbox", now());
  }
  const botRepo = createBotRepository({ db, createNote, getNote });

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
    indexNoteLinks(id, input.body || "");
    return getNote(id);
  }
  function hydrateSkill(row) {
    return row ? { ...row, pinned: Boolean(row.pinned) } : null;
  }
  function listSkills() {
    return db.prepare("SELECT * FROM skills ORDER BY pinned DESC, updated_at DESC").all().map(hydrateSkill);
  }
  function getSkill(id) {
    return hydrateSkill(db.prepare("SELECT * FROM skills WHERE id = ?").get(id) || null);
  }
  function createSkill(input = {}) {
    const requestedName = normalizedLibraryText(input.name);
    if (requestedName && db.prepare("SELECT id FROM skills WHERE lower(trim(name)) = lower(?)").get(requestedName)) throw new Error("A skill with that name already exists.");
    const id = randomUUID(); const timestamp = now();
    db.prepare("INSERT INTO skills (id, name, category, body, source_url, ownership, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, input.name || "", input.category || "Unsorted", input.body || "", input.sourceUrl || input.source_url || "", input.ownership === "other" ? "other" : "mine", Number(Boolean(input.pinned)), timestamp, timestamp);
    return getSkill(id);
  }
  function updateSkill(id, input) {
    const skill = getSkill(id); if (!skill) throw new Error("Skill not found.");
    const nextName = normalizedLibraryText(input.name ?? skill.name);
    if (nextName && db.prepare("SELECT id FROM skills WHERE id != ? AND lower(trim(name)) = lower(?)").get(id, nextName)) throw new Error("A skill with that name already exists.");
    db.prepare("UPDATE skills SET name = ?, category = ?, body = ?, source_url = ?, ownership = ?, pinned = ?, updated_at = ? WHERE id = ?").run(input.name ?? skill.name, input.category ?? skill.category, input.body ?? skill.body, input.sourceUrl ?? input.source_url ?? skill.source_url, input.ownership === undefined ? skill.ownership : input.ownership === "other" ? "other" : "mine", Number(input.pinned ?? skill.pinned), now(), id);
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
    const requestedCommand = normalizedLibraryName(input.command);
    const requestedName = normalizedLibraryName(input.name);
    if (requestedCommand && db.prepare("SELECT id FROM slash_commands WHERE lower(trim(command)) = ?").get(requestedCommand)) throw new Error("That command invocation is already saved.");
    if (!requestedCommand && requestedName && db.prepare("SELECT id FROM slash_commands WHERE trim(command) = '' AND lower(trim(name)) = ?").get(requestedName)) throw new Error("A command page with that name already exists.");
    const id = randomUUID(); const timestamp = now();
    db.prepare("INSERT INTO slash_commands (id, name, command, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, input.name || "", input.command || "", input.body || "", timestamp, timestamp);
    return getSlashCommand(id);
  }
  function updateSlashCommand(id, input) {
    const slashCommand = getSlashCommand(id); if (!slashCommand) throw new Error("Slash command not found.");
    const nextCommand = normalizedLibraryName(input.command ?? slashCommand.command);
    const nextName = normalizedLibraryName(input.name ?? slashCommand.name);
    if (nextCommand && db.prepare("SELECT id FROM slash_commands WHERE id != ? AND lower(trim(command)) = ?").get(id, nextCommand)) throw new Error("That command invocation is already saved.");
    if (!nextCommand && nextName && db.prepare("SELECT id FROM slash_commands WHERE id != ? AND trim(command) = '' AND lower(trim(name)) = ?").get(id, nextName)) throw new Error("A command page with that name already exists.");
    db.prepare("UPDATE slash_commands SET name = ?, command = ?, body = ?, updated_at = ? WHERE id = ?").run(input.name ?? slashCommand.name, input.command ?? slashCommand.command, input.body ?? slashCommand.body, now(), id);
    return getSlashCommand(id);
  }
  function deleteSlashCommand(id) { db.prepare("DELETE FROM slash_commands WHERE id = ?").run(id); }

  // Keeps cloud/import history from turning the personal library into repeated pages.
  // A backup is written before any startup cleanup; relations are moved to the kept row.
  function cleanupLibraryEntries({ backup = true } = {}) {
    const noteRows = db.prepare("SELECT * FROM notes").all();
    const skillRows = db.prepare("SELECT * FROM skills").all();
    const commandRows = db.prepare("SELECT * FROM slash_commands").all();
    const referencedNotes = new Set(db.prepare("SELECT documentation_note_id AS id FROM bots WHERE documentation_note_id IS NOT NULL").all().map((row) => row.id));
    const catalogByName = new Map(CURATED_SKILLS.map((skill) => [normalizedLibraryName(skill.name), skill]));

    const blankNotes = noteRows.filter((note) => !normalizedLibraryText(note.title) && !normalizedLibraryText(note.body) && !referencedNotes.has(note.id));
    const blankSkills = skillRows.filter((skill) => !normalizedLibraryText(skill.name) && !normalizedLibraryText(skill.body) && !normalizedLibraryText(skill.source_url));
    const blankCommands = commandRows.filter((command) => !normalizedLibraryText(command.name) && !normalizedLibraryText(command.command) && !normalizedLibraryText(command.body));

    function duplicateGroups(rows, keyFor) {
      const groups = new Map();
      for (const row of rows) {
        const key = keyFor(row);
        if (!key) continue;
        const items = groups.get(key) || [];
        items.push(row);
        groups.set(key, items);
      }
      return [...groups.values()].filter((items) => items.length > 1);
    }

    const noteDuplicates = duplicateGroups(
      noteRows.filter((note) => !blankNotes.some((blank) => blank.id === note.id)),
      (note) => `${normalizedLibraryName(note.title)}\u0000${normalizedLibraryText(note.body)}`
    );
    const skillDuplicates = duplicateGroups(
      skillRows.filter((skill) => !blankSkills.some((blank) => blank.id === skill.id)),
      (skill) => normalizedLibraryName(skill.name)
    );
    const commandDuplicates = duplicateGroups(
      commandRows.filter((command) => !blankCommands.some((blank) => blank.id === command.id)),
      (command) => normalizedLibraryName(command.command) ? `command:${normalizedLibraryName(command.command)}` : `page:${normalizedLibraryName(command.name)}`
    );

    const duplicateNoteCount = noteDuplicates.reduce((total, items) => total + items.length - 1, 0);
    const duplicateSkillCount = skillDuplicates.reduce((total, items) => total + items.length - 1, 0);
    const duplicateCommandCount = commandDuplicates.reduce((total, items) => total + items.length - 1, 0);
    const removedNotes = blankNotes.length + duplicateNoteCount;
    const removedSkills = blankSkills.length + duplicateSkillCount;
    const removedCommands = blankCommands.length + duplicateCommandCount;
    if (!removedNotes && !removedSkills && !removedCommands) return { removedNotes: 0, removedSkills: 0, removedCommands: 0, backup: null };

    const safetyBackup = backup ? createBackup() : null;
    const updatedAt = now();
    const chooseNewest = (left, right) => String(right.updated_at || "").localeCompare(String(left.updated_at || "")) || String(left.id).localeCompare(String(right.id));
    // The survivor keeps its own updated_at. Stamping "now" made it the newest copy on this
    // device only, so two synced devices kept opposite copies and re-merged them forever.
    const cleanup = db.transaction(() => {
      for (const note of blankNotes) db.prepare("DELETE FROM notes WHERE id = ?").run(note.id);
      for (const items of noteDuplicates) {
        const ordered = [...items].sort((left, right) => Number(referencedNotes.has(right.id)) - Number(referencedNotes.has(left.id)) || Number(!right.deleted_at) - Number(!left.deleted_at) || chooseNewest(left, right));
        const keep = ordered[0];
        db.prepare("UPDATE notes SET pinned = ?, archived = ?, deleted_at = ? WHERE id = ?").run(Number(items.some((item) => item.pinned)), Number(items.every((item) => item.archived)), items.some((item) => !item.deleted_at) ? null : keep.deleted_at, keep.id);
        for (const duplicate of ordered.slice(1)) {
          db.prepare("INSERT OR IGNORE INTO note_tags (note_id, tag_id) SELECT ?, tag_id FROM note_tags WHERE note_id = ?").run(keep.id, duplicate.id);
          db.prepare("UPDATE compressions SET note_id = ? WHERE note_id = ?").run(keep.id, duplicate.id);
          db.prepare("UPDATE bots SET documentation_note_id = ? WHERE documentation_note_id = ?").run(keep.id, duplicate.id);
          db.prepare("DELETE FROM notes WHERE id = ?").run(duplicate.id);
        }
      }

      for (const skill of blankSkills) db.prepare("DELETE FROM skills WHERE id = ?").run(skill.id);
      for (const items of skillDuplicates) {
        const catalog = catalogByName.get(normalizedLibraryName(items[0].name));
        const ordered = [...items].sort((left, right) => Number(right.id === catalog?.id) - Number(left.id === catalog?.id) || Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) || chooseNewest(left, right));
        const keep = ordered[0];
        const pinned = Number(items.some((item) => item.pinned));
        if (catalog) db.prepare("UPDATE skills SET name = ?, category = ?, body = ?, source_url = ?, ownership = ?, pinned = ? WHERE id = ?").run(catalog.name, catalog.category, catalog.body, catalog.source_url, catalog.ownership, pinned, keep.id);
        else db.prepare("UPDATE skills SET pinned = ? WHERE id = ?").run(pinned, keep.id);
        for (const duplicate of ordered.slice(1)) {
          db.prepare("INSERT OR IGNORE INTO project_skills (project_id, skill_id) SELECT project_id, ? FROM project_skills WHERE skill_id = ?").run(keep.id, duplicate.id);
          db.prepare("INSERT OR IGNORE INTO project_skill_installs (project_id, skill_id, relative_path, content_hash, installed_at) SELECT project_id, ?, relative_path, content_hash, installed_at FROM project_skill_installs WHERE skill_id = ?").run(keep.id, duplicate.id);
          db.prepare("INSERT OR IGNORE INTO bot_relations (bot_id, relation_type, relation_id) SELECT bot_id, 'skill', ? FROM bot_relations WHERE relation_type = 'skill' AND relation_id = ?").run(keep.id, duplicate.id);
          db.prepare("DELETE FROM skills WHERE id = ?").run(duplicate.id);
        }
      }

      for (const command of blankCommands) db.prepare("DELETE FROM slash_commands WHERE id = ?").run(command.id);
      for (const items of commandDuplicates) {
        const ordered = [...items].sort(chooseNewest);
        const keep = ordered[0];
        for (const duplicate of ordered.slice(1)) {
          db.prepare("INSERT OR IGNORE INTO project_slash_commands (project_id, slash_command_id) SELECT project_id, ? FROM project_slash_commands WHERE slash_command_id = ?").run(keep.id, duplicate.id);
          db.prepare("INSERT OR IGNORE INTO project_command_installs (project_id, slash_command_id, relative_path, content_hash, installed_at) SELECT project_id, ?, relative_path, content_hash, installed_at FROM project_command_installs WHERE slash_command_id = ?").run(keep.id, duplicate.id);
          db.prepare("DELETE FROM slash_commands WHERE id = ?").run(duplicate.id);
        }
      }
    });
    cleanup();
    const report = { removedNotes, removedSkills, removedCommands, backup: safetyBackup?.name || null, cleanedAt: updatedAt };
    setSetting("libraryCleanup", report);
    return report;
  }
  function cleanJsonList(value, limit = 24) {
    const source = Array.isArray(value) ? value : [];
    return [...new Set(source.map((item) => String(item).trim()).filter(Boolean))].slice(0, limit);
  }
  function projectRow(row) {
    if (!row) return null;
    const tasks = db.prepare("SELECT * FROM project_tasks WHERE project_id = ? ORDER BY CASE status WHEN 'in_progress' THEN 0 WHEN 'blocked' THEN 1 WHEN 'todo' THEN 2 WHEN 'done' THEN 3 ELSE 4 END, manual_order, created_at").all(row.id).map((task) => ({ ...task, tags: JSON.parse(task.tags_json || "[]") }));
    return enrichProject({
      ...row,
      tags: JSON.parse(row.tags_json || "[]"),
      push_after_commit: Boolean(row.push_after_commit),
      tasks,
      skill_ids: db.prepare("SELECT skill_id FROM project_skills WHERE project_id = ? ORDER BY skill_id").all(row.id).map((item) => item.skill_id),
      slash_command_ids: db.prepare("SELECT slash_command_id FROM project_slash_commands WHERE project_id = ? ORDER BY slash_command_id").all(row.id).map((item) => item.slash_command_id),
      skill_installs: db.prepare("SELECT skill_id AS item_id, relative_path, content_hash, installed_at FROM project_skill_installs WHERE project_id = ? ORDER BY skill_id").all(row.id),
      command_installs: db.prepare("SELECT slash_command_id AS item_id, relative_path, content_hash, installed_at FROM project_command_installs WHERE project_id = ? ORDER BY slash_command_id").all(row.id),
      activity: db.prepare("SELECT * FROM project_activity WHERE project_id = ? ORDER BY created_at DESC LIMIT 100").all(row.id),
      canvas_items: db.prepare("SELECT * FROM project_canvas_items WHERE project_id = ? ORDER BY created_at").all(row.id),
    });
  }
  function listProjects() { return db.prepare("SELECT * FROM projects ORDER BY tier, tier_order, updated_at DESC").all().map(projectRow); }
  function getProject(id) { return projectRow(db.prepare("SELECT * FROM projects WHERE id = ?").get(id)); }
  function addProjectActivity(projectId, kind, summary, detail = "") {
    db.prepare("INSERT INTO project_activity (id, project_id, kind, summary, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(randomUUID(), projectId, kind, summary, detail, now());
  }
  function touchProject(projectId, worked = true) { const timestamp = now(); db.prepare("UPDATE projects SET updated_at = ?, last_worked_at = CASE WHEN ? THEN ? ELSE last_worked_at END, last_device = ? WHERE id = ?").run(timestamp, Number(worked), timestamp, DEVICE_NAME, projectId); }
  function createProject(input = {}) {
    const id = randomUUID(); const timestamp = now();
    const duplicate = db.prepare("SELECT name FROM projects WHERE (? IS NOT NULL AND lower(local_path) = lower(?)) OR (? IS NOT NULL AND lower(git_root) = lower(?)) OR (? IS NOT NULL AND lower(github_url) = lower(?))").get(input.localPath || null, input.localPath || null, input.gitRoot || null, input.gitRoot || null, input.githubUrl || null, input.githubUrl || null);
    if (duplicate) throw new Error(`This repository is already tracked as ${duplicate.name}.`);
    const rank = Number.isInteger(input.manualRank) ? input.manualRank : (db.prepare("SELECT COALESCE(MAX(manual_rank), -1) + 1 AS rank FROM projects").get().rank);
    const tier = Number.isInteger(input.tier) ? input.tier : ({ critical: 1, high: 2, medium: 3 }[input.priority] || 4);
    const tierOrder = Number.isInteger(input.tierOrder) ? input.tierOrder : db.prepare("SELECT COALESCE(MAX(tier_order), -1) + 1 AS value FROM projects WHERE tier = ?").get(tier).value;
    const category = String(input.category || "Uncategorized").trim() || "Uncategorized";
    db.prepare("INSERT INTO projects (id, name, description, status, priority, manual_rank, category, tier, tier_order, local_path, git_root, github_url, primary_language, tags_json, next_action, notes, push_after_commit, created_at, updated_at, last_worked_at, last_device) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, String(input.name || "Untitled project").trim(), input.description || "", input.status || "active", input.priority || "none", rank, category, tier, tierOrder, input.localPath || null, input.gitRoot === undefined ? input.localPath || null : input.gitRoot || null, input.githubUrl || null, input.primaryLanguage || "", JSON.stringify(cleanJsonList(input.tags)), input.nextAction || "", input.notes || "", Number(Boolean(input.pushAfterCommit)), timestamp, timestamp, input.lastWorkedAt || timestamp, DEVICE_NAME);
    addProjectActivity(id, "created", "Project added");
    return getProject(id);
  }
  function updateProject(id, input = {}) {
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id); if (!project) throw new Error("Project not found.");
    const tier = input.tier ?? project.tier;
    const tierOrder = input.tierOrder ?? (tier === project.tier ? project.tier_order : db.prepare("SELECT COALESCE(MAX(tier_order), -1) + 1 AS value FROM projects WHERE tier = ?").get(tier).value);
    const category = input.category === undefined ? project.category : String(input.category || "Uncategorized").trim() || "Uncategorized";
    db.prepare("UPDATE projects SET name = ?, description = ?, status = ?, priority = ?, manual_rank = ?, category = ?, tier = ?, tier_order = ?, local_path = ?, git_root = ?, github_url = ?, primary_language = ?, tags_json = ?, next_action = ?, notes = ?, push_after_commit = ?, updated_at = ?, last_worked_at = ?, last_device = ? WHERE id = ?").run(input.name ?? project.name, input.description ?? project.description, input.status ?? project.status, input.priority ?? project.priority, input.manualRank ?? project.manual_rank, category, tier, tierOrder, input.localPath === undefined ? project.local_path : input.localPath || null, input.gitRoot === undefined ? project.git_root : input.gitRoot || null, input.githubUrl === undefined ? project.github_url : input.githubUrl || null, input.primaryLanguage ?? project.primary_language, JSON.stringify(input.tags === undefined ? JSON.parse(project.tags_json || "[]") : cleanJsonList(input.tags)), input.nextAction ?? project.next_action, input.notes ?? project.notes, input.pushAfterCommit === undefined ? project.push_after_commit : Number(Boolean(input.pushAfterCommit)), now(), input.lastWorkedAt ?? project.last_worked_at, DEVICE_NAME, id);
    addProjectActivity(id, "updated", "Project details updated");
    return getProject(id);
  }
  function reorderProjects(ids) {
    const update = db.prepare("UPDATE projects SET manual_rank = ?, updated_at = ? WHERE id = ?");
    db.transaction(() => ids.forEach((id, rank) => update.run(rank, now(), id)))();
    return listProjects();
  }
  function moveProject(id, tier, beforeId = null) {
    const project = db.prepare("SELECT id, tier FROM projects WHERE id = ?").get(id); if (!project) throw new Error("Project not found.");
    const targetTier = Math.max(1, Math.min(4, Number(tier) || 4));
    db.transaction(() => {
      db.prepare("UPDATE projects SET tier = ?, updated_at = ?, last_device = ? WHERE id = ?").run(targetTier, now(), DEVICE_NAME, id);
      const targetIds = db.prepare("SELECT id FROM projects WHERE tier = ? AND id <> ? ORDER BY tier_order, manual_rank, updated_at DESC").all(targetTier, id).map((item) => item.id);
      const beforeIndex = beforeId ? targetIds.indexOf(beforeId) : -1;
      targetIds.splice(beforeIndex >= 0 ? beforeIndex : targetIds.length, 0, id);
      const updateOrder = db.prepare("UPDATE projects SET tier_order = ? WHERE id = ?");
      targetIds.forEach((projectId, order) => updateOrder.run(order, projectId));
      if (project.tier !== targetTier) db.prepare("SELECT id FROM projects WHERE tier = ? ORDER BY tier_order, manual_rank, updated_at DESC").all(project.tier).forEach((item, order) => updateOrder.run(order, item.id));
    })();
    return listProjects();
  }
  function setProjectLogo(id, logoPath) {
    db.prepare("UPDATE projects SET logo_path = ? WHERE id = ?").run(logoPath || "", id);
    return getProject(id);
  }
  function removeProject(id) { db.prepare("DELETE FROM projects WHERE id = ?").run(id); }
  function createProjectTask(projectId, input = {}) {
    if (!db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId)) throw new Error("Project not found.");
    const id = randomUUID(); const timestamp = now();
    const order = db.prepare("SELECT COALESCE(MAX(manual_order), -1) + 1 AS value FROM project_tasks WHERE project_id = ? AND status = ?").get(projectId, input.status || "todo").value;
    db.prepare("INSERT INTO project_tasks (id, project_id, title, description, status, priority, manual_order, due_date, tags_json, related, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, projectId, String(input.title || "").trim(), input.description || "", input.status || "todo", input.priority || "medium", order, input.dueDate || null, JSON.stringify(cleanJsonList(input.tags)), input.related || "", timestamp, timestamp);
    touchProject(projectId);
    addProjectActivity(projectId, "task", "Task added", String(input.title || "").trim());
    return getProject(projectId);
  }
  function updateProjectTask(id, input = {}) {
    const task = db.prepare("SELECT * FROM project_tasks WHERE id = ?").get(id); if (!task) throw new Error("Task not found.");
    const status = input.status ?? task.status; const timestamp = now();
    db.prepare("UPDATE project_tasks SET title = ?, description = ?, status = ?, priority = ?, manual_order = ?, due_date = ?, tags_json = ?, related = ?, completed_at = ?, updated_at = ? WHERE id = ?").run(input.title ?? task.title, input.description ?? task.description, status, input.priority ?? task.priority, input.manualOrder ?? task.manual_order, input.dueDate === undefined ? task.due_date : input.dueDate || null, JSON.stringify(input.tags === undefined ? JSON.parse(task.tags_json || "[]") : cleanJsonList(input.tags)), input.related ?? task.related, status === "done" ? task.completed_at || timestamp : null, timestamp, id);
    touchProject(task.project_id);
    addProjectActivity(task.project_id, "task", status === "done" ? "Task completed" : "Task updated", input.title ?? task.title);
    return getProject(task.project_id);
  }
  function moveProjectTask(id, status, beforeId = null) {
    const task = db.prepare("SELECT * FROM project_tasks WHERE id = ?").get(id); if (!task) throw new Error("Task not found.");
    const targetStatus = ["todo", "in_progress", "blocked", "done"].includes(status) ? status : "todo";
    const timestamp = now();
    db.transaction(() => {
      db.prepare("UPDATE project_tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?").run(targetStatus, targetStatus === "done" ? task.completed_at || timestamp : null, timestamp, id);
      const targetIds = db.prepare("SELECT id FROM project_tasks WHERE project_id = ? AND status = ? AND id <> ? ORDER BY manual_order, created_at").all(task.project_id, targetStatus, id).map((item) => item.id);
      const beforeIndex = beforeId ? targetIds.indexOf(beforeId) : -1;
      targetIds.splice(beforeIndex >= 0 ? beforeIndex : targetIds.length, 0, id);
      const updateOrder = db.prepare("UPDATE project_tasks SET manual_order = ? WHERE id = ?");
      targetIds.forEach((taskId, order) => updateOrder.run(order, taskId));
      if (task.status !== targetStatus) db.prepare("SELECT id FROM project_tasks WHERE project_id = ? AND status = ? ORDER BY manual_order, created_at").all(task.project_id, task.status).forEach((item, order) => updateOrder.run(order, item.id));
    })();
    touchProject(task.project_id);
    addProjectActivity(task.project_id, "task", targetStatus === "done" ? "Task completed" : "Task moved", task.title);
    return getProject(task.project_id);
  }
  function removeProjectTask(id) { const task = db.prepare("SELECT project_id, title FROM project_tasks WHERE id = ?").get(id); if (!task) throw new Error("Task not found."); db.prepare("DELETE FROM project_tasks WHERE id = ?").run(id); touchProject(task.project_id); addProjectActivity(task.project_id, "task", "Task deleted", task.title); return getProject(task.project_id); }
  function setProjectAssignments(projectId, input = {}) {
    if (!db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId)) throw new Error("Project not found.");
    db.transaction(() => {
      if (input.skillIds) { db.prepare("DELETE FROM project_skills WHERE project_id = ?").run(projectId); const insert = db.prepare("INSERT OR IGNORE INTO project_skills (project_id, skill_id) VALUES (?, ?)"); cleanJsonList(input.skillIds, 200).forEach((id) => insert.run(projectId, id)); }
      if (input.slashCommandIds) { db.prepare("DELETE FROM project_slash_commands WHERE project_id = ?").run(projectId); const insert = db.prepare("INSERT OR IGNORE INTO project_slash_commands (project_id, slash_command_id) VALUES (?, ?)"); cleanJsonList(input.slashCommandIds, 200).forEach((id) => insert.run(projectId, id)); }
    })();
    touchProject(projectId, false);
    addProjectActivity(projectId, "assignment", "Skills and commands updated");
    return getProject(projectId);
  }
  function getProjectToolInstall(projectId, kind, itemId) {
    const table = kind === "skill" ? "project_skill_installs" : "project_command_installs";
    const column = kind === "skill" ? "skill_id" : "slash_command_id";
    return db.prepare(`SELECT ${column} AS item_id, relative_path, content_hash, installed_at FROM ${table} WHERE project_id = ? AND ${column} = ?`).get(projectId, itemId) || null;
  }
  function setProjectToolInstall(projectId, kind, itemId, relativePath, contentHash) {
    const table = kind === "skill" ? "project_skill_installs" : "project_command_installs";
    const column = kind === "skill" ? "skill_id" : "slash_command_id";
    db.prepare(`INSERT INTO ${table} (project_id, ${column}, relative_path, content_hash, installed_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(project_id, ${column}) DO UPDATE SET relative_path = excluded.relative_path, content_hash = excluded.content_hash, installed_at = excluded.installed_at`).run(projectId, itemId, relativePath, contentHash, now());
    touchProject(projectId, false);
    return getProject(projectId);
  }
  function removeProjectToolInstall(projectId, kind, itemId) {
    const table = kind === "skill" ? "project_skill_installs" : "project_command_installs";
    const column = kind === "skill" ? "skill_id" : "slash_command_id";
    db.prepare(`DELETE FROM ${table} WHERE project_id = ? AND ${column} = ?`).run(projectId, itemId);
    touchProject(projectId, false);
    return getProject(projectId);
  }
  function createProjectCanvasItem(projectId, input = {}) {
    if (!db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId)) throw new Error("Project not found.");
    const id = randomUUID(); const timestamp = now(); const count = db.prepare("SELECT COUNT(*) AS value FROM project_canvas_items WHERE project_id = ?").get(projectId).value;
    db.prepare("INSERT INTO project_canvas_items (id, project_id, title, body, color, x, y, width, height, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, projectId, String(input.title || "New card").slice(0, 160), String(input.body || "").slice(0, 10_000), input.color || "yellow", input.x ?? 24 + (count % 3) * 244, input.y ?? 24 + Math.floor(count / 3) * 174, input.width ?? 220, input.height ?? 150, timestamp, timestamp);
    touchProject(projectId); addProjectActivity(projectId, "canvas", "Canvas card added", String(input.title || "New card").slice(0, 160)); return getProject(projectId);
  }
  function updateProjectCanvasItem(id, input = {}) {
    const item = db.prepare("SELECT * FROM project_canvas_items WHERE id = ?").get(id); if (!item) throw new Error("Canvas card not found.");
    db.prepare("UPDATE project_canvas_items SET title = ?, body = ?, color = ?, x = ?, y = ?, width = ?, height = ?, updated_at = ? WHERE id = ?").run(input.title ?? item.title, input.body ?? item.body, input.color ?? item.color, input.x ?? item.x, input.y ?? item.y, input.width ?? item.width, input.height ?? item.height, now(), id);
    touchProject(item.project_id); return getProject(item.project_id);
  }
  function removeProjectCanvasItem(id) { const item = db.prepare("SELECT project_id FROM project_canvas_items WHERE id = ?").get(id); if (!item) throw new Error("Canvas card not found."); db.prepare("DELETE FROM project_canvas_items WHERE id = ?").run(id); touchProject(item.project_id); return getProject(item.project_id); }
  function getDailyTask(id) {
    const task = db.prepare("SELECT * FROM daily_tasks WHERE id = ?").get(id);
    return task ? { ...task, carried: Boolean(task.carried_from_id) } : null;
  }
  function listDailyTasks() {
    return db.prepare("SELECT * FROM daily_tasks ORDER BY task_date DESC, priority, created_at").all();
  }
  function normalizedDailyActivities(input) {
    const byId = new Map();
    for (const raw of Array.isArray(input) ? input : []) {
      const activityDate = String(raw?.activity_date || raw?.activityDate || "");
      const text = String(raw?.text || "").trim().slice(0, 500);
      const startMinute = Number(raw?.start_minute ?? raw?.startMinute);
      const durationMinutes = Number(raw?.duration_minutes ?? raw?.durationMinutes);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(activityDate) || !text || !Number.isInteger(startMinute) || ![1, 5].includes(durationMinutes) || startMinute < 0 || startMinute + durationMinutes > 1440) continue;
      const activity = { id: String(raw.id || randomUUID()), activity_date: activityDate, text, start_minute: startMinute, duration_minutes: durationMinutes, created_at: raw.created_at || now(), updated_at: raw.updated_at || now() };
      const existing = byId.get(activity.id);
      if (!existing || String(activity.updated_at) >= String(existing.updated_at)) byId.set(activity.id, activity);
    }
    return [...byId.values()].sort((left, right) => right.activity_date.localeCompare(left.activity_date) || left.start_minute - right.start_minute || String(left.created_at).localeCompare(String(right.created_at)));
  }
  function listDailyActivities(date) {
    if (date) return db.prepare("SELECT * FROM daily_activities WHERE activity_date = ? ORDER BY start_minute, created_at").all(date);
    return db.prepare("SELECT * FROM daily_activities ORDER BY activity_date DESC, start_minute, created_at").all();
  }
  function insertDailyActivityRows(input) {
    const activities = normalizedDailyActivities(input);
    const insert = db.prepare("INSERT INTO daily_activities (id, activity_date, text, start_minute, duration_minutes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (const activity of activities) insert.run(activity.id, activity.activity_date, activity.text, activity.start_minute, activity.duration_minutes, activity.created_at, activity.updated_at);
    return activities;
  }
  function insertDailyTaskRows(input) {
    const tasks = normalizeDailyTasks(input);
    const insert = db.prepare("INSERT INTO daily_tasks (id, task_date, text, status, priority, owner, completed_at, completed_on, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const task of tasks) insert.run(task.id, task.task_date, task.text, task.status, taskPriority(task.priority), taskOwner(task.owner), task.completed_at || null, task.completed_on || null, task.created_at || now(), task.updated_at || now());
    const connect = db.prepare("UPDATE daily_tasks SET carried_from_id = ? WHERE id = ?");
    for (const task of tasks) if (task.carried_from_id) connect.run(task.carried_from_id, task.id);
    return tasks;
  }
  function dailyTasksDiffer(before, after) {
    if (before.length !== after.length) return true;
    const byId = new Map(before.map((task) => [task.id, task]));
    return after.some((task) => !byId.has(task.id) || JSON.stringify(byId.get(task.id)) !== JSON.stringify(task));
  }
  function repairDailyTasks({ backup = true } = {}) {
    const before = listDailyTasks();
    const after = normalizeDailyTasks(before);
    if (!dailyTasksDiffer(before, after)) return 0;
    if (backup) createBackup();
    db.transaction(() => {
      db.prepare("DELETE FROM daily_tasks").run();
      insertDailyTaskRows(after);
    })();
    return before.length - after.length;
  }
  function rollDailyTasks(date = localDate()) {
    const overdue = db.prepare("SELECT * FROM daily_tasks WHERE task_date < ? AND status = 'open' ORDER BY task_date, created_at").all(date);
    if (!overdue.length) return 0;
    const timestamp = now();
    let moved = 0;
    const roll = db.transaction(() => {
      const markCarried = db.prepare("UPDATE daily_tasks SET status = 'carried', updated_at = ? WHERE id = ? AND status = 'open'");
      const insert = db.prepare("INSERT OR IGNORE INTO daily_tasks (id, task_date, text, status, priority, owner, carried_from_id, created_at, updated_at) VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?)");
      for (const task of overdue) {
        if (!markCarried.run(timestamp, task.id).changes) continue;
        insert.run(dailyCarryId(task.id, date), date, task.text, taskPriority(task.priority), taskOwner(task.owner), task.id, timestamp, timestamp);
        moved += 1;
      }
    });
    roll();
    if (moved && typeof onChange === "function") onChange("rollDailyTasks");
    return moved;
  }
  function dailyDashboard(date = localDate()) {
    rollDailyTasks(date);
    const tomorrow = shiftDate(date, 1);
    const todayTasks = db.prepare("SELECT * FROM daily_tasks WHERE task_date = ? AND status = 'open' ORDER BY priority, created_at").all(date);
    const tomorrowTasks = db.prepare("SELECT * FROM daily_tasks WHERE task_date = ? AND status = 'open' ORDER BY priority, created_at").all(tomorrow);
    const done = db.prepare("SELECT * FROM daily_tasks WHERE completed_on = ? AND status = 'done' ORDER BY completed_at DESC").all(date);
    const history = [];
    const completedCount = db.prepare("SELECT COUNT(*) AS count FROM daily_tasks WHERE completed_on = ? AND status = 'done'");
    for (let offset = 0; offset < 7; offset += 1) {
      const day = shiftDate(date, -offset);
      history.push({ date: day, completed: completedCount.get(day).count });
    }
    const hydrate = (task) => ({ ...task, carried: Boolean(task.carried_from_id) });
    const activities = listDailyActivities(date);
    return {
      date,
      tomorrowDate: tomorrow,
      today: todayTasks.map(hydrate),
      done: done.map(hydrate),
      tomorrow: tomorrowTasks.map(hydrate),
      history,
      carriedCount: todayTasks.filter((task) => task.carried_from_id).length,
      activities,
      loggedMinutes: activities.reduce((total, activity) => total + activity.duration_minutes, 0),
    };
  }
  function dailyPage(viewDate = localDate(), todayDate = localDate()) {
    if (viewDate === todayDate) rollDailyTasks(todayDate);
    const nextDate = shiftDate(viewDate, 1);
    const hydrate = (task) => ({ ...task, carried: Boolean(task.carried_from_id), moved: task.status === "carried" });
    const items = db.prepare("SELECT * FROM daily_tasks WHERE task_date = ? ORDER BY created_at").all(viewDate).map(hydrate);
    const tomorrow = db.prepare("SELECT * FROM daily_tasks WHERE task_date = ? AND status <> 'carried' ORDER BY created_at").all(nextDate).map(hydrate);
    const open = items.filter((task) => task.status === "open");
    const done = items.filter((task) => task.status === "done");
    const moved = items.filter((task) => task.status === "carried");
    const activities = listDailyActivities(viewDate);
    return {
      date: viewDate,
      today: todayDate,
      tomorrowDate: nextDate,
      isToday: viewDate === todayDate,
      isFuture: viewDate > todayDate,
      items,
      tomorrow,
      openCount: open.length,
      doneCount: done.length,
      movedCount: moved.length,
      carriedCount: items.filter((task) => task.carried && task.status !== "carried").length,
      activities,
      loggedMinutes: activities.reduce((total, activity) => total + activity.duration_minutes, 0),
    };
  }
  function dailyMonth(month = localDate().slice(0, 7)) {
    const rows = db.prepare(`
      SELECT date, SUM(total) AS total, SUM(done) AS done, SUM(activity_count) AS activity_count, SUM(logged_minutes) AS logged_minutes
      FROM (
        SELECT task_date AS date, COUNT(*) AS total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done, 0 AS activity_count, 0 AS logged_minutes
        FROM daily_tasks WHERE task_date LIKE ? GROUP BY task_date
        UNION ALL
        SELECT activity_date AS date, 0 AS total, 0 AS done, COUNT(*) AS activity_count, SUM(duration_minutes) AS logged_minutes
        FROM daily_activities WHERE activity_date LIKE ? GROUP BY activity_date
      ) GROUP BY date ORDER BY date
    `).all(`${month}-%`, `${month}-%`);
    return { month, days: rows.map((row) => ({ date: row.date, total: Number(row.total), done: Number(row.done), activityCount: Number(row.activity_count), loggedMinutes: Number(row.logged_minutes) })) };
  }
  function createDailyTask(input, date = localDate()) {
    const text = String(input?.text || "").trim();
    if (!text) throw new Error("Task text is required.");
    const taskDate = input.bucket === "tomorrow" ? shiftDate(date, 1) : date;
    const timestamp = now();
    const completed = Boolean(input.completed) && input.bucket !== "tomorrow";
    db.prepare("INSERT INTO daily_tasks (id, task_date, text, status, priority, owner, completed_at, completed_on, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(randomUUID(), taskDate, text, completed ? "done" : "open", taskPriority(input.priority), taskOwner(input.owner), completed ? timestamp : null, completed ? date : null, timestamp, timestamp);
    return dailyDashboard(date);
  }
  function updateDailyTask(id, input, date = localDate()) {
    const task = getDailyTask(id);
    if (!task) throw new Error("Daily task not found.");
    const patch = typeof input === "string" ? { text: input } : input || {};
    const clean = String(patch.text ?? task.text).trim();
    if (!clean) throw new Error("Task text is required.");
    const taskDate = patch.bucket === "tomorrow" ? shiftDate(date, 1) : patch.bucket === "today" ? date : task.task_date;
    db.prepare("UPDATE daily_tasks SET text = ?, task_date = ?, priority = ?, owner = ?, updated_at = ? WHERE id = ?").run(clean, taskDate, taskPriority(patch.priority ?? task.priority), taskOwner(patch.owner ?? task.owner), now(), id);
    return dailyDashboard(date);
  }
  function completeDailyTask(id, completed, date = localDate()) {
    const task = getDailyTask(id);
    if (!task) throw new Error("Daily task not found.");
    const timestamp = now();
    if (completed) db.prepare("UPDATE daily_tasks SET status = 'done', completed_at = ?, completed_on = ?, updated_at = ? WHERE id = ?").run(timestamp, date, timestamp, id);
    else db.prepare("UPDATE daily_tasks SET task_date = ?, status = 'open', completed_at = NULL, completed_on = NULL, updated_at = ? WHERE id = ?").run(date, timestamp, id);
    return dailyDashboard(date);
  }
  function deleteDailyTask(id, date = localDate()) {
    db.prepare("DELETE FROM daily_tasks WHERE id = ?").run(id);
    return dailyDashboard(date);
  }
  function validateDailyActivity(input, fallback = {}) {
    const text = String(input?.text ?? fallback.text ?? "").trim();
    const startMinute = Number(input?.startMinute ?? input?.start_minute ?? fallback.start_minute);
    const durationMinutes = Number(input?.durationMinutes ?? input?.duration_minutes ?? fallback.duration_minutes);
    if (!text) throw new Error("Activity text is required.");
    if (!Number.isInteger(startMinute) || startMinute < 0 || startMinute > 1439) throw new Error("Activity time is invalid.");
    if (![1, 5].includes(durationMinutes)) throw new Error("Activity duration must be 1 or 5 minutes.");
    if (startMinute + durationMinutes > 1440) throw new Error("Activity must end on the same day.");
    return { text: text.slice(0, 500), startMinute, durationMinutes };
  }
  function createDailyActivity(input, date = localDate()) {
    const activity = validateDailyActivity(input);
    const timestamp = now();
    db.prepare("INSERT INTO daily_activities (id, activity_date, text, start_minute, duration_minutes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(randomUUID(), date, activity.text, activity.startMinute, activity.durationMinutes, timestamp, timestamp);
    return dailyPage(date);
  }
  function updateDailyActivity(id, input) {
    const existing = db.prepare("SELECT * FROM daily_activities WHERE id = ?").get(id);
    if (!existing) throw new Error("Daily activity not found.");
    const activity = validateDailyActivity(input, existing);
    db.prepare("UPDATE daily_activities SET text = ?, start_minute = ?, duration_minutes = ?, updated_at = ? WHERE id = ?").run(activity.text, activity.startMinute, activity.durationMinutes, now(), id);
    return dailyPage(existing.activity_date);
  }
  function deleteDailyActivity(id) {
    const existing = db.prepare("SELECT activity_date FROM daily_activities WHERE id = ?").get(id);
    if (!existing) throw new Error("Daily activity not found.");
    db.prepare("DELETE FROM daily_activities WHERE id = ?").run(id);
    return dailyPage(existing.activity_date);
  }
  function updateNote(id, input) {
    const note = getNote(id); if (!note) throw new Error("Note not found.");
    db.prepare("UPDATE notes SET title = ?, body = ?, folder_id = ?, pinned = ?, archived = ?, updated_at = ? WHERE id = ?").run(input.title ?? note.title, input.body ?? note.body, input.folderId ?? note.folder_id, input.pinned === undefined ? Number(note.pinned) : Number(input.pinned), input.archived === undefined ? Number(note.archived) : Number(input.archived), now(), id);
    if (input.body !== undefined) indexNoteLinks(id, input.body);
    return getNote(id);
  }
  // --- Wiki-links -------------------------------------------------------------------
  // Every `[[target]]` in a note is stored by its canonical key, so backlinks are a single
  // indexed lookup instead of a scan over every body. Links are kept by TITLE rather than by
  // id: a note can be linked before it exists, and renaming a note re-points its backlinks
  // without rewriting anyone's text.
  function indexNoteLinks(noteId, body) {
    const targets = wikilinkTargets(body);
    const write = db.transaction(() => {
      db.prepare("DELETE FROM note_links WHERE source_id = ?").run(noteId);
      const insert = db.prepare("INSERT OR IGNORE INTO note_links (source_id, target_key, target_title) VALUES (?, ?, ?)");
      for (const target of targets) insert.run(noteId, linkKey(target), target);
    });
    write();
  }

  // Notes that link to this one, newest first, each with the line the link sits on.
  function backlinks(noteId) {
    const note = getNote(noteId);
    if (!note?.title?.trim()) return [];
    const rows = db.prepare(`
      SELECT n.id, n.title, n.body, n.updated_at FROM note_links l
      JOIN notes n ON n.id = l.source_id
      WHERE l.target_key = ? AND n.id != ? AND n.deleted_at IS NULL
      ORDER BY n.updated_at DESC
    `).all(linkKey(note.title), noteId);
    return rows.map(({ id, title, body, updated_at }) => ({ id, title, updated_at, context: linkContext(body, note.title) }));
  }

  // Targets that no note answers to yet, so the UI can offer to create them.
  function brokenLinks() {
    return db.prepare(`
      SELECT DISTINCT l.target_title AS title FROM note_links l
      WHERE NOT EXISTS (
        SELECT 1 FROM notes n WHERE n.deleted_at IS NULL AND TRIM(LOWER(n.title)) = l.target_key
      ) ORDER BY l.target_title COLLATE NOCASE
    `).all().map((row) => row.title);
  }

  // One pass over every note, used once on upgrade to fill the index for notes written
  // before links existed.
  function reindexAllLinks() {
    const rows = db.prepare("SELECT id, body FROM notes").all();
    for (const row of rows) indexNoteLinks(row.id, row.body);
    return rows.length;
  }

  function setTags(noteId, names) {
    const clean = [...new Set(names.map((name) => name.trim()).filter(Boolean))].slice(0, 12);
    const run = db.transaction(() => {
      db.prepare("DELETE FROM note_tags WHERE note_id = ?").run(noteId);
      for (const name of clean) {
        let tag = db.prepare("SELECT id FROM tags WHERE name = ? COLLATE NOCASE").get(name);
        if (!tag) { tag = { id: randomUUID() }; db.prepare("INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)").run(tag.id, name, now()); }
        db.prepare("INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)").run(noteId, tag.id);
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
  function renameFolder(id, name) {
    if (id === inbox.id) throw new Error("Inbox cannot be renamed.");
    const clean = name.trim();
    if (!clean) throw new Error("Folder name is required.");
    db.prepare("UPDATE folders SET name = ? WHERE id = ?").run(clean, id);
  }
  function removeFolder(id) { if (id === inbox.id) throw new Error("Inbox cannot be removed."); const run = db.transaction(() => { db.prepare("UPDATE notes SET folder_id = ? WHERE folder_id = ?").run(inbox.id, id); db.prepare("DELETE FROM folders WHERE id = ?").run(id); }); run(); }
  function createCompression(input) {
    const id = randomUUID(); const timestamp = now();
    db.prepare("INSERT INTO compressions (id, note_id, source_text, compressed_text, preset, rate, origin_tokens, compressed_tokens, ratio, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, input.noteId || null, input.sourceText, input.compressedText, input.preset, input.rate, input.originTokens ?? null, input.compressedTokens ?? null, input.ratio ?? null, timestamp);
    return { id, ...input, created_at: timestamp };
  }
  function listCompressions(noteId) { return db.prepare("SELECT * FROM compressions WHERE note_id = ? ORDER BY created_at DESC").all(noteId); }
  function importCompressions(rows, ignore = false) {
    const insert = db.prepare(`INSERT ${ignore ? "OR IGNORE " : ""}INTO compressions (id, note_id, source_text, compressed_text, preset, rate, origin_tokens, compressed_tokens, ratio, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const compression of rows) {
      const noteId = compression.note_id && db.prepare("SELECT id FROM notes WHERE id = ?").get(compression.note_id)?.id;
      insert.run(compression.id || randomUUID(), noteId || null, compression.source_text || "", compression.compressed_text || "", compression.preset || "Balanced", compression.rate ?? 0.6, compression.origin_tokens ?? null, compression.compressed_tokens ?? null, compression.ratio ?? null, compression.created_at || now());
    }
  }
  function exportData() { return { version: 12, exportedAt: now(), folders: listFolders(), notes: listNotes(), skills: listSkills(), slashCommands: listSlashCommands(), projects: listProjects(), dailyTasks: listDailyTasks(), dailyActivities: listDailyActivities(), compressions: db.prepare("SELECT * FROM compressions ORDER BY created_at DESC").all(), ...botRepo.exportBotData() }; }
  function importData(data) {
    if (!data || !Array.isArray(data.notes)) throw new Error("That is not a Notebook JSON backup.");
    const dailyTasks = normalizeDailyTasks([...listDailyTasks(), ...(data.dailyTasks || [])]);
    const dailyActivities = normalizedDailyActivities([...listDailyActivities(), ...(data.dailyActivities || [])]);
    const run = db.transaction(() => {
      for (const folder of data.folders || []) if (folder.id !== inbox.id) db.prepare("INSERT OR IGNORE INTO folders (id, name, is_inbox, created_at) VALUES (?, ?, 0, ?)").run(folder.id, folder.name, folder.created_at || now());
      for (const note of data.notes) {
        const folderId = db.prepare("SELECT id FROM folders WHERE id = ?").get(note.folder_id)?.id || inbox.id;
        const noteId = note.id || randomUUID();
        const inserted = db.prepare("INSERT OR IGNORE INTO notes (id, title, body, folder_id, pinned, archived, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(noteId, note.title || "", note.body || "", folderId, Number(Boolean(note.pinned)), Number(Boolean(note.archived)), note.deleted_at || null, note.created_at || now(), note.updated_at || now());
        if (inserted.changes && Array.isArray(note.tags)) setTags(noteId, note.tags.map((tag) => tag.name));
      }
      importCompressions(data.compressions || [], true);
      for (const skill of data.skills || []) {
        db.prepare("INSERT OR IGNORE INTO skills (id, name, category, body, source_url, ownership, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(skill.id || randomUUID(), skill.name || "", skill.category || "Unsorted", skill.body || "", skill.source_url || skill.sourceUrl || "", skill.ownership === "other" ? "other" : "mine", Number(Boolean(skill.pinned)), skill.created_at || now(), skill.updated_at || now());
      }
      for (const slashCommand of data.slashCommands || []) {
        db.prepare("INSERT OR IGNORE INTO slash_commands (id, name, command, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(slashCommand.id || randomUUID(), slashCommand.name || "", slashCommand.command || "", slashCommand.body || "", slashCommand.created_at || now(), slashCommand.updated_at || now());
      }
      for (const project of data.projects || []) importProject(project, true);
      db.prepare("DELETE FROM daily_tasks").run();
      insertDailyTaskRows(dailyTasks);
      db.prepare("DELETE FROM daily_activities").run();
      insertDailyActivityRows(dailyActivities);
      botRepo.importBotData(data);
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
  // Keep the newest backups plus the last one from each of the most recent days, so a burst of
  // sync safety backups can never push every older day out of the folder.
  function pruneBackups() {
    const backups = listBackups();
    const keep = new Set(backups.slice(0, BACKUP_RETENTION).map((backup) => backup.name));
    const days = new Set();
    for (const backup of backups) {
      const day = backup.createdAt.slice(0, 10);
      if (days.has(day)) continue;
      if (days.size >= BACKUP_RETENTION) break;
      days.add(day);
      keep.add(backup.name);
    }
    for (const backup of backups) if (!keep.has(backup.name)) fs.rmSync(path.join(backupDirectory(), backup.name), { force: true });
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
    const dailyTasks = normalizeDailyTasks(data.dailyTasks || []);
    const dailyActivities = normalizedDailyActivities(data.dailyActivities || []);
    const restore = db.transaction(() => {
      db.prepare("DELETE FROM note_tags").run();
      db.prepare("DELETE FROM tags").run();
      db.prepare("DELETE FROM compressions").run();
      db.prepare("DELETE FROM notes").run();
      db.prepare("DELETE FROM skills").run();
      db.prepare("DELETE FROM daily_tasks").run();
      db.prepare("DELETE FROM daily_activities").run();
      if (Array.isArray(data.projects)) db.prepare("DELETE FROM projects").run();
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
          // Keep the snapshot's tag id so a restore is idempotent and never reads as a sync edit.
          const wantedId = typeof rawTag?.id === "string" && rawTag.id && !db.prepare("SELECT 1 FROM tags WHERE id = ?").get(rawTag.id) ? rawTag.id : randomUUID();
          if (!tag) { tag = { id: wantedId }; db.prepare("INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)").run(tag.id, tagName, rawTag?.created_at || now()); }
          db.prepare("INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)").run(noteId, tag.id);
        }
      }
      importCompressions(data.compressions || []);
      for (const skill of data.skills || []) {
        db.prepare("INSERT INTO skills (id, name, category, body, source_url, ownership, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(skill.id || randomUUID(), skill.name || "", skill.category || "Unsorted", skill.body || "", skill.source_url || skill.sourceUrl || "", skill.ownership === "other" ? "other" : "mine", Number(Boolean(skill.pinned)), skill.created_at || now(), skill.updated_at || now());
      }
      for (const slashCommand of data.slashCommands || []) {
        db.prepare("INSERT INTO slash_commands (id, name, command, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(slashCommand.id || randomUUID(), slashCommand.name || "", slashCommand.command || "", slashCommand.body || "", slashCommand.created_at || now(), slashCommand.updated_at || now());
      }
      for (const project of data.projects || []) importProject(project, false);
      insertDailyTaskRows(dailyTasks);
      insertDailyActivityRows(dailyActivities);
      botRepo.importBotData(data, { replace: true });
    });
    restore();
    return { notes: listNotes(), skills: listSkills(), slashCommands: listSlashCommands(), projects: listProjects(), bots: botRepo.listBots({ includeArchived: true }) };
  }

  function replaceData(data) {
    if (!data || !Array.isArray(data.notes)) throw new Error("This is not a Notebook backup.");
    const name = `notebook-backup-0000-${randomUUID().replaceAll("-", "").slice(0, 12)}.json`;
    const destination = path.join(backupDirectory(), name);
    const temporary = `${destination}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(data), "utf8");
    fs.renameSync(temporary, destination);
    try {
      restoreBackup(name);
      cleanupLibraryEntries({ backup: false });
      return { notes: listNotes(), skills: listSkills(), slashCommands: listSlashCommands(), projects: listProjects(), bots: botRepo.listBots({ includeArchived: true }) };
    }
    finally { fs.rmSync(destination, { force: true }); }
  }

  function importProject(project, ignore = true) {
    const verb = ignore ? "INSERT OR IGNORE" : "INSERT"; const projectId = project.id || randomUUID();
    const priority = project.priority || "none";
    const tier = project.tier ?? ({ critical: 1, high: 2, medium: 3 }[priority] || 4);
    db.prepare(`${verb} INTO projects (id, name, description, status, priority, manual_rank, category, tier, tier_order, local_path, git_root, github_url, primary_language, tags_json, next_action, notes, push_after_commit, created_at, updated_at, last_worked_at, last_device, logo_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ).run(projectId, project.name || "Untitled project", project.description || "", project.status || "active", priority, project.manual_rank ?? project.manualRank ?? 0, project.category || "Uncategorized", tier, project.tier_order ?? project.tierOrder ?? project.manual_rank ?? project.manualRank ?? 0, project.local_path || project.localPath || null, project.git_root || project.gitRoot || null, project.github_url || project.githubUrl || null, project.primary_language || project.primaryLanguage || "", JSON.stringify(cleanJsonList(project.tags)), project.next_action || project.nextAction || "", project.notes || "", Number(Boolean(project.push_after_commit ?? project.pushAfterCommit)), project.created_at || now(), project.updated_at || now(), project.last_worked_at || project.lastWorkedAt || null, project.last_device || DEVICE_NAME, project.logo_path || project.logoPath || "");
    const taskInsert = db.prepare(`${verb} INTO project_tasks (id, project_id, title, description, status, priority, manual_order, due_date, tags_json, related, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const task of project.tasks || []) taskInsert.run(task.id || randomUUID(), projectId, task.title || "Untitled task", task.description || "", task.status || "todo", task.priority || "medium", task.manual_order ?? task.manualOrder ?? 0, task.due_date || task.dueDate || null, JSON.stringify(cleanJsonList(task.tags)), task.related || "", task.completed_at || null, task.created_at || now(), task.updated_at || now());
    // Concurrent sync deletions can leave references to library rows absent from the snapshot.
    const skillExists = db.prepare("SELECT 1 FROM skills WHERE id = ?");
    const commandExists = db.prepare("SELECT 1 FROM slash_commands WHERE id = ?");
    const skillInsert = db.prepare("INSERT OR IGNORE INTO project_skills (project_id, skill_id) VALUES (?, ?)"); for (const id of project.skill_ids || project.skillIds || []) if (skillExists.get(id)) skillInsert.run(projectId, id);
    const commandInsert = db.prepare("INSERT OR IGNORE INTO project_slash_commands (project_id, slash_command_id) VALUES (?, ?)"); for (const id of project.slash_command_ids || project.slashCommandIds || []) if (commandExists.get(id)) commandInsert.run(projectId, id);
    const skillInstallInsert = db.prepare("INSERT OR IGNORE INTO project_skill_installs (project_id, skill_id, relative_path, content_hash, installed_at) VALUES (?, ?, ?, ?, ?)"); for (const item of project.skill_installs || project.skillInstalls || []) if (skillExists.get(item.item_id || item.itemId)) skillInstallInsert.run(projectId, item.item_id || item.itemId, item.relative_path || item.relativePath, item.content_hash || item.contentHash, item.installed_at || item.installedAt || now());
    const commandInstallInsert = db.prepare("INSERT OR IGNORE INTO project_command_installs (project_id, slash_command_id, relative_path, content_hash, installed_at) VALUES (?, ?, ?, ?, ?)"); for (const item of project.command_installs || project.commandInstalls || []) if (commandExists.get(item.item_id || item.itemId)) commandInstallInsert.run(projectId, item.item_id || item.itemId, item.relative_path || item.relativePath, item.content_hash || item.contentHash, item.installed_at || item.installedAt || now());
    const activityInsert = db.prepare("INSERT OR IGNORE INTO project_activity (id, project_id, kind, summary, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)"); for (const item of project.activity || []) activityInsert.run(item.id || randomUUID(), projectId, item.kind || "imported", item.summary || "Imported", item.detail || "", item.created_at || now());
    const canvasInsert = db.prepare("INSERT OR IGNORE INTO project_canvas_items (id, project_id, title, body, color, x, y, width, height, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"); for (const item of project.canvas_items || project.canvasItems || []) canvasInsert.run(item.id || randomUUID(), projectId, item.title || "Card", item.body || "", item.color || "yellow", item.x ?? 24, item.y ?? 24, item.width ?? 220, item.height ?? 150, item.created_at || now(), item.updated_at || now());
  }

  function seedSkills() {
    if (getSetting("starterSkillsVersion", 0) >= 1) return;
    const timestamp = now();
    const insert = db.prepare("INSERT OR IGNORE INTO skills (id, name, category, body, source_url, ownership, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    const seed = db.transaction(() => STARTER_SKILLS.forEach((item) => insert.run(item.id, item.name, item.category, item.body, item.source_url || "", item.ownership || "other", timestamp, timestamp)));
    seed();
    setSetting("starterSkillsVersion", 1);
  }

  function seedCuratedSkills() {
    if (getSetting("curatedSkillsVersion", 0) >= CURATED_SKILLS_VERSION) return;
    const timestamp = now();
    const findByName = db.prepare("SELECT id FROM skills WHERE name = ? COLLATE NOCASE");
    const insert = db.prepare("INSERT OR IGNORE INTO skills (id, name, category, body, source_url, ownership, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    const update = db.prepare("UPDATE skills SET name = ?, category = ?, body = ?, source_url = ?, ownership = ?, updated_at = ? WHERE id = ?");
    const seed = db.transaction(() => {
      for (const item of CURATED_SKILLS) {
        const existing = findByName.get(item.name);
        if (existing) update.run(item.name, item.category, item.body, item.source_url, item.ownership, timestamp, existing.id);
        else insert.run(item.id, item.name, item.category, item.body, item.source_url, item.ownership, Number(Boolean(item.pinned)), timestamp, timestamp);
      }
      db.prepare("DELETE FROM skills WHERE name = 'Cep Extensions' COLLATE NOCASE AND id LIKE 'curated-%'").run();
      db.prepare("DELETE FROM skills WHERE id IN ('library-ui-max', 'library-affine-native') AND source_url IN ('https://github.com/blixvip/skills/blob/main/ui-max/SKILL.md', 'https://github.com/blixvip/skills/blob/main/affine-native/SKILL.md')").run();
    });
    seed();
    setSetting("curatedSkillsVersion", CURATED_SKILLS_VERSION);
  }

  function seedSlashCommands() {
    if (getSetting("starterSlashCommandsVersion", 0) >= 1) return;
    const timestamp = now();
    const insert = db.prepare("INSERT OR IGNORE INTO slash_commands (id, name, command, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
    const seed = db.transaction(() => STARTER_SLASH_COMMANDS.forEach((item) => insert.run(item.id, item.name, item.command, item.body, timestamp, timestamp)));
    seed();
    setSetting("starterSlashCommandsVersion", 1);
  }

  seedSkills();
  seedCuratedSkills();
  seedSlashCommands();
  migrateLegacyJson();
  // Notes written before wiki-links existed have no rows yet; fill them in once.
  if (getSetting("linkIndexVersion") !== "1") { reindexAllLinks(); setSetting("linkIndexVersion", "1"); }
  repairDailyTasks();
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS daily_tasks_one_carry_per_source_day ON daily_tasks(task_date, carried_from_id) WHERE carried_from_id IS NOT NULL");
  cleanupLibraryEntries();
  const api = { listNotes, getNote, listFolders, listTags, createNote, updateNote, setTags, backlinks, brokenLinks, reindexAllLinks, moveToTrash, restoreNote, deleteForever, createFolder, renameFolder, removeFolder, listSkills, getSkill, createSkill, updateSkill, deleteSkill, listSlashCommands, getSlashCommand, createSlashCommand, updateSlashCommand, deleteSlashCommand, listProjects, getProject, createProject, updateProject, reorderProjects, moveProject, removeProject, setProjectLogo, createProjectTask, updateProjectTask, moveProjectTask, removeProjectTask, createProjectCanvasItem, updateProjectCanvasItem, removeProjectCanvasItem, setProjectAssignments, getProjectToolInstall, setProjectToolInstall, removeProjectToolInstall, addProjectActivity, dailyDashboard, dailyPage, dailyMonth, createDailyTask, updateDailyTask, completeDailyTask, deleteDailyTask, listDailyTasks, createDailyActivity, updateDailyActivity, deleteDailyActivity, listDailyActivities, createCompression, listCompressions, getSetting, setSetting, exportData, importData, replaceData, createBackup, ensureDailyBackup, listBackups, restoreBackup, ...botRepo, close: () => db.close(), userDataPath, inboxId: inbox.id };
  const mutations = new Set([
    "createNote", "updateNote", "setTags", "moveToTrash", "restoreNote", "deleteForever",
    "createFolder", "renameFolder", "removeFolder", "createSkill", "updateSkill", "deleteSkill",
    "createSlashCommand", "updateSlashCommand", "deleteSlashCommand", "createProject", "updateProject",
    "moveProjectTask", "setProjectToolInstall", "removeProjectToolInstall",
    "reorderProjects", "moveProject", "removeProject", "setProjectLogo", "createProjectTask",
    "updateProjectTask", "removeProjectTask", "createProjectCanvasItem", "updateProjectCanvasItem",
    "removeProjectCanvasItem", "setProjectAssignments", "addProjectActivity", "createDailyTask",
    "updateDailyTask", "completeDailyTask", "deleteDailyTask", "createDailyActivity", "updateDailyActivity",
    "deleteDailyActivity", "createCompression", "importData",
    "restoreBackup", "archiveBot", "createBot", "importBotData", "recordBotEvent", "recordBotRun",
    "restoreBot", "saveBotRuntime", "updateBot", "updateConnectionVerification",
  ]);
  for (const name of mutations) {
    if (typeof api[name] !== "function") continue;
    const mutate = api[name];
    api[name] = (...args) => {
      const result = mutate(...args);
      if (typeof onChange === "function") onChange(name);
      return result;
    };
  }
  return api;
}

module.exports = { createStorage };
