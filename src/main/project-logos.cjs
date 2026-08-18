const fs = require("fs");
const path = require("path");

const MAX_BYTES = 1024 * 1024;
const EXTENSIONS = new Map([[".svg", "image/svg+xml"], [".png", "image/png"], [".ico", "image/x-icon"], [".webp", "image/webp"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"]]);
const MAX_DIRECTORIES = 400;
const MAX_DEPTH = 4;
const SKIP_DIRECTORIES = /^(node_modules|venv|__pycache__|target|coverage|test-results|screenshots|shots|snapshots|fixtures|locales|release[^\/]*|\.[^\/]+)$/i;
const SKIP_PATHS = /(playwright|screenshot|\.shots|\.debug|audit|sample|template-audit)/i;
const BUILD_OUTPUT = /^(dist|dist-[^\/]+|out|\.output|win-unpacked)$/i;
const NAME_SCORE = [[/^logo\b/i, 100], [/logo/i, 80], [/^icon\b/i, 70], [/app[-_]?icon/i, 65], [/icon/i, 50], [/favicon/i, 30], [/mark|brand|glyph/i, 40]];
const EXT_SCORE = new Map([[".svg", 30], [".png", 25], [".webp", 15], [".ico", 12], [".jpg", 5], [".jpeg", 5]]);

function scoreCandidate(file) {
  const base = path.basename(file);
  const ext = path.extname(base).toLowerCase();
  if (!EXTENSIONS.has(ext)) return 0;
  let score = EXT_SCORE.get(ext) || 0;
  const named = NAME_SCORE.find(([pattern]) => pattern.test(base));
  if (!named) return 0;
  score += named[1];
  const size = base.match(/(\d{2,4})/);
  if (size) score += Math.min(Number(size[1]), 512) / 64;
  if (/(placeholder|sample|example|test|sprite)/i.test(base)) score -= 60;
  return score;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

// Declared icons beat guessed ones: an Electron build icon or an extension manifest is the real mark.
function declaredIcons(root) {
  const found = [];
  const pkg = readJson(path.join(root, "package.json"));
  const declared = pkg?.build?.icon || pkg?.icon;
  if (typeof declared === "string") found.push(path.resolve(root, declared));
  const manifest = readJson(path.join(root, "manifest.json")) || readJson(path.join(root, "public", "manifest.json"));
  const icons = manifest?.icons || manifest?.action?.default_icon || manifest?.browser_action?.default_icon;
  if (icons && typeof icons === "object") {
    const best = Object.entries(icons).sort((a, b) => Number(b[0]) - Number(a[0]))[0];
    if (best) found.push(path.resolve(root, String(best[1])));
  } else if (typeof icons === "string") found.push(path.resolve(root, icons));
  return found.filter((file) => { try { return fs.statSync(file).isFile() && fs.statSync(file).size <= MAX_BYTES; } catch { return false; } });
}

function findProjectLogo(root, options = {}) {
  if (!root) return null;
  try { if (!fs.statSync(root).isDirectory()) return null; } catch { return null; }
  const declared = declaredIcons(root);
  if (declared.length) return declared[0];
  // A nested checkout of another tracked project keeps its own mark — never borrow it.
  const foreign = options.skipDirectories instanceof Set ? options.skipDirectories : new Set();
  // Breadth-first so a mark at the project root always beats the same file buried in a sub-app.
  let best = null;
  let visited = 0;
  const queue = [{ directory: root, depth: 0 }];
  while (queue.length && visited < MAX_DIRECTORIES) {
    const { directory, depth, generated = false } = queue.shift();
    visited += 1;
    let entries = [];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (depth >= MAX_DEPTH || SKIP_DIRECTORIES.test(entry.name) || SKIP_PATHS.test(entry.name) || foreign.has(entry.name.toLowerCase())) continue;
        queue.push({ directory: file, depth: depth + 1, generated: generated || BUILD_OUTPUT.test(entry.name) });
        continue;
      }
      if (!entry.isFile() || SKIP_PATHS.test(file)) continue;
      const lowered = entry.name.toLowerCase();
      if ([...foreign].some((name) => name.length >= 4 && lowered.includes(name))) continue;
      const score = scoreCandidate(entry.name);
      if (!score) continue;
      let size = 0;
      try { size = fs.statSync(file).size; } catch { continue; }
      if (!size || size > MAX_BYTES) continue;
      const total = score - depth * 6 - (generated ? 20 : 0);
      if (!best || total > best.score) best = { file, score: total };
    }
  }
  return best?.file || null;
}

function readProjectLogo(file) {
  if (!file) return null;
  const ext = path.extname(file).toLowerCase();
  const type = EXTENSIONS.get(ext);
  if (!type) return null;
  let buffer;
  try {
    const stats = fs.statSync(file);
    if (!stats.isFile() || stats.size > MAX_BYTES) return null;
    buffer = fs.readFileSync(file);
  } catch { return null; }
  return `data:${type};base64,${buffer.toString("base64")}`;
}

module.exports = { findProjectLogo, readProjectLogo, MAX_BYTES };
