import assert from "node:assert/strict";
import { markdownToHtml, markdownToText } from "../src/renderer/markdown-html.js";

// The formatting engine lives in main.jsx next to the toolbar it drives; import it without JSX.
const { applyMarkdownFormat } = await import("../src/renderer/format.js");

// Wrapping marks apply to a selection and toggle back off.
let result = applyMarkdownFormat("make this bold", 10, 14, "bold");
assert.equal(result.body, "make this **bold**");
assert.equal(result.body.slice(result.start, result.end), "bold");
assert.equal(applyMarkdownFormat(result.body, result.start, result.end, "bold").body, "make this bold");

// With no selection a placeholder is inserted and left selected for typing over.
result = applyMarkdownFormat("", 0, 0, "italic");
assert.equal(result.body, "*italic text*");
assert.equal(result.body.slice(result.start, result.end), "italic text");

// Line prefixes replace any existing prefix rather than stacking.
assert.equal(applyMarkdownFormat("A heading", 0, 0, "h2").body, "## A heading");
assert.equal(applyMarkdownFormat("## A heading", 0, 0, "h1").body, "# A heading");
assert.equal(applyMarkdownFormat("- [ ] task", 0, 0, "bullet").body, "- task");
assert.equal(applyMarkdownFormat("# Title", 0, 0, "h1").body, "Title", "applying the same prefix twice removes it");

// Multi-line selections renumber ordered lists.
assert.equal(applyMarkdownFormat("one\ntwo\nthree", 0, 13, "number").body, "1. one\n2. two\n3. three");

// Links leave the URL selected so it can be replaced immediately.
result = applyMarkdownFormat("see docs", 4, 8, "link");
assert.equal(result.body, "see [docs](https://)");
assert.equal(result.body.slice(result.start, result.end), "https://");

// Code blocks fence the selection.
assert.equal(applyMarkdownFormat("npm test", 0, 8, "codeblock").body, "```\nnpm test\n```");

// HTML export keeps structure for a Google Docs paste and escapes anything dangerous.
const html = markdownToHtml("# Plan\n\n- [x] done\n- [ ] next\n\nSome **bold** text.", "Release");
assert.match(html, /<h1>Release<\/h1>/);
assert.match(html, /<h1>Plan<\/h1>/);
assert.match(html, /☑ done/);
assert.match(html, /<strong>bold<\/strong>/);
assert.equal(markdownToHtml("<script>alert(1)</script>").includes("<script>"), false, "HTML in a note must be escaped");
assert.match(markdownToText("body text", "Title"), /^# Title\n\nbody text$/);

console.log("Formatting toolbar, Markdown rewriting, and Google Docs HTML export tests passed.");
