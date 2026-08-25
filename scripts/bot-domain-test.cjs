const assert = require("node:assert/strict");
const {
  calculateRunMetrics,
  dedupeRunRecords,
  deriveBotState,
  deriveJobState,
  formatRelativeTime,
  isIanaTimezone,
  nextOccurrences,
  parseStructuredStatus,
  redactSecrets,
  sanitizeHttpUrl,
} = require("../src/main/bot-domain.cjs");
const { botInput } = require("../src/main/bot-schemas.cjs");

const continuous = {
  id: "ops-bot",
  executionMode: "continuous",
  monitoring: { adapter: "http-health", monitoringEnabled: true, staleAfterSeconds: 180, failuresBeforeOffline: 3 },
};

const healthy = deriveBotState({
  bot: continuous,
  snapshot: { reportedState: "healthy", observedAt: "2026-08-17T15:19:30.000Z", consecutiveFailures: 0, source: "HTTP health response" },
  jobs: [],
  runs: [],
  now: new Date("2026-08-17T15:20:00.000Z"),
});
assert.equal(healthy.state, "healthy");
assert.equal(healthy.isStale, false);

const dstRuns = nextOccurrences({
  id: "morning",
  scheduleType: "cron",
  cronExpression: "0 9 * * *",
  timezone: "America/Edmonton",
  enabled: true,
}, new Date("2026-03-07T16:00:01.000Z"), 2);
assert.deepEqual(dstRuns, ["2026-03-08T15:00:00.000Z", "2026-03-09T15:00:00.000Z"]);

assert.deepEqual(nextOccurrences({ id: "year", scheduleType: "cron", cronExpression: "0 0 1 1 *", timezone: "UTC", enabled: true }, new Date("2026-12-31T23:59:00.000Z"), 1), ["2027-01-01T00:00:00.000Z"]);
assert.deepEqual(nextOccurrences({ id: "month", scheduleType: "cron", cronExpression: "0 0 * * *", timezone: "UTC", enabled: true }, new Date("2026-01-31T23:59:00.000Z"), 1), ["2026-02-01T00:00:00.000Z"]);
assert.deepEqual(nextOccurrences({ id: "disabled", scheduleType: "cron", cronExpression: "0 0 * * *", timezone: "UTC", enabled: false }, new Date(), 3), []);
assert.deepEqual(nextOccurrences({ id: "once", scheduleType: "oneTime", oneTimeAt: "2027-01-02T00:00:00.000Z", enabled: true }, new Date("2027-01-01T00:00:00.000Z"), 3), ["2027-01-02T00:00:00.000Z"]);
assert.deepEqual(nextOccurrences({ id: "interval", scheduleType: "interval", intervalSeconds: 3600, anchorAt: "2026-08-17T12:00:00.000Z", enabled: true }, new Date("2026-08-17T15:20:00.000Z"), 2), ["2026-08-17T16:00:00.000Z", "2026-08-17T17:00:00.000Z"]);
assert.equal(isIanaTimezone("America/Edmonton"), true);
assert.equal(isIanaTimezone("Mountain-ish"), false);
assert.throws(() => nextOccurrences({ scheduleType: "cron", cronExpression: "not cron", timezone: "UTC", enabled: true }), /Invalid cron expression/);

const dailyJob = { id: "summary", scheduleType: "cron", cronExpression: "0 14 * * *", timezone: "UTC", enabled: true, createdAt: "2026-08-01T00:00:00.000Z", gracePeriodSeconds: 600 };
assert.equal(deriveJobState(dailyJob, [], new Date("2026-08-17T15:20:00.000Z")).state, "overdue");
const successRun = { id: "r1", jobId: "summary", scheduledFor: "2026-08-17T14:00:00.000Z", startedAt: "2026-08-17T14:00:03.000Z", completedAt: "2026-08-17T14:00:04.000Z", status: "success", durationMilliseconds: 1000 };
assert.equal(deriveJobState(dailyJob, [successRun], new Date("2026-08-17T15:20:00.000Z")).state, "on_schedule");
assert.equal(deriveJobState(dailyJob, [{ ...successRun, status: "failed" }], new Date("2026-08-17T15:20:00.000Z")).state, "degraded");
const runningJob = { ...dailyJob, expectedDurationSeconds: 300, gracePeriodSeconds: 60 };
const runningRun = { id: "r2", jobId: "summary", scheduledFor: "2026-08-17T14:00:00.000Z", startedAt: "2026-08-17T14:00:00.000Z", completedAt: null, status: "running" };
assert.equal(deriveJobState(runningJob, [runningRun], new Date("2026-08-17T14:03:00.000Z")).state, "running");
assert.equal(deriveJobState(runningJob, [runningRun], new Date("2026-08-17T14:07:00.000Z")).state, "overdue");

