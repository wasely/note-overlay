const { z } = require("zod");
const { isIanaTimezone, nextOccurrences, sanitizeHttpUrl } = require("./bot-domain.cjs");

const optionalHttpUrl = z.string().max(2_000).refine((value) => {
  if (!value) return true;
  try { sanitizeHttpUrl(value); return true; } catch { return false; }
}, "Only valid HTTP or HTTPS URLs are allowed.");
const optionalTimestamp = z.union([z.string().datetime({ offset: true }), z.literal(""), z.null()]).optional();
const optionalId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/).optional();
const secretRef = z.union([z.string().regex(/^[A-Z_][A-Z0-9_]{1,127}$/), z.literal("")]).optional();

const connectionInput = z.object({
  id: z.string().max(160).optional(),
  platform: z.enum(["discord", "telegram"]),
  externalBotId: z.string().max(120).optional(),
  username: z.string().max(120).optional(),
  displayName: z.string().max(240).optional(),
  avatarUrl: optionalHttpUrl.optional(),
  credentialSecretRef: secretRef,
  credentialState: z.enum(["verified", "invalid", "not_configured", "unknown"]).optional(),
  credentialVerifiedAt: optionalTimestamp,
  credentialErrorSummary: z.string().max(1_000).optional(),
  installPermissions: z.string().regex(/^\d{1,24}$/).optional(),
});

const jobInput = z.object({
  id: z.string().max(160).optional(),
  name: z.string().trim().min(1).max(240),
  description: z.string().max(4_000).optional(),
  scheduleType: z.enum(["cron", "interval", "oneTime", "external", "manual"]),
  cronExpression: z.string().max(200).optional(),
  intervalSeconds: z.coerce.number().positive().max(31_536_000).optional(),
  oneTimeAt: optionalTimestamp,
  timezone: z.string().max(120).optional(),
  enabled: z.boolean().optional(),
  critical: z.boolean().optional(),
  schedulerSource: z.enum(["Internal bot scheduler", "Windows Task Scheduler", "GitHub Actions", "Hosting-provider cron", "External automation", "Manual", "Unknown"]).optional(),
  schedulerUrl: optionalHttpUrl.optional(),
  expectedDurationSeconds: z.coerce.number().positive().max(2_592_000).optional(),
  gracePeriodSeconds: z.coerce.number().nonnegative().max(604_800).optional(),
  retryDescription: z.string().max(2_000).optional(),
  authoritativeNextRunAt: optionalTimestamp,
  logsLocation: z.string().max(2_000).optional(),
  createdAt: optionalTimestamp,
  updatedAt: optionalTimestamp,
  archivedAt: optionalTimestamp,
}).superRefine((job, context) => {
  if (job.scheduleType === "cron") {
    if (!job.cronExpression) context.addIssue({ code: "custom", path: ["cronExpression"], message: "Cron expression is required." });
    if (!job.timezone || !isIanaTimezone(job.timezone)) context.addIssue({ code: "custom", path: ["timezone"], message: "A valid IANA timezone is required." });
    if (job.cronExpression && job.timezone && isIanaTimezone(job.timezone)) {
      try { nextOccurrences({ ...job, enabled: true }, new Date(), 1); }
      catch (error) { context.addIssue({ code: "custom", path: ["cronExpression"], message: error.message }); }
    }
  }
  if (job.scheduleType === "interval" && !job.intervalSeconds) context.addIssue({ code: "custom", path: ["intervalSeconds"], message: "Positive interval seconds are required." });
  if (job.scheduleType === "oneTime" && !job.oneTimeAt) context.addIssue({ code: "custom", path: ["oneTimeAt"], message: "One-time execution date is required." });
});

const commandInput = z.object({
  id: z.string().max(160).optional(),
  platform: z.enum(["discord", "telegram"]),
  command: z.string().trim().min(1).max(240),
  description: z.string().max(2_000).optional(),
  usage: z.string().max(2_000).optional(),
  parameters: z.string().max(4_000).optional(),
  permission: z.string().max(1_000).optional(),
  category: z.string().max(120).optional(),
  enabled: z.boolean().optional(),
  deprecated: z.boolean().optional(),
  notes: z.string().max(10_000).optional(),
});

