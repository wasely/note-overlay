const DISCORD_API = "https://discord.com/api/v10";
const USERNAME = /^[A-Za-z0-9_]{5,32}$/;
const LOCAL_BOT_ID = /^[a-z0-9][a-z0-9-]{0,119}$/;
const PERMISSIONS = new Set(["read_notes", "write_notes", "projects", "skills"]);
const PAIR_TTL_MS = 10 * 60 * 1000;

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}

function cleanText(value, maximum, required = false) {
  const result = String(value || "").trim().slice(0, maximum);
  if (required && !result) throw new Error("A required field is missing.");
  return result;
}

function bytesToHex(bytes) { return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join(""); }
function hexToBytes(value) {
  if (!/^[a-f0-9]+$/i.test(value) || value.length % 2) throw new Error("Invalid hexadecimal value.");
  return Uint8Array.from(value.match(/.{2}/g).map((byte) => Number.parseInt(byte, 16)));
}
function randomToken(size = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
async function digest(value) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)))));
}
async function derivedDeviceToken(env, deviceId) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.DEVICE_SIGNING_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`notebook-device:${deviceId}`)));
  return `nbc_${btoa(String.fromCharCode(...signature)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`;
}
function bearer(request) {
  const match = request.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] || "";
}
async function sameSecret(left, right) {
  if (!left || !right) return false;
  return (await digest(left)) === (await digest(right));
}
async function matchesHash(value, expectedHash) {
  return Boolean(value && expectedHash) && (await digest(value)) === expectedHash;
}

export function discordInstallUrl(applicationId, baseUrl) {
  if (!/^\d{5,30}$/.test(String(applicationId || ""))) return "";
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", String(applicationId));
  url.searchParams.set("scope", "applications.commands");
  url.searchParams.set("integration_type", "1");
  if (baseUrl) url.searchParams.set("redirect_uri", `${String(baseUrl).replace(/\/$/, "")}/v1/discord/oauth/callback`);
  return url.toString();
}
export function discordGuildInstallUrl(applicationId, permissions = "0") {
  if (!/^\d{5,30}$/.test(String(applicationId || ""))) return "";
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", String(applicationId));
  url.searchParams.set("scope", "applications.commands bot");
  url.searchParams.set("integration_type", "0");
  url.searchParams.set("permissions", /^\d{1,24}$/.test(String(permissions)) ? String(permissions) : "0");
  return url.toString();
}

export function commandDefinitions() {
  return [
    { name: "agents", description: "List your Notebook agents.", integration_types: [0, 1], contexts: [0, 1, 2] },
    { name: "agent", description: "Use a named Notebook agent.", integration_types: [0, 1], contexts: [0, 1, 2], options: [
      { type: 3, name: "name", description: "Agent name", required: true, autocomplete: true },
      { type: 3, name: "prompt", description: "What you want the agent to do", required: true, max_length: 1800 },
    ] },
  ];
}

export function sanitizeAgentInput(value) {
  const input = value && typeof value === "object" ? value : {};
  const localBotId = cleanText(input.localBotId, 120, true);
  const name = cleanText(input.name, 120, true);
  const description = cleanText(input.description, 2000, true);
  if (!LOCAL_BOT_ID.test(localBotId)) throw new Error("Local bot ID is invalid.");
  const permissions = [...new Set(Array.isArray(input.permissions) ? input.permissions : [])];
  if (!permissions.length || permissions.some((permission) => !PERMISSIONS.has(permission))) throw new Error("Bot permissions are invalid.");
  const icon = input.icon && typeof input.icon === "object" ? input.icon : {};
  return { localBotId, name, description, permissions, icon };
}

export function telegramClaimOwner(value, device) {
  const requested = cleanText(value?.telegramUserId, 30, true);
  if (!/^\d{1,30}$/.test(requested)) throw new Error("Telegram user ID is invalid.");
  if (device?.external_user_id && String(device.external_user_id) !== requested) throw new Error("Telegram account does not match this device.");
  return String(device?.external_user_id || requested);
}

