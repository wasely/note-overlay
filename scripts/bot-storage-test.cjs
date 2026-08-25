const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createStorage } = require("../src/main/storage.cjs");

const firstPath = fs.mkdtempSync(path.join(os.tmpdir(), "notebook-bots-a-"));
const secondPath = fs.mkdtempSync(path.join(os.tmpdir(), "notebook-bots-b-"));
const restorePath = fs.mkdtempSync(path.join(os.tmpdir(), "notebook-bots-restore-"));
let activeStore;
let backup;

try {
  let store = createStorage(firstPath); activeStore = store;
  const skill = store.createSkill({ name: "Daily planning", category: "Automation", body: "Plan safely." });
  const mcp = { id: "calendar", name: "Calendar", description: "Calendar tools", transport: "stdio", command: "calendar-mcp" };
  const bot = store.createBot({
    name: "Calendar Assistant",
    description: "Posts reminders without reading message content.",
    icon: { type: "symbol", value: "📅", color: "blue" },
    platforms: ["discord", "telegram"],
    executionMode: "scheduled",
    environment: "production",
    tags: ["calendar", "productivity"],
    monitoring: { adapter: "local-status", filePath: "status.json", monitoringEnabled: true, intervalSeconds: 60, timeoutMilliseconds: 5000, staleAfterSeconds: 180, failuresBeforeOffline: 3 },
    connections: [
      { platform: "discord", displayName: "Calendar", credentialSecretRef: "DISCORD_CALENDAR_BOT_TOKEN", installPermissions: "274877975552" },
      { platform: "telegram", username: "calendar_assistant_bot", credentialSecretRef: "TELEGRAM_CALENDAR_BOT_TOKEN" },
    ],
    jobs: [{ name: "Morning summary", scheduleType: "cron", cronExpression: "0 8 * * *", timezone: "America/Edmonton", enabled: true, schedulerSource: "Internal bot scheduler", gracePeriodSeconds: 600 }],
    commands: [{ platform: "discord", command: "/today", description: "Shows today's schedule", enabled: true, deprecated: false }],
    skillIds: [skill.id, "missing-skill"],
  });
  assert.equal(bot.id, "calendar-assistant");
  assert.equal(bot.connections.length, 2);
  assert.equal(bot.jobs.length, 1);
  assert.deepEqual(bot.icon, { type: "symbol", value: "📅", color: "blue" });
  assert.equal("mcpServerIds" in bot, false);
  assert.ok(store.getNote(bot.documentationNoteId).body.includes("# What this bot does"));

  store.updateNote(bot.documentationNoteId, { title: "Calendar runbook", body: "# Custom runbook\n\nKeep this body.", folderId: store.inboxId });
  const updated = store.updateBot(bot.id, { ...bot, name: "Calendar Operations", description: "Updated description" });
  assert.equal(updated.id, bot.id);
  assert.equal(store.getNote(bot.documentationNoteId).body, "# Custom runbook\n\nKeep this body.");

  store.saveBotRuntime(bot.id, { reportedState: "healthy", activityState: "idle", stateReason: "Fixture", source: "Local status file", observedAt: "2026-08-17T15:20:00.000Z", lastSuccessfulCheckAt: "2026-08-17T15:20:00.000Z", consecutiveFailures: 0, responseLatencyMilliseconds: 12, isStale: false });
  store.recordBotEvent({ botId: bot.id, type: "status_check_succeeded", timestamp: "2026-08-17T15:20:00.000Z", summary: "Local fixture accepted.", source: "Local status file", metadata: { path: "[local status file]" } });
  const run = { botId: bot.id, jobId: updated.jobs[0].id, externalRunId: "fixture-1", scheduledFor: "2026-08-17T14:00:00.000Z", startedAt: "2026-08-17T14:00:01.000Z", completedAt: "2026-08-17T14:00:02.000Z", status: "success", durationMilliseconds: 1000, source: "Reported by bot" };
  store.recordBotRun(run);
  store.recordBotRun(run);
  assert.equal(store.listBotRuns(bot.id).length, 1);
  assert.equal(store.getBotActivity(bot.id).filter((event) => event.type === "status_check_succeeded").length, 1);
  assert.equal(store.getBot(bot.id).runtime.source, "Local status file");
  store.importData({
    notes: [],
    mcpServers: [mcp],
    bots: [{ id: "legacy-mcp-bot", name: "Legacy MCP bot", description: "Compatibility fixture", mcpServerIds: [mcp.id, "missing-mcp"], skillIds: [] }],
  });
  assert.equal("mcpServerIds" in store.getBot("legacy-mcp-bot"), false);
  backup = store.exportData();
  assert.equal(backup.bots.length, 2);
  assert.deepEqual(backup.bots.find((item) => item.id === "legacy-mcp-bot").mcpServerIds, [mcp.id, "missing-mcp"]);
  assert.equal(store.listRelatedBots("skill", skill.id)[0].id, bot.id);

  store.archiveBot(bot.id);
  assert.ok(store.getBot(bot.id).archivedAt);
  assert.equal(store.listBots().length, 1);
  assert.equal(store.listBots({ includeArchived: true }).length, 2);
  store.restoreBot(bot.id);
  store.close(); activeStore = null;

  store = createStorage(firstPath); activeStore = store;
  assert.equal(store.getBot(bot.id).name, "Calendar Operations");
  assert.equal(store.getBot(bot.id).icon.value, "📅");
  assert.equal(store.listBotRuns(bot.id).length, 1);
  store.close(); activeStore = null;

  const isolated = createStorage(secondPath); activeStore = isolated;
  assert.equal(isolated.listBots({ includeArchived: true }).length, 0);
  isolated.close(); activeStore = null;

  const restored = createStorage(restorePath); activeStore = restored;
  restored.importData(backup);
  assert.equal(restored.getBot(bot.id).name, "Calendar Operations");
  assert.deepEqual(restored.getBot(bot.id).icon, { type: "symbol", value: "📅", color: "blue" });
  assert.equal(restored.getBot(bot.id).runtime.source, "Local status file");
  assert.equal(restored.listBotRuns(bot.id).length, 1);
  assert.equal(restored.getNote(restored.getBot(bot.id).documentationNoteId).body, "# Custom runbook\n\nKeep this body.");
  assert.equal("mcpServerIds" in restored.getBot("legacy-mcp-bot"), false);
  assert.deepEqual(restored.exportData().bots.find((item) => item.id === "legacy-mcp-bot").mcpServerIds, [mcp.id, "missing-mcp"]);
  restored.close(); activeStore = null;
  console.log("Bot registry, docs, relations, archive, history, backup import, and store isolation tests passed.");
} finally {
  try { activeStore?.close(); } catch { /* Test cleanup only. */ }
  fs.rmSync(firstPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.rmSync(secondPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.rmSync(restorePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
