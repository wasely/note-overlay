const DEFAULT_MAIL_URL = "https://mail.google.com/mail/";
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

function isSafeExternalUrl(value) {
  return parsedUrl(value)?.protocol === "https:";
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

function createMailViewController({ WebContentsView, parentWindow, shell, emitStatus = () => {}, mailUrl = DEFAULT_MAIL_URL, devTools = false }) {
  let view = null;
  let attached = false;
  let active = false;
  let loaded = false;
  let loadFailed = false;
  let status = "idle";

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

  function fail(message = "Gmail could not load.") {
    detach();
    report("error", message);
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
      if (!loadFailed) report("ready");
    });
    contents.on("did-fail-load", (_event, errorCode, _description, _url, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return;
      loadFailed = true;
      fail("Gmail could not load. Check your connection or open Gmail externally.");
    });
    contents.on("render-process-gone", () => {
      loadFailed = true;
      fail("Gmail stopped unexpectedly. Reload it or open Gmail externally.");
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
    view.webContents.loadURL(mailUrl).catch(() => {
      loadFailed = true;
      fail("Gmail could not load. Check your connection or open Gmail externally.");
    });
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
    return openSafeExternal(DEFAULT_MAIL_URL);
  }

  function destroy() {
    active = false;
    detach();
    if (view && !view.webContents.isDestroyed()) view.webContents.close();
    view = null;
    loaded = false;
    loadFailed = false;
    status = "idle";
  }

  return { show, hide, reload, resize, openExternal, destroy, isActive: () => active, getStatus: () => status };
}

module.exports = {
  DEFAULT_MAIL_URL,
  MAIL_TOOLBAR_HEIGHT,
  createMailViewController,
  isAllowedMailNavigation,
  isSafeExternalUrl,
  mailBounds,
};
