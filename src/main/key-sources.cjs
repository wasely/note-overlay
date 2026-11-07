const fs = require("fs");
const path = require("path");

const MAX_KEY_BYTES = 2_000_000;
const KEY_SPECS = Object.freeze([
  { id: "build-a-key", label: "Build a Key" },
  { id: "thumbnail-extension-fix", label: "Thumbnail Extension Fix" },
]);

function keyDescription(content) {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] || "";
  return frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, "") || "Reusable solution key";
}

function listKeySources({ homeDir, codexHome = process.env.CODEX_HOME } = {}) {
  const root = codexHome?.trim() ? path.resolve(codexHome) : path.join(path.resolve(homeDir), ".codex");
  return KEY_SPECS.map((spec) => {
    const sourcePath = path.join(root, "skills", spec.id, "SKILL.md");
    try {
      const stat = fs.statSync(sourcePath);
      if (!stat.isFile()) throw new Error("SKILL.md is not a file.");
      if (stat.size > MAX_KEY_BYTES) throw new Error("SKILL.md is too large to display safely.");
      const content = fs.readFileSync(sourcePath, "utf8");
      return {
        ...spec,
        exists: true,
        path: sourcePath,
        content,
        description: keyDescription(content),
        bytes: Buffer.byteLength(content, "utf8"),
        lines: content ? content.split(/\r?\n/).length : 0,
        modifiedAt: stat.mtime.toISOString(),
      };
    } catch (error) {
      return { ...spec, exists: false, path: sourcePath, content: "", description: "Installed key unavailable", bytes: 0, lines: 0, modifiedAt: null, error: error.message };
    }
  });
}

module.exports = { KEY_SPECS, listKeySources };
