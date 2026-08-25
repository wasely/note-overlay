const assert = require("node:assert/strict");
const { createBotProvisioning, secretReference } = require("../src/main/bot-provisioning.cjs");

const savedSecrets = new Map();
let settings = {};
const opened = [];
const requests = [];
const discordToken = "discord-test-token-value-123456789";
const managerToken = "123456:telegram-manager-token-value";
const managedToken = "987654:telegram-managed-token-value";

function response(payload) {
  return { ok: true, text: async () => JSON.stringify(payload) };
}

async function fetchImpl(url, options = {}) {
  requests.push({ url: String(url), options });
  if (url === "https://discord.com/api/v10/users/@me") return response({ id: "1234567890", username: "notebook_bot" });
  if (String(url).includes(`/bot${managerToken}/getMe`)) return response({ ok: true, result: { id: 10, username: "NotebookManagerBot", first_name: "Notebook Manager", can_manage_bots: true } });
  if (String(url).includes(`/bot${managerToken}/getUpdates`)) return response({ ok: true, result: [{ update_id: 41, managed_bot: { bot: { id: 22, username: "DailyBriefBot", first_name: "Daily Brief" } } }] });
  if (String(url).includes(`/bot${managerToken}/getManagedBotToken`)) return response({ ok: true, result: managedToken });
  throw new Error(`Unexpected request: ${url}`);
}

const provisioning = createBotProvisioning({
  env: {},
  fetchImpl,
  openExternal: async (url) => opened.push(url),
  getSetting: (_key, fallback) => settings || fallback,
  setSetting: (_key, value) => { settings = value; },
  secrets: {
    set: (reference, value) => savedSecrets.set(reference, value),
    get: (reference) => savedSecrets.get(reference),
  },
});

(async () => {
  let status = await provisioning.status();
  assert.equal(status.discord.ready, false);
  assert.equal(status.telegram.ready, false);

  status = await provisioning.configure({ platform: "discord", applicationId: "1234567890", token: discordToken });
  assert.equal(status.discord.ready, true);
  assert.equal(savedSecrets.get("NOTEBOOK_DISCORD_CONTROLLER_TOKEN"), discordToken);
  const discord = await provisioning.begin({ platform: "discord", name: "Daily Brief", permissions: "2048" });
  assert.match(discord.url, /client_id=1234567890/);
  assert.match(discord.url, /permissions=2048/);
  assert.equal(discord.secretRef, "NOTEBOOK_DISCORD_CONTROLLER_TOKEN");

  status = await provisioning.configure({ platform: "telegram", token: managerToken });
  assert.equal(status.telegram.ready, true);
  const telegram = await provisioning.begin({ platform: "telegram", name: "Daily Brief", username: "DailyBriefBot" });
  assert.match(telegram.url, /t\.me\/newbot\/NotebookManagerBot\/DailyBriefBot/);
  const completed = await provisioning.completeTelegram({ username: "DailyBriefBot" });
  assert.equal(completed.state, "ready");
  assert.equal(completed.secretRef, secretReference("DailyBriefBot"));
  assert.equal(savedSecrets.get(completed.secretRef), managedToken);
  assert.equal(settings.telegramUpdateOffset, 42);

  const publicResults = JSON.stringify({ status, discord, telegram, completed, opened });
  assert.equal(publicResults.includes(discordToken), false);
  assert.equal(publicResults.includes(managerToken), false);
  assert.equal(publicResults.includes(managedToken), false);
  assert.equal(requests.find((item) => item.url.includes("discord.com"))?.options?.headers?.Authorization, `Bot ${discordToken}`);
  console.log("Bot provisioning secure configuration, install links, and Telegram managed-token capture passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
