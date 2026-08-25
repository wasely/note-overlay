const assert = require("assert");
const { CATALOG, listCepExtensions } = require("../src/main/cep-extensions.cjs");

const expected = [
  "Null Motion",
  "Buzzroll Studio",
  "ClipForge AI",
  "Asset Board / Kinetic Core",
  "OpenScreen Bridge",
  "YouTube Uploader",
  "Motion Highlighter",
];

assert.deepStrictEqual(CATALOG.map((item) => item.name), expected, "CEP catalog order changed");
assert.deepStrictEqual(CATALOG.map((item) => item.group), ["main", "main", "main", "main", "secondary", "secondary", "secondary"]);
assert.strictEqual(new Set(CATALOG.map((item) => item.id)).size, CATALOG.length, "CEP ids must be unique");

const items = listCepExtensions([
  { id: "null-project", name: "Null Motion" },
  { id: "buzzroll-project", name: "Buzzroll Studio" },
  { id: "clipforge-project", name: "ClipForge AI" },
]);
assert.deepStrictEqual(items.map((item) => item.name), expected);
assert.strictEqual(items[0].projectId, "null-project");
assert.strictEqual(items[1].projectId, "buzzroll-project");
assert.strictEqual(items[2].projectId, "clipforge-project");
assert.strictEqual(items[2].attention, "Install fix");
assert(items.every((item) => item.sourceAvailable), "Every curated CEP source should resolve on this workstation");
assert(items.filter((item) => item.logo).length >= 3, "Expected the available CEP logos to load");

console.log("CEP extension catalog passed");