const monitoringInput = z.object({
  adapter: z.enum(["http-status", "http-health", "local-status", "manual"]),
  url: optionalHttpUrl.optional(),
  filePath: z.string().max(2_000).optional(),
  httpMethod: z.enum(["GET", "HEAD"]).optional(),
  authSecretRef: secretRef,
  intervalSeconds: z.coerce.number().int().min(30).max(86_400).optional(),
  timeoutMilliseconds: z.coerce.number().int().min(250).max(60_000).optional(),
  staleAfterSeconds: z.coerce.number().int().min(30).max(604_800).optional(),
  failuresBeforeOffline: z.coerce.number().int().min(1).max(20).optional(),
  monitoringEnabled: z.boolean().optional(),
  expectedResponseCode: z.union([z.coerce.number().int().min(100).max(599), z.literal(""), z.null()]).optional(),
}).superRefine((monitoring, context) => {
  if (["http-status", "http-health"].includes(monitoring.adapter) && !monitoring.url) context.addIssue({ code: "custom", path: ["url"], message: "Monitoring URL is required for this adapter." });
  if (monitoring.adapter === "local-status" && !monitoring.filePath) context.addIssue({ code: "custom", path: ["filePath"], message: "Status-file path is required." });
  if (monitoring.adapter === "http-status" && monitoring.httpMethod === "HEAD") context.addIssue({ code: "custom", path: ["httpMethod"], message: "Structured status monitoring requires GET so JSON can be validated." });
});

const botInput = z.object({
  id: optionalId,
  name: z.string().trim().min(1).max(240),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/).optional(),
  description: z.string().max(4_000).optional(),
  platforms: z.array(z.enum(["discord", "telegram"])).min(1).max(2),
  executionMode: z.enum(["continuous", "scheduled", "webhook", "manual"]),
  environment: z.string().trim().min(1).max(120),
  enabled: z.boolean().optional(),
  archivedAt: optionalTimestamp,
  tags: z.array(z.string().trim().min(1).max(80)).max(24).optional(),
  repositoryUrl: optionalHttpUrl.optional(),
  localProjectPath: z.string().max(2_000).optional(),
  deploymentUrl: optionalHttpUrl.optional(),
  hostingProvider: z.string().max(240).optional(),
  runtime: z.string().max(240).optional(),
  version: z.string().max(120).optional(),
  logsLocation: z.string().max(2_000).optional(),
  schedulerSource: z.string().max(240).optional(),
  schedulerUrl: optionalHttpUrl.optional(),
  documentationNoteId: z.string().max(120).optional(),
  monitoring: monitoringInput,
  connections: z.array(connectionInput).max(2),
  jobs: z.array(jobInput).max(100),
  commands: z.array(commandInput).max(200),
  skillIds: z.array(z.string().max(120)).max(200).optional(),
}).superRefine((bot, context) => {
  const connections = new Set();
  for (let index = 0; index < bot.connections.length; index += 1) {
    const connection = bot.connections[index];
    if (connections.has(connection.platform)) context.addIssue({ code: "custom", path: ["connections", index, "platform"], message: "Only one connection per platform is allowed." });
    connections.add(connection.platform);
    if (!bot.platforms.includes(connection.platform)) context.addIssue({ code: "custom", path: ["connections", index, "platform"], message: "Connection platform must be selected in Basics." });
  }
  const jobNames = new Set();
  for (let index = 0; index < bot.jobs.length; index += 1) {
    const key = bot.jobs[index].name.toLowerCase();
    if (jobNames.has(key)) context.addIssue({ code: "custom", path: ["jobs", index, "name"], message: "Job names must be unique within a bot." });
    jobNames.add(key);
  }
  if (bot.executionMode === "scheduled" && !bot.jobs.some((job) => job.enabled !== false && !job.archivedAt)) context.addIssue({ code: "custom", path: ["jobs"], message: "Scheduled bots require at least one enabled job." });
});

module.exports = { botInput, connectionInput, jobInput, monitoringInput };