export async function verifyDiscordSignature(request, publicKey) {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  if (!signature || !timestamp || !publicKey) return { ok: false, body: "" };
  const body = await request.text();
  try {
    const key = await crypto.subtle.importKey("raw", hexToBytes(publicKey), { name: "Ed25519" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("Ed25519", key, hexToBytes(signature), new TextEncoder().encode(timestamp + body));
    return { ok, body };
  } catch { return { ok: false, body }; }
}

async function requireDevice(request, env, platform) {
  const token = bearer(request);
  if (!token) throw Object.assign(new Error("Device authentication is required."), { status: 401 });
  const device = await env.DB.prepare("SELECT * FROM devices WHERE token_hash = ? AND revoked_at IS NULL").bind(await digest(token)).first();
  if (!device || (platform && device.platform !== platform)) throw Object.assign(new Error("Device authentication is invalid."), { status: 401 });
  return device;
}

function requireConnectorConfiguration(env) {
  if (!env.DEVICE_SIGNING_KEY || String(env.DEVICE_SIGNING_KEY).length < 32) throw Object.assign(new Error("Connector signing key is not configured."), { status: 503 });
}

async function createDiscordPairing(env) {
  requireConnectorConfiguration(env);
  if (!env.DISCORD_APPLICATION_ID || !env.DISCORD_CLIENT_SECRET || !env.PUBLIC_BASE_URL) throw Object.assign(new Error("Discord connector is not configured."), { status: 503 });
  const id = crypto.randomUUID();
  const claimSecret = randomToken();
  const oauthState = randomToken();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + PAIR_TTL_MS);
  await env.DB.prepare("INSERT INTO discord_pairings (id, claim_hash, oauth_state_hash, status, created_at, expires_at) VALUES (?, ?, ?, 'pending', ?, ?)")
    .bind(id, await digest(claimSecret), await digest(oauthState), createdAt.toISOString(), expiresAt.toISOString()).run();
  const callback = `${String(env.PUBLIC_BASE_URL).replace(/\/$/, "")}/v1/discord/oauth/callback`;
  const authorize = new URL("https://discord.com/oauth2/authorize");
  authorize.searchParams.set("client_id", env.DISCORD_APPLICATION_ID);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", callback);
  authorize.searchParams.set("scope", "identify applications.commands");
  authorize.searchParams.set("integration_type", "1");
  authorize.searchParams.set("state", oauthState);
  authorize.searchParams.set("prompt", "consent");
  return json({ id, claimSecret, authorizeUrl: authorize.toString(), expiresAt: expiresAt.toISOString() }, 201);
}

async function discordOAuthCallback(url, env) {
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const row = await env.DB.prepare("SELECT * FROM discord_pairings WHERE oauth_state_hash = ?").bind(await digest(state)).first();
  if (!row || row.status !== "pending" || Date.parse(row.expires_at) <= Date.now() || !code) return new Response("This Notebook connection expired. Start again in Notebook.", { status: 400 });
  try {
    const callback = `${String(env.PUBLIC_BASE_URL).replace(/\/$/, "")}/v1/discord/oauth/callback`;
    const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.DISCORD_APPLICATION_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: callback }) });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || !token.access_token) throw new Error("Discord authorization failed.");
    const userResponse = await fetch(`${DISCORD_API}/users/@me`, { headers: { authorization: `Bearer ${token.access_token}` } });
    const user = await userResponse.json();
    if (!userResponse.ok || !user.id) throw new Error("Discord identity lookup failed.");
    const deviceId = crypto.randomUUID();
    const deviceToken = await derivedDeviceToken(env, deviceId);
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO devices (id, token_hash, platform, external_user_id, created_at) VALUES (?, ?, 'discord', ?, ?)").bind(deviceId, await digest(deviceToken), String(user.id), now),
      env.DB.prepare("UPDATE discord_pairings SET status = 'ready', device_id = ?, discord_user_id = ? WHERE id = ?").bind(deviceId, String(user.id), row.id),
    ]);
    return new Response("<!doctype html><meta charset=utf-8><title>Notebook connected</title><style>body{font:16px system-ui;background:#f6f5f2;color:#222;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:32rem;padding:2rem;background:white;border:1px solid #ddd;border-radius:16px}h1{font-size:1.4rem}</style><main><h1>Discord connected</h1><p>Return to Notebook. You can now create agents instantly.</p></main>", { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch (error) {
    await env.DB.prepare("UPDATE discord_pairings SET status = 'failed', error_summary = ? WHERE id = ?").bind(cleanText(error.message, 500), row.id).run();
    return new Response("Discord connection failed. Return to Notebook and try again.", { status: 502 });
  }
}

async function pollDiscordPairing(request, env, id) {
  requireConnectorConfiguration(env);
  const row = await env.DB.prepare("SELECT * FROM discord_pairings WHERE id = ?").bind(id).first();
  if (!row || !(await matchesHash(request.headers.get("x-notebook-claim"), row.claim_hash)) || Date.parse(row.expires_at) <= Date.now()) return json({ error: "Pairing not found or expired." }, 404);
  if (row.status === "failed") return json({ status: "failed", error: row.error_summary || "Discord connection failed." }, 409);
  if (row.status !== "ready" || !row.device_id) return json({ status: "pending" }, 202);
  return json({ status: "ready", deviceToken: await derivedDeviceToken(env, row.device_id), userId: row.discord_user_id, installUrl: discordInstallUrl(env.DISCORD_APPLICATION_ID) });
}

async function createDiscordAgent(request, env) {
  const device = await requireDevice(request, env, "discord");
  const input = sanitizeAgentInput(await request.json());
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  await env.DB.prepare("INSERT INTO agents (id, device_id, local_bot_id, platform, owner_external_id, name, description, icon_json, permissions_json, created_at, updated_at) VALUES (?, ?, ?, 'discord', ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(device_id, local_bot_id, platform) DO UPDATE SET name = excluded.name, description = excluded.description, icon_json = excluded.icon_json, permissions_json = excluded.permissions_json, updated_at = excluded.updated_at")
    .bind(id, device.id, input.localBotId, device.external_user_id, input.name, input.description, JSON.stringify(input.icon), JSON.stringify(input.permissions), timestamp, timestamp).run();
  const agent = await env.DB.prepare("SELECT * FROM agents WHERE device_id = ? AND local_bot_id = ? AND platform = 'discord'").bind(device.id, input.localBotId).first();
  return json({ agent: publicAgent(agent), installUrl: discordGuildInstallUrl(env.DISCORD_APPLICATION_ID) }, 201);
}

async function createTelegramClaim(request, env) {
  requireConnectorConfiguration(env);
  const token = bearer(request);
  let device = null;
  if (token) device = await requireDevice(request, env, "telegram");
  const raw = await request.json();
  const input = sanitizeAgentInput(raw);
  const expectedUserId = telegramClaimOwner(raw, device);
  const username = cleanText(raw.username, 32, true).replace(/^@/, "");
  if (!USERNAME.test(username) || !/bot$/i.test(username)) throw new Error("Telegram username is invalid.");
  const id = crypto.randomUUID();
  const claimSecret = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PAIR_TTL_MS);
  await env.DB.prepare("UPDATE telegram_claims SET status = 'failed', error_summary = 'Claim expired.' WHERE status = 'pending' AND expires_at <= ?").bind(now.toISOString()).run();
  await env.DB.prepare("INSERT INTO telegram_claims (id, claim_hash, requested_username, local_bot_id, name, description, icon_json, permissions_json, status, device_id, expected_user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)")
    .bind(id, await digest(claimSecret), username, input.localBotId, input.name, input.description, JSON.stringify(input.icon), JSON.stringify(input.permissions), device?.id || null, expectedUserId, now.toISOString(), expiresAt.toISOString()).run();
  return json({ id, claimSecret, username, expiresAt: expiresAt.toISOString() }, 201);
}

