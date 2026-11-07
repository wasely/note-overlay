const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { listMemoryStores, memoryStorePath, readMaster, saveMaster } = require("../src/main/memory-sources.cjs");

const home = fs.mkdtempSync(path.join(os.tmpdir(), "notebook-memory-"));
const write = (relative, text = "x") => { const file = path.join(home, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
try {
  const missing = readMaster({ homeDir: home });
  assert.equal(missing.exists, false);
  assert.equal(missing.content, "");

  const created = saveMaster({ homeDir: home, content: "# Master\n\n- concise\n", expectedModifiedAt: null });
  assert.equal(created.exists, true);
  assert.equal(fs.readFileSync(path.join(home, "MASTER-MEMORY.md"), "utf8"), "# Master\n\n- concise\n");

  const updated = saveMaster({ homeDir: home, content: "# Master\n\n- v2\n", expectedModifiedAt: created.modifiedAt });
  assert.equal(updated.content, "# Master\n\n- v2\n");

  // An agent edits the file after the page loaded it: the page's save must not clobber it.
  const later = new Date(Date.parse(updated.modifiedAt) + 5_000);
  fs.writeFileSync(path.join(home, "MASTER-MEMORY.md"), "# Master\n\n- agent edit\n");
  fs.utimesSync(path.join(home, "MASTER-MEMORY.md"), later, later);
  assert.throws(() => saveMaster({ homeDir: home, content: "stale", expectedModifiedAt: updated.modifiedAt }), (error) => error.code === "MEMORY_CONFLICT");
  assert.equal(readMaster({ homeDir: home }).content, "# Master\n\n- agent edit\n", "a conflicting save leaves the agent's version intact");
  assert.throws(() => saveMaster({ homeDir: home, content: "x".repeat(1_000_001) }), /too large/);

  write(".claude/projects/C--a/memory/MEMORY.md");
  write(".claude/projects/C--a/memory/one.md");
  write(".claude/projects/C--b/memory/two.md");
  write(".claude/projects/C--b/notes.md");
  write(".grok/memory-v2/workspaces/w/MEMORY.md");
  write(".grok/memory-v2/workspaces/w/topics/a.md");
  write(".grok/memory-v2/workspaces/w/archive/dream/old.md");
  write(".aside/u/0/memory/USER.md");
  write(".aside/u/0/memory/projects/p.md");
  const stores = Object.fromEntries(listMemoryStores({ homeDir: home }).map((store) => [store.id, store]));
  assert.equal(stores.claude.count, 2, "Claude counts memory folders only and skips MEMORY.md indexes");
  assert.equal(stores.grok.count, 1, "Grok skips its index and archived summaries");
  assert.equal(stores.aside.count, 2);
  assert.equal(stores.codex.exists, false);
  assert.equal(stores.codex.count, 0);
  assert.equal(memoryStorePath({ homeDir: home, id: "claude" }), path.join(home, ".claude", "projects"));
  assert.equal(memoryStorePath({ homeDir: home, id: "../../etc" }), null);
  console.log("Master memory read/save/conflict and agent store counting tests passed.");
} finally {
  fs.rmSync(home, { recursive: true, force: true });
}
