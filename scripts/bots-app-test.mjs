import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const packagedExecutable = process.env.NOTEBOOK_EXECUTABLE;
const userData = await fs.mkdtemp(path.join(os.tmpdir(), "notebook-bots-app-"));
const projectRoot = path.join(userData, "scheduled-bot-project");
const screenshots = path.resolve("screenshots");
const secretValue = "test-only-token-must-never-reach-renderer";
await fs.mkdir(projectRoot, { recursive: true });
await fs.mkdir(screenshots, { recursive: true });

async function launch() {
  return electron.launch({
    executablePath: packagedExecutable || electronPath,
    args: [`--user-data-dir=${userData}`, ...(packagedExecutable ? [] : ["."])],
    env: { ...process.env, NOTEBOOK_DISABLE_STARTUP_REGISTRATION: "1", NOTEBOOK_BOT_CONNECTOR_URL: "", NOTEBOOK_TELEGRAM_API_ID: "", NOTEBOOK_TELEGRAM_API_HASH: "", TELEGRAM_E2E_BOT_TOKEN: secretValue, DISCORD_E2E_BOT_TOKEN: secretValue },
  });
}

async function ready(application, width = 1180, height = 860) {
  const page = await application.firstWindow();
  await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setAlwaysOnTop(false);
    window.show();
  });
  await page.bringToFront();
  await page.setViewportSize({ width, height });
  await page.locator(".wordmark").getByText("Notebook", { exact: true }).waitFor();
  return page;
}

async function stop(application) {
  await application.evaluate(({ app }) => { app.isQuitting = true; app.quit(); }).catch(() => {});
  await application.close().catch(() => {});
}

function statusPayload(bot, job, state, message) {
  const observedAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    botId: bot.id,
    observedAt,
    state: "healthy",
    activity: "idle",
    message,
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    version: "1.2.3",
    jobs: [{ id: job.id, state, lastRunAt: observedAt, nextRunAt: new Date(Date.now() + 300_000).toISOString(), lastDurationMs: 850, message: state === "failed" ? "Fixture job failed without exposing secrets." : "Fixture job completed." }],
  };
}

async function openSavedBot(page) {
  const botsButton = page.getByRole("button", { name: /^Bots/ });
  if (!(await botsButton.count())) throw new Error(`Bots navigation unavailable. Buttons: ${JSON.stringify(await page.locator("button").allTextContents())}`);
  await botsButton.click();
  const heading = page.getByRole("heading", { name: "Scheduled Multi Platform Ops", exact: true });
  if (!(await heading.isVisible().catch(() => false))) await page.locator(".bot-sidebar-list button").filter({ hasText: "Scheduled Multi Platform Ops" }).first().click();
  await heading.waitFor();
}

