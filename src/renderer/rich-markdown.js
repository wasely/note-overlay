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

export function docToMarkdown(json) {
  const content = json?.content || [];
  return content.map(blockToMarkdown).filter((text) => text !== "").join("\n\n");
}
