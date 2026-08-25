const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createStorage } = require("../src/main/storage.cjs");
const { createBotMonitorService } = require("../src/main/bot-monitor.cjs");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "notebook-monitor-"));
const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "notebook-bot-project-"));
const statusFile = path.join(projectDir, "status.json");
const observedAt = new Date().toISOString();
fs.writeFileSync(statusFile, JSON.stringify({ schemaVersion: 1, botId: "local-bot", observedAt, state: "healthy", activity: "idle", message: "Waiting for work", jobs: [] }));
const store = createStorage(userData);
let service;

(async () => {
try {
  const health = store.createBot({ name: "Health Bot", executionMode: "continuous", monitoring: { adapter: "http-health", url: "http://example.test/health", expectedResponseCode: 204, authSecretRef: "HEALTH_SECRET", monitoringEnabled: true, timeoutMilliseconds: 250, staleAfterSeconds: 180, failuresBeforeOffline: 3 }, connections: [{ platform: "discord", credentialSecretRef: "DISCORD_TEST_TOKEN" }] });
  const structured = store.createBot({ name: "Status Bot", id: "status-bot", platforms: ["discord"], executionMode: "continuous", monitoring: { adapter: "http-status", url: "http://example.test/status", monitoringEnabled: true, timeoutMilliseconds: 250, staleAfterSeconds: 180, failuresBeforeOffline: 3 }, connections: [{ platform: "discord", verificationMode: "runtime" }], jobs: [{ id: "status-bot-daily", name: "Daily", scheduleType: "cron", cronExpression: "0 14 * * *", timezone: "UTC", enabled: true }] });
  const local = store.createBot({ name: "Local Bot", id: "local-bot", executionMode: "continuous", localProjectPath: projectDir, monitoring: { adapter: "local-status", filePath: "status.json", monitoringEnabled: true, staleAfterSeconds: 180, failuresBeforeOffline: 3 } });
  const broken = store.createBot({ name: "Broken Bot", id: "broken-bot", executionMode: "continuous", monitoring: { adapter: "http-health", url: "http://example.test/broken", monitoringEnabled: true, timeoutMilliseconds: 250, staleAfterSeconds: 180, failuresBeforeOffline: 2 } });
  store.createBot({ name: "Manual Bot", executionMode: "manual", monitoring: { adapter: "manual", monitoringEnabled: true } });

  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), authorization: options.headers?.Authorization || options.headers?.authorization || "" });
    if (String(url).includes("/health")) return new Response(null, { status: 204 });
    if (String(url).includes("/status")) return new Response(JSON.stringify({ schemaVersion: 1, botId: structured.id, observedAt: new Date().toISOString(), state: "healthy", activity: "idle", version: "1.4.2", jobs: [{ id: "status-bot-daily", state: "success", lastRunAt: "2026-08-17T14:00:00.000Z", nextRunAt: "2026-08-18T14:00:00.000Z", lastDurationMs: 1280, message: "Done" }], connections: [{ platform: "discord", state: "verified", displayName: "Cloud alerts", verifiedAt: new Date().toISOString(), message: "Webhook verified by runtime." }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    if (String(url).includes("/broken")) return new Response("unavailable", { status: 503 });
    if (String(url).includes("discord.com/api/v10/users/@me")) return new Response(JSON.stringify({ id: "123456", username: "calendar", global_name: "Calendar", avatar: "hash" }), { status: 200 });
    if (String(url).includes("api.telegram.org")) return new Response(JSON.stringify({ ok: true, result: { id: 98765, username: "calendar_bot", first_name: "Calendar" } }), { status: 200 });
    throw new Error("Unexpected request");
  };
  const updates = [];
  const encryptedSecrets = new Map([["HEALTH_SECRET", "health-secret-value"], ["DISCORD_TEST_TOKEN", "discord-secret-value"]]);
  service = createBotMonitorService({ store, fetchImpl, env: { TELEGRAM_TEST_TOKEN: "telegram-secret-value" }, resolveSecret: (reference) => encryptedSecrets.get(reference), emit: (update) => updates.push(update) });

  const healthResult = await service.checkBot(health.id);
  assert.equal(healthResult.ok, true);
  assert.equal(healthResult.snapshot.reportedState, "healthy");
  assert.equal(requests[0].authorization, "Bearer health-secret-value");
  assert.equal(JSON.stringify(healthResult).includes("health-secret-value"), false);

  const statusResult = await service.checkBot(structured.id);
  assert.equal(statusResult.snapshot.reportedVersion, "1.4.2");
  assert.equal(store.listBotRuns(structured.id).length, 1);
  assert.equal(store.listBotRuns(structured.id)[0].source, "Reported by bot");
  assert.equal(store.getBotActivity(structured.id).filter((event) => event.type === "job_succeeded").length, 1);
  assert.equal(store.getBotActivity(structured.id).filter((event) => event.type === "job_scheduled").length, 1);
  assert.equal(store.getBot(structured.id).connections[0].credentialState, "verified");
  assert.equal(store.getBot(structured.id).connections[0].displayName, "Cloud alerts");
  await service.checkBot(structured.id);
  assert.equal(store.listBotRuns(structured.id).length, 1);
  assert.equal(store.getBotActivity(structured.id).filter((event) => event.type === "job_succeeded").length, 1);

  const localResult = await service.checkBot(local.id);
  assert.equal(localResult.ok, true);
  assert.equal(localResult.snapshot.source, "Local status file");
  fs.writeFileSync(statusFile, "{partially-written");
  const malformedLocal = await service.checkBot(local.id);
  assert.equal(malformedLocal.ok, false);
  assert.match(malformedLocal.error.message, /valid JSON/);

  const firstFailure = await service.checkBot(broken.id);
  const secondFailure = await service.checkBot(broken.id);
  assert.equal(firstFailure.snapshot.consecutiveFailures, 1);
  assert.equal(secondFailure.snapshot.consecutiveFailures, 2);
  assert.equal(store.getBot(broken.id).derivedState.state, "offline");
  assert.ok(store.getBotActivity(broken.id).some((event) => event.type === "state_changed"));

  const refresh = await service.checkAllBots();
  assert.equal(refresh.checked, 4);
  assert.ok(refresh.succeeded >= 2);
  assert.ok(refresh.failed >= 1);
  assert.equal(refresh.succeeded + refresh.failed, refresh.checked);
  assert.ok(updates.length >= refresh.checked);

  const verifiedDiscord = await service.verifyPlatformConnection(health.id, health.connections[0].id);
  assert.equal(verifiedDiscord.credentialState, "verified");
  assert.equal(verifiedDiscord.externalBotId, "123456");
  assert.equal(JSON.stringify(verifiedDiscord).includes("discord-secret-value"), false);

  const telegramBot = store.createBot({ name: "Telegram Verify", connections: [{ platform: "telegram", credentialSecretRef: "TELEGRAM_TEST_TOKEN" }], monitoring: { adapter: "manual", monitoringEnabled: true } });
  const verifiedTelegram = await service.verifyPlatformConnection(telegramBot.id, telegramBot.connections[0].id);
  assert.equal(verifiedTelegram.username, "calendar_bot");
  assert.equal(JSON.stringify(verifiedTelegram).includes("telegram-secret-value"), false);

  service.start();
  assert.ok(service.activeTimerCount() >= 1);
  service.stop();
  assert.equal(service.activeTimerCount(), 0);
  console.log("Bot monitor HTTP, structured status, local file, partial refresh, identity, redaction, and shutdown tests passed.");
} finally {
  service?.stop();
  store.close();
  fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.rmSync(projectDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
})().catch((error) => { console.error(error); process.exitCode = 1; });
