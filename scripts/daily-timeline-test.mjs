import assert from "node:assert/strict";
import { clockFromMinute, formatLoggedTime, formatRemaining, minuteFromClock, progressThroughDay } from "../src/renderer/daily-timeline.js";

assert.equal(minuteFromClock("09:17"), 557);
assert.equal(minuteFromClock("23:59"), 1439);
assert.equal(minuteFromClock("24:00"), null);
assert.equal(minuteFromClock("not-a-time"), null);
assert.equal(clockFromMinute(557), "09:17");
assert.equal(clockFromMinute(-1), "00:00");
assert.equal(clockFromMinute(2000), "23:59");
assert.equal(formatRemaining(0), "00:00:00");
assert.equal(formatRemaining(3661), "01:01:01");
assert.equal(formatRemaining(Number.NaN), "00:00:00");
assert.match(formatLoggedTime(new Date(2026, 7, 24, 18, 40, 42).toISOString()), /:40:42/);
assert.equal(formatLoggedTime("invalid"), "Time unavailable");
assert.equal(progressThroughDay(new Date("2026-08-24T12:00:00")), 50);
assert.equal(progressThroughDay(new Date("invalid")), 0);

console.log("Daily timeline formatting tests passed.");
