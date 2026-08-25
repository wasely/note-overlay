const AI_TOOLBAR_HEIGHT = 44;

const AI_SERVICES = Object.freeze({
  chatgpt: Object.freeze({
    id: "chatgpt",
    name: "ChatGPT",
    url: "https://chatgpt.com/",
    hosts: ["chatgpt.com", "openai.com", "auth.openai.com", "auth0.openai.com"],
  }),
  gemini: Object.freeze({
    id: "gemini",
    name: "Gemini",
    url: "https://gemini.google.com/app",
    hosts: ["gemini.google.com", "google.com"],
    // Gmail and Gemini are the same Google account surface. Reuse Gmail's persistent
    // partition so signing in once works in both embedded views.
    partition: "persist:notebook-gmail",
  }),
  deepseek: Object.freeze({
    id: "deepseek",
    name: "DeepSeek",
    url: "https://chat.deepseek.com/",
    hosts: ["chat.deepseek.com", "deepseek.com"],
  }),
});

const AUTH_HOSTS = new Set([
  "accounts.google.com",
  "appleid.apple.com",
  "login.live.com",
  "login.microsoftonline.com",
]);

function parsedUrl(value) {
  try { return new URL(value); }
  catch { return null; }
}

function hostMatches(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function isSafeExternalUrl(value) {
  return parsedUrl(value)?.protocol === "https:";
}

function isAllowedAiNavigation(service, value, initialUrl = service?.url) {
  if (value === "about:blank") return true;
  const target = parsedUrl(value);
  if (!target) return false;
  const initial = parsedUrl(initialUrl);
  if (initial && target.origin === initial.origin) {
    return initial.protocol === "https:" || initial.hostname === "127.0.0.1" || initial.hostname === "localhost";
  }
  return target.protocol === "https:" && (
    (service?.hosts || []).some((domain) => hostMatches(target.hostname, domain))
    || AUTH_HOSTS.has(target.hostname)
  );
}

function aiBounds(contentBounds, toolbarHeight = AI_TOOLBAR_HEIGHT) {
  const width = Math.max(0, Math.floor(Number(contentBounds?.width) || 0));
  const height = Math.max(0, Math.floor(Number(contentBounds?.height) || 0));
  const top = Math.min(height, Math.max(0, Math.floor(Number(toolbarHeight) || 0)));
  return { x: 0, y: top, width, height: Math.max(0, height - top) };
}

function createAiViewController({ WebContentsView, parentWindow, shell, service, emitStatus = () => {}, devTools = false }) {
  if (!service || !AI_SERVICES[service.id]) throw new Error("Unknown AI service.");
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
    view.setBounds(aiBounds(parentWindow.getContentBounds()));
  }

  function fail(message = `${service.name} could not load.`) {
    detach();
    report("error", message);
  }

  function ensureView() {
    if (view && !view.webContents.isDestroyed()) return view;
    view = new WebContentsView({
      webPreferences: {
        partition: service.partition || `persist:notebook-ai-${service.id}`,
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
      if (isAllowedAiNavigation(service, url)) return;
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
      fail(`${service.name} could not load. Check your connection or open it in your browser.`);
    });
    contents.on("render-process-gone", () => {
      loadFailed = true;
      fail(`${service.name} stopped unexpectedly. Reload it or open it in your browser.`);
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
    view.webContents.loadURL(service.url).catch(() => {
      loadFailed = true;
      fail(`${service.name} could not load. Check your connection or open it in your browser.`);
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
    return openSafeExternal(service.url);
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
  AI_SERVICES,
  AI_TOOLBAR_HEIGHT,
  aiBounds,
  createAiViewController,
  isAllowedAiNavigation,
  isSafeExternalUrl,
};
