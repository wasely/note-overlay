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
    args: packagedExecutable ? [`--user-data-dir=${userData}`] : [".", `--user-data-dir=${userData}`],
    env: { ...process.env, NOTEBOOK_DISABLE_STARTUP_REGISTRATION: "1", TELEGRAM_E2E_BOT_TOKEN: secretValue, DISCORD_E2E_BOT_TOKEN: secretValue },
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
  await page.getByText("Notebook", { exact: true }).waitFor();
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
  await page.getByRole("button", { name: "Bots", exact: true }).click();
  const heading = page.getByRole("heading", { name: "Scheduled Multi Platform Ops", exact: true });
  if (!(await heading.isVisible().catch(() => false))) await page.locator(".bot-sidebar-list button").filter({ hasText: "Scheduled Multi Platform Ops" }).first().click();
  await heading.waitFor();
}

let app;
try {
  app = await launch();
  let page = await ready(app);
  const related = await page.evaluate(async () => {
    const mcp = await window.hushnote.mcpServers.create({ name: "Calendar Test MCP", description: "Fixture dependency", transport: "stdio", command: "calendar-test" });
    const skill = await window.hushnote.skills.create({ name: "Bot Operations Test Skill", category: "Automation", body: "Fixture skill." });
    return { mcp, skill };
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Notebook", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Bots", exact: true }).click();
  await page.getByRole("heading", { name: "Bots", exact: true }).waitFor();
  await page.getByRole("button", { name: "Add bot", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add bot" });
  await page.getByLabel("Bot name").fill("Scheduled Multi Platform Ops");
  await page.getByLabel("Bot description").fill("Real Electron persistence and monitoring fixture.");
  await page.getByLabel("Execution mode").selectOption("scheduled");
  await page.getByLabel("Bot environment").fill("production");
  await dialog.getByRole("checkbox", { name: "Telegram", exact: true }).check();
  await page.getByLabel("discord username").fill("scheduled_discord_bot");
  await page.getByLabel("discord external bot ID").fill("123456789012345678");
  await page.getByLabel("discord credential secret reference").fill("DISCORD_E2E_BOT_TOKEN");
  await page.getByLabel("Discord install permissions").fill("274877975552");
  await page.getByLabel("telegram username").fill("scheduled_telegram_bot");
  await page.getByLabel("telegram credential secret reference").fill("TELEGRAM_E2E_BOT_TOKEN");
  await page.getByLabel("Local project folder").fill(projectRoot);
  await page.getByLabel("Runtime language").fill("Node.js 24");
  await page.getByLabel("Monitoring adapter").selectOption("local-status");
  await page.getByLabel("Status file path").fill("status.json");
  await dialog.getByRole("button", { name: "Add job", exact: true }).click();
  await page.getByLabel("Job name").fill("Five minute digest");
  await page.getByLabel("Cron expression for Five minute digest").fill("*/5 * * * *");
  await page.getByLabel("Timezone for Five minute digest").fill("America/Edmonton");
  await dialog.getByRole("checkbox", { name: "Calendar Test MCP", exact: true }).check();
  await dialog.getByRole("checkbox", { name: "Bot Operations Test Skill", exact: true }).check();
  await dialog.getByRole("button", { name: "Add bot", exact: true }).click();
  await page.getByRole("heading", { name: "Scheduled Multi Platform Ops", exact: true }).waitFor();

  const bot = await page.evaluate(async () => (await window.hushnote.bots.list({ includeArchived: true }))[0]);
  if (!bot || bot.runtimeLanguage !== "Node.js 24") throw new Error(`Bot definition was not persisted safely: ${JSON.stringify(bot)}`);
  if (!bot.mcpServerIds.includes(related.mcp.id) || !bot.skillIds.includes(related.skill.id)) throw new Error("Bot relationships were not persisted.");
  await page.getByLabel("Search everything").fill("Bot Operations Test Skill");
  await page.locator(".global-results section").filter({ has: page.getByText("Bots", { exact: true }) }).getByRole("button", { name: /Scheduled Multi Platform Ops/ }).waitFor();
  await page.getByLabel("Search everything").fill("Common failure modes");
  await page.locator(".global-results section").filter({ has: page.getByText("Bots", { exact: true }) }).getByRole("button", { name: /Scheduled Multi Platform Ops/ }).waitFor();
  await page.getByLabel("Search everything").fill("");
  const serialized = await page.evaluate(async () => JSON.stringify(await window.hushnote.bots.list({ includeArchived: true })));
  if (serialized.includes(secretValue)) throw new Error("A resolved secret reached the renderer.");
  const invalidRejected = await page.evaluate(async () => { try { await window.hushnote.bots.create({ name: "invalid" }); return false; } catch { return true; } });
  if (!invalidRejected) throw new Error("Invalid bot IPC payload was accepted.");

  await fs.writeFile(path.join(projectRoot, "status.json"), JSON.stringify(statusPayload(bot, bot.jobs[0], "success", "Connected and waiting for scheduled work.")));
  await page.getByRole("button", { name: "Check now", exact: true }).click();
  await page.getByText(/Check succeeded in \d+ ms\./).waitFor();
  await page.locator(".bot-state.state-on_schedule").waitFor();
  await page.screenshot({ path: path.join(screenshots, "bots-electron-healthy.png"), fullPage: true });

  await page.getByRole("button", { name: "Documentation", exact: true }).click();
  await page.getByRole("button", { name: "Open note", exact: true }).click();
  await page.getByLabel("Note title").waitFor();
  if (!(await page.getByLabel("Note content").inputValue()).includes("# What this bot does")) throw new Error("Bot Markdown runbook did not open in the existing editor.");
  await openSavedBot(page);
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page.getByRole("button", { name: "Calendar Test MCP", exact: true }).click();
  await page.getByRole("heading", { name: "MCP Servers", exact: true }).waitFor();
  await page.getByRole("button", { name: "Scheduled Multi Platform Ops", exact: true }).waitFor();
  await openSavedBot(page);
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page.getByRole("button", { name: "Bot Operations Test Skill", exact: true }).click();
  await page.getByText("Used by bots", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Scheduled Multi Platform Ops", exact: true }).waitFor();

  await openSavedBot(page);
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await app.evaluate(({ shell }) => {
    globalThis.__botSetupUrls = [];
    shell.openExternal = async (url) => { globalThis.__botSetupUrls.push(url); };
  });
  await page.getByRole("button", { name: "Open setup", exact: true }).first().click();
  await page.getByRole("button", { name: "Install to server", exact: true }).click();
  await page.getByRole("button", { name: "Open setup", exact: true }).last().click();
  await page.getByRole("button", { name: "Open bot", exact: true }).click();
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
  await page.getByRole("button", { name: "Check now", exact: true }).click();
  await page.getByText(/Check succeeded in \d+ ms\./).waitFor();
  await page.locator(".bot-state.state-degraded").waitFor();
  await page.getByRole("button", { name: "Jobs", exact: true }).click();
  await page.locator(".job-error").filter({ hasText: "Fixture job failed without exposing secrets." }).waitFor();
  await page.screenshot({ path: path.join(screenshots, "bots-electron-narrow-failed.png"), fullPage: true });

  await page.getByRole("button", { name: "Overview", exact: true }).click();
  page.once("dialog", (dialogEvent) => dialogEvent.accept());
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).waitFor();
  page.once("dialog", (dialogEvent) => dialogEvent.accept());
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByRole("button", { name: "Archive", exact: true }).waitFor();
  await page.getByRole("button", { name: "← Registry", exact: true }).click();
  await page.getByRole("button", { name: "Refresh all", exact: true }).click();
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
    mcpServerIds: [],
    skillIds: [],
  }), new Date(Date.now() - 7_200_000).toISOString());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Notebook", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Bots", exact: true }).click();
  const overdueRow = page.locator(".bot-table-row").filter({ hasText: "Overdue Telegram Fixture" });
  await overdueRow.locator(".state-overdue").waitFor();
  await page.screenshot({ path: path.join(screenshots, "bots-electron-overdue.png"), fullPage: true });
  console.log("Real Electron bot create, both-platform setup URLs, relationships, Markdown, local monitoring, restart persistence, failed run, archive/restore, and refresh passed.");
} finally {
  if (app) await stop(app);
  await fs.rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
