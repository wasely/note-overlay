// Mail is Mailbrain, the local unified inbox (all Gmail accounts in one place). It runs at login
// from the "Mailbrain" scheduled task; Notebook only embeds its page.
const DEFAULT_MAIL_URL = "http://127.0.0.1:4390/";
const MAIL_SERVICE_NAME = "Mailbrain";
const MAIL_TOOLBAR_HEIGHT = 44;
const MAIL_NAVIGATION_HOSTS = new Set([
  "mail.google.com",
  "accounts.google.com",
  "myaccount.google.com",
  "workspace.google.com",
]);

function parsedUrl(value) {
  try { return new URL(value); }
  catch { return null; }
}

function isLoopback(url) {
  return url?.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
}

// HTTPS anywhere, plus plain HTTP only for this computer (Mailbrain's own page).
function isSafeExternalUrl(value) {
  const url = parsedUrl(value);
  return url?.protocol === "https:" || isLoopback(url);
}

function isAllowedMailNavigation(value, initialUrl = DEFAULT_MAIL_URL) {
  if (value === "about:blank") return true;
  const target = parsedUrl(value);
  if (!target) return false;
  const initial = parsedUrl(initialUrl);
  if (initial && target.origin === initial.origin) return initial.protocol === "https:" || initial.hostname === "127.0.0.1" || initial.hostname === "localhost";
  return target.protocol === "https:" && MAIL_NAVIGATION_HOSTS.has(target.hostname);
}

function mailBounds(contentBounds, toolbarHeight = MAIL_TOOLBAR_HEIGHT) {
  const width = Math.max(0, Math.floor(Number(contentBounds?.width) || 0));
  const height = Math.max(0, Math.floor(Number(contentBounds?.height) || 0));
  const top = Math.min(height, Math.max(0, Math.floor(Number(toolbarHeight) || 0)));
  return { x: 0, y: top, width, height: Math.max(0, height - top) };
}

function createMailViewController({ WebContentsView, parentWindow, shell, emitStatus = () => {}, mailUrl = DEFAULT_MAIL_URL, devTools = false, startService = null, retryDelayMs = 2500, maxStartAttempts = 3 }) {
  let view = null;
  let attached = false;
  let active = false;
  let loaded = false;
  let loadFailed = false;
  let status = "idle";
  let startAttempts = 0;
  let retryTimer = null;

  function report(nextStatus, message = "") {
    status = nextStatus;
    emitStatus({ status: nextStatus, message });
  }

  function openSafeExternal(url) {
    if (!isSafeExternalUrl(url)) return false;
    shell.openExternal(url).catch(() => {});
    return true;
  }

  function detach() {
    if (!view || !attached || parentWindow.isDestroyed()) return;
    parentWindow.contentView.removeChildView(view);
    attached = false;
  }

  function resize() {
    if (!view || !attached || parentWindow.isDestroyed()) return;
    view.setBounds(mailBounds(parentWindow.getContentBounds()));
  }

  function fail(message = `${MAIL_SERVICE_NAME} could not load.`) {
    detach();
    report("error", message);
  }

  // A local inbox that is not answering is usually just not started yet (or restarting).
  // Ask the host to start it, keep showing "loading", and retry a few times before failing.
  function recover(message) {
    loadFailed = true;
    if (typeof startService !== "function" || !isLoopback(parsedUrl(mailUrl)) || startAttempts >= maxStartAttempts) { fail(message); return; }
    startAttempts += 1;
    report("loading", `Starting ${MAIL_SERVICE_NAME}…`);
    Promise.resolve().then(() => startService()).catch(() => {}).finally(() => {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => { retryTimer = null; if (view && !view.webContents.isDestroyed()) load(); }, retryDelayMs);
      retryTimer.unref?.();
    });
  }

  function ensureView() {
    if (view && !view.webContents.isDestroyed()) return view;
    view = new WebContentsView({
      webPreferences: {
        partition: "persist:notebook-gmail",
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        devTools,
        // The inbox keeps its live connection and timers running while hidden.
        backgroundThrottling: false,
      },
    });
    const contents = view.webContents;
    contents.setWindowOpenHandler(({ url }) => {
      openSafeExternal(url);
      return { action: "deny" };
    });
    const guardNavigation = (event, url) => {
      if (isAllowedMailNavigation(url, mailUrl)) return;
      event.preventDefault();
      openSafeExternal(url);
    };
    contents.on("will-navigate", guardNavigation);
    contents.on("will-redirect", guardNavigation);
    contents.on("did-start-loading", () => {
      loadFailed = false;
      report("loading");
    });
    contents.on("did-stop-loading", () => {
      if (loadFailed) return;
      startAttempts = 0;
      report("ready");
    });
    contents.on("did-fail-load", (_event, errorCode, _description, _url, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return;
      recover(`${MAIL_SERVICE_NAME} is not running. Start the Mailbrain task or C:\\code\\mailbrain, then reload.`);
    });
    contents.on("render-process-gone", () => {
      loadFailed = true;
      fail(`${MAIL_SERVICE_NAME} stopped unexpectedly. Reload it or open it externally.`);
    });
    return view;
  }

  function attach() {
    ensureView();
    if (attached || parentWindow.isDestroyed()) return;
    parentWindow.contentView.addChildView(view);
    attached = true;
    resize();
  }

  function load() {
    loaded = true;
    loadFailed = false;
    report("loading");
    view.webContents.loadURL(mailUrl).catch(() => {});
  }

  // Load while detached so the first visible attach is immediate. The persistent
  // partition keeps the user's Google session across app restarts.
  function preload() {
    ensureView();
    if (!loaded || status === "error") load();
    return { status, message: "" };
  }

  function show() {
    active = true;
    attach();
    if (!loaded || status === "error") load();
    else report(status === "idle" ? "ready" : status);
    return { status, message: "" };
  }

  function hide() {
    active = false;
    detach();
    return { status };
  }

  function reload() {
    active = true;
    attach();
    loadFailed = false;
    report("loading");
    if (!loaded || status === "error" || !view.webContents.getURL()) load();
    else view.webContents.reload();
    return { status: "loading" };
  }

  function openExternal() {
    return openSafeExternal(mailUrl);
  }

  function destroy() {
    clearTimeout(retryTimer); retryTimer = null; startAttempts = 0;
    active = false;
    detach();
    if (view && !view.webContents.isDestroyed()) view.webContents.close();
    view = null;
    loaded = false;
    loadFailed = false;
    status = "idle";
  }

  return { preload, show, hide, reload, resize, openExternal, destroy, isActive: () => active, getStatus: () => status };
}

module.exports = {
  DEFAULT_MAIL_URL,
  MAIL_SERVICE_NAME,
  MAIL_TOOLBAR_HEIGHT,
  createMailViewController,
  isAllowedMailNavigation,
  isSafeExternalUrl,
  mailBounds,
};
