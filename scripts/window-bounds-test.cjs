const assert = require("node:assert/strict");
const { boundsForDisplay, boundsMatch } = require("../src/main/window-bounds.cjs");

const left = { x: -1920, y: 0, width: 1920, height: 1080 };
const right = { x: 0, y: 0, width: 2560, height: 1440 };
assert.deepEqual(boundsForDisplay({ saved: { x: 140, y: 90, width: 940, height: 700 }, fallback: {}, workArea: right }), { x: 810, y: 370, width: 940, height: 700 });
assert.deepEqual(boundsForDisplay({ saved: { x: 4000, y: 90, width: 940, height: 700 }, fallback: {}, workArea: right }), { x: 810, y: 370, width: 940, height: 700 });
assert.deepEqual(boundsForDisplay({ saved: null, fallback: { width: 940, height: 700 }, workArea: left }), { x: -1430, y: 190, width: 940, height: 700 });
assert.deepEqual(boundsForDisplay({ saved: { x: 40, y: 32, width: 1880, height: 1000 }, fallback: { x: 40, y: 32, width: 1880, height: 1000 }, workArea: right }), { x: 810, y: 370, width: 940, height: 700 });
assert.deepEqual(boundsForDisplay({ saved: { x: 0, y: 0, width: 700, height: 500 }, fallback: {}, workArea: right }), { x: 930, y: 470, width: 700, height: 500 });

// A mixed-DPI move lands the window at the wrong physical size; the placement loop must notice.
const target = { x: 1930, y: 166, width: 940, height: 700 };
assert.equal(boundsMatch(target, target), true);
assert.equal(boundsMatch({ ...target, x: target.x + 1 }, target), true);
assert.equal(boundsMatch({ x: 1930, y: 166, width: 1880, height: 1400 }, target), false, "a doubled window must be corrected");
assert.equal(boundsMatch({ x: 1930, y: 166, width: 470, height: 350 }, target), false, "a halved window must be corrected");
assert.equal(boundsMatch(null, target), false);
// A saved size from a 2x display must still be centred and clamped on the 1x display.
const secondary = { x: 1920, y: 0, width: 1920, height: 1032 };
assert.deepEqual(boundsForDisplay({ saved: null, fallback: { x: 490, y: 166, width: 940, height: 700 }, workArea: secondary }), { x: 2410, y: 166, width: 940, height: 700 });
console.log("Window bounds and mixed-DPI placement regression tests passed.");
