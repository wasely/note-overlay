// Formatting actions rewrite the Markdown source around the current selection, so the
// toolbar, the keyboard shortcuts, and hand-typed Markdown all produce the same file.
const WRAPS = { bold: "**", italic: "*", strike: "~~", code: "`" };
const LINE_PREFIXES = { h1: "# ", h2: "## ", h3: "### ", quote: "> ", bullet: "- ", number: "1. ", todo: "- [ ] " };

// Which line prefix, if any, a line already carries.
function prefixKind(line) {
  const heading = line.match(/^\s*(#{1,6})\s+/);
  if (heading) return `h${Math.min(heading[1].length, 3)}`;
  if (/^\s*>\s?/.test(line)) return "quote";
  if (/^\s*[-*+]\s+\[[ xX]]\s+/.test(line)) return "todo";
  if (/^\s*[-*+]\s+/.test(line)) return "bullet";
  if (/^\s*\d+[.)]\s+/.test(line)) return "number";
  return "";
}

export function applyMarkdownFormat(body, selectionStart, selectionEnd, action) {
  const text = String(body ?? "");
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));
  const selected = text.slice(start, end);

  if (WRAPS[action]) {
    const mark = WRAPS[action];
    const before = text.slice(Math.max(0, start - mark.length), start);
    const after = text.slice(end, end + mark.length);
    if (before === mark && after === mark) {
      const next = text.slice(0, start - mark.length) + selected + text.slice(end + mark.length);
      return { body: next, start: start - mark.length, end: end - mark.length };
    }
    const placeholder = selected || (action === "code" ? "code" : action === "italic" ? "italic text" : action === "strike" ? "struck text" : "bold text");
    const next = `${text.slice(0, start)}${mark}${placeholder}${mark}${text.slice(end)}`;
    return { body: next, start: start + mark.length, end: start + mark.length + placeholder.length };
  }

  if (action === "link") {
    const label = selected || "link text";
    const next = `${text.slice(0, start)}[${label}](https://)${text.slice(end)}`;
    const urlStart = start + label.length + 3;
    return { body: next, start: urlStart, end: urlStart + 8 };
  }

  if (action === "codeblock") {
    const fenced = `\`\`\`\n${selected || "code"}\n\`\`\``;
    const lead = start > 0 && text[start - 1] !== "\n" ? "\n" : "";
    const next = `${text.slice(0, start)}${lead}${fenced}${text.slice(end)}`;
    const bodyStart = start + lead.length + 4;
    return { body: next, start: bodyStart, end: bodyStart + (selected || "code").length };
  }

  const prefix = LINE_PREFIXES[action];
  if (!prefix) return { body: text, start, end };
  const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineEndIndex = text.indexOf("\n", end);
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
  const lines = text.slice(lineStart, lineEnd).split("\n");
  // Every prefix toggles, and a line only counts as already formatted when its existing
  // prefix is the same kind: a checklist item is not a plain bullet.
  const strip = /^\s*(?:#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]]\s+|[-*+]\s+|\d+[.)]\s+)/;
  const alreadyApplied = lines.every((line) => prefixKind(line) === action);
  const rewritten = lines.map((line, index) => {
    const bare = line.replace(strip, "");
    if (alreadyApplied) return bare;
    return action === "number" ? `${index + 1}. ${bare}` : `${prefix}${bare}`;
  });
  const replacement = rewritten.join("\n");
  const next = text.slice(0, lineStart) + replacement + text.slice(lineEnd);
  return { body: next, start: lineStart, end: lineStart + replacement.length };
}
