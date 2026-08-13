const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const userData = path.join(process.env.APPDATA, "note-overlay");
const databasePath = path.join(userData, "hushnote.sqlite");
if (!fs.existsSync(databasePath)) throw new Error(`Notebook data was not found at ${databasePath}`);

const backupDir = path.join(userData, "backups");
fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(databasePath, path.join(backupDir, `hushnote-before-settings-reset-${Date.now()}.sqlite`));

const db = new Database(databasePath);
db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
  .run("app", JSON.stringify({ hotkey: "Control+Alt+Shift+N", startAtLogin: true, compressorDir: "C:\\Code\\llmlingua-local" }));
db.close();
console.log("Notebook settings reset. Notes were preserved and backed up.");
process.exit(0);
