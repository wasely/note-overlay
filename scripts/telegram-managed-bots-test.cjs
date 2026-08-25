const assert = require("node:assert/strict");
const { createTelegramManagedBots, configuredCredentials, usernameCandidates, SESSION_REFERENCE } = require("../src/main/telegram-managed-bots.cjs");

assert.equal(configuredCredentials({}), null);
assert.deepEqual(configuredCredentials({ NOTEBOOK_TELEGRAM_API_ID: "123", NOTEBOOK_TELEGRAM_API_HASH: "1234567890abcdef" }), { apiId: 123, apiHash: "1234567890abcdef" });
assert.match(usernameCandidates("Daily Brief")[0], /^DailyBriefBot$/);
assert.equal(usernameCandidates("x")[0].endsWith("Bot"), true);

class CheckUsername { constructor(value) { Object.assign(this, value); this.kind = "check"; } }
class CreateBot { constructor(value) { Object.assign(this, value); this.kind = "create"; } }
const fakeApi = { bots: { CheckUsername, CreateBot } };
class StringSession { constructor(value) { this.value = value; } save() { return this.value || "saved-session"; } }
class TelegramClient {
  constructor(session) { this.session = session; this.connected = false; }
  async connect() { this.connected = true; }
  async disconnect() { this.connected = false; }
  async checkAuthorization() { return Boolean(this.session.value); }
  async getMe() { return { id: 7, username: "kai", firstName: "Kai" }; }
  async signInUserWithQrCode(_credentials, callbacks) {
    await callbacks.qrCode({ token: Buffer.from("qr-token"), expires: Math.floor(Date.now() / 1000) + 30 });
    this.session.value = "saved-session";
    return { id: 7, username: "kai", firstName: "Kai" };
  }
  async invoke(request) {
    if (request.kind === "check") return true;
    if (request.kind === "create") return { id: 99, username: request.username, firstName: request.name };
    throw new Error("Unexpected request");
  }
  async getInputEntity(value) { return { value }; }
}

const saved = new Map();
const telegram = createTelegramManagedBots({
  env: { NOTEBOOK_TELEGRAM_API_ID: "123", NOTEBOOK_TELEGRAM_API_HASH: "1234567890abcdef", NOTEBOOK_TELEGRAM_MANAGER_USERNAME: "NotebookManagerBot" },
  secrets: { get: (key) => saved.get(key), set: (key, value) => saved.set(key, value), remove: (key) => saved.delete(key) },
  teleprotoModule: { TelegramClient, Api: fakeApi }, sessionModule: { StringSession }, qrcodeModule: { toDataURL: async () => "data:image/png;base64,cXI=" },
});

(async () => {
  const login = await telegram.startQrLogin();
  assert.equal(login.status, "waiting_qr");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(telegram.getLoginState().status, "ready");
  assert.equal(saved.get(SESSION_REFERENCE), "saved-session");
  const username = await telegram.suggestUsername("Daily Brief");
  assert.equal(username, "DailyBriefBot");
  const bot = await telegram.createManagedBot({ name: "Daily Brief", username, managerUsername: "NotebookManagerBot" });
  assert.deepEqual(bot, { externalBotId: "99", username: "DailyBriefBot", displayName: "Daily Brief" });
  await telegram.close();
  console.log("Telegram QR session persistence, username selection, and managed-bot creation passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
