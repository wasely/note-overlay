// Pure Markdown block/inline parsing. No React, so it can be unit-tested in Node.
// The wiki-link alternative comes first so `[[Note]]` is never split by the inline-link rule.
export const INLINE_PATTERN = /(\[\[[^[\]\n]+\]\]|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`|~~[^~\n]+~~|\[[^\]\n]+\]\([^)\s]+\)|https?:\/\/\S+)/g;

// `[[Note title]]`, or `[[Note title|what the sentence should read]]`.
const WIKILINK = /^\[\[([^[\]\n]+)\]\]$/;

// One canonical form for a link target, so "My Note", "my note" and " My  Note " all match.
export function linkKey(title) {
  return String(title ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

// Brackets are markup, not prose, so a quoted line reads as the author wrote it.
export function stripLinkMarkup(line) {
  return String(line ?? "").replace(/\[\[([^[\]\n]+)\]\]/g, (_whole, inner) => {
    const [target, alias] = inner.split("|");
    return (alias ?? target).trim();
  });
}

// Every wiki-link in a note, in document order, de-duplicated by target.
export function wikilinkTargets(source = "") {
  const found = new Map();
  for (const match of String(source).matchAll(/\[\[([^[\]\n]+)\]\]/g)) {
    const target = match[1].split("|")[0].trim();
    if (target && !found.has(linkKey(target))) found.set(linkKey(target), target);
  }
  return [...found.values()];
}

const TASK = /^(\s*)[-*]\s+\[([ xX])]\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d+)[.)]\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;

// Splits one line of text into styled inline tokens.
export function inlineTokens(text) {
  return String(text ?? "").split(INLINE_PATTERN).filter((part) => part !== "" && part !== undefined).map((part) => {
    const wiki = part.match(WIKILINK);
    if (wiki) {
      const [target, alias] = wiki[1].split("|");
      // `raw` keeps the brackets so the editor can round-trip the link back to Markdown unchanged.
      return { type: "wikilink", text: (alias ?? target).trim(), target: target.trim(), raw: part };
    }
    if (/^\*\*[^*]+\*\*$/.test(part) || /^__[^_]+__$/.test(part)) return { type: "strong", text: part.slice(2, -2) };
    if (/^\*[^*\n]+\*$/.test(part) || /^_[^_\n]+_$/.test(part)) return { type: "emphasis", text: part.slice(1, -1) };
    if (/^`[^`\n]+`$/.test(part)) return { type: "code", text: part.slice(1, -1) };
    if (/^~~[^~\n]+~~$/.test(part)) return { type: "strike", text: part.slice(2, -2) };
    const link = part.match(/^\[([^\]\n]+)\]\(([^)\s]+)\)$/);
    if (link) return { type: "link", text: link[1], href: link[2] };
    if (/^https?:\/\/\S+$/.test(part)) return { type: "link", text: part, href: part };
    return { type: "text", text: part };
  });
}

// Groups raw Markdown lines into renderable blocks, keeping each task line's index
// so checkbox clicks can be written straight back into the source text.
export function markdownBlocks(source = "") {
  const blocks = [];
  let fence = null;
  String(source).split("\n").forEach((line, lineIndex) => {
    const last = blocks[blocks.length - 1];
    if (fence) {
      if (/^\s*```/.test(line)) { fence = null; return; }
      fence.lines.push(line);
      return;
    }
    if (/^\s*```/.test(line)) { fence = { type: "code", language: line.replace(/^\s*```/, "").trim(), lines: [] }; blocks.push(fence); return; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { blocks.push({ type: "rule" }); return; }
    if (!line.trim()) { blocks.push({ type: "gap" }); return; }
    const heading = line.match(HEADING);
    if (heading) { blocks.push({ type: "heading", level: Math.min(heading[1].length, 4), text: heading[2] }); return; }
    const task = line.match(TASK);
    if (task) {
      const item = { lineIndex, checked: task[2].toLowerCase() === "x", text: task[3] };
      if (last?.type === "tasks") last.items.push(item);
      else blocks.push({ type: "tasks", items: [item] });
      return;
    }
    const quote = line.match(QUOTE);
    if (quote) {
      if (last?.type === "quote") last.lines.push(quote[1]);
      else blocks.push({ type: "quote", lines: [quote[1]] });
      return;
    }
    const ordered = line.match(ORDERED);
    if (ordered) {
      if (last?.type === "ordered") last.items.push(ordered[2]);
      else blocks.push({ type: "ordered", start: Number(ordered[1]) || 1, items: [ordered[2]] });
      return;
    }
    const bullet = line.match(BULLET);
    if (bullet) {
      if (last?.type === "bullets") last.items.push(bullet[1]);
      else blocks.push({ type: "bullets", items: [bullet[1]] });
      return;
    }
    if (TABLE_ROW.test(line)) {
      if (last?.type === "pipes") last.lines.push(line);
      else blocks.push({ type: "pipes", lines: [line] });
      return;
    }
    if (last?.type === "paragraph") last.lines.push(line);
    else blocks.push({ type: "paragraph", lines: [line] });
  });
  return blocks.filter((block) => block.type !== "gap").map(pipesToTable);
}

// GitHub-style tables: a run of |-delimited lines whose second line is the |---|:--:| rule.
// Anything that only looks like one stays a paragraph, exactly as typed.
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|(\s*:?-+:?\s*\|)+\s*$/;
function tableCells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}
function pipesToTable(block) {
  if (block.type !== "pipes") return block;
  if (block.lines.length < 2 || !TABLE_RULE.test(block.lines[1])) return { type: "paragraph", lines: block.lines };
  const header = tableCells(block.lines[0]);
  const align = tableCells(block.lines[1]).map((cell) => cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : "left");
  const rows = block.lines.slice(2).map((line) => {
    const cells = tableCells(line);
    return header.map((_, index) => cells[index] ?? "");
  });
  // `lines` keeps the source so the rich editor can hold the table as plain text and save it unchanged.
  return { type: "table", header, align: header.map((_, index) => align[index] || "left"), rows, lines: block.lines };
}
