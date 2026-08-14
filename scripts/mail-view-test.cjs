const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  DEFAULT_MAIL_URL,
  createMailViewController,
  isAllowedMailNavigation,
  isSafeExternalUrl,
  mailBounds,
} = require("../src/main/mail-view.cjs");

assert.deepEqual(mailBounds({ width: 940, height: 700 }), { x: 0, y: 44, width: 940, height: 656 });
assert.deepEqual(mailBounds({ width: -1, height: 20 }), { x: 0, y: 20, width: 0, height: 0 });
assert.equal(isAllowedMailNavigation(DEFAULT_MAIL_URL), true);
assert.equal(isAllowedMailNavigation("https://accounts.google.com/signin"), true);
assert.equal(isAllowedMailNavigation("https://example.com/phish"), false);
assert.equal(isAllowedMailNavigation("javascript:alert(1)"), false);
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

const children = [];
const parentWindow = {
  isDestroyed: () => false,
  getContentBounds: () => ({ width: 800, height: 600 }),
  contentView: {
    addChildView(view) { children.push(view); },
    removeChildView(view) { const index = children.indexOf(view); if (index >= 0) children.splice(index, 1); },
  },
};
const externalUrls = [];
const statuses = [];
const controller = createMailViewController({
  WebContentsView: FakeWebContentsView,
  parentWindow,
  shell: { openExternal: async (url) => { externalUrls.push(url); } },
  emitStatus: (status) => statuses.push(status),
});

assert.equal(controller.show().status, "loading");
assert.equal(children.length, 1);
assert.equal(FakeWebContentsView.last.options.webPreferences.partition, "persist:notebook-gmail");
assert.equal(FakeWebContentsView.last.options.webPreferences.nodeIntegration, false);
assert.equal(FakeWebContentsView.last.options.webPreferences.sandbox, true);
assert.deepEqual(FakeWebContentsView.last.bounds, { x: 0, y: 44, width: 800, height: 556 });
assert.equal(FakeWebContentsView.last.webContents.url, DEFAULT_MAIL_URL);

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
const popup = FakeWebContentsView.last.webContents.windowOpenHandler({ url: "javascript:alert(1)" });
assert.deepEqual(popup, { action: "deny" });
assert.equal(externalUrls.length, 1);

FakeWebContentsView.last.webContents.emit("did-fail-load", {}, -105, "NAME_NOT_RESOLVED", DEFAULT_MAIL_URL, true);
assert.equal(controller.getStatus(), "error");
assert.equal(children.length, 0);
FakeWebContentsView.last.webContents.emit("did-stop-loading");
assert.equal(controller.getStatus(), "error");
controller.reload();
assert.equal(children.length, 1);
assert.equal(FakeWebContentsView.last.webContents.reloads, 1);
controller.openExternal();
assert.equal(externalUrls.at(-1), DEFAULT_MAIL_URL);
controller.destroy();
assert.equal(children.length, 0);
assert.equal(FakeWebContentsView.last.webContents.destroyed, true);
assert.ok(statuses.some((entry) => entry.status === "error"));

console.log("Gmail view security, bounds, and lifecycle tests passed.");
