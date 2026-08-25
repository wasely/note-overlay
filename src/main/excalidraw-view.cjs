const DEFAULT_EXCALIDRAW_URL = "https://excalidraw.com/";
const EXCALIDRAW_TOOLBAR_HEIGHT = 44;

function parsedUrl(value) {
  try { return new URL(value); }
  catch { return null; }
}

function isSafeExternalUrl(value) {
  return parsedUrl(value)?.protocol === "https:";
}

function isExcalidrawHost(hostname) {
  return hostname === "excalidraw.com" || hostname.endsWith(".excalidraw.com");
}

function isAllowedExcalidrawNavigation(value, initialUrl = DEFAULT_EXCALIDRAW_URL) {
  if (value === "about:blank") return true;
  const target = parsedUrl(value);
  if (!target) return false;
  const initial = parsedUrl(initialUrl);
  if (initial && target.origin === initial.origin) return initial.protocol === "https:" || initial.hostname === "127.0.0.1" || initial.hostname === "localhost";
  return target.protocol === "https:" && isExcalidrawHost(target.hostname);
}

function excalidrawBounds(contentBounds, toolbarHeight = EXCALIDRAW_TOOLBAR_HEIGHT) {
  const width = Math.max(0, Math.floor(Number(contentBounds?.width) || 0));
  const height = Math.max(0, Math.floor(Number(contentBounds?.height) || 0));
  const top = Math.min(height, Math.max(0, Math.floor(Number(toolbarHeight) || 0)));
  return { x: 0, y: top, width, height: Math.max(0, height - top) };
}

function createExcalidrawViewController({ WebContentsView, parentWindow, shell, emitStatus = () => {}, excalidrawUrl = DEFAULT_EXCALIDRAW_URL, devTools = false }) {
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
    view.setBounds(excalidrawBounds(parentWindow.getContentBounds()));
  }

  function fail(message = "Excalidraw could not load.") {
    detach();
    report("error", message);
  }

  function ensureView() {
    if (view && !view.webContents.isDestroyed()) return view;
    view = new WebContentsView({
      webPreferences: {
        partition: "persist:notebook-excalidraw",
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
      if (isAllowedExcalidrawNavigation(url, excalidrawUrl)) return;
      event.preventDefault();
      openSafeExternal(url);
    };
    contents.on("will-navigate", guardNavigation);
    contents.on("will-redirect", guardNavigation);
    contents.on("did-start-loading", () => {
      loadFailed = false;
      report("loading");
    });
    contents.on("dom-ready", () => {
      if (!loadFailed) report("ready");
    });
    contents.on("did-stop-loading", () => {
      if (!loadFailed) report("ready");
    });
    contents.on("did-fail-load", (_event, errorCode, _description, _url, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return;
      loadFailed = true;
      fail("Excalidraw could not load. Check your connection or open it externally.");
    });
    contents.on("render-process-gone", () => {
      loadFailed = true;
      fail("Excalidraw stopped unexpectedly. Reload it or open it externally.");
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
    view.webContents.loadURL(excalidrawUrl).catch(() => {
      loadFailed = true;
      fail("Excalidraw could not load. Check your connection or open it externally.");
    });
  }

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
    return openSafeExternal(DEFAULT_EXCALIDRAW_URL);
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

  return { preload, show, hide, reload, resize, openExternal, destroy, isActive: () => active, getStatus: () => status };
}

module.exports = {
  DEFAULT_EXCALIDRAW_URL,
  EXCALIDRAW_TOOLBAR_HEIGHT,
  createExcalidrawViewController,
  excalidrawBounds,
  isAllowedExcalidrawNavigation,
  isSafeExternalUrl,
};
