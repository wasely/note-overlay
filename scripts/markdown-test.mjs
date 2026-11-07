import assert from "node:assert/strict";
import { inlineTokens, markdownBlocks } from "../src/renderer/markdown-blocks.js";

const source = [
  "# Title",
  "",
  "Some **bold** and `code` text.",
  "Second line of the same paragraph.",
  "",
  "- [ ] First task",
  "- [x] Done task",
  "",
  "- plain bullet",
  "1. numbered",
  "",
  "> quoted line",
  "",
  "```js",
  "const value = 1;",
  "```",
  "",
  "---",
].join("\n");

const blocks = markdownBlocks(source);
assert.deepEqual(blocks.map((block) => block.type), ["heading", "paragraph", "tasks", "bullets", "ordered", "quote", "code", "rule"]);
assert.equal(blocks[0].level, 1);
assert.equal(blocks[1].lines.length, 2);

const tasks = blocks[2];
assert.equal(tasks.items.length, 2);
assert.deepEqual(tasks.items.map((item) => item.checked), [false, true]);
// Line indexes must point at the real source lines so toggling writes back correctly.
assert.deepEqual(tasks.items.map((item) => item.lineIndex), [5, 6]);
assert.equal(source.split("\n")[tasks.items[1].lineIndex], "- [x] Done task");

assert.equal(blocks[6].language, "js");
assert.deepEqual(blocks[6].lines, ["const value = 1;"]);

const tokens = inlineTokens("plain **bold** and [link](https://example.com) end");
assert.deepEqual(tokens.map((token) => token.type), ["text", "strong", "text", "link", "text"]);
assert.equal(tokens[3].href, "https://example.com");
assert.equal(tokens[3].text, "link");

// A note that is only whitespace renders nothing rather than an empty paragraph.
assert.deepEqual(markdownBlocks("\n\n   \n"), []);

// GitHub tables: header, alignment, ragged rows padded, escaped pipes kept; no rule line = paragraph.
const [table] = markdownBlocks(String.raw`| a \| b | c | d |` + "\n|---|:-:|--:|\n| 1 | **2** |");
assert.equal(table.type, "table");
assert.deepEqual(table.header, ["a | b", "c", "d"]);
assert.deepEqual(table.align, ["left", "center", "right"]);
assert.deepEqual(table.rows, [["1", "**2**", ""]]);
assert.equal(markdownBlocks("| not | a table |\nprose")[0].type, "paragraph");

console.log("Markdown block, task line index, and inline token tests passed.");