const scheduled = { id: "schedule-bot", executionMode: "scheduled", monitoring: { adapter: "manual", monitoringEnabled: true }, createdAt: "2026-08-01T00:00:00.000Z" };
assert.equal(deriveBotState({ bot: scheduled, snapshot: null, jobs: [dailyJob], runs: [successRun], now: new Date("2026-08-17T15:20:00.000Z") }).state, "on_schedule");
assert.equal(deriveBotState({ bot: scheduled, snapshot: null, jobs: [dailyJob], runs: [], now: new Date("2026-08-17T15:20:00.000Z") }).state, "overdue");
assert.equal(deriveBotState({ bot: { ...continuous, executionMode: "webhook" }, snapshot: null, jobs: [], runs: [], now: new Date() }).state, "unknown");
assert.equal(deriveBotState({ bot: { ...continuous, executionMode: "webhook" }, snapshot: { reportedState: "healthy", observedAt: "2026-08-17T15:19:30.000Z", consecutiveFailures: 0, source: "HTTP health response" }, jobs: [], runs: [], now: new Date("2026-08-17T15:20:00.000Z") }).state, "healthy");
assert.equal(deriveBotState({ bot: { ...continuous, executionMode: "webhook" }, snapshot: { reportedState: "healthy", observedAt: "2026-08-17T15:19:30.000Z", consecutiveFailures: 1, source: "HTTP health response" }, jobs: [], runs: [], now: new Date("2026-08-17T15:20:00.000Z") }).state, "degraded");
assert.equal(deriveBotState({ bot: { ...continuous, executionMode: "webhook" }, snapshot: { reportedState: "healthy", observedAt: "2026-08-17T15:19:30.000Z", consecutiveFailures: 3, source: "HTTP health response" }, jobs: [], runs: [], now: new Date("2026-08-17T15:20:00.000Z") }).state, "offline");
assert.equal(deriveBotState({ bot: { ...continuous, executionMode: "manual" }, snapshot: null, jobs: [], runs: [], now: new Date() }).state, "manual");
assert.equal(deriveBotState({ bot: continuous, snapshot: { reportedState: "healthy", observedAt: "2026-08-17T15:10:00.000Z", consecutiveFailures: 0, source: "HTTP health response" }, jobs: [], runs: [], now: new Date("2026-08-17T15:20:00.000Z") }).state, "offline");
assert.equal(deriveBotState({ bot: continuous, snapshot: { reportedState: "healthy", observedAt: "2026-08-17T15:19:30.000Z", consecutiveFailures: 1, source: "HTTP health response" }, jobs: [], runs: [], now: new Date("2026-08-17T15:20:00.000Z") }).state, "degraded");
assert.equal(deriveBotState({ bot: continuous, snapshot: { reportedState: "healthy", observedAt: "2026-08-17T15:19:30.000Z", consecutiveFailures: 0, source: "HTTP health response" }, jobs: [{ ...dailyJob, critical: true }], runs: [{ ...successRun, status: "failed" }], now: new Date("2026-08-17T15:20:00.000Z") }).state, "degraded");
assert.equal(deriveJobState(dailyJob, [successRun], new Date("2026-08-20T15:20:00.000Z")).state, "overdue");

const payload = parseStructuredStatus({ schemaVersion: 1, botId: "ops-bot", observedAt: "2026-08-17T15:20:00.000Z", state: "healthy", activity: "idle", message: "Waiting", jobs: [{ id: "summary", state: "success", lastRunAt: "2026-08-17T14:00:00.000Z", nextRunAt: "2026-08-18T14:00:00.000Z", lastDurationMs: 1200 }], connections: [{ platform: "discord", state: "verified", displayName: "Cloud alerts", verifiedAt: "2026-08-17T15:19:00.000Z", message: "Webhook verified by runtime." }] }, "ops-bot");
assert.equal(payload.jobs[0].state, "success");
assert.equal(payload.connections[0].state, "verified");
const runtimeVerifiedBot = botInput.parse({ name: "Cloud bot", platforms: ["discord"], executionMode: "continuous", environment: "production", monitoring: { adapter: "http-status", url: "https://example.com/status" }, connections: [{ platform: "discord", verificationMode: "runtime" }], jobs: [], commands: [] });
assert.equal(runtimeVerifiedBot.connections[0].verificationMode, "runtime");
assert.throws(() => parseStructuredStatus({ schemaVersion: 1, botId: "other", observedAt: "bad", state: "up" }, "ops-bot"), /Invalid structured status payload/);

assert.deepEqual(calculateRunMetrics([]), { total: 0, successes: 0, failures: 0, successRate: null, averageDurationMilliseconds: null, latestDurationMilliseconds: null });
assert.deepEqual(calculateRunMetrics([{ status: "success", durationMilliseconds: 1000 }, { status: "success", durationMilliseconds: 3000 }, { status: "failed", durationMilliseconds: 2000 }]), { total: 3, successes: 2, failures: 1, successRate: 2 / 3, averageDurationMilliseconds: 2000, latestDurationMilliseconds: 1000 });
assert.equal(dedupeRunRecords([{ id: "1", externalRunId: "remote-a" }, { id: "2", externalRunId: "remote-a" }, { id: "3", externalRunId: null }]).length, 2);
assert.equal(formatRelativeTime("2026-08-17T16:20:00.000Z", new Date("2026-08-17T15:20:00.000Z")), "in 1 hour");
assert.equal(sanitizeHttpUrl("https://example.com/status?mode=brief").protocol, "https:");
assert.throws(() => sanitizeHttpUrl("https://example.com/status?token=secret"), /Secret-like query/);
assert.throws(() => sanitizeHttpUrl("file:///C:/secret"), /HTTP or HTTPS/);
const redacted = redactSecrets("Authorization: Bot abc.def.ghi https://example.com/status?token=123 Telegram 123456:ABCdef_secret");
assert.equal(redacted.includes("123"), false);
assert.match(redacted, /\[REDACTED\]/);

console.log("Bot domain status, schedules, metrics, validation, and redaction tests passed.");
