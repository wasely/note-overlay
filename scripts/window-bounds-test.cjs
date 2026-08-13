const assert = require("node:assert/strict");
const { boundsForDisplay } = require("../src/main/window-bounds.cjs");

const left = { x: -1920, y: 0, width: 1920, height: 1080 };
const right = { x: 0, y: 0, width: 2560, height: 1440 };
assert.deepEqual(boundsForDisplay({ saved: { x: 140, y: 90, width: 940, height: 700 }, fallback: {}, workArea: right }), { x: 810, y: 370, width: 940, height: 700 });
assert.deepEqual(boundsForDisplay({ saved: { x: 4000, y: 90, width: 940, height: 700 }, fallback: {}, workArea: right }), { x: 810, y: 370, width: 940, height: 700 });
assert.deepEqual(boundsForDisplay({ saved: null, fallback: { width: 940, height: 700 }, workArea: left }), { x: -1430, y: 190, width: 940, height: 700 });
assert.deepEqual(boundsForDisplay({ saved: { x: 40, y: 32, width: 1880, height: 1000 }, fallback: { x: 40, y: 32, width: 1880, height: 1000 }, workArea: right }), { x: 810, y: 370, width: 940, height: 700 });
assert.deepEqual(boundsForDisplay({ saved: { x: 0, y: 0, width: 700, height: 500 }, fallback: {}, workArea: right }), { x: 930, y: 470, width: 700, height: 500 });
console.log("Window bounds regression tests passed.");