async function telegramApi(env, method, body, botToken = env.TELEGRAM_MANAGER_BOT_TOKEN) {
  if (!botToken) throw Object.assign(new Error("Telegram manager is not configured."), { status: 503 });
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.description || `Telegram ${method} failed.`);
  return payload.result;
}

async function telegramWebhook(request, env) {
  if (!(await sameSecret(request.headers.get("x-telegram-bot-api-secret-token"), env.TELEGRAM_WEBHOOK_SECRET))) return json({ error: "Invalid webhook secret." }, 401);
  const update = await request.json();
  const managed = update?.managed_bot;
  if (!managed?.bot?.id || !managed?.bot?.username || !managed?.user?.id) return json({ ok: true });
  const claim = await env.DB.prepare("SELECT * FROM telegram_claims WHERE requested_username = ? COLLATE NOCASE AND status = 'pending' AND expires_at > ? ORDER BY created_at DESC LIMIT 1").bind(String(managed.bot.username), new Date().toISOString()).first();
  if (!claim) return json({ ok: true });
  if (claim.expected_user_id && String(claim.expected_user_id) !== String(managed.user.id)) {
    await env.DB.prepare("UPDATE telegram_claims SET status = 'failed', error_summary = 'Telegram account did not match the connected device.' WHERE id = ?").bind(claim.id).run();
    return json({ ok: true });
  }
  await env.DB.prepare("UPDATE telegram_claims SET status = 'ready', telegram_user_id = ?, external_bot_id = ?, bot_username = ?, display_name = ? WHERE id = ?")
    .bind(String(managed.user.id), String(managed.bot.id), String(managed.bot.username), cleanText(managed.bot.first_name || managed.bot.username, 120), claim.id).run();
  return json({ ok: true });
}

