const fs = require("fs");
const path = require("path");

// The master sheet is a plain file in the home folder so every agent (Claude, Codex, Grok…)
// reads the same text Notebook shows. Notebook never copies it into its own database.
const MASTER_FILE = "MASTER-MEMORY.md";
const MAX_MASTER_BYTES = 1_000_000;

function masterPath(homeDir) {
  return path.join(path.resolve(homeDir), MASTER_FILE);
}

function readMaster({ homeDir }) {
  const file = masterPath(homeDir);
  try {
    const stat = fs.statSync(file);
    if (stat.size > MAX_MASTER_BYTES) throw new Error("The master memory file is too large to show safely.");
    const content = fs.readFileSync(file, "utf8");
    return { exists: true, path: file, content, modifiedAt: stat.mtime.toISOString(), lines: content.split(/\r?\n/).length };
  } catch (error) {
    if (error.code === "ENOENT") return { exists: false, path: file, content: "", modifiedAt: null, lines: 0 };
    return { exists: false, path: file, content: "", modifiedAt: null, lines: 0, error: error.message };
  }
}

// Agents edit this file too. A save only lands when the file is still the version the page
// loaded, so an agent's newer edit is never silently overwritten.
function saveMaster({ homeDir, content, expectedModifiedAt }) {
  if (typeof content !== "string") throw new Error("Memory content must be text.");
  if (Buffer.byteLength(content, "utf8") > MAX_MASTER_BYTES) throw new Error("The master memory is too large to save.");
  const file = masterPath(homeDir);
  const current = readMaster({ homeDir });
  if (current.exists && expectedModifiedAt && current.modifiedAt !== expectedModifiedAt) {
    const error = new Error("An agent changed the master memory since you opened it. Reload to see its version.");
    error.code = "MEMORY_CONFLICT";
    throw error;
  }
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content, "utf8");
  fs.renameSync(temporary, file);
  return readMaster({ homeDir });
}

function markdownFiles(root, { exclude = () => false, maxDepth = 4 } = {}) {
  const found = [];
  const walk = (directory, depth) => {
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (exclude(full, entry)) continue;
      if (entry.isDirectory() && depth < maxDepth) walk(full, depth + 1);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) found.push(full);
    }
  };
  walk(root, 0);
  return found;
}

function storeSummary(spec, files) {
  let modifiedAt = null;
  for (const file of files) {
    try {
      const time = fs.statSync(file).mtime.toISOString();
      if (!modifiedAt || time > modifiedAt) modifiedAt = time;
    } catch { /* A file removed mid-scan is simply not counted. */ }
  }
  return { id: spec.id, label: spec.label, detail: spec.detail, path: spec.path, exists: fs.existsSync(spec.path), count: files.length, modifiedAt };
}

function storeSpecs(homeDir) {
  const home = path.resolve(homeDir);
  return [
    { id: "claude", label: "Claude Code", detail: "Per-project memory folders", path: path.join(home, ".claude", "projects") },
    { id: "grok", label: "Grok", detail: "Current topics (archive skipped)", path: path.join(home, ".grok", "memory-v2") },
    { id: "aside", label: "Aside", detail: "Browser agent profile and journal", path: path.join(home, ".aside", "u", "0", "memory") },
    { id: "codex", label: "Codex", detail: "Saved project memories", path: path.join(home, ".codex", "memories") },
  ];
}

function listMemoryStores({ homeDir }) {
  return storeSpecs(homeDir).map((spec) => {
    let files = [];
    if (spec.id === "claude") {
      let projects = [];
      try { projects = fs.readdirSync(spec.path, { withFileTypes: true }).filter((entry) => entry.isDirectory()); }
      catch { projects = []; }
      files = projects.flatMap((project) => markdownFiles(path.join(spec.path, project.name, "memory"), { maxDepth: 0 })).filter((file) => path.basename(file) !== "MEMORY.md");
    } else if (spec.id === "grok") {
      files = markdownFiles(spec.path, { exclude: (full, entry) => entry.isDirectory() && entry.name === "archive" }).filter((file) => path.basename(file) !== "MEMORY.md");
    } else {
      files = markdownFiles(spec.path);
    }
    return storeSummary(spec, files);
  });
}

function memoryStorePath({ homeDir, id }) {
  return storeSpecs(homeDir).find((spec) => spec.id === id)?.path || null;
}

module.exports = { MASTER_FILE, listMemoryStores, memoryStorePath, readMaster, saveMaster };
