import assert from "node:assert/strict";
import { markdownToDoc, docToMarkdown, looksLikeMarkdown } from "../src/renderer/rich-markdown.js";
import { markdownBlocks } from "../src/renderer/markdown-blocks.js";

// The converter must round-trip the supported Markdown dialect without drift.
function roundtrip(markdown) {
  assert.equal(docToMarkdown(markdownToDoc(markdown)), markdown);
}

roundtrip("# Title\n\nA **bold** plan.");
roundtrip("Paragraph one.\n\n- one\n- two\n\n1. first\n2. second");
roundtrip("- [ ] open\n- [x] done");
roundtrip("> quoted line\n> next line");
roundtrip("```js\nconsole.log(1)\n```");
roundtrip("---");
roundtrip("line **a** and *b* and `c` and ~~d~~");
roundtrip("see [docs](https://example.com)");
roundtrip("Soft break\nstill one paragraph.");

// An empty note becomes an empty document and back.
assert.equal(docToMarkdown(markdownToDoc("")), "");

// Specific node/attribute mapping is correct for TipTap to consume.
const doc = markdownToDoc("# Hi\n\n- [x] done");
assert.equal(doc.type, "doc");
assert.equal(doc.content[0].type, "heading");
assert.equal(doc.content[0].attrs.level, 1);
assert.equal(doc.content[1].type, "taskList");
assert.equal(doc.content[1].content[0].type, "taskItem");
assert.equal(doc.content[1].content[0].attrs.checked, true);

// Bold/link inline tokens become TipTap text marks.
const inline = markdownToDoc("A **bold** and [link](https://x.dev) word.");
const paragraph = inline.content[0];
const marks = paragraph.content.map((node) => (node.marks || []).map((mark) => mark.type));
assert.deepEqual(marks, [[], ["bold"], [], ["link"], []]);

// Plain-text pastes: Markdown converts, ordinary prose and URLs stay literal.
for (const text of ["# Title", "- item", "1. first", "> quote", "```js\ncode\n```", "- [ ] todo", "a **bold** word", "see [docs](https://x.dev)"]) assert.equal(looksLikeMarkdown(text), true, text);
for (const text of ["", "Just a sentence.", "https://example.com", "C#-style names", "2*3*4", "#hashtag"]) assert.equal(looksLikeMarkdown(text), false, text);

// Tables have no TipTap node: they ride through the editor as their own source lines, so an
// autosave can never drop a row or a column alignment.
for (const table of [
  "| Scene | Note |\n| --- | :--: |\n| One | [[Shot list]] |",
  "# T\n\n| a | b |\n|---|---:|\n| 1 | **2** |\n| 3 |\n\nafter",
  "| looks | like |\n| a table | but no rule |",
  // Two stored tables separated by a blank line must stay two tables (a join here once merged them).
  "| Scene | Take |\n| --- | --- |\n| One | A |\n\n| Shot | Lens |\n| --- | --- |\n| Wide | 24mm |",
  "| a |\n\n| b |",
  "| x |\n|---|\n\nprose\n\n| y |",
]) assert.equal(docToMarkdown(markdownToDoc(table)), table, table);
// Round trips are stable: saving twice changes nothing.
for (const md of ["| a | b |\n|---|---|\n| 1 | 2 |\n\n| c | d |\n|---|---|\n| 3 | 4 |"]) {
  const once = docToMarkdown(markdownToDoc(md));
  assert.equal(docToMarkdown(markdownToDoc(once)), once);
  assert.deepEqual(markdownBlocks(once).map((block) => block.type), ["table", "table"]);
}
// Typed rows that are not a table (no rule line) are left as separate paragraphs.
const loose = { type: "doc", content: ["| a |", "| b |"].map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })) };
assert.equal(docToMarkdown(loose), "| a |\n\n| b |");
// A pasted table is Markdown, and rows typed with Enter (one paragraph each) save as one table.
assert.equal(looksLikeMarkdown("| Scene | Note |\n| --- | :--: |\n| One | x |"), true);
const typed = { type: "doc", content: ["| a | b |", "|---|---|", "| 1 | 2 |", "after"].map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })) };
assert.equal(docToMarkdown(typed), "| a | b |\n|---|---|\n| 1 | 2 |\n\nafter");
// …but an empty line between two typed tables keeps them two tables.
const para = (text) => text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };
assert.equal(docToMarkdown({ type: "doc", content: ["| a |", "|---|", "", "| b |", "|---|"].map(para) }), "| a |\n|---|\n\n| b |\n|---|");

console.log("Rich Markdown <-> TipTap conversion tests passed.");
