const { CronExpressionParser } = require("cron-parser");
const { z } = require("zod");

const SCHEDULE_TYPES = new Set(["cron", "interval", "oneTime", "external", "manual"]);

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid timestamp.");
  return date;
}

function isIanaTimezone(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; }
  catch { return false; }
}

function nextOccurrences(job, from = new Date(), count = 3) {
  if (!job?.enabled || job.archivedAt || !SCHEDULE_TYPES.has(job.scheduleType)) return [];
  const current = asDate(from);
  const limit = Math.max(1, Math.min(20, Number(count) || 3));
  if (job.scheduleType === "cron") {
    if (!isIanaTimezone(job.timezone)) throw new Error("Cron jobs require a valid IANA timezone.");
    try {
      const expression = CronExpressionParser.parse(String(job.cronExpression || ""), { currentDate: current, tz: job.timezone });
      return expression.take(limit).map((date) => date.toISOString());
    } catch (error) { throw new Error(`Invalid cron expression: ${error.message}`); }
  }
  if (job.scheduleType === "interval") {
    const seconds = Number(job.intervalSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("Interval must be a positive number of seconds.");
    const intervalMs = seconds * 1000;
    const anchor = asDate(job.anchorAt || job.createdAt || current).getTime();
    const elapsed = Math.max(0, current.getTime() - anchor);
    let next = anchor + (Math.floor(elapsed / intervalMs) + 1) * intervalMs;
    return Array.from({ length: limit }, () => { const value = new Date(next).toISOString(); next += intervalMs; return value; });
  }
  if (job.scheduleType === "oneTime") {
    const scheduled = asDate(job.oneTimeAt);
    return scheduled > current ? [scheduled.toISOString()] : [];
  }
  if (job.scheduleType === "external" && job.authoritativeNextRunAt) {
    const reported = asDate(job.authoritativeNextRunAt);
    return reported > current ? [reported.toISOString()] : [];
  }
  return [];
}

function previousOccurrence(job, before = new Date()) {
  if (!job?.enabled || job.archivedAt) return null;
  const current = asDate(before);
  if (job.scheduleType === "cron") {
    if (!isIanaTimezone(job.timezone)) return null;
    try { return CronExpressionParser.parse(String(job.cronExpression || ""), { currentDate: current, tz: job.timezone }).prev().toISOString(); }
    catch { return null; }
  }
  if (job.scheduleType === "interval") {
    const seconds = Number(job.intervalSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    const anchor = asDate(job.anchorAt || job.createdAt || current).getTime();
    const elapsed = current.getTime() - anchor;
    if (elapsed < 0) return null;
    return new Date(anchor + Math.floor(elapsed / (seconds * 1000)) * seconds * 1000).toISOString();
  }
  if (job.scheduleType === "oneTime" && job.oneTimeAt && asDate(job.oneTimeAt) <= current) return asDate(job.oneTimeAt).toISOString();
  return null;
}

function orderedRuns(runs, jobId) {
  return (runs || []).filter((run) => !jobId || run.jobId === jobId).slice().sort((left, right) => String(right.startedAt || right.scheduledFor || right.createdAt || "").localeCompare(String(left.startedAt || left.scheduledFor || left.createdAt || "")));
}

function deriveJobState(job, runs = [], now = new Date()) {
  if (!job?.enabled || job.archivedAt) return { state: "paused", reason: "Tracking is disabled for this job.", overdue: false };
  const current = asDate(now);
  const history = orderedRuns(runs, job.id);
  const active = history.find((run) => run.status === "running" && !run.completedAt);
  if (active) {
    const allowedSeconds = Math.max(1, Number(job.expectedDurationSeconds) || 3600) + Math.max(0, Number(job.gracePeriodSeconds) || 0);
    const exceeded = current.getTime() > asDate(active.startedAt || active.scheduledFor).getTime() + allowedSeconds * 1000;
    return exceeded
      ? { state: "overdue", reason: "The running job exceeded its expected duration and grace period.", overdue: true }
      : { state: "running", reason: "The latest run started and has not completed.", overdue: false };
  }
  const expected = previousOccurrence(job, current);
  const createdAt = job.createdAt ? asDate(job.createdAt) : null;
  const graceMs = Math.max(0, Number(job.gracePeriodSeconds) || 0) * 1000;
  if (expected && (!createdAt || asDate(expected) >= createdAt)) {
    const expectedMs = asDate(expected).getTime();
    const matching = history.find((run) => {
      const evidence = run.scheduledFor || run.startedAt;
      if (!evidence) return false;
      const delta = asDate(evidence).getTime() - expectedMs;
      return delta >= -60_000 && delta <= Math.max(graceMs, 60_000);
    });
    if (current.getTime() > expectedMs + graceMs && !matching) return { state: "overdue", reason: "An expected execution passed its grace period without a run record.", overdue: true, expectedAt: expected };
  }
  const latest = history[0];
  if (latest?.status === "failed") return { state: "degraded", reason: latest.redactedErrorSummary || latest.summary || "The latest job run failed.", overdue: false };
  if (["skipped", "cancelled"].includes(latest?.status)) return { state: "degraded", reason: `The latest job run was ${latest.status}.`, overdue: false };
  if (latest?.status === "success" || nextOccurrences(job, current, 1).length) return { state: "on_schedule", reason: latest?.status === "success" ? "The latest expected run succeeded." : "No scheduled execution is due yet.", overdue: false };
  return { state: "unknown", reason: "No trustworthy schedule or run evidence is available.", overdue: false };
}

function deriveBotState({ bot, snapshot, jobs = [], runs = [], now = new Date() }) {
  const monitoring = bot?.monitoring || {};
  const current = asDate(now);
  const source = snapshot?.source || (monitoring.adapter === "manual" ? "Manual" : "No source");
  if (bot?.archivedAt || monitoring.monitoringEnabled === false) {
    return { state: "paused", reason: bot?.archivedAt ? "Bot is archived." : "Monitoring is paused.", source, observedAt: snapshot?.observedAt || null, isStale: false };
  }
  if (bot?.executionMode === "scheduled") {
    const enabledJobs = jobs.filter((job) => job.enabled && !job.archivedAt);
    if (!enabledJobs.length) return { state: "unknown", reason: "No enabled schedule is configured.", source: "Job history", observedAt: snapshot?.observedAt || null, isStale: false };
    const jobStates = enabledJobs.map((job) => deriveJobState(job, runs, current));
    const worst = jobStates.find((item) => item.state === "overdue") || jobStates.find((item) => item.state === "running") || jobStates.find((item) => item.state === "degraded");
    const state = worst?.state || (jobStates.some((item) => item.state === "on_schedule") ? "on_schedule" : "unknown");
    return { state, reason: worst?.reason || "No expected execution has been missed.", source: snapshot?.source || "Job history", observedAt: snapshot?.observedAt || orderedRuns(runs)[0]?.completedAt || null, isStale: false };
  }
  if (bot?.executionMode === "manual" || monitoring.adapter === "manual") {
    return { state: "manual", reason: "No automatic monitoring is configured.", source: "Manual", observedAt: snapshot?.observedAt || null, isStale: false };
  }
  if (!snapshot?.observedAt) {
    return { state: "unknown", reason: "This bot has never been checked.", source, observedAt: null, isStale: false };
  }
  const staleAfter = Math.max(30, Number(monitoring.staleAfterSeconds) || 180) * 1000;
  const isStale = current.getTime() - asDate(snapshot.observedAt).getTime() > staleAfter;
  const failures = Math.max(0, Number(snapshot.consecutiveFailures) || 0);
  const offlineAt = Math.max(1, Number(monitoring.failuresBeforeOffline) || 3);
  let state = "healthy";
  let reason = snapshot.message || "Latest configured check succeeded.";
  if (isStale || failures >= offlineAt || ["offline", "error"].includes(snapshot.reportedState)) {
    state = "offline";
    reason = isStale ? "Status data exceeded the stale threshold." : snapshot.message || "Configured health checks repeatedly failed.";
  } else if (failures > 0 || snapshot.reportedState === "degraded") {
    state = "degraded";
    reason = snapshot.message || "A recent configured check failed.";
  }
  const criticalFailure = jobs.filter((job) => job.critical && job.enabled).some((job) => orderedRuns(runs, job.id)[0]?.status === "failed");
  if (state === "healthy" && criticalFailure) { state = "degraded"; reason = "A critical job has a recent unresolved failure."; }
  return { state, reason, source, observedAt: snapshot.observedAt, isStale };
}

const isoTimestamp = z.string().refine((value) => !Number.isNaN(Date.parse(value)) && /T/.test(value), "Invalid timestamp");
const structuredJobSchema = z.object({
  id: z.string().min(1).max(120),
  state: z.enum(["scheduled", "running", "success", "failed", "skipped", "cancelled"]),
  lastRunAt: isoTimestamp.optional(),
  nextRunAt: isoTimestamp.optional(),
  lastDurationMs: z.number().int().nonnegative().max(31_536_000_000).optional(),
  message: z.string().max(1000).optional(),
});
const structuredStatusSchema = z.object({
  schemaVersion: z.literal(1),
  botId: z.string().min(1).max(120),
  observedAt: isoTimestamp,
  state: z.enum(["healthy", "degraded", "offline", "unknown"]),
  activity: z.enum(["running", "idle", "recently_active", "unknown"]).default("unknown"),
  message: z.string().max(1000).optional(),
  startedAt: isoTimestamp.optional(),
  version: z.string().max(120).optional(),
  latencyMs: z.number().nonnegative().max(3_600_000).optional(),
  jobs: z.array(structuredJobSchema).max(200).default([]),
});

function parseStructuredStatus(value, expectedBotId) {
  const parsed = structuredStatusSchema.safeParse(value);
  if (!parsed.success || (expectedBotId && parsed.data.botId !== expectedBotId)) {
    const detail = parsed.success ? "botId does not match this record" : parsed.error.issues[0]?.message || "malformed data";
    throw new Error(`Invalid structured status payload: ${detail}.`);
  }
  return parsed.data;
}

function calculateRunMetrics(runs = []) {
  const completed = runs.filter((run) => ["success", "failed"].includes(run.status));
  const successes = completed.filter((run) => run.status === "success").length;
  const failures = completed.filter((run) => run.status === "failed").length;
  const durations = completed.map((run) => Number(run.durationMilliseconds)).filter((value) => Number.isFinite(value) && value >= 0);
  return {
    total: completed.length,
    successes,
    failures,
    successRate: completed.length ? successes / completed.length : null,
    averageDurationMilliseconds: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null,
    latestDurationMilliseconds: durations.length ? durations[0] : null,
  };
}

function dedupeRunRecords(runs = []) {
  const seen = new Set();
  return runs.filter((run) => {
    const key = run.externalRunId || `${run.jobId || ""}:${run.scheduledFor || ""}:${run.startedAt || ""}:${run.status || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatRelativeTime(value, now = new Date()) {
  const difference = asDate(value).getTime() - asDate(now).getTime();
  const absolute = Math.abs(difference);
  let divisor = 1000; let unit = "second";
  if (absolute >= 86_400_000) { divisor = 86_400_000; unit = "day"; }
  else if (absolute >= 3_600_000) { divisor = 3_600_000; unit = "hour"; }
  else if (absolute >= 60_000) { divisor = 60_000; unit = "minute"; }
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(Math.round(difference / divisor), unit);
}

function sanitizeHttpUrl(value) {
  let url;
  try { url = new URL(String(value || "")); } catch { throw new Error("Enter a valid HTTP or HTTPS URL."); }
  if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error("Only HTTP or HTTPS URLs are allowed.");
  if (url.username || url.password) throw new Error("Credentials are not allowed inside monitoring URLs.");
  for (const key of url.searchParams.keys()) if (/token|secret|api.?key|password|authorization/i.test(key)) throw new Error("Secret-like query parameters are not allowed; use an environment-variable reference.");
  return url;
}

function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, /authorization|token|secret|api.?key|password/i.test(key) ? "[REDACTED]" : redactSecrets(entry)]));
  if (typeof value !== "string") return value;
  return value
    .replace(/(authorization\s*:\s*)(?:bot|bearer)?\s*[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|access_token|api_?key|secret)=)[^&#\s]+/gi, "$1[REDACTED]")
    .replace(/\b\d{5,}:[A-Za-z0-9_-]{10,}\b/g, "[REDACTED]")
    .replace(/\b(?:mfa\.)?[A-Za-z0-9_-]{3,}\.[A-Za-z0-9_-]{3,}\.[A-Za-z0-9_-]{3,}\b/g, "[REDACTED]");
}

module.exports = {
  calculateRunMetrics,
  dedupeRunRecords,
  deriveBotState,
  deriveJobState,
  formatRelativeTime,
  isIanaTimezone,
  nextOccurrences,
  parseStructuredStatus,
  previousOccurrence,
  redactSecrets,
  sanitizeHttpUrl,
};