async function pollTelegramClaim(request, env, id) {
  requireConnectorConfiguration(env);
  let claim = await env.DB.prepare("SELECT * FROM telegram_claims WHERE id = ?").bind(id).first();
  if (!claim || !(await matchesHash(request.headers.get("x-notebook-claim"), claim.claim_hash)) || Date.parse(claim.expires_at) <= Date.now()) return json({ error: "Telegram creation request not found or expired." }, 404);
  if (claim.status === "failed") return json({ status: "failed", error: claim.error_summary || "Telegram creation failed." }, 409);
  if (claim.status !== "ready" || !claim.external_bot_id) return json({ status: "pending" }, 202);
  let deviceId = claim.device_id;
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    const deviceToken = await derivedDeviceToken(env, deviceId);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO devices (id, token_hash, platform, external_user_id, created_at) VALUES (?, ?, 'telegram', ?, ?)").bind(deviceId, await digest(deviceToken), claim.telegram_user_id, new Date().toISOString()),
      env.DB.prepare("UPDATE telegram_claims SET device_id = ? WHERE id = ?").bind(deviceId, claim.id),
    ]);
    claim = { ...claim, device_id: deviceId };
  }
  const managedToken = await telegramApi(env, "getManagedBotToken", { user_id: claim.external_bot_id });
  await Promise.all([
    telegramApi(env, "setMyName", { name: claim.name }, managedToken).catch(() => null),
    telegramApi(env, "setMyDescription", { description: claim.description.slice(0, 512) }, managedToken).catch(() => null),
    telegramApi(env, "setMyShortDescription", { short_description: claim.description.slice(0, 120) }, managedToken).catch(() => null),
  ]);
  const timestamp = new Date().toISOString();
  const agentId = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO agents (id, device_id, local_bot_id, platform, owner_external_id, name, description, icon_json, permissions_json, external_bot_id, username, created_at, updated_at) VALUES (?, ?, ?, 'telegram', ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(device_id, local_bot_id, platform) DO UPDATE SET name = excluded.name, description = excluded.description, icon_json = excluded.icon_json, permissions_json = excluded.permissions_json, external_bot_id = excluded.external_bot_id, username = excluded.username, updated_at = excluded.updated_at")
    .bind(agentId, deviceId, claim.local_bot_id, claim.telegram_user_id, claim.name, claim.description, claim.icon_json, claim.permissions_json, claim.external_bot_id, claim.bot_username, timestamp, timestamp).run();
  const agent = await env.DB.prepare("SELECT * FROM agents WHERE device_id = ? AND local_bot_id = ? AND platform = 'telegram'").bind(deviceId, claim.local_bot_id).first();
  return json({ status: "ready", deviceToken: await derivedDeviceToken(env, deviceId), managedBotToken: managedToken, agent: publicAgent(agent), telegram: { userId: claim.telegram_user_id, botId: claim.external_bot_id, username: claim.bot_username, displayName: claim.display_name, url: `https://t.me/${claim.bot_username}` } });
}

