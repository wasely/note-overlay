const { randomBytes } = require("node:crypto");

const SESSION_REFERENCE = "NOTEBOOK_TELEGRAM_USER_SESSION";
const USERNAME = /^[A-Za-z0-9_]{5,32}$/;

function configuredCredentials(env) {
  const apiId = Number(env.NOTEBOOK_TELEGRAM_API_ID);
  const apiHash = String(env.NOTEBOOK_TELEGRAM_API_HASH || "").trim();
  return Number.isInteger(apiId) && apiId > 0 && apiHash.length >= 16 ? { apiId, apiHash } : null;
}

function usernameStem(name) {
  const words = String(name || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").split(/[^A-Za-z0-9]+/).filter(Boolean);
  let stem = words.map((word) => `${word[0]?.toUpperCase() || ""}${word.slice(1)}`).join("").replace(/[^A-Za-z0-9_]/g, "");
  if (!stem) stem = "Notebook";
  if (/bot$/i.test(stem)) stem = stem.slice(0, -3);
  stem = stem.slice(0, 27);
  if (stem.length < 2) stem = `${stem}Note`;
  return stem;
}

function usernameCandidates(name, count = 12) {
  const stem = usernameStem(name);
  const values = [`${stem}Bot`.slice(0, 32)];
  while (values.length < count) {
    const suffix = randomBytes(3).toString("hex").slice(0, 5);
    values.push(`${stem.slice(0, 24)}${suffix}Bot`);
  }
  return [...new Set(values)].filter((value) => USERNAME.test(value) && /bot$/i.test(value));
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: String(user.id || ""),
    username: String(user.username || ""),
    displayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || String(user.username || "Telegram account"),
  };
}

