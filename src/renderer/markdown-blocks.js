// Pure Markdown block/inline parsing. No React, so it can be unit-tested in Node.
export const INLINE_PATTERN = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`|~~[^~\n]+~~|\[[^\]\n]+\]\([^)\s]+\)|https?:\/\/\S+)/g;

const TASK = /^(\s*)[-*]\s+\[([ xX])]\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d+)[.)]\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;

// Splits one line of text into styled inline tokens.
export function inlineTokens(text) {
  return String(text ?? "").split(INLINE_PATTERN).filter((part) => part !== "" && part !== undefined).map((part) => {
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
    if (last?.type === "paragraph") last.lines.push(line);
    else blocks.push({ type: "paragraph", lines: [line] });
  });
  return blocks.filter((block) => block.type !== "gap");
}
