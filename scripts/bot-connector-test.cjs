const assert = require("node:assert/strict");
const { createBotConnector, safeBaseUrl, DEVICE_SECRET } = require("../src/main/bot-connector.cjs");

assert.equal(safeBaseUrl("https://connector.example/"), "https://connector.example");
assert.equal(safeBaseUrl("http://127.0.0.1:8787"), "http://127.0.0.1:8787");
assert.throws(() => safeBaseUrl("http://connector.example"), /HTTPS/);

const stored = new Map();
const opened = [];
const responses = [];
function response(status, payload) { return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) }; }
async function fetchImpl(url, options = {}) {
  responses.push({ url: String(url), options });
  if (String(url).endsWith("/v1/status")) return response(200, { ok: true, discord: { ready: true, applicationId: "123456789" }, telegram: { ready: true, managerUsername: "NotebookManagerBot" } });
  if (String(url).endsWith("/v1/discord/pairings")) return response(201, { id: "pair-1", claimSecret: "claim-secret", authorizeUrl: "https://discord.com/oauth2/authorize?client_id=123", expiresAt: new Date(Date.now() + 60000).toISOString() });
  if (String(url).includes("/v1/discord/pairings/pair-1")) return response(200, { status: "ready", deviceToken: "discord-device-token", userId: "42", installUrl: "https://discord.com/oauth2/authorize?client_id=123" });
  if (String(url).endsWith("/v1/discord/agents")) return response(201, { agent: { id: "agent-1", name: "Daily Brief" }, installUrl: "https://discord.com/oauth2/authorize?client_id=123" });
  if (String(url).endsWith("/v1/telegram/claims")) return response(201, { id: "claim-1", claimSecret: "telegram-claim", username: "DailyBriefBot" });
  if (String(url).includes("/v1/telegram/claims/claim-1")) return response(200, { status: "ready", deviceToken: "telegram-device-token", managedBotToken: "123456:managed-token-value", agent: { id: "agent-2" }, telegram: { botId: "123456", userId: "77", username: "DailyBriefBot", displayName: "Daily Brief", url: "https://t.me/DailyBriefBot" } });
  throw new Error(`Unexpected request: ${url}`);
}
const connector = createBotConnector({ env: { NOTEBOOK_BOT_CONNECTOR_URL: "https://connector.example" }, fetchImpl, openExternal: async (url) => opened.push(url), secrets: { get: (key) => stored.get(key), set: (key, value) => stored.set(key, value) } });

(async () => {
  let status = await connector.status();
  assert.equal(status.discord.connected, false);
  const pairing = await connector.startDiscordConnection();
  assert.equal(opened[0].startsWith("https://discord.com/"), true);
  assert.equal((await connector.pollDiscordConnection(pairing)).status, "ready");
  assert.equal(stored.get(DEVICE_SECRET.discord), "discord-device-token");
  const discordPoll = responses.find((item) => item.url.includes("/v1/discord/pairings/pair-1"));
  assert.equal(discordPoll.url.includes("claim-secret"), false);
  assert.equal(discordPoll.options.headers["x-notebook-claim"], "claim-secret");
  const discord = await connector.createDiscordAgent({ localBotId: "daily-brief", name: "Daily Brief", description: "Brief", permissions: ["read_notes"], icon: {} });
  assert.match(discord.monitoring.url, /agent-1\/health$/);
  const claim = await connector.startTelegramClaim({ localBotId: "daily-brief-telegram", username: "DailyBriefBot", telegramUserId: "77", name: "Daily Brief", description: "Brief", permissions: ["read_notes"], icon: {} });
  const telegramCreate = responses.find((item) => item.url.endsWith("/v1/telegram/claims"));
  assert.equal(JSON.parse(telegramCreate.options.body).telegramUserId, "77");
  const telegram = await connector.pollTelegramClaim(claim);
  assert.equal(telegram.status, "ready");
  assert.equal(stored.get(DEVICE_SECRET.telegram), "telegram-device-token");
  assert.equal(stored.get(telegram.tokenReference), "123456:managed-token-value");
  const telegramPoll = responses.find((item) => item.url.includes("/v1/telegram/claims/claim-1"));
  assert.equal(telegramPoll.url.includes("telegram-claim"), false);
  assert.equal(telegramPoll.options.headers["x-notebook-claim"], "telegram-claim");
  assert.equal(JSON.stringify({ status, pairing, discord, telegram, responses }).includes("managed-token-value"), false);
  assert.equal(responses.find((item) => item.url.endsWith("/v1/discord/agents")).options.headers.authorization, "Bearer discord-device-token");
  console.log("Bot Connector URL validation, Discord pairing, agent creation, and Telegram token capture passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