function createTelegramManagedBots({ env = process.env, secrets, teleprotoModule, sessionModule, qrcodeModule } = {}) {
  const credentials = configuredCredentials(env);
  let client = null;
  let loginTask = null;
  let loginAbort = null;
  let passwordResolver = null;
  let loginState = credentials ? { status: "disconnected", configured: true } : { status: "unconfigured", configured: false, error: "Telegram publisher API credentials are not configured for this build." };

  function libraries() {
    const teleproto = teleprotoModule || require("teleproto");
    const sessions = sessionModule || require("teleproto/sessions");
    const qrcode = qrcodeModule || require("qrcode");
    return { ...teleproto, ...sessions, qrcode };
  }

  function savedSession() { try { return String(secrets.get(SESSION_REFERENCE) || ""); } catch { return ""; } }
  async function buildClient(session = savedSession()) {
    if (!credentials) throw new Error("Telegram publisher API credentials are not configured for this build.");
    const { TelegramClient, StringSession } = libraries();
    return new TelegramClient(new StringSession(session), credentials.apiId, credentials.apiHash, { connectionRetries: 5, autoReconnect: true, floodSleepThreshold: 10 });
  }
  async function ensureClient() {
    if (!client) client = await buildClient();
    if (!client.connected) await client.connect();
    if (!(await client.checkAuthorization())) throw new Error("Connect your Telegram account once before creating bots.");
    return client;
  }

  async function status() {
    if (!credentials) return { ...loginState };
    if (!savedSession()) return { ...loginState, configured: true, authorized: false };
    try {
      const active = await ensureClient();
      const user = publicUser(await active.getMe());
      loginState = { status: "ready", configured: true, authorized: true, user };
    } catch (error) {
      loginState = { status: "disconnected", configured: true, authorized: false, error: String(error.message || "Telegram session is unavailable.").slice(0, 500) };
    }
    return { ...loginState };
  }

  async function startQrLogin() {
    if (!credentials) throw new Error("Telegram publisher API credentials are not configured for this build.");
    if (loginTask && ["starting", "waiting_qr", "waiting_password"].includes(loginState.status)) return { ...loginState };
    if (savedSession()) {
      const current = await status();
      if (current.authorized) return current;
    }
    if (client) { try { await client.disconnect(); } catch {} }
    client = await buildClient("");
    loginAbort = new AbortController();
    const activeAbort = loginAbort;
    let firstQrResolver;
    const firstQr = new Promise((resolve) => { firstQrResolver = resolve; });
    loginState = { status: "starting", configured: true, authorized: false };
    const { qrcode } = libraries();
    loginTask = (async () => {
      await client.connect();
      const user = await client.signInUserWithQrCode(credentials, {
        abortSignal: activeAbort.signal,
        qrCode: async ({ token, expires }) => {
          const qrUrl = `tg://login?token=${Buffer.from(token).toString("base64url")}`;
          const qrImage = await qrcode.toDataURL(qrUrl, { errorCorrectionLevel: "M", margin: 1, width: 256, color: { dark: "#111111", light: "#ffffff" } });
          loginState = { status: "waiting_qr", configured: true, authorized: false, qrUrl, qrImage, expiresAt: new Date(Number(expires) * 1000).toISOString() };
          firstQrResolver?.(); firstQrResolver = null;
        },
        password: async (hint) => {
          loginState = { status: "waiting_password", configured: true, authorized: false, passwordHint: String(hint || "") };
          firstQrResolver?.(); firstQrResolver = null;
          return new Promise((resolve) => { passwordResolver = resolve; });
        },
        onError: async (error) => {
          loginState = { status: "error", configured: true, authorized: false, error: String(error?.message || "Telegram login failed.").slice(0, 500) };
          firstQrResolver?.(); firstQrResolver = null;
          return true;
        },
      });
      await secrets.set(SESSION_REFERENCE, String(client.session.save()));
      loginState = { status: "ready", configured: true, authorized: true, user: publicUser(user) };
      firstQrResolver?.(); firstQrResolver = null;
    })().catch((error) => {
      if (error?.name !== "AbortError" && !activeAbort.signal.aborted) loginState = { status: "error", configured: true, authorized: false, error: String(error?.message || "Telegram login failed.").slice(0, 500) };
      firstQrResolver?.(); firstQrResolver = null;
    }).finally(() => { loginTask = null; passwordResolver = null; if (loginAbort === activeAbort) loginAbort = null; });
    let startTimer;
    try {
      await Promise.race([firstQr, new Promise((_, reject) => { startTimer = setTimeout(() => reject(new Error("Telegram QR login did not start.")), 15_000); })]);
    } finally { clearTimeout(startTimer); }
    return { ...loginState };
  }

  function getLoginState() { return { ...loginState }; }
  async function submitPassword(password) {
    if (!passwordResolver || loginState.status !== "waiting_password") throw new Error("Telegram is not waiting for a 2FA password.");
    const value = String(password || "");
    if (!value || value.length > 512) throw new Error("Enter your Telegram 2FA password.");
    const resolve = passwordResolver; passwordResolver = null;
    loginState = { status: "checking_password", configured: true, authorized: false };
    resolve(value);
    return { ...loginState };
  }
  async function cancelLogin() {
    loginAbort?.abort(); passwordResolver?.(""); loginAbort = null; passwordResolver = null;
    loginState = credentials ? { status: "disconnected", configured: true, authorized: false } : loginState;
    return { ...loginState };
  }
  async function logout() {
    loginAbort?.abort(); passwordResolver?.(""); passwordResolver = null;
    if (client) { try { await client.disconnect(); } catch {} }
    client = null; secrets.remove(SESSION_REFERENCE);
    loginState = credentials ? { status: "disconnected", configured: true, authorized: false } : loginState;
    return { ...loginState };
  }

  async function suggestUsername(name) {
    const active = await ensureClient();
    const { Api } = libraries();
    let lastError;
    for (const username of usernameCandidates(name)) {
      try {
        await active.invoke(new Api.bots.CheckUsername({ username }));
        return username;
      } catch (error) {
        lastError = error;
        if (!/USERNAME_OCCUPIED/i.test(String(error?.errorMessage || error?.message || ""))) throw error;
      }
    }
    throw new Error(lastError ? "Telegram usernames were taken. Try a more distinctive bot name." : "Telegram could not generate a bot username.");
  }

  async function createManagedBot({ name, username, managerUsername }) {
    const active = await ensureClient();
    const cleanName = String(name || "").trim().slice(0, 64);
    const cleanUsername = String(username || "").replace(/^@/, "");
    const manager = String(managerUsername || env.NOTEBOOK_TELEGRAM_MANAGER_USERNAME || "").replace(/^@/, "");
    if (!cleanName) throw new Error("Bot name is required.");
    if (!USERNAME.test(cleanUsername) || !/bot$/i.test(cleanUsername)) throw new Error("Telegram username is invalid.");
    if (!USERNAME.test(manager)) throw new Error("Telegram manager username is not configured.");
    const { Api } = libraries();
    await active.invoke(new Api.bots.CheckUsername({ username: cleanUsername }));
    const managerId = await active.getInputEntity(`@${manager}`);
    const bot = await active.invoke(new Api.bots.CreateBot({ name: cleanName, username: cleanUsername, managerId }));
    return { externalBotId: String(bot.id || ""), username: String(bot.username || cleanUsername), displayName: [bot.firstName, bot.lastName].filter(Boolean).join(" ") || cleanName };
  }

  async function close() { loginAbort?.abort(); passwordResolver?.(""); passwordResolver = null; if (client) { try { await client.disconnect(); } catch {} } client = null; }
  return { status, startQrLogin, getLoginState, submitPassword, cancelLogin, logout, suggestUsername, createManagedBot, close };
}

module.exports = { createTelegramManagedBots, configuredCredentials, usernameCandidates, SESSION_REFERENCE };
