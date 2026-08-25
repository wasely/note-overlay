const assert = require("node:assert/strict");
const { createBotLinks, linkReference } = require("../src/main/bot-links.cjs");

const secrets = new Map();
const events = [];
const bots = new Map([["daily-brief", { id: "daily-brief", name: "Daily Brief" }]]);
const links = createBotLinks({
  getBot: (id) => bots.get(id),
  secrets: { get: (reference) => secrets.get(reference), set: (reference, value) => secrets.set(reference, value) },
  recordEvent: (event) => events.push(event),
});

const first = links.get("daily-brief");
assert.match(first.url, /^notebook:\/\/bot\/daily-brief\?key=[A-Za-z0-9_-]{32}$/);
assert.deepEqual(links.resolve(first.url), { botId: "daily-brief" });
assert.equal(links.resolve(first.url.replace(/.$/, "x")), null);
assert.equal(secrets.has(linkReference("daily-brief")), true);

const second = links.rotate("daily-brief");
assert.notEqual(second.url, first.url);
assert.equal(links.resolve(first.url), null);
assert.deepEqual(links.resolve(second.url), { botId: "daily-brief" });
assert.equal(events.at(-1).summary.includes("previous link no longer works"), true);
assert.throws(() => links.get("missing"), /Bot not found/);

console.log("Private bot link creation, validation, and reset passed.");
