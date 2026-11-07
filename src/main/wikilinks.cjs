// Wiki-link parsing for the main process.
//
// The renderer has its own copy of these rules in src/renderer/markdown-blocks.js, because that
// file is ESM and bundled while this one is CommonJS and loaded by Electron. scripts/wikilinks-test.mjs
// runs both over the same corpus and fails if they ever disagree, so the duplication cannot drift
// silently.
const LINK = /\[\[([^[\]\n]+)\]\]/g;

// One canonical form for a link target, so "My Note", "my note" and " My  Note " all match.
function linkKey(title) {
  return String(title ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

// Every wiki-link target in a note, in document order, de-duplicated.
function wikilinkTargets(source = "") {
  const found = new Map();
  for (const match of String(source).matchAll(LINK)) {
    const target = match[1].split("|")[0].trim();
    if (target && !found.has(linkKey(target))) found.set(linkKey(target), target);
  }
  return [...found.values()];
}

// Brackets are markup, not prose, so a quoted line reads as the author wrote it.
function stripLinkMarkup(line) {
  return String(line ?? "").replace(LINK, (_whole, inner) => {
    const [target, alias] = inner.split("|");
    return (alias ?? target).trim();
  });
}

// The first line that links to `target`, trimmed, so a backlink can show where it came from.
function linkContext(source, target) {
  const wanted = linkKey(target);
  for (const line of String(source ?? "").split("\n")) {
    for (const match of line.matchAll(LINK)) {
      if (linkKey(match[1].split("|")[0]) === wanted) return stripLinkMarkup(line).trim().slice(0, 240);
    }
  }
  return "";
}

module.exports = { linkKey, wikilinkTargets, linkContext, stripLinkMarkup };