function publicAgent(row) {
  return row ? { id: row.id, localBotId: row.local_bot_id, platform: row.platform, name: row.name, description: row.description, icon: JSON.parse(row.icon_json || "{}"), permissions: JSON.parse(row.permissions_json || "[]"), externalBotId: row.external_bot_id || "", username: row.username || "", createdAt: row.created_at, updatedAt: row.updated_at } : null;
}

async function listAgents(request, env) {
  const device = await requireDevice(request, env);
  const result = await env.DB.prepare("SELECT * FROM agents WHERE device_id = ? ORDER BY updated_at DESC").bind(device.id).all();
  return json({ agents: (result.results || []).map(publicAgent) });
}

async function agentHealth(request, env, id) {
  const device = await requireDevice(request, env);
  const row = await env.DB.prepare("SELECT * FROM agents WHERE id = ? AND device_id = ?").bind(id, device.id).first();
  if (!row) return json({ error: "Agent not found." }, 404);
  return json({ schemaVersion: 1, botId: row.local_bot_id, observedAt: new Date().toISOString(), state: "healthy", activity: "idle", message: `${row.platform === "discord" ? "Discord agent" : "Telegram bot"} registered with Notebook Connector.`, version: "connector-v1", jobs: [] });
}

function optionValue(interaction, name) { return interaction?.data?.options?.find((option) => option.name === name)?.value || ""; }
async function discordInteractions(request, env) {
  const verified = await verifyDiscordSignature(request, env.DISCORD_PUBLIC_KEY);
  if (!verified.ok) return new Response("Bad request signature", { status: 401 });
  const interaction = JSON.parse(verified.body);
  if (interaction.type === 1) return json({ type: 1 });
  const ownerId = String(interaction.authorizing_integration_owners?.["1"] || interaction.user?.id || interaction.member?.user?.id || "");
  if (!ownerId) return json({ type: 4, data: { content: "Install Notebook for your Discord account first.", flags: 64 } });
  const result = await env.DB.prepare("SELECT agents.* FROM agents JOIN devices ON devices.id = agents.device_id WHERE agents.platform = 'discord' AND devices.external_user_id = ? ORDER BY agents.updated_at DESC").bind(ownerId).all();
  const agents = result.results || [];
  if (interaction.type === 4) {
    const query = String(optionValue(interaction, "name")).toLowerCase();
    return json({ type: 8, data: { choices: agents.filter((agent) => !query || agent.name.toLowerCase().includes(query)).slice(0, 25).map((agent) => ({ name: agent.name, value: agent.id })) } });
  }
  if (interaction.type !== 2) return json({ type: 4, data: { content: "Unsupported interaction.", flags: 64 } });
  if (interaction.data?.name === "agents") {
    const content = agents.length ? `Your Notebook agents:\n${agents.slice(0, 20).map((agent) => `• **${agent.name}** — ${agent.description}`).join("\n")}` : "You have no Notebook agents yet. Create one in Notebook.";
    return json({ type: 4, data: { content: content.slice(0, 1900), flags: 64 } });
  }
  if (interaction.data?.name === "agent") {
    const selected = agents.find((agent) => agent.id === String(optionValue(interaction, "name"))) || agents.find((agent) => agent.name.toLowerCase() === String(optionValue(interaction, "name")).toLowerCase());
    if (!selected) return json({ type: 4, data: { content: "That Notebook agent no longer exists. Run `/agents` to refresh the list.", flags: 64 } });
    const prompt = cleanText(optionValue(interaction, "prompt"), 1800, true);
    return json({ type: 4, data: { content: `**${selected.name}** received: ${prompt}\n\nThe logical agent is registered. Notebook execution requires its private Notebook link/runtime.`, flags: 64 } });
  }
  return json({ type: 4, data: { content: "Unknown command.", flags: 64 } });
}

