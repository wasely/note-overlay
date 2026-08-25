import assert from "node:assert/strict";
import { markdownToHtml, markdownToText } from "../src/renderer/markdown-html.js";

// HTML export keeps structure for a Google Docs paste and escapes anything dangerous.
const html = markdownToHtml("# Plan\n\n- [x] done\n- [ ] next\n\nSome **bold** text.", "Release");
assert.match(html, /<h1>Release<\/h1>/);
assert.match(html, /<h1>Plan<\/h1>/);
assert.match(html, /☑ done/);
assert.match(html, /<strong>bold<\/strong>/);
assert.equal(markdownToHtml("<script>alert(1)</script>").includes("<script>"), false, "HTML in a note must be escaped");
assert.match(markdownToText("body text", "Title"), /^# Title\n\nbody text$/);

console.log("Google Docs HTML export tests passed.");
