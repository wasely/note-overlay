const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  DEFAULT_TWITTER_URL,
  createTwitterViewController,
  isAllowedTwitterNavigation,
  isSafeExternalUrl,
  twitterBounds,
} = require("../src/main/twitter-view.cjs");

assert.deepEqual(twitterBounds({ width: 940, height: 700 }), { x: 0, y: 44, width: 940, height: 656 });
assert.equal(isAllowedTwitterNavigation(DEFAULT_TWITTER_URL), true);
assert.equal(isAllowedTwitterNavigation("https://twitter.com/home"), true);
assert.equal(isAllowedTwitterNavigation("https://accounts.google.com/signin"), true);
assert.equal(isAllowedTwitterNavigation("https://example.com/phish"), false);
assert.equal(isSafeExternalUrl("https://x.com/"), true);
assert.equal(isSafeExternalUrl("javascript:alert(1)"), false);

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
const controller = createTwitterViewController({
  WebContentsView: FakeWebContentsView,
  parentWindow,
  shell: { openExternal: async (url) => { externalUrls.push(url); } },
  emitStatus: (status) => statuses.push(status),
});

assert.equal(controller.preload().status, "loading");
assert.equal(children.length, 0);
assert.equal(FakeWebContentsView.last.options.webPreferences.partition, "persist:notebook-twitter");
assert.equal(FakeWebContentsView.last.options.webPreferences.sandbox, true);
assert.equal(FakeWebContentsView.last.webContents.url, DEFAULT_TWITTER_URL);
FakeWebContentsView.last.webContents.emit("did-stop-loading");
assert.equal(controller.show().status, "ready");
assert.equal(children.length, 1);
assert.deepEqual(FakeWebContentsView.last.bounds, { x: 0, y: 44, width: 800, height: 556 });

controller.hide();
assert.equal(children.length, 0);
const navigationEvent = { prevented: false, preventDefault() { this.prevented = true; } };
FakeWebContentsView.last.webContents.emit("will-navigate", navigationEvent, "https://example.com/message");
assert.equal(navigationEvent.prevented, true);
assert.deepEqual(externalUrls, ["https://example.com/message"]);
const popup = FakeWebContentsView.last.webContents.windowOpenHandler({ url: "javascript:alert(1)" });
assert.deepEqual(popup, { action: "deny" });

controller.show();
FakeWebContentsView.last.webContents.emit("did-fail-load", {}, -105, "NAME_NOT_RESOLVED", DEFAULT_TWITTER_URL, true);
assert.equal(controller.getStatus(), "error");
assert.equal(children.length, 0);
controller.reload();
assert.equal(children.length, 1);
assert.equal(FakeWebContentsView.last.webContents.reloads, 1);
controller.destroy();
assert.equal(FakeWebContentsView.last.webContents.destroyed, true);
assert.ok(statuses.some((entry) => entry.status === "error"));

console.log("Twitter view security, preload, bounds, and lifecycle tests passed.");