async function registerDiscordCommands(request, env) {
  if (!(await sameSecret(bearer(request), env.ADMIN_TOKEN))) return json({ error: "Admin authentication is invalid." }, 401);
  if (!env.DISCORD_APPLICATION_ID || !env.DISCORD_BOT_TOKEN) return json({ error: "Discord registration is not configured." }, 503);
  const response = await fetch(`${DISCORD_API}/applications/${env.DISCORD_APPLICATION_ID}/commands`, { method: "PUT", headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "content-type": "application/json" }, body: JSON.stringify(commandDefinitions()) });
  const payload = await response.json();
  return response.ok ? json({ commands: payload }) : json({ error: payload.message || "Discord command registration failed." }, response.status);
}

async function status(env) {
  const connectorReady = Boolean(env.DEVICE_SIGNING_KEY && String(env.DEVICE_SIGNING_KEY).length >= 32 && env.PUBLIC_BASE_URL);
  return json({ ok: true, service: "notebook-bot-connector", discord: { ready: Boolean(connectorReady && env.DISCORD_APPLICATION_ID && env.DISCORD_CLIENT_SECRET && env.DISCORD_PUBLIC_KEY), applicationId: env.DISCORD_APPLICATION_ID || "", userInstallUrl: discordInstallUrl(env.DISCORD_APPLICATION_ID), guildInstallUrl: discordGuildInstallUrl(env.DISCORD_APPLICATION_ID) }, telegram: { ready: Boolean(connectorReady && env.TELEGRAM_MANAGER_BOT_TOKEN && env.TELEGRAM_MANAGER_USERNAME && env.TELEGRAM_WEBHOOK_SECRET), managerUsername: env.TELEGRAM_MANAGER_USERNAME || "" } });
}

async function route(request, env) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  if (method === "GET" && url.pathname === "/v1/status") return status(env);
  if (method === "POST" && url.pathname === "/v1/discord/pairings") return createDiscordPairing(env);
  if (method === "GET" && url.pathname === "/v1/discord/oauth/callback") return discordOAuthCallback(url, env);
  const discordPair = url.pathname.match(/^\/v1\/discord\/pairings\/([a-f0-9-]+)$/i);
  if (method === "GET" && discordPair) return pollDiscordPairing(request, env, discordPair[1]);
  if (method === "POST" && url.pathname === "/v1/discord/agents") return createDiscordAgent(request, env);
  if (method === "POST" && url.pathname === "/v1/telegram/claims") return createTelegramClaim(request, env);
  const telegramClaim = url.pathname.match(/^\/v1\/telegram\/claims\/([a-f0-9-]+)$/i);
  if (method === "GET" && telegramClaim) return pollTelegramClaim(request, env, telegramClaim[1]);
  if (method === "POST" && url.pathname === "/v1/webhooks/telegram") return telegramWebhook(request, env);
  if (method === "POST" && url.pathname === "/v1/interactions/discord") return discordInteractions(request, env);
  if (method === "POST" && url.pathname === "/v1/admin/discord/register") return registerDiscordCommands(request, env);
  if (method === "GET" && url.pathname === "/v1/agents") return listAgents(request, env);
  const health = url.pathname.match(/^\/v1\/agents\/([a-f0-9-]+)\/health$/i);
  if (method === "GET" && health) return agentHealth(request, env, health[1]);
  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env) {
    try { return await route(request, env); }
    catch (error) { return json({ error: cleanText(error?.message || "Request failed.", 500) }, Number(error?.status) || (/invalid|required|missing/i.test(error?.message || "") ? 400 : 500)); }
  },
};
