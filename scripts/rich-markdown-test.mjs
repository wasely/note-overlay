import assert from "node:assert/strict";
import { markdownToDoc, docToMarkdown } from "../src/renderer/rich-markdown.js";

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

console.log("Rich Markdown <-> TipTap conversion tests passed.");
