const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  DEFAULT_EXCALIDRAW_URL,
  createExcalidrawViewController,
  excalidrawBounds,
  isAllowedExcalidrawNavigation,
  isSafeExternalUrl,
} = require("../src/main/excalidraw-view.cjs");

assert.deepEqual(excalidrawBounds({ width: 940, height: 700 }), { x: 0, y: 44, width: 940, height: 656 });
assert.equal(isAllowedExcalidrawNavigation(DEFAULT_EXCALIDRAW_URL), true);
assert.equal(isAllowedExcalidrawNavigation("https://plus.excalidraw.com/"), true);
assert.equal(isAllowedExcalidrawNavigation("https://example.com/phish"), false);
assert.equal(isSafeExternalUrl("https://excalidraw.com/"), true);
assert.equal(isSafeExternalUrl("http://excalidraw.com/"), false);

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
const controller = createExcalidrawViewController({
  WebContentsView: FakeWebContentsView,
  parentWindow,
  shell: { openExternal: async (url) => { externalUrls.push(url); } },
  emitStatus: (status) => statuses.push(status),
});

assert.equal(controller.preload().status, "loading");
assert.equal(children.length, 0);
assert.equal(FakeWebContentsView.last.options.webPreferences.partition, "persist:notebook-excalidraw");
assert.equal(FakeWebContentsView.last.options.webPreferences.nodeIntegration, false);
assert.equal(FakeWebContentsView.last.options.webPreferences.sandbox, true);
assert.equal(FakeWebContentsView.last.webContents.url, DEFAULT_EXCALIDRAW_URL);
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
assert.equal(externalUrls.length, 1);

controller.show();
FakeWebContentsView.last.webContents.emit("did-fail-load", {}, -105, "NAME_NOT_RESOLVED", DEFAULT_EXCALIDRAW_URL, true);
assert.equal(controller.getStatus(), "error");
assert.equal(children.length, 0);
controller.reload();
assert.equal(children.length, 1);
assert.equal(FakeWebContentsView.last.webContents.reloads, 1);
controller.openExternal();
assert.equal(externalUrls.at(-1), DEFAULT_EXCALIDRAW_URL);
controller.destroy();
assert.equal(children.length, 0);
assert.equal(FakeWebContentsView.last.webContents.destroyed, true);
assert.ok(statuses.some((entry) => entry.status === "error"));

console.log("Excalidraw view security, preload, persistence, and lifecycle tests passed.");
