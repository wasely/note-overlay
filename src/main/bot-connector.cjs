const CONNECTOR_URL = "botConnectorUrl";
const DEVICE_SECRET = {
  discord: "NOTEBOOK_BOT_CONNECTOR_DISCORD_DEVICE_TOKEN",
  telegram: "NOTEBOOK_BOT_CONNECTOR_TELEGRAM_DEVICE_TOKEN",
};

function safeBaseUrl(value) {
  const raw = String(value || "").trim().replace(/\/$/, "");
  if (!raw) return "";
  const url = new URL(raw);
  const loopback = ["127.0.0.1", "localhost"].includes(url.hostname);
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) throw new Error("Bot Connector must use HTTPS.");
  url.username = ""; url.password = ""; url.search = ""; url.hash = "";
  return url.toString().replace(/\/$/, "");
}

async function readJson(fetchImpl, url, options = {}, timeoutMilliseconds = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMilliseconds);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal, redirect: "error", headers: { accept: "application/json", ...(options.headers || {}) } });
    const text = await response.text();
    if (text.length > 1_000_000) throw new Error("Bot Connector returned too much data.");
    let payload;
    try { payload = JSON.parse(text); } catch { throw new Error("Bot Connector returned malformed data."); }
    return { response, payload };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Bot Connector timed out.");
    throw error;
  } finally { clearTimeout(timer); }
}

function createBotConnector({ env = process.env, fetchImpl = fetch, openExternal, getSetting = () => undefined, setSetting = () => {}, secrets }) {
  const configuredUrl = () => safeBaseUrl(env.NOTEBOOK_BOT_CONNECTOR_URL || getSetting(CONNECTOR_URL, ""));
  function deviceToken(platform) { try { return String(secrets.get(DEVICE_SECRET[platform]) || ""); } catch { return ""; } }
  function requireUrl() { const value = configuredUrl(); if (!value) throw new Error("Notebook Bot Connector is not configured for this build."); return value; }
  async function request(pathname, { method = "GET", body, platform, token, timeoutMilliseconds } = {}) {
    const baseUrl = requireUrl();
    const headers = { "content-type": "application/json" };
    const credential = token || (platform ? deviceToken(platform) : "");
    if (credential) headers.authorization = `Bearer ${credential}`;
    const { response, payload } = await readJson(fetchImpl, `${baseUrl}${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, timeoutMilliseconds);
    if (!response.ok) throw new Error(String(payload?.error || `Bot Connector returned HTTP ${response.status}.`).slice(0, 500));
    return payload;
  }

  async function setUrl(value) {
    const url = safeBaseUrl(value);
    setSetting(CONNECTOR_URL, url);
    return status();
  }

  async function status() {
    const baseUrl = configuredUrl();
    if (!baseUrl) return { configured: false, baseUrl: "", reason: "Connector URL is not configured.", discord: { ready: false, connected: false }, telegram: { ready: false, connected: false } };
    try {
      const remote = await request("/v1/status");
      return { configured: true, baseUrl, reason: "", discord: { ...(remote.discord || {}), connected: Boolean(deviceToken("discord")) }, telegram: { ...(remote.telegram || {}), connected: Boolean(deviceToken("telegram")) } };
    } catch (error) {
      return { configured: true, baseUrl, reason: error.message, discord: { ready: false, connected: Boolean(deviceToken("discord")) }, telegram: { ready: false, connected: Boolean(deviceToken("telegram")) } };
    }
  }

  async function startDiscordConnection() {
    const pairing = await request("/v1/discord/pairings", { method: "POST", body: {} });
    const authorize = new URL(pairing.authorizeUrl);
    if (authorize.protocol !== "https:" || authorize.hostname !== "discord.com") throw new Error("Connector returned an unsafe Discord authorization URL.");
    await openExternal(authorize.toString());
    return { id: pairing.id, claimSecret: pairing.claimSecret, expiresAt: pairing.expiresAt };
  }

  async function pollDiscordConnection(pairing) {
    const baseUrl = requireUrl();
    const { response, payload } = await readJson(fetchImpl, `${baseUrl}/v1/discord/pairings/${encodeURIComponent(String(pairing?.id || ""))}`, { headers: { accept: "application/json", "x-notebook-claim": String(pairing?.claimSecret || "") } });
    if (response.status === 202) return { status: "pending" };
    if (!response.ok) throw new Error(String(payload?.error || "Discord connection failed.").slice(0, 500));
    if (payload.status === "ready" && payload.deviceToken) await secrets.set(DEVICE_SECRET.discord, payload.deviceToken);
    return { status: payload.status, userId: payload.userId || "", installUrl: payload.installUrl || "" };
  }

  async function createDiscordAgent(input) {
    if (!deviceToken("discord")) throw new Error("Connect Discord once before creating agents.");
    const payload = await request("/v1/discord/agents", { method: "POST", platform: "discord", body: input });
    return { ...payload, monitoring: { url: `${requireUrl()}/v1/agents/${encodeURIComponent(payload.agent.id)}/health`, secretRef: DEVICE_SECRET.discord } };
  }

  async function startTelegramClaim(input) {
    return request("/v1/telegram/claims", { method: "POST", platform: deviceToken("telegram") ? "telegram" : undefined, body: input });
  }

  async function pollTelegramClaim(claim) {
    const baseUrl = requireUrl();
    const { response, payload } = await readJson(fetchImpl, `${baseUrl}/v1/telegram/claims/${encodeURIComponent(String(claim?.id || ""))}`, { headers: { accept: "application/json", "x-notebook-claim": String(claim?.claimSecret || "") } }, 20_000);
    if (response.status === 202) return { status: "pending" };
    if (!response.ok) throw new Error(String(payload?.error || "Telegram bot creation failed.").slice(0, 500));
    if (payload.status !== "ready" || !payload.deviceToken || !payload.managedBotToken || !payload.telegram?.username) throw new Error("Connector returned an incomplete Telegram bot.");
    const tokenReference = `NOTEBOOK_TELEGRAM_${payload.telegram.username.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 80)}_TOKEN`;
    await secrets.set(DEVICE_SECRET.telegram, payload.deviceToken);
    await secrets.set(tokenReference, payload.managedBotToken);
    return { status: "ready", agent: payload.agent, telegram: payload.telegram, tokenReference, monitoring: { url: `${baseUrl}/v1/agents/${encodeURIComponent(payload.agent.id)}/health`, secretRef: DEVICE_SECRET.telegram } };
  }

  async function waitForTelegramClaim(claim, { attempts = 20, delayMilliseconds = 750 } = {}) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const result = await pollTelegramClaim(claim);
      if (result.status === "ready") return result;
      await new Promise((resolve) => setTimeout(resolve, delayMilliseconds));
    }
    throw new Error("Telegram created the bot, but the manager has not delivered its token yet. Try again shortly.");
  }

  return { status, setUrl, startDiscordConnection, pollDiscordConnection, createDiscordAgent, startTelegramClaim, pollTelegramClaim, waitForTelegramClaim, deviceSecretReference: (platform) => DEVICE_SECRET[platform] };
}

module.exports = { createBotConnector, safeBaseUrl, DEVICE_SECRET };
