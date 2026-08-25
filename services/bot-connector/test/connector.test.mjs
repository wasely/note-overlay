import assert from "node:assert/strict";
import test from "node:test";
import { commandDefinitions, discordGuildInstallUrl, discordInstallUrl, sanitizeAgentInput, telegramClaimOwner, verifyDiscordSignature } from "../src/index.js";

test("Discord user-install link requests only application commands", () => {
  const url = new URL(discordInstallUrl("1234567890"));
  assert.equal(url.hostname, "discord.com");
  assert.equal(url.searchParams.get("scope"), "applications.commands");
  assert.equal(url.searchParams.get("integration_type"), "1");
  assert.equal(url.searchParams.has("permissions"), false);
});

test("Discord guild-install link adds the shared bot with zero platform permissions", () => {
  const url = new URL(discordGuildInstallUrl("1234567890"));
  assert.equal(url.searchParams.get("scope"), "applications.commands bot");
  assert.equal(url.searchParams.get("integration_type"), "0");
  assert.equal(url.searchParams.get("permissions"), "0");
});

test("agent input is narrow and rejects unknown permissions", () => {
  const result = sanitizeAgentInput({ localBotId: "daily-brief", name: "Daily Brief", description: "Summarizes notes.", permissions: ["read_notes", "read_notes"], icon: { type: "symbol", value: "☀" } });
  assert.deepEqual(result.permissions, ["read_notes"]);
  assert.throws(() => sanitizeAgentInput({ ...result, permissions: ["admin"] }), /permissions/i);
  assert.throws(() => sanitizeAgentInput({ ...result, localBotId: "../../bad" }), /ID/i);
});

test("Telegram claims bind to the authorized account", () => {
  assert.equal(telegramClaimOwner({ telegramUserId: "77" }, null), "77");
  assert.equal(telegramClaimOwner({ telegramUserId: "77" }, { external_user_id: "77" }), "77");
  assert.throws(() => telegramClaimOwner({ telegramUserId: "88" }, { external_user_id: "77" }), /does not match/i);
  assert.throws(() => telegramClaimOwner({ telegramUserId: "not-an-id" }, null), /invalid/i);
});

test("registered Discord commands support user and guild installs with autocomplete", () => {
  const commands = commandDefinitions();
  assert.deepEqual(commands.map((command) => command.name), ["agents", "agent"]);
  assert.deepEqual(commands[1].integration_types, [0, 1]);
  assert.equal(commands[1].options[0].autocomplete, true);
});

test("Discord signature verification fails closed", async () => {
  const request = new Request("https://example.test/v1/interactions/discord", { method: "POST", body: "{}" });
  assert.deepEqual(await verifyDiscordSignature(request, "00".repeat(32)), { ok: false, body: "" });
});
