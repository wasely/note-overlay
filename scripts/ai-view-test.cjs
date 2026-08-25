const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  AI_SERVICES,
  aiBounds,
  createAiViewController,
  isAllowedAiNavigation,
  isSafeExternalUrl,
} = require("../src/main/ai-view.cjs");

assert.deepEqual(aiBounds({ width: 940, height: 700 }), { x: 0, y: 44, width: 940, height: 656 });
assert.deepEqual(aiBounds({ width: -1, height: 20 }), { x: 0, y: 20, width: 0, height: 0 });
for (const service of Object.values(AI_SERVICES)) {
  assert.equal(isAllowedAiNavigation(service, service.url), true);
  assert.equal(isAllowedAiNavigation(service, "https://accounts.google.com/signin"), true);
  assert.equal(isAllowedAiNavigation(service, "https://example.com/phish"), false);
  assert.equal(isAllowedAiNavigation(service, "javascript:alert(1)"), false);
}
assert.equal(isAllowedAiNavigation(AI_SERVICES.chatgpt, "https://help.openai.com/en/"), true);
assert.equal(isAllowedAiNavigation(AI_SERVICES.gemini, "https://support.google.com/gemini/"), true);
assert.equal(isAllowedAiNavigation(AI_SERVICES.deepseek, "https://platform.deepseek.com/"), true);
assert.equal(isSafeExternalUrl("https://example.com/"), true);
assert.equal(isSafeExternalUrl("http://example.com/"), false);

class FakeContents extends EventEmitter {
  constructor() { super(); this.url = ""; this.destroyed = false; this.reloads = 0; }
  isDestroyed() { return this.destroyed; }
  setWindowOpenHandler(handler) { this.windowOpenHandler = handler; }
  loadURL(url) { this.url = url; return Promise.resolve(); }
  getURL() { return this.url; }
  reload() { this.reloads += 1; }
  close() { this.destroyed = true; }
}

class FakeWebContentsView {
  constructor(options) { this.options = options; this.webContents = new FakeContents(); FakeWebContentsView.last = this; }
  setBounds(bounds) { this.bounds = bounds; }
}

for (const service of Object.values(AI_SERVICES)) {
  const children = [];
  const externalUrls = [];
  const statuses = [];
  const parentWindow = {
    isDestroyed: () => false,
    getContentBounds: () => ({ width: 800, height: 600 }),
    contentView: {
      addChildView(view) { children.push(view); },
      removeChildView(view) { const index = children.indexOf(view); if (index >= 0) children.splice(index, 1); },
    },
  };
  const controller = createAiViewController({
    WebContentsView: FakeWebContentsView,
    parentWindow,
    shell: { openExternal: async (url) => { externalUrls.push(url); } },
    service,
    emitStatus: (status) => statuses.push(status),
  });

  assert.equal(controller.show().status, "loading");
  assert.equal(children.length, 1);
  assert.equal(FakeWebContentsView.last.options.webPreferences.partition, service.id === "gemini" ? "persist:notebook-gmail" : `persist:notebook-ai-${service.id}`);
  assert.equal(FakeWebContentsView.last.options.webPreferences.nodeIntegration, false);
  assert.equal(FakeWebContentsView.last.options.webPreferences.contextIsolation, true);
  assert.equal(FakeWebContentsView.last.options.webPreferences.sandbox, true);
  assert.deepEqual(FakeWebContentsView.last.bounds, { x: 0, y: 44, width: 800, height: 556 });
  assert.equal(FakeWebContentsView.last.webContents.url, service.url);

  FakeWebContentsView.last.webContents.emit("did-stop-loading");
  assert.equal(controller.getStatus(), "ready");
  controller.hide();
  assert.equal(children.length, 0);
  controller.show();
  assert.equal(children.length, 1);

  const navigationEvent = { prevented: false, preventDefault() { this.prevented = true; } };
  FakeWebContentsView.last.webContents.emit("will-navigate", navigationEvent, "https://example.com/message");
  assert.equal(navigationEvent.prevented, true);
  assert.deepEqual(externalUrls, ["https://example.com/message"]);
  assert.deepEqual(FakeWebContentsView.last.webContents.windowOpenHandler({ url: "javascript:alert(1)" }), { action: "deny" });
  assert.equal(externalUrls.length, 1);

  FakeWebContentsView.last.webContents.emit("did-fail-load", {}, -105, "NAME_NOT_RESOLVED", service.url, true);
  assert.equal(controller.getStatus(), "error");
  assert.equal(children.length, 0);
  FakeWebContentsView.last.webContents.emit("did-stop-loading");
  assert.equal(controller.getStatus(), "error");
  controller.reload();
  assert.equal(children.length, 1);
  assert.equal(FakeWebContentsView.last.webContents.reloads, 1);
  controller.openExternal();
  assert.equal(externalUrls.at(-1), service.url);
  controller.destroy();
  assert.equal(children.length, 0);
  assert.equal(FakeWebContentsView.last.webContents.destroyed, true);
  assert.ok(statuses.some((entry) => entry.status === "error"));
}

console.log("AI view security, bounds, and lifecycle tests passed for ChatGPT, Gemini, and DeepSeek.");
