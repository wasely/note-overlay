import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addBrowserFileDragData, markdownFileName } from "../src/renderer/drag-file.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dragHelper = path.join(scriptDir, "..", "build", "clean-text-drag.exe");
assert.equal(execFileSync(dragHelper, ["--probe", "Token and Efficiency maxxing.md"], { encoding: "utf8" }).trim(), "Token and Efficiency maxxing.md");

assert.equal(markdownFileName({ id: "ab12-cd34", title: "Plan: launch?" }), "Plan launch.md");
assert.equal(markdownFileName({ title: "" }), "notebook-note.md");

const values = new Map();
const files = [];
const revoked = [];
const dataTransfer = {
  effectAllowed: "none",
  setData: (type, value) => values.set(type, value),
  items: { add: (file) => files.push(file) },
};
const environment = {
  File,
  URL: { createObjectURL: () => "blob:notebook-drag", revokeObjectURL: (url) => revoked.push(url) },
  setTimeout: (handler, delay) => { assert.equal(delay, 60_000); handler(); },
};
const result = addBrowserFileDragData({ dataTransfer }, { id: "abc-123", title: "Terminal note", body: "echo hello" }, environment);

assert.equal(result.fileName, "Terminal note.md");
assert.equal(result.contents, "# Terminal note\n\necho hello\n");
assert.equal(dataTransfer.effectAllowed, "copy");
assert.equal(values.get("text/plain"), result.fileName);
assert.equal(values.get("text/uri-list"), "blob:notebook-drag");
assert.equal(values.get("DownloadURL"), `text/markdown:${result.fileName}:blob:notebook-drag`);
assert.equal(files.length, 1);
assert.equal(files[0].name, result.fileName);
assert.equal(await files[0].text(), result.contents);
assert.deepEqual(revoked, ["blob:notebook-drag"]);
assert.equal(addBrowserFileDragData({ dataTransfer }, { title: "", body: "" }, environment), null);

console.log("Browser and desktop Markdown drag contract tests passed.");
