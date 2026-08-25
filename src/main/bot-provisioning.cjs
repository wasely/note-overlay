const USERNAME = /^[A-Za-z0-9_]{5,32}$/;
const DISCORD_ID = /^\d{5,30}$/;
const PERMISSIONS = /^\d{1,24}$/;

function safeName(value) {
  return String(value || "").trim().slice(0, 64);
}

function secretReference(username) {
  const key = String(username || "BOT").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 80) || "BOT";
  return `NOTEBOOK_TELEGRAM_${key}_TOKEN`;
}

async function readJson(fetchImpl, url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal, redirect: "error" });
    const text = await response.text();
    if (text.length > 1_000_000) throw new Error("Platform response was too large.");
    let payload;
    try { payload = JSON.parse(text); } catch { throw new Error("Platform returned malformed data."); }
    if (!response.ok || payload?.ok === false) throw new Error("Platform request failed.");
    return payload;
  } finally { clearTimeout(timer); }
}

function createBotProvisioning({ env = process.env, fetchImpl = fetch, openExternal, getSetting = () => ({}), setSetting = () => {}, secrets }) {
  let telegramIdentity = null;
  let discordIdentity = null;
  function storedSecret(reference) {
    try { return String(secrets?.get(reference) || "").trim(); } catch { return ""; }
  }
  const configuration = () => getSetting("botProvisioning", {}) || {};
  const managerToken = () => storedSecret("NOTEBOOK_TELEGRAM_MANAGER_BOT_TOKEN") || String(env.NOTEBOOK_TELEGRAM_MANAGER_BOT_TOKEN || "").trim();
  const controllerToken = () => storedSecret("NOTEBOOK_DISCORD_CONTROLLER_TOKEN") || String(env.NOTEBOOK_DISCORD_CONTROLLER_TOKEN || "").trim();

  async function telegramManager() {
    if (telegramIdentity) return telegramIdentity;
    const token = managerToken();
    if (!token) return null;
    const payload = await readJson(fetchImpl, `https://api.telegram.org/bot${token}/getMe`);
    const result = payload?.result;
    if (!result || !USERNAME.test(result.username || "")) throw new Error("Telegram manager identity is invalid.");
    telegramIdentity = { id: String(result.id), username: result.username, displayName: result.first_name || result.username, canManageBots: result.can_manage_bots === true };
    return telegramIdentity;
  }

  async function discordController() {
    if (discordIdentity) return discordIdentity;
    const configuredId = String(configuration().discordApplicationId || env.NOTEBOOK_DISCORD_CONTROLLER_ID || "").trim();
    const token = controllerToken();
    if (DISCORD_ID.test(configuredId)) {
      discordIdentity = { id: configuredId, displayName: "Notebook Controller" };
      return discordIdentity;
    }
    if (!token) return null;
    const payload = await readJson(fetchImpl, "https://discord.com/api/v10/users/@me", { headers: { Authorization: `Bot ${token}` } });
    if (!DISCORD_ID.test(payload?.id || "")) throw new Error("Discord controller identity is invalid.");
    discordIdentity = { id: payload.id, displayName: payload.global_name || payload.username || "Notebook Controller" };
    return discordIdentity;
  }

  async function configure(input) {
    const platform = input?.platform;
    if (platform === "discord") {
      const applicationId = String(input.applicationId || "").trim();
      const token = String(input.token || "").trim();
      if (!DISCORD_ID.test(applicationId)) throw new Error("Enter the Discord application ID.");
      if (token.length < 20) throw new Error("Enter the Discord bot token.");
      const payload = await readJson(fetchImpl, "https://discord.com/api/v10/users/@me", { headers: { Authorization: `Bot ${token}` } });
      if (!DISCORD_ID.test(payload?.id || "")) throw new Error("Discord did not return a bot identity.");
      if (payload.id !== applicationId) throw new Error("The application ID and bot token belong to different Discord apps.");
      await secrets.set("NOTEBOOK_DISCORD_CONTROLLER_TOKEN", token);
      setSetting("botProvisioning", { ...configuration(), discordApplicationId: applicationId });
      discordIdentity = { id: applicationId, displayName: payload.global_name || payload.username || "Notebook Bot" };
      return status();
    }
    if (platform === "telegram") {
      const token = String(input.token || "").trim();
      if (token.length < 20) throw new Error("Enter the Telegram manager token.");
      const payload = await readJson(fetchImpl, `https://api.telegram.org/bot${token}/getMe`);
      const result = payload?.result;
      if (!result || !USERNAME.test(result.username || "")) throw new Error("Telegram did not return a manager identity.");
      await secrets.set("NOTEBOOK_TELEGRAM_MANAGER_BOT_TOKEN", token);
      telegramIdentity = { id: String(result.id), username: result.username, displayName: result.first_name || result.username, canManageBots: result.can_manage_bots === true };
      return status();
    }
    throw new Error("Choose Discord or Telegram.");
  }

  async function status() {
    const output = {
      discord: { ready: false, applicationId: "", displayName: "Notebook Controller", reason: "Controller is not configured." },
      telegram: { ready: false, managerUsername: "", displayName: "", reason: "Manager bot is not configured." },
    };
    try {
      const identity = await discordController();
      if (identity) output.discord = { ready: Boolean(controllerToken()), applicationId: identity.id, displayName: identity.displayName, reason: controllerToken() ? "Ready to install and run workflows." : "Controller token is missing; installation works but runtime cannot start." };
    } catch (error) { output.discord.reason = error.message; }
    try {
      const manager = await telegramManager();
      if (manager) output.telegram = { ready: manager.canManageBots, managerUsername: manager.username, displayName: manager.displayName, reason: manager.canManageBots ? "Ready to create managed bots." : "Enable Bot Management Mode for this manager in BotFather." };
    } catch (error) { output.telegram.reason = error.message; }
    return output;
  }

  async function begin(input) {
    const platform = input?.platform;
    const name = safeName(input?.name);
    if (!name) throw new Error("Bot name is required.");
    if (platform === "discord") {
      const identity = await discordController();
      if (!identity) throw new Error("Configure the Notebook Discord controller once before creating workflows.");
      const permissions = String(input.permissions || "0");
      if (!PERMISSIONS.test(permissions)) throw new Error("Discord permissions are invalid.");
      const url = new URL("https://discord.com/oauth2/authorize");
      url.searchParams.set("client_id", identity.id);
      url.searchParams.set("scope", "bot applications.commands");
      url.searchParams.set("permissions", permissions);
      if (input.guildId) {
        if (!DISCORD_ID.test(String(input.guildId))) throw new Error("Discord server ID is invalid.");
        url.searchParams.set("guild_id", String(input.guildId));
        url.searchParams.set("disable_guild_select", "true");
      }
      const value = url.toString();
      await openExternal(value);
      return { platform, state: "awaiting_confirmation", url: value, applicationId: identity.id, secretRef: "NOTEBOOK_DISCORD_CONTROLLER_TOKEN" };
    }
    if (platform === "telegram") {
      const manager = await telegramManager();
      const username = String(input.username || "").replace(/^@/, "");
      if (!manager?.canManageBots) throw new Error("Telegram Bot Management Mode is not ready.");
      if (!USERNAME.test(username) || !/bot$/i.test(username)) throw new Error("Telegram username must be 5–32 characters and end in bot.");
      const url = new URL(`https://t.me/newbot/${manager.username}/${username}`);
      url.searchParams.set("name", name);
      const value = url.toString();
      await openExternal(value);
      return { platform, state: "awaiting_confirmation", url: value, username, managerUsername: manager.username };
    }
    throw new Error("Choose Discord or Telegram.");
  }

  async function completeTelegram(input) {
    const username = String(input?.username || "").replace(/^@/, "");
    if (!USERNAME.test(username)) throw new Error("Telegram username is invalid.");
    const token = managerToken();
    if (!token) throw new Error("Telegram manager is not configured.");
    const current = getSetting("botProvisioning", {}) || {};
    const offset = Number.isInteger(current.telegramUpdateOffset) ? current.telegramUpdateOffset : 0;
    const updates = await readJson(fetchImpl, `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&limit=100&timeout=0&allowed_updates=%5B%22managed_bot%22%5D`);
    const rows = Array.isArray(updates?.result) ? updates.result : [];
    if (rows.length) setSetting("botProvisioning", { ...current, telegramUpdateOffset: Math.max(...rows.map((row) => Number(row.update_id) || 0)) + 1 });
    const match = rows.map((row) => row?.managed_bot).find((event) => String(event?.bot?.username || "").toLowerCase() === username.toLowerCase());
    if (!match?.bot?.id) return { platform: "telegram", state: "awaiting_confirmation", username };
    const exported = await readJson(fetchImpl, `https://api.telegram.org/bot${token}/getManagedBotToken`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user_id: match.bot.id }) });
    if (typeof exported?.result !== "string" || exported.result.length < 20) throw new Error("Telegram did not return a usable managed-bot token.");
    const secretRef = secretReference(match.bot.username);
    await secrets.set(secretRef, exported.result);
    return { platform: "telegram", state: "ready", externalBotId: String(match.bot.id), username: match.bot.username, displayName: match.bot.first_name || match.bot.username, secretRef };
  }

  return { status, configure, begin, completeTelegram };
}

module.exports = { createBotProvisioning, secretReference };
