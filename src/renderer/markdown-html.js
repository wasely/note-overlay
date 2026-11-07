import { inlineTokens, markdownBlocks } from "./markdown-blocks.js";

// Converts a note to standalone HTML so it can be pasted into rich editors such as
// Google Docs with its headings, lists, and emphasis intact.
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

function inlineHtml(text) {
  return inlineTokens(text).map((token) => {
    const body = escapeHtml(token.text);
    if (token.type === "strong") return `<strong>${body}</strong>`;
    if (token.type === "emphasis") return `<em>${body}</em>`;
    if (token.type === "code") return `<code style="font-family:monospace">${body}</code>`;
    if (token.type === "strike") return `<s>${body}</s>`;
    if (token.type === "link") return `<a href="${escapeHtml(token.href)}">${body}</a>`;
    // Nothing outside the app can resolve a wiki-link, so it pastes as its plain text.
    if (token.type === "wikilink") return body;
    return body;
  }).join("");
}

export function markdownToHtml(source, title = "") {
  const blocks = markdownBlocks(source);
  const parts = title.trim() ? [`<h1>${escapeHtml(title.trim())}</h1>`] : [];
  for (const block of blocks) {
    if (block.type === "heading") { parts.push(`<h${block.level}>${inlineHtml(block.text)}</h${block.level}>`); continue; }
    if (block.type === "rule") { parts.push("<hr>"); continue; }
    if (block.type === "table") {
      const cell = (tag, text, index) => `<${tag} style="text-align:${block.align[index]};border:1px solid #ccc;padding:4px 8px">${inlineHtml(text)}</${tag}>`;
      parts.push(`<table style="border-collapse:collapse"><thead><tr>${block.header.map((text, index) => cell("th", text, index)).join("")}</tr></thead><tbody>${block.rows.map((row) => `<tr>${row.map((text, index) => cell("td", text, index)).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (block.type === "code") { parts.push(`<pre style="font-family:monospace"><code>${escapeHtml(block.lines.join("\n"))}</code></pre>`); continue; }
    if (block.type === "quote") { parts.push(`<blockquote>${block.lines.map((line) => `<p>${inlineHtml(line)}</p>`).join("")}</blockquote>`); continue; }
    if (block.type === "bullets") { parts.push(`<ul>${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join("")}</ul>`); continue; }
    if (block.type === "ordered") { parts.push(`<ol start="${block.start}">${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join("")}</ol>`); continue; }
    // Google Docs turns these into its own checklist items when pasted.
    if (block.type === "tasks") { parts.push(`<ul>${block.items.map((item) => `<li>${item.checked ? "☑" : "☐"} ${inlineHtml(item.text)}</li>`).join("")}</ul>`); continue; }
    parts.push(`<p>${block.lines.map(inlineHtml).join("<br>")}</p>`);
  }
  return parts.join("\n") || "<p></p>";
}

// Plain-text fallback that keeps the Markdown readable when HTML is not accepted.
export function markdownToText(source, title = "") {
  return [title.trim() ? `# ${title.trim()}` : "", String(source || "").trimEnd()].filter(Boolean).join("\n\n");
}