let app;
try {
  app = await launch();
  let page = await ready(app);
  const connectorBoundary = await page.evaluate(async () => {
    const status = await window.hushnote.bots.connectorStatus();
    let unsafeRejected = false;
    try { await window.hushnote.bots.setConnectorUrl("http://connector.example"); } catch { unsafeRejected = true; }
    return { status, unsafeRejected };
  });
  if (connectorBoundary.status.connector.configured || connectorBoundary.status.telegramAuth.configured || !connectorBoundary.unsafeRejected) throw new Error(`Bot Connector IPC boundary is unsafe: ${JSON.stringify(connectorBoundary)}`);
  const related = await page.evaluate(async () => {
    const skill = await window.hushnote.skills.create({ name: "Bot Operations Test Skill", category: "Automation", body: "Fixture skill." });
    return { skill };
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Notebook", { exact: true }).waitFor();
  const bot = await page.evaluate(async ({ skillId, projectRoot }) => window.hushnote.bots.create({
    name: "Scheduled Multi Platform Ops",
    description: "Real Electron persistence and monitoring fixture.",
    platforms: ["discord", "telegram"],
    executionMode: "scheduled",
    environment: "production",
    tags: ["fixture"],
    localProjectPath: projectRoot,
    runtime: "Node.js 24",
    monitoring: { adapter: "local-status", filePath: "status.json", monitoringEnabled: true, intervalSeconds: 60, timeoutMilliseconds: 5000, staleAfterSeconds: 180, failuresBeforeOffline: 3, httpMethod: "GET", authSecretRef: "" },
    connections: [
      { platform: "discord", username: "scheduled_discord_bot", externalBotId: "123456789012345678", credentialSecretRef: "DISCORD_E2E_BOT_TOKEN", credentialState: "not_configured", installPermissions: "274877975552" },
      { platform: "telegram", username: "scheduled_telegram_bot", credentialSecretRef: "TELEGRAM_E2E_BOT_TOKEN", credentialState: "not_configured" },
    ],
    jobs: [{ id: "digest-job", name: "Five minute digest", scheduleType: "cron", cronExpression: "*/5 * * * *", timezone: "America/Edmonton", enabled: true, schedulerSource: "External automation", gracePeriodSeconds: 600, expectedDurationSeconds: 300 }],
    commands: [],
    skillIds: [skillId],
  }), { skillId: related.skill.id, projectRoot });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Notebook", { exact: true }).waitFor();
  await openSavedBot(page);
  if (!bot || bot.runtimeLanguage !== "Node.js 24") throw new Error(`Bot definition was not persisted safely: ${JSON.stringify(bot)}`);
  if (!bot.skillIds.includes(related.skill.id) || "mcpServerIds" in bot) throw new Error("Bot skill relationships or removed MCP state are wrong.");
  const serialized = await page.evaluate(async () => JSON.stringify(await window.hushnote.bots.list({ includeArchived: true })));
  if (serialized.includes(secretValue)) throw new Error("A resolved secret reached the renderer.");
  const invalidRejected = await page.evaluate(async () => { try { await window.hushnote.bots.create({ name: "invalid" }); return false; } catch { return true; } });
  if (!invalidRejected) throw new Error("Invalid bot IPC payload was accepted.");

  await fs.writeFile(path.join(projectRoot, "status.json"), JSON.stringify(statusPayload(bot, bot.jobs[0], "success", "Connected and waiting for scheduled work.")));
  await page.getByRole("button", { name: "Check Now", exact: true }).click();
  await page.getByText(/Check succeeded in \d+ ms\./).waitFor();
  await page.locator(".bot-state.state-on_schedule").waitFor();
  await page.screenshot({ path: path.join(screenshots, "bots-electron-healthy.png"), fullPage: true });

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Open Note", exact: true }).click();
  await page.getByLabel("Note title").waitFor();
  if (!(await page.getByLabel("Note content").textContent()).includes("What this bot does")) throw new Error("Bot Markdown runbook did not open in the existing editor.");
  await openSavedBot(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await app.evaluate(({ shell }) => {
    globalThis.__botSetupUrls = [];
    shell.openExternal = async (url) => { globalThis.__botSetupUrls.push(url); };
  });
  await page.getByRole("button", { name: "Install To Server", exact: true }).click();
  await page.getByRole("button", { name: "Open Bot", exact: true }).click();
  await page.evaluate(async ({ botId, discordId, telegramId }) => {
    await window.hushnote.bots.openSetup(botId, discordId, "portal");
    await window.hushnote.bots.openSetup(botId, telegramId, "portal");
  }, { botId: bot.id, discordId: bot.connections[0].id, telegramId: bot.connections[1].id });
  const setupUrls = await app.evaluate(() => globalThis.__botSetupUrls);
  if (!setupUrls.some((url) => url.includes("discord.com/developers/applications/123456789012345678"))) throw new Error("Discord developer portal URL was not generated.");
  if (!setupUrls.some((url) => url.includes("discord.com/oauth2/authorize") && url.includes("permissions=274877975552"))) throw new Error("Discord server install URL was not generated with configured permissions.");
  if (!setupUrls.includes("https://t.me/BotFather") || !setupUrls.includes("https://t.me/scheduled_telegram_bot")) throw new Error("Telegram setup URLs were not generated.");

  await stop(app); app = null;
  app = await launch();
  page = await ready(app, 720, 820);
  await openSavedBot(page);
  const persisted = await page.evaluate(async () => (await window.hushnote.bots.list({ includeArchived: true }))[0]);
  if (!persisted?.runtime || persisted.jobs[0].name !== "Five minute digest") throw new Error("Bot definition or runtime did not survive restart.");

  await fs.writeFile(path.join(projectRoot, "status.json"), JSON.stringify(statusPayload(persisted, persisted.jobs[0], "failed", "Process reachable; latest job failed.")));
  await page.getByRole("button", { name: "Check Now", exact: true }).click();
  await page.getByText(/Check succeeded in \d+ ms\./).waitFor();
  await page.locator(".bot-state.state-degraded").waitFor();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await page.getByText("Fixture job failed without exposing secrets.", { exact: false }).first().waitFor();
  await page.screenshot({ path: path.join(screenshots, "bots-electron-narrow-failed.png"), fullPage: true });

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  page.once("dialog", (dialogEvent) => dialogEvent.accept());
  await page.getByRole("button", { name: "Archive Bot", exact: true }).click();
  await page.getByRole("button", { name: "Restore Bot", exact: true }).waitFor();
  page.once("dialog", (dialogEvent) => dialogEvent.accept());
  await page.getByRole("button", { name: "Restore Bot", exact: true }).click();
  await page.getByRole("button", { name: "Archive Bot", exact: true }).waitFor();
  await page.getByRole("button", { name: "← Bots", exact: true }).click();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.getByText(/Checked 1: 1 succeeded, 0 failed\./).waitFor();
  await page.evaluate(async (createdAt) => window.hushnote.bots.create({
    name: "Overdue Telegram Fixture",
    description: "Proves missed schedules stay visible without fake runtime health.",
    platforms: ["telegram"],
    executionMode: "scheduled",
    environment: "test",
    tags: ["overdue", "visual-check"],
    monitoring: { adapter: "manual", monitoringEnabled: true, intervalSeconds: 60, timeoutMilliseconds: 5000, staleAfterSeconds: 180, failuresBeforeOffline: 3 },
    connections: [{ platform: "telegram", username: "overdue_fixture_bot", credentialState: "not_configured" }],
    jobs: [{ id: "overdue-job", name: "Missed minute job", scheduleType: "cron", cronExpression: "* * * * *", timezone: "America/Edmonton", enabled: true, schedulerSource: "External automation", gracePeriodSeconds: 0, expectedDurationSeconds: 60, createdAt }],
    commands: [],
    skillIds: [],
  }), new Date(Date.now() - 7_200_000).toISOString());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Notebook", { exact: true }).waitFor();
  await page.getByRole("button", { name: /^Bots/ }).click();
  const overdueRow = page.locator(".bot-list-row").filter({ hasText: "Overdue Telegram Fixture" });
  await overdueRow.locator(".state-overdue").waitFor();
  await page.screenshot({ path: path.join(screenshots, "bots-electron-overdue.png"), fullPage: true });
  const instant = await page.evaluate(async () => {
    const created = await window.hushnote.bots.createInstant({ name: "Instant Notebook Agent", description: "Uses trusted local context.", icon: { type: "symbol", value: "⚡", color: "blue" }, permissions: ["read_notes", "skills"] });
    const first = await window.hushnote.bots.link(created.bot.id);
    const reset = await window.hushnote.bots.resetLink(created.bot.id);
    return { created, first, reset, listed: await window.hushnote.bots.get(created.bot.id) };
  });
  if (instant.created.bot.platforms[0] !== "notebook" || instant.listed.permissions.join(",") !== "read_notes,skills") throw new Error("Instant Notebook bot identity or permissions were not persisted.");
  if (!/^notebook:\/\/bot\//.test(instant.first.url) || instant.first.url === instant.reset.url) throw new Error("Private bot link was not created and rotated through real IPC.");
  if (JSON.stringify(instant.listed).includes(instant.reset.url.split("key=")[1])) throw new Error("Private bot link token leaked into the bot record.");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".wordmark").getByText("Notebook", { exact: true }).waitFor();
  await page.getByRole("button", { name: /^Bots/ }).click();
  await page.locator(".bot-list-row").filter({ hasText: "Instant Notebook Agent" }).click();
  await page.getByRole("heading", { name: "Instant Notebook Agent", exact: true }).waitFor();
  await page.locator(".bot-tabs").getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByText("Private bot link", { exact: true }).first().waitFor();
  await page.screenshot({ path: path.join(screenshots, "bots-electron-instant-settings.png"), fullPage: true });
  console.log("Real Electron bots, instant Notebook creation, private link rotation, platform setup URLs, relationships, Markdown, monitoring, restart, archive/restore, and refresh passed.");
} finally {
  if (app) await stop(app);
  await fs.rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
