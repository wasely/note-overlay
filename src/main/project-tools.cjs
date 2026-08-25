const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function slugify(value) {
  return String(value || "tool").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "tool";
}

function digest(content) { return crypto.createHash("sha256").update(content, "utf8").digest("hex"); }

function descriptionFor(item) {
  const prose = String(item.body || "").split(/\r?\n/).map((line) => line.replace(/^#+\s*/, "").trim()).find(Boolean);
  return (prose || `Use ${item.name || "this tool"} in this project.`).slice(0, 240);
}

function buildProjectTool(kind, item) {
  const slug = slugify(item.name || item.command || item.id);
  if (kind === "skill") {
    const body = String(item.body || "").trim();
    const content = body.startsWith("---\n") || body.startsWith("---\r\n")
      ? `${body}\n`
      : `---\nname: ${slug}\ndescription: ${JSON.stringify(descriptionFor(item))}\n---\n\n${body || `# ${item.name || slug}\n`}\n`;
    return { kind, itemId: item.id, relativePath: `.agents/skills/${slug}/SKILL.md`, content, contentHash: digest(content) };
  }
  const body = String(item.body || "").trim();
  const heading = item.name ? `# ${item.name}\n\n` : "";
  const command = item.command ? `Command: \`${item.command}\`\n\n` : "";
  const content = `${heading}${command}${body}\n`;
  return { kind, itemId: item.id, relativePath: `.codex/prompts/${slug}.md`, content, contentHash: digest(content) };
}

function safeTarget(root, relativePath) {
  const base = fs.realpathSync.native(path.resolve(root));
  const target = path.resolve(base, relativePath);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) throw new Error("Project tool path escaped the repository.");
  return { base, target };
}

function toolStatus(root, tool, record = null) {
  const { target } = safeTarget(root, tool.relativePath);
  if (!fs.existsSync(target)) return { ...tool, status: "missing" };
  const currentHash = digest(fs.readFileSync(target, "utf8"));
  if (currentHash === tool.contentHash) return { ...tool, status: "current", currentHash };
  if (record?.content_hash && currentHash === record.content_hash) return { ...tool, status: "outdated", currentHash };
  return { ...tool, status: "modified", currentHash };
}

function installProjectTool(root, tool, record = null, overwrite = false) {
  const state = toolStatus(root, tool, record);
  if (state.status === "modified" && !overwrite) return { ...state, conflict: true };
  const { target } = safeTarget(root, tool.relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, tool.content, "utf8");
  fs.renameSync(temporary, target);
  return { ...tool, status: "current", conflict: false, path: target };
}

function uninstallProjectTool(root, tool, record = null, force = false) {
  const state = toolStatus(root, tool, record);
  if (state.status === "modified" && !force) return { ...state, conflict: true };
  const { target, base } = safeTarget(root, tool.relativePath);
  if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  let directory = path.dirname(target);
  while (directory !== base && directory.startsWith(`${base}${path.sep}`)) {
    if (fs.readdirSync(directory).length) break;
    fs.rmdirSync(directory);
    directory = path.dirname(directory);
  }
  return { ...tool, status: "missing", conflict: false };
}

module.exports = { buildProjectTool, digest, installProjectTool, slugify, toolStatus, uninstallProjectTool };
