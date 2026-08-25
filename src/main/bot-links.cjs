const { randomBytes, timingSafeEqual } = require("node:crypto");

const BOT_ID = /^[a-z0-9][a-z0-9-]{0,119}$/;
const TOKEN = /^[A-Za-z0-9_-]{32}$/;

function linkReference(botId) {
  if (!BOT_ID.test(String(botId || ""))) throw new Error("Bot ID is invalid.");
  return `NOTEBOOK_BOT_LINK_${String(botId).toUpperCase().replace(/-/g, "_")}`;
}

function equalToken(left, right) {
  if (!TOKEN.test(String(left || "")) || !TOKEN.test(String(right || ""))) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function createBotLinks({ getBot, secrets, recordEvent = () => {} }) {
  function requireBot(botId) {
    const id = String(botId || "");
    const bot = getBot(id);
    if (!bot) throw new Error("Bot not found.");
    return bot;
  }

  function tokenFor(botId) {
    const reference = linkReference(botId);
    const current = secrets.get(reference);
    if (TOKEN.test(String(current || ""))) return current;
    const token = randomBytes(24).toString("base64url");
    secrets.set(reference, token);
    return token;
  }

  function get(botId) {
    const bot = requireBot(botId);
    const token = tokenFor(bot.id);
    return { botId: bot.id, url: `notebook://bot/${encodeURIComponent(bot.id)}?key=${token}` };
  }

  function rotate(botId) {
    const bot = requireBot(botId);
    const token = randomBytes(24).toString("base64url");
    secrets.set(linkReference(bot.id), token);
    recordEvent({ botId: bot.id, type: "configuration_updated", summary: "Private bot link reset; the previous link no longer works.", source: "Bot Factory" });
    return { botId: bot.id, url: `notebook://bot/${encodeURIComponent(bot.id)}?key=${token}` };
  }

  function resolve(value) {
    let parsed;
    try { parsed = new URL(String(value || "")); } catch { return null; }
    if (parsed.protocol !== "notebook:" || parsed.hostname !== "bot") return null;
    const botId = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    if (!BOT_ID.test(botId) || !getBot(botId)) return null;
    const saved = secrets.get(linkReference(botId));
    return equalToken(parsed.searchParams.get("key"), saved) ? { botId } : null;
  }

  return { get, rotate, resolve };
}

module.exports = { createBotLinks, linkReference };
