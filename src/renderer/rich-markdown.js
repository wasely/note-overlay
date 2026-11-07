// Pure Markdown <-> TipTap JSON conversion. No React, so it can be unit-tested in Node.
// Markdown stays the source of truth: the editor parses it on open and serializes back to it
// on every change, so the existing preview, copy, drag-out, and Google Docs paths are unchanged.
import { inlineTokens, markdownBlocks } from "./markdown-blocks.js";

// Markdown inline tokens -> TipTap text nodes with marks.
function inlineNodes(text) {
  return inlineTokens(text).map((token) => {
    if (token.type === "strong") return { type: "text", text: token.text, marks: [{ type: "bold" }] };
    if (token.type === "emphasis") return { type: "text", text: token.text, marks: [{ type: "italic" }] };
    if (token.type === "code") return { type: "text", text: token.text, marks: [{ type: "code" }] };
    if (token.type === "strike") return { type: "text", text: token.text, marks: [{ type: "strike" }] };
    if (token.type === "link") return { type: "text", text: token.text, marks: [{ type: "link", attrs: { href: token.href } }] };
    // Wiki-links stay literal `[[...]]` text in the editor, so serializing back is lossless.
    if (token.type === "wikilink") return { type: "text", text: token.raw };
    return { type: "text", text: token.text };
  });
}

function paragraphNode(text) {
  return { type: "paragraph", content: inlineNodes(text) };
}

// A Markdown paragraph can span several lines joined by soft breaks; those map to hardBreak nodes.
function paragraphFromLines(lines) {
  const content = [];
  lines.forEach((line, index) => {
    if (index) content.push({ type: "hardBreak" });
    content.push(...inlineNodes(line));
  });
  return { type: "paragraph", content };
}

export function markdownToDoc(markdown = "") {
  const content = markdownBlocks(markdown).map((block) => {
    if (block.type === "heading") return { type: "heading", attrs: { level: block.level }, content: inlineNodes(block.text) };
    if (block.type === "rule") return { type: "horizontalRule" };
    if (block.type === "code") return {
      type: "codeBlock",
      attrs: { language: block.language || null },
      content: block.lines.length ? [{ type: "text", text: block.lines.join("\n") }] : [],
    };
    if (block.type === "quote") return { type: "blockquote", content: block.lines.map((line) => paragraphNode(line)) };
    if (block.type === "bullets") return { type: "bulletList", content: block.items.map((item) => ({ type: "listItem", content: [paragraphNode(item)] })) };
    if (block.type === "ordered") return { type: "orderedList", attrs: { start: block.start || 1 }, content: block.items.map((item) => ({ type: "listItem", content: [paragraphNode(item)] })) };
    if (block.type === "tasks") return {
      type: "taskList",
      content: block.items.map((item) => ({ type: "taskItem", attrs: { checked: Boolean(item.checked) }, content: [paragraphNode(item.text)] })),
    };
    return paragraphFromLines(block.lines);
  });
  // The schema requires at least one block; keep an empty note as a single empty paragraph.
  if (!content.length) content.push({ type: "paragraph" });
  return { type: "doc", content };
}

function textWithMarks(text, marks = []) {
  let out = String(text);
  const types = new Set((marks || []).map((mark) => mark.type));
  // Innermost first: code, strike, italic, bold; the link wraps the whole thing.
  if (types.has("code")) out = `\`${out}\``;
  if (types.has("strike")) out = `~~${out}~~`;
  if (types.has("italic")) out = `*${out}*`;
  if (types.has("bold")) out = `**${out}**`;
  const link = (marks || []).find((mark) => mark.type === "link");
  if (link) out = `[${out}](${link.attrs?.href || ""})`;
  return out;
}

function inlineToMarkdown(nodes) {
  return (nodes || []).map((node) => {
    if (node.type === "text") return textWithMarks(node.text, node.marks);
    if (node.type === "hardBreak") return "\n";
    return "";
  }).join("");
}

function blockToMarkdown(node) {
  switch (node.type) {
    case "paragraph": return inlineToMarkdown(node.content);
    case "heading": return `${"#".repeat(node.attrs?.level || 1)} ${inlineToMarkdown(node.content)}`;
    case "horizontalRule": return "---";
    case "codeBlock": {
      const language = node.attrs?.language || "";
      const text = (node.content || []).map((child) => child.text || "").join("\n");
      return `\`\`\`${language}\n${text}\n\`\`\``;
    }
    case "blockquote": return (node.content || []).map((child) => `> ${blockToMarkdown(child)}`).join("\n");
    case "bulletList": return (node.content || []).map((item) => `${"- "}${listItemText(item)}`).join("\n");
    case "orderedList": {
      const start = node.attrs?.start || 1;
      return (node.content || []).map((item, index) => `${start + index}. ${listItemText(item)}`).join("\n");
    }
    case "taskList": return (node.content || []).map((item) => `- [${item.attrs?.checked ? "x" : " "}] ${listItemText(item)}`).join("\n");
    default: return "";
  }
}

function listItemText(item) {
  return (item.content || []).map((child) => blockToMarkdown(child)).filter(Boolean).join("\n");
}

// A table typed with Enter arrives as one single-line paragraph per row; those rows are joined by
// a single newline so they save as one table. The rule is deliberately narrow, because a join
// rewrites the note:
//  - only SINGLE-LINE pipe paragraphs join. A stored table is one paragraph of several lines and
//    is already complete, so two stored tables separated by a blank line stay two tables;
//  - a run of such rows joins only if it really is a table (its second line is the |---| rule),
//    so pipe-ish prose kept on separate lines is written back exactly as it was;
//  - an empty paragraph (the user pressing Enter twice) always ends a run.
const PIPE_ROW = /^\s*\|.*\|\s*$/;
const PIPE_RULE = /^\s*\|(\s*:?-+:?\s*\|)+\s*$/;
const isRowParagraph = (text) => !text.includes("\n") && PIPE_ROW.test(text);
export function docToMarkdown(json) {
  const content = json?.content || [];
  const parts = [];
  let afterGap = false;
  for (const text of content.map(blockToMarkdown)) {
    if (text === "") { afterGap = true; continue; }
    parts.push({ text, afterGap });
    afterGap = false;
  }
  // Mark each part that continues a typed table started above it.
  const joins = new Array(parts.length).fill(false);
  for (let start = 0; start < parts.length;) {
    let end = start;
    while (isRowParagraph(parts[end]?.text || "") && (end === start || !parts[end].afterGap)) end += 1;
    if (end - start >= 2 && PIPE_RULE.test(parts[start + 1].text)) for (let index = start + 1; index < end; index += 1) joins[index] = true;
    start = Math.max(end, start + 1);
  }
  return parts.reduce((out, part, index) => index ? out + (joins[index] ? "\n" : "\n\n") + part.text : part.text, "");
}

// Plain-text pastes that look like Markdown (from a terminal, an AI chat, a .md file) arrive as
// formatted content instead of literal "#" and "**" characters. Rich HTML pastes keep TipTap's path.
const MARKDOWN_SIGNAL = /^(#{1,6} |[-*+] |\d+[.)] |> |```|- \[[ xX]\] )|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:/m;
// A pipe table: a |-row followed by its |---|:-:| rule.
const TABLE_SIGNAL = /^\s*\|.*\|\s*\r?\n\s*\|(\s*:?-+:?\s*\|)+\s*$/m;
export function looksLikeMarkdown(text) {
  return typeof text === "string" && text.length > 0 && (MARKDOWN_SIGNAL.test(text) || TABLE_SIGNAL.test(text));
}
