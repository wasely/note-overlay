const { app, BrowserWindow, WebContentsView, Tray, Menu, globalShortcut, ipcMain, dialog, nativeImage, screen, clipboard, powerMonitor, shell, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { z } = require("zod");
const { createStorage } = require("./storage.cjs");
const { createBotMonitorService } = require("./bot-monitor.cjs");
const { botInput } = require("./bot-schemas.cjs");
const { createBotFactory } = require("./bot-factory.cjs");
const { createBotProcessService } = require("./bot-process.cjs");
const { createBotProvisioning } = require("./bot-provisioning.cjs");
const { createBotSecretStore } = require("./bot-secrets.cjs");
const { createGithubSync } = require("./github-sync.cjs");
const projectsService = require("./projects.cjs");
const { syncWorkshop } = require("./workshop.cjs");
const { readProjectLogo } = require("./project-logos.cjs");
const { validBounds, boundsForDisplay, boundsMatch } = require("./window-bounds.cjs");
const { createHotkeyManager, shouldHideOverlay } = require("./hotkey-manager.cjs");
const { DEFAULT_MAIL_URL, createMailViewController } = require("./mail-view.cjs");
const { DEFAULT_NOTION_URL, createNotionViewController } = require("./notion-view.cjs");
const { DEFAULT_TWITTER_URL, createTwitterViewController } = require("./twitter-view.cjs");
const { AI_SERVICES, createAiViewController } = require("./ai-view.cjs");
const { syncStartAtLogin } = require("./startup.cjs");

const DEFAULT_SETTINGS = { hotkey: "Control+Alt+Shift+N", startAtLogin: true, compressorDir: "C:\\Code\\llmlingua-local" };
const FALLBACK_HOTKEYS = ["Control+Alt+N"];
const MAIL_HOTKEY = "Control+Alt+Shift+M";
const NOTION_HOTKEY = "Control+Alt+Shift+O";
const TWITTER_HOTKEY = "Control+Alt+Shift+X";
const RETIRED_HOTKEYS = new Set(["Control+Shift+Space", "Control+Alt+N", "F8"]);
const COMPRESSOR_URL = process.env.NOTEBOOK_COMPRESSOR_URL || "http://127.0.0.1:8787";
const noteInput = z.object({ title: z.string().max(240).optional(), body: z.string().max(2_000_000).optional(), folderId: z.string().max(120).optional(), pinned: z.boolean().optional(), archived: z.boolean().optional() });
const skillInput = z.object({ name: z.string().max(240).optional(), category: z.string().max(80).optional(), body: z.string().max(2_000_000).optional(), pinned: z.boolean().optional() });
const slashCommandInput = z.object({ name: z.string().max(240).optional(), command: z.string().max(1_000).optional(), body: z.string().max(2_000_000).optional() });
const dailyDateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();
const dailyMonthInput = z.string().regex(/^\d{4}-\d{2}$/).optional();
const dailyTaskInput = z.object({ text: z.string().trim().min(1).max(500), bucket: z.enum(["today", "tomorrow"]), completed: z.boolean().optional(), priority: z.number().int().min(1).max(3).optional(), owner: z.enum(["me", "agent"]).optional() });
const dailyTaskPatch = z.object({ text: z.string().trim().min(1).max(500).optional(), bucket: z.enum(["today", "tomorrow"]).optional(), priority: z.number().int().min(1).max(3).optional(), owner: z.enum(["me", "agent"]).optional() }).refine((input) => Object.keys(input).length > 0);
const projectStatus = z.enum(["active", "paused", "blocked", "completed", "archived"]);
const projectPriority = z.enum(["critical", "high", "medium", "low", "none"]);
const projectInput = z.object({ name: z.string().trim().min(1).max(240), description: z.string().max(4_000).optional(), status: projectStatus.optional(), priority: projectPriority.optional(), manualRank: z.number().int().min(0).max(100_000).optional(), category: z.string().trim().min(1).max(80).optional(), tier: z.number().int().min(1).max(4).optional(), tierOrder: z.number().int().min(0).max(100_000).optional(), localPath: z.string().max(1_000).nullable().optional(), gitRoot: z.string().max(1_000).nullable().optional(), githubUrl: z.string().url().max(2_000).nullable().optional(), primaryLanguage: z.string().max(80).optional(), tags: z.array(z.string().max(80)).max(24).optional(), nextAction: z.string().max(1_000).optional(), notes: z.string().max(100_000).optional(), pushAfterCommit: z.boolean().optional(), lastWorkedAt: z.string().datetime().nullable().optional() });
const projectPatch = projectInput.partial().refine((input) => Object.keys(input).length > 0);
const projectTaskInput = z.object({ title: z.string().trim().min(1).max(500), description: z.string().max(10_000).optional(), status: z.enum(["todo", "in_progress", "blocked", "done", "archived"]).optional(), priority: projectPriority.optional(), manualOrder: z.number().int().min(0).max(100_000).optional(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), tags: z.array(z.string().max(80)).max(24).optional(), related: z.string().max(2_000).optional() });
const projectTaskPatch = projectTaskInput.partial().refine((input) => Object.keys(input).length > 0);
const projectAssignments = z.object({ skillIds: z.array(z.string().max(120)).max(200).optional(), slashCommandIds: z.array(z.string().max(120)).max(200).optional() });
const projectCanvasInput = z.object({ title: z.string().max(160).optional(), body: z.string().max(10_000).optional(), color: z.enum(["yellow", "blue", "green", "pink", "gray"]).optional(), x: z.number().int().min(0).max(5_000).optional(), y: z.number().int().min(0).max(5_000).optional(), width: z.number().int().min(140).max(800).optional(), height: z.number().int().min(100).max(800).optional() });
const projectCanvasPatch = projectCanvasInput.refine((input) => Object.keys(input).length > 0);
const repositoryFilesInput = z.object({ root: z.string().max(1_000), files: z.array(z.string().max(2_000)).min(1).max(500) });
const commitInput = repositoryFilesInput.extend({ message: z.string().trim().min(1).max(5_000), push: z.boolean().optional(), acknowledgeSensitive: z.boolean().optional() });
const botFactoryInput = z.object({
  name: z.string().trim().min(1).max(120), description: z.string().max(2_000).optional(), platforms: z.array(z.enum(["discord", "telegram"])).min(1).max(2), runtime: z.enum(["node", "python"]),
  parentPath: z.string().min(3).max(1_000), folderName: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_. -]{0,79}$/).optional(), executionMode: z.enum(["continuous", "scheduled", "webhook", "manual"]).default("continuous"), environment: z.string().trim().min(1).max(120).default("development"), tags: z.array(z.string().max(80)).max(24).optional(), avatarUrl: z.union([z.string().url().max(2_000), z.literal("")]).optional(),
  discordApplicationId: z.union([z.string().regex(/^\d{5,30}$/), z.literal("")]).optional(), discordPermissions: z.string().regex(/^\d{1,24}$/).default("0"), discordSecretRef: z.string().regex(/^[A-Z_][A-Z0-9_]{1,127}$/).default("DISCORD_BOT_TOKEN"), telegramUsername: z.union([z.string().regex(/^[A-Za-z0-9_]{5,32}$/), z.literal("")]).optional(), telegramSecretRef: z.string().regex(/^[A-Z_][A-Z0-9_]{1,127}$/).default("TELEGRAM_BOT_TOKEN"),
  publishToGithub: z.boolean().default(false), githubRepository: z.string().max(140).default(""), githubVisibility: z.enum(["private", "public"]).default("private"), commitMessage: z.string().trim().min(1).max(200).default("Create bot project"),
}).superRefine((input, context) => { if (input.publishToGithub && !/^(?:[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+$/.test(input.githubRepository)) context.addIssue({ code: "custom", path: ["githubRepository"], message: "GitHub repository is required." }); });
const cloudInput = z.object({ repository: z.string().trim().max(140).optional(), visibility: z.enum(["private", "public"]).optional(), autoUpload: z.boolean().optional() }).default({});
const dragNoteInput = z.object({ id: z.string().max(120).optional(), title: z.string().max(240).optional(), body: z.string().max(2_000_000).optional() });
const compressionInput = z.object({ noteId: z.string().nullable().optional(), sourceText: z.string().min(1).max(2_000_000), compressedText: z.string().min(1).max(2_000_000), preset: z.string().max(40), rate: z.number().min(0.1).max(1), originTokens: z.number().optional(), compressedTokens: z.number().optional(), ratio: z.string().optional() });
let overlay; let tray; let store; let botMonitor; let botFactory; let botProcesses; let botSecrets; let botProvisioning; let githubSync; let cloudSyncTimer; let cloudSyncRunning; let boundsTimer; let hideTimer; let focusTimer; let placementTimer; let hotkeys; let mailHotkeys; let notionHotkeys; let twitterHotkeys; let mailView; let notionView; let twitterView; let aiViews = {}; let quitFlushed = false;
const isolatedTestInstance = process.env.NOTEBOOK_TEST_ISOLATED === "1";
const isPrimaryInstance = isolatedTestInstance || app.requestSingleInstanceLock();
const openedInBackground = process.argv.includes("--background");

function settings() { return { ...DEFAULT_SETTINGS, ...store.getSetting("app", {}) }; }
function wait(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function announceCloudUpdate(result) {
  if (result?.remoteChanged && overlay && !overlay.isDestroyed()) overlay.webContents.send("github-sync:updated", result);
}
async function performCloudSync({ manual = false, force = false } = {}) {
  if (!githubSync) return null;
  if (cloudSyncRunning) return cloudSyncRunning;
  cloudSyncRunning = (async () => {
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send("overlay:flush-editor");
    await wait(650);
    const result = await githubSync.sync({ automatic: !manual, force });
    announceCloudUpdate(result);
    return result;
  })().finally(() => { cloudSyncRunning = null; });
  return cloudSyncRunning;
}
function scheduleCloudSync(delay = 1_500) {
  if (isolatedTestInstance || !githubSync) return;
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(() => {
    performCloudSync().catch((error) => console.error(`Notebook cloud sync failed: ${error.message}`));
  }, delay);
  cloudSyncTimer.unref();
}
function icon() { return nativeImage.createFromPath(path.join(__dirname, "../../build/notebook.ico")); }
function savedWindowBounds() { const bounds = store.getSetting("windowBounds", null); return validBounds(bounds) ? bounds : null; }
function savedBoundsByDisplay() { const saved = store.getSetting("windowBoundsByDisplay", {}); return saved && typeof saved === "object" ? saved : {}; }
function persistWindowBounds() {
  if (!overlay || overlay.isDestroyed()) return;
  const bounds = overlay.getBounds();
  const display = screen.getDisplayMatching(bounds);
  store.setSetting("windowBounds", bounds);
  store.setSetting("windowBoundsByDisplay", { ...savedBoundsByDisplay(), [display.id]: bounds });
}
function scheduleBoundsSave() { clearTimeout(boundsTimer); boundsTimer = setTimeout(persistWindowBounds, 220); }
function forEachAiView(callback) { Object.values(aiViews).forEach(callback); }
function hideAiViews(exceptId = "") { Object.entries(aiViews).forEach(([id, view]) => { if (id !== exceptId) view.hide(); }); }
function resizeEmbeddedViews() { mailView?.resize(); notionView?.resize(); twitterView?.resize(); forEachAiView((view) => view.resize()); }
function destroyAiViews() { forEachAiView((view) => view.destroy()); aiViews = {}; }
function restoreNormalWindowState() {
  if (!overlay || overlay.isDestroyed()) return false;
  let restored = false;
  if (overlay.isFullScreen()) { overlay.setFullScreen(false); restored = true; }
  if (overlay.isMaximized()) { overlay.unmaximize(); restored = true; }
  if (overlay.isMinimized()) { overlay.restore(); restored = true; }
  return restored;
}
// Re-applies bounds until Windows reports them. Windows converts a setBounds call with the scale
// factor of the display the window is still on, so moving between monitors with different DPI
// would otherwise leave the window at double or half its intended size.
function applyBounds(target, attempts = 5) {
  if (!overlay || overlay.isDestroyed()) return;
  overlay.setBounds(target);
  if (attempts <= 0) return;
  clearTimeout(placementTimer);
  placementTimer = setTimeout(() => {
    if (!overlay || overlay.isDestroyed()) return;
    if (!boundsMatch(overlay.getBounds(), target)) applyBounds(target, attempts - 1);
    else resizeEmbeddedViews();
  }, 45);
  placementTimer.unref?.();
}
function moveOverlayToCursorDisplay() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const saved = savedBoundsByDisplay()[display.id];
  applyBounds(boundsForDisplay({ saved, fallback: savedWindowBounds() || overlay.getBounds(), workArea: display.workArea }));
}
function showOverlay(newNote = false) {
  if (!overlay || overlay.isDestroyed()) { createOverlay(true, newNote); return; }
  clearTimeout(hideTimer); clearTimeout(focusTimer);
  restoreNormalWindowState();
  moveOverlayToCursorDisplay();
  const reclaimForeground = overlay.isVisible() && !overlay.isFocused();
  const focus = () => {
    if (!overlay || overlay.isDestroyed() || !overlay.isVisible()) return;
    overlay.setAlwaysOnTop(true, "screen-saver");
    if (process.platform === "win32" && !overlay.isFocused()) { overlay.setFocusable(false); overlay.setFocusable(true); }
    overlay.moveTop(); overlay.focus();
  };
  if (reclaimForeground) overlay.hide();
  overlay.show(); focus();
  focusTimer = setTimeout(() => { if (!overlay?.isFocused()) focus(); }, 180); focusTimer.unref?.();
  overlay.webContents.send("overlay:focus-editor"); overlay.webContents.send("overlay:shown");
  if (newNote) overlay.webContents.send("overlay:new-inbox");
}
function hideOverlay() {
  if (!overlay || overlay.isDestroyed()) return;
  overlay.webContents.send("overlay:flush-editor");
  overlay.webContents.send("overlay:hiding");
  clearTimeout(hideTimer); clearTimeout(focusTimer);
  hideTimer = setTimeout(() => { overlay?.hide(); overlay?.blur(); }, 130);
}
function toggleOverlay() { if (shouldHideOverlay(overlay)) hideOverlay(); else showOverlay(false); }
function toggleMailOverlay() {
  if (overlay?.isVisible() && mailView?.isActive()) { hideOverlay(); return; }
  showOverlay(false);
  const openMail = () => overlay?.webContents.send("overlay:open-mail");
  if (overlay?.webContents.isLoadingMainFrame()) overlay.webContents.once("did-finish-load", openMail);
  else openMail();
}
function toggleNotionOverlay() {
  if (overlay?.isVisible() && notionView?.isActive()) { hideOverlay(); return; }
  showOverlay(false);
  const openNotion = () => overlay?.webContents.send("overlay:open-notion");
  if (overlay?.webContents.isLoadingMainFrame()) overlay.webContents.once("did-finish-load", openNotion);
  else openNotion();
}
function toggleTwitterOverlay() {
  if (overlay?.isVisible() && twitterView?.isActive()) { hideOverlay(); return; }
  showOverlay(false);
  const openTwitter = () => overlay?.webContents.send("overlay:open-twitter");
  if (overlay?.webContents.isLoadingMainFrame()) overlay.webContents.once("did-finish-load", openTwitter);
  else openTwitter();
}
function readableHotkey(hotkey) { return hotkey ? hotkey.replaceAll("Control", "Ctrl").replaceAll("+", " + ") : "Unavailable"; }
function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Notebook: ${readableHotkey(hotkeys?.getActive())}`, enabled: false },
    { label: `Mail: ${readableHotkey(mailHotkeys?.getActive())}`, enabled: false },
    { label: `Notion: ${readableHotkey(notionHotkeys?.getActive())}`, enabled: false },
    { label: `Twitter: ${readableHotkey(twitterHotkeys?.getActive())}`, enabled: false },
    { type: "separator" },
    { label: "New Inbox note", click: () => showOverlay(true) },
    { label: "Show Notebook", click: () => showOverlay(false) },
    { label: "Open Gmail", click: toggleMailOverlay },
    { label: "Open Notion", click: toggleNotionOverlay },
    { label: "Open Twitter", click: toggleTwitterOverlay },
    { type: "separator" },
    { label: "Quit", click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}
function createDragFile(input) {
  const note = dragNoteInput.parse(input || {});
  const title = note.title?.trim() || "";
  const body = note.body?.trimEnd() || "";
  const content = [title ? `# ${title}` : "", body].filter(Boolean).join("\n\n");
  if (!content) throw new Error("Write something before dragging it out.");
  const safeTitle = (title || "notebook-note").replace(/[<>:"/\\|?*\x00-\x1F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 72).replace(/[. ]+$/g, "") || "notebook-note";
  const dropDir = path.join(app.getPath("userData"), "Markdown Notes");
  fs.mkdirSync(dropDir, { recursive: true });
  const desired = `${content}\n`;
  let filePath = path.join(dropDir, `${safeTitle}.md`);
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, "utf8") !== desired) {
    let counter = 2;
    while (fs.existsSync(path.join(dropDir, `${safeTitle} (${counter}).md`))) counter += 1;
    filePath = path.join(dropDir, `${safeTitle} (${counter}).md`);
  }
  fs.writeFileSync(filePath, desired, "utf8");
  return filePath;
}
function cleanTextDragHelper() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app.asar.unpacked", "build", "clean-text-drag.exe")
    : path.join(__dirname, "../../build/clean-text-drag.exe");
}
function startCleanNameDrag(input) {
  const filePath = createDragFile(input);
  const helper = cleanTextDragHelper();
  if (!fs.existsSync(helper)) throw new Error("Clean drag helper is missing.");
  const child = spawn(helper, [path.basename(filePath)], { detached: true, windowsHide: true, stdio: "ignore" });
  child.unref();
}
async function openBotSetup(botId, connectionId, action) {
  const bot = store.getBot(z.string().max(120).parse(botId));
  if (!bot) throw new Error("Bot not found.");
  const connection = bot.connections.find((item) => item.id === z.string().max(160).parse(connectionId));
  if (!connection) throw new Error("Platform connection not found.");
  const requested = z.enum(["portal", "install"]).parse(action);
  let url;
  if (connection.platform === "discord") {
    if (requested === "portal") url = connection.externalBotId ? `https://discord.com/developers/applications/${connection.externalBotId}` : "https://discord.com/developers/applications";
    else {
      if (!/^\d{5,30}$/.test(connection.externalBotId || "")) throw new Error("Verify the Discord identity or add its application ID before installing it.");
      if (!/^\d{1,24}$/.test(connection.installPermissions || "0")) throw new Error("Discord permissions must be a numeric bitfield.");
      const invite = new URL("https://discord.com/oauth2/authorize");
      invite.searchParams.set("client_id", connection.externalBotId);
      invite.searchParams.set("scope", "bot applications.commands");
      invite.searchParams.set("permissions", connection.installPermissions || "0");
      url = invite.toString();
    }
  } else if (connection.platform === "telegram") {
    if (requested === "portal") url = "https://t.me/BotFather";
    else {
      if (!/^[A-Za-z0-9_]{5,32}$/.test(connection.username || "")) throw new Error("Verify the Telegram identity or add its username before opening it.");
      url = `https://t.me/${connection.username}`;
    }
  } else throw new Error("Unsupported platform connection.");
  await shell.openExternal(url);
  return true;
}
async function openBotResource(botId, kind) {
  const bot = store.getBot(z.string().max(120).parse(botId));
  if (!bot) throw new Error("Bot not found.");
  const resource = z.enum(["repository", "project", "deployment", "logs", "scheduler"]).parse(kind);
  const value = resource === "repository" ? bot.repositoryUrl : resource === "project" ? bot.localProjectPath : resource === "deployment" ? bot.deploymentUrl : resource === "logs" ? bot.logsLocation : bot.schedulerUrl;
  if (!value) throw new Error("That resource is not configured.");
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) throw new Error("Only safe HTTP or HTTPS resources can be opened.");
    await shell.openExternal(url.toString());
  } else {
    const resolved = path.resolve(value);
    if (!fs.existsSync(resolved)) throw new Error("The configured local resource does not exist.");
    const error = await shell.openPath(resolved); if (error) throw new Error(error);
  }
  return true;
}
function createTray() {
  tray = new Tray(icon()); tray.setToolTip("Notebook");
  refreshTrayMenu();
  tray.on("click", () => showOverlay(false));
}
function createOverlay(showWhenReady = !openedInBackground, newNoteWhenReady = false) {
  const remembered = savedWindowBounds();
  overlay = new BrowserWindow({ width: remembered?.width || 940, height: remembered?.height || 700, minWidth: 600, minHeight: 430, show: false, frame: false, transparent: false, backgroundColor: "#f7f7f5", hasShadow: true, alwaysOnTop: true, resizable: true, webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, devTools: !app.isPackaged } });
  overlay.setAlwaysOnTop(true, "screen-saver"); overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  overlay.webContents.on("will-navigate", (event) => event.preventDefault());
  overlay.webContents.on("render-process-gone", (_event, details) => console.error(`Notebook renderer ended: ${details.reason}`));
  overlay.loadFile(path.join(__dirname, "../../dist/renderer/index.html"));
  overlay.once("ready-to-show", () => { if (showWhenReady) showOverlay(newNoteWhenReady); });
  overlay.on("resize", () => { scheduleBoundsSave(); resizeEmbeddedViews(); }); overlay.on("move", scheduleBoundsSave);
  overlay.on("close", (event) => { if (!app.isQuitting) { event.preventDefault(); hideOverlay(); } });
  overlay.on("closed", () => { mailView?.destroy(); notionView?.destroy(); twitterView?.destroy(); destroyAiViews(); mailView = null; notionView = null; twitterView = null; overlay = null; });
}
function repairStartAtLogin() {
  try {
    const status = syncStartAtLogin(app, settings().startAtLogin);
    if (settings().startAtLogin && !status.skipped && !status.executableWillLaunchAtLogin) console.error("Windows reports that Notebook startup is not enabled.");
    return status;
  } catch (error) { console.error(`Could not update Notebook startup: ${error.message}`); return null; }
}
async function compressorStatus() { try { return (await fetch(`${COMPRESSOR_URL}/health`, { signal: AbortSignal.timeout(1200) })).ok; } catch { return false; } }
async function startCompressor() {
  if (await compressorStatus()) return { ready: true };
  const script = path.join(settings().compressorDir, "start.ps1");
  if (!fs.existsSync(script)) return { ready: false, error: `Could not find local compressor at ${settings().compressorDir}` };
  const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], { detached: true, windowsHide: true, stdio: "ignore" }); child.unref();
  for (let attempt = 0; attempt < 90; attempt += 1) { await new Promise((resolve) => setTimeout(resolve, 1000)); if (await compressorStatus()) return { ready: true }; }
  return { ready: false, error: "Compressor did not start within 90 seconds." };
}

if (!isPrimaryInstance) app.quit();
if (!isolatedTestInstance) app.on("second-instance", () => showOverlay(false));

app.whenReady().then(() => {
  if (!isPrimaryInstance) return;
  app.setAppUserModelId("com.notebook.local");
  app.on("web-contents-created", (_event, contents) => {
    contents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  });
  store = createStorage(app.getPath("userData"), { onChange: () => scheduleCloudSync() });
  botMonitor = createBotMonitorService({ store, emit: (update) => overlay?.webContents.send("bots:status", update) });
  botFactory = createBotFactory({ run: projectsService.run });
  botSecrets = createBotSecretStore({ userDataPath: app.getPath("userData"), safeStorage });
  botProcesses = createBotProcessService({ run: projectsService.run, resolveSecret: (reference) => { try { return botSecrets.get(reference); } catch { return undefined; } } });
  botProvisioning = createBotProvisioning({ env: process.env, fetchImpl: fetch, openExternal: (url) => shell.openExternal(url), getSetting: (key, fallback) => store.getSetting(key, fallback), setSetting: (key, value) => store.setSetting(key, value), secrets: botSecrets });
  githubSync = createGithubSync({ userDataPath: app.getPath("userData"), store, run: projectsService.run, authStatus: projectsService.githubAuthStatus, signIn: projectsService.githubSignIn });
  try { store.ensureDailyBackup(); } catch (error) { console.error(`Notebook automatic backup failed: ${error.message}`); }
  const backupInterval = setInterval(() => { try { store.ensureDailyBackup(); } catch (error) { console.error(`Notebook automatic backup failed: ${error.message}`); } }, 6 * 60 * 60 * 1000);
  backupInterval.unref();
  const cloudInterval = setInterval(() => scheduleCloudSync(0), 30_000);
  cloudInterval.unref();
  const savedSettings = store.getSetting("app", {});
  if (!savedSettings.hotkey || RETIRED_HOTKEYS.has(savedSettings.hotkey)) store.setSetting("app", { ...savedSettings, hotkey: DEFAULT_SETTINGS.hotkey });
  createOverlay();
  scheduleCloudSync(1_000);
  mailView = createMailViewController({
    WebContentsView,
    parentWindow: overlay,
    shell,
    devTools: !app.isPackaged,
    mailUrl: !app.isPackaged && process.env.NOTEBOOK_MAIL_URL ? process.env.NOTEBOOK_MAIL_URL : DEFAULT_MAIL_URL,
    emitStatus: (status) => overlay?.webContents.send("mail:status", status),
  });
  notionView = createNotionViewController({
    WebContentsView,
    parentWindow: overlay,
    shell,
    devTools: !app.isPackaged,
    notionUrl: !app.isPackaged && process.env.NOTEBOOK_NOTION_URL ? process.env.NOTEBOOK_NOTION_URL : DEFAULT_NOTION_URL,
    emitStatus: (status) => overlay?.webContents.send("notion:status", status),
  });
  twitterView = createTwitterViewController({
    WebContentsView,
    parentWindow: overlay,
    shell,
    devTools: !app.isPackaged,
    twitterUrl: !app.isPackaged && process.env.NOTEBOOK_TWITTER_URL ? process.env.NOTEBOOK_TWITTER_URL : DEFAULT_TWITTER_URL,
    emitStatus: (status) => overlay?.webContents.send("twitter:status", status),
  });
  aiViews = Object.fromEntries(Object.values(AI_SERVICES).map((service) => {
    const overrideName = `NOTEBOOK_AI_${service.id.toUpperCase()}_URL`;
    const configured = !app.isPackaged && process.env[overrideName] ? { ...service, url: process.env[overrideName] } : service;
    return [service.id, createAiViewController({
      WebContentsView,
      parentWindow: overlay,
      shell,
      service: configured,
      devTools: !app.isPackaged,
      emitStatus: (status) => overlay?.webContents.send(`ai:${service.id}:status`, status),
    })];
  }));
  hotkeys = createHotkeyManager({
    globalShortcut,
    onTriggered: toggleOverlay,
    fallbacks: FALLBACK_HOTKEYS,
    onChange: (active, preferred) => {
      refreshTrayMenu();
      if (!active) console.error("No Notebook global hotkey could be registered.");
      else if (active !== preferred) console.error(`Notebook shortcut ${preferred} is unavailable; using ${active} until it becomes free.`);
    },
  });
  hotkeys.start(settings().hotkey);
  mailHotkeys = createHotkeyManager({
    globalShortcut,
    onTriggered: toggleMailOverlay,
    onChange: (active) => {
      refreshTrayMenu();
      if (!active) console.error(`Notebook mail shortcut ${MAIL_HOTKEY} is unavailable.`);
    },
  });
  mailHotkeys.start(MAIL_HOTKEY);
  notionHotkeys = createHotkeyManager({
    globalShortcut,
    onTriggered: toggleNotionOverlay,
    onChange: (active) => {
      refreshTrayMenu();
      if (!active) console.error(`Notebook Notion shortcut ${NOTION_HOTKEY} is unavailable.`);
    },
  });
  notionHotkeys.start(NOTION_HOTKEY);
  twitterHotkeys = createHotkeyManager({
    globalShortcut,
    onTriggered: toggleTwitterOverlay,
    onChange: (active) => {
      refreshTrayMenu();
      if (!active) console.error(`Notebook Twitter shortcut ${TWITTER_HOTKEY} is unavailable.`);
    },
  });
  twitterHotkeys.start(TWITTER_HOTKEY);
  createTray();
  const hotkeyRepairInterval = setInterval(() => { hotkeys.repair(); mailHotkeys.repair(); notionHotkeys.repair(); twitterHotkeys.repair(); }, 15_000); hotkeyRepairInterval.unref();
  const repairAfterWake = () => setTimeout(() => { hotkeys?.repair(); mailHotkeys?.repair(); notionHotkeys?.repair(); twitterHotkeys?.repair(); botMonitor?.start(); botMonitor?.checkAllBots().catch(() => {}); }, 1_000);
  powerMonitor.on("resume", repairAfterWake); powerMonitor.on("unlock-screen", repairAfterWake);
  botMonitor.start();
  repairStartAtLogin();
  const startupRepairInterval = setInterval(repairStartAtLogin, 10 * 60 * 1000); startupRepairInterval.unref();
  ipcMain.handle("notes:list", () => store.listNotes());
  ipcMain.handle("notes:create", (_event, input) => store.createNote(noteInput.partial().parse(input || {})));
  ipcMain.handle("notes:update", (_event, id, input) => store.updateNote(z.string().parse(id), noteInput.parse(input)));
  ipcMain.handle("notes:drag-file", (_event, input) => createDragFile(input));
  ipcMain.on("notes:drag-clean-name", (_event, input) => { try { startCleanNameDrag(input); } catch (error) { console.error(`Could not start clean note drag: ${error.message}`); } });
  ipcMain.handle("notes:tags", (_event, id, tags) => store.setTags(z.string().parse(id), z.array(z.string().max(48)).parse(tags)));
  ipcMain.handle("notes:trash", (_event, id) => store.moveToTrash(z.string().parse(id)));
  ipcMain.handle("notes:restore", (_event, id) => store.restoreNote(z.string().parse(id)));
  ipcMain.handle("notes:remove", (_event, id) => store.deleteForever(z.string().parse(id)));
  ipcMain.handle("skills:list", () => store.listSkills());
  ipcMain.handle("skills:create", (_event, input) => store.createSkill(skillInput.partial().parse(input || {})));
  ipcMain.handle("skills:update", (_event, id, input) => store.updateSkill(z.string().parse(id), skillInput.parse(input)));
  ipcMain.handle("skills:remove", (_event, id) => store.deleteSkill(z.string().parse(id)));
  ipcMain.handle("skills:related-bots", (_event, id) => store.listRelatedBots("skill", z.string().max(120).parse(id)));
  ipcMain.handle("bots:list", (_event, options) => store.listBots(z.object({ includeArchived: z.boolean().optional() }).parse(options || {})));
  ipcMain.handle("bots:get", (_event, id) => store.getBot(z.string().max(120).parse(id)));
  ipcMain.handle("bots:create", (_event, input) => { const bot = store.createBot(botInput.parse(input)); botMonitor.start(); return bot; });
  ipcMain.handle("bots:update", (_event, id, input) => { const bot = store.updateBot(z.string().max(120).parse(id), botInput.parse(input)); botMonitor.start(); return bot; });
  ipcMain.handle("bots:archive", (_event, id) => { const bot = store.archiveBot(z.string().max(120).parse(id)); botMonitor.start(); return bot; });
  ipcMain.handle("bots:restore", (_event, id) => { const bot = store.restoreBot(z.string().max(120).parse(id)); botMonitor.start(); return bot; });
  ipcMain.handle("bots:check", (_event, id) => botMonitor.checkBot(z.string().max(120).parse(id)));
  ipcMain.handle("bots:check-all", () => botMonitor.checkAllBots());
  ipcMain.handle("bots:test-monitoring", (_event, input) => botMonitor.testConfiguration(botInput.parse(input)));
  ipcMain.handle("bots:verify-connection", (_event, botId, connectionId) => botMonitor.verifyPlatformConnection(z.string().max(120).parse(botId), z.string().max(160).parse(connectionId)));
  ipcMain.handle("bots:activity", (_event, id) => store.getBotActivity(z.string().max(120).parse(id)));
  ipcMain.handle("bots:runs", (_event, id) => store.listBotRuns(z.string().max(120).parse(id)));
  ipcMain.handle("bots:upcoming", (_event, limit) => store.getUpcomingJobs(new Date(), z.number().int().min(1).max(100).optional().parse(limit)));
  ipcMain.handle("bots:open-setup", (_event, botId, connectionId, action) => openBotSetup(botId, connectionId, action));
  ipcMain.handle("bots:open-resource", (_event, botId, kind) => openBotResource(botId, kind));
  ipcMain.handle("bots:factory-choose-parent", async () => {
    const result = await dialog.showOpenDialog({ title: "Choose where to create the bot project", defaultPath: "C:\\code", properties: ["openDirectory", "createDirectory"] });
    return result.canceled || !result.filePaths[0] ? { canceled: true } : { canceled: false, path: result.filePaths[0] };
  });
  ipcMain.handle("bots:factory-defaults", () => {
    const preferred = "C:\\code";
    const parentPath = fs.existsSync(preferred) && fs.statSync(preferred).isDirectory() ? fs.realpathSync.native(preferred) : app.getPath("documents");
    return { parentPath };
  });
  ipcMain.handle("bots:provisioning-status", () => botProvisioning.status());
  ipcMain.handle("bots:provisioning-begin", (_event, input) => botProvisioning.begin(z.discriminatedUnion("platform", [
    z.object({ platform: z.literal("discord"), name: z.string().trim().min(1).max(64), permissions: z.string().regex(/^\d{1,24}$/), guildId: z.string().regex(/^\d{5,30}$/).optional() }),
    z.object({ platform: z.literal("telegram"), name: z.string().trim().min(1).max(64), username: z.string().regex(/^[A-Za-z0-9_]{5,32}$/) }),
  ]).parse(input)));
  ipcMain.handle("bots:provisioning-complete-telegram", (_event, input) => botProvisioning.completeTelegram(z.object({ username: z.string().regex(/^[A-Za-z0-9_]{5,32}$/) }).parse(input)));
  ipcMain.handle("bots:factory-open-platform", async (_event, platform) => { const value = z.enum(["discord", "telegram"]).parse(platform); await shell.openExternal(value === "discord" ? "https://discord.com/developers/applications" : "https://t.me/BotFather"); return true; });
  ipcMain.handle("bots:factory-open-install", async (_event, input) => {
    const data = z.discriminatedUnion("platform", [
      z.object({ platform: z.literal("discord"), applicationId: z.string().regex(/^\d{5,30}$/), permissions: z.string().regex(/^\d{1,24}$/) }),
      z.object({ platform: z.literal("telegram"), username: z.string().regex(/^[A-Za-z0-9_]{5,32}$/) }),
    ]).parse(input);
    const url = data.platform === "discord" ? `https://discord.com/oauth2/authorize?client_id=${data.applicationId}&scope=bot+applications.commands&permissions=${data.permissions}` : `https://t.me/${data.username}`;
    await shell.openExternal(url); return true;
  });
  ipcMain.handle("bots:process-status", (_event, botId) => { const bot = store.getBot(z.string().max(120).parse(botId)); if (!bot) throw new Error("Bot not found."); return botProcesses.status(bot); });
  ipcMain.handle("bots:process-start", (_event, botId) => { const bot = store.getBot(z.string().max(120).parse(botId)); if (!bot) throw new Error("Bot not found."); return botProcesses.start(bot); });
  ipcMain.handle("bots:process-stop", (_event, botId) => { const bot = store.getBot(z.string().max(120).parse(botId)); if (!bot) throw new Error("Bot not found."); return botProcesses.stop(bot); });
  ipcMain.handle("bots:factory-create", async (_event, input) => {
    const data = botFactoryInput.parse(input); const built = await botFactory.scaffold(data);
    const connections = data.platforms.map((platform) => platform === "discord"
      ? { platform, externalBotId: data.discordApplicationId || "", avatarUrl: data.avatarUrl || "", credentialSecretRef: data.discordSecretRef, installPermissions: data.discordPermissions, credentialState: "not_configured" }
        : { platform, username: data.telegramUsername || "", avatarUrl: data.avatarUrl || "", credentialSecretRef: data.telegramSecretRef, credentialState: "not_configured" });
    const bot = store.createBot({ name: data.name, description: data.description || "", platforms: data.platforms, executionMode: data.executionMode, environment: data.environment, enabled: true, tags: data.tags || [], repositoryUrl: built.repositoryUrl, localProjectPath: built.projectPath, runtime: built.runtime, version: "1.0.0", logsLocation: path.join(built.projectPath, "runtime"), connections, jobs: [], commands: data.platforms.map((platform) => ({ platform, command: platform === "discord" ? "/ping" : "/ping", description: "Confirm the generated bot responds.", usage: "/ping", category: "System", enabled: true })), monitoring: { adapter: "local-status", filePath: path.join(built.projectPath, "runtime", "status.json"), intervalSeconds: 60, timeoutMilliseconds: 5000, staleAfterSeconds: 180, failuresBeforeOffline: 3, monitoringEnabled: true, httpMethod: "GET", authSecretRef: "" }, skillIds: [] });
    try { store.createProject({ name: data.name, description: data.description || "Generated bot project", localPath: built.projectPath, gitRoot: built.projectPath, githubUrl: built.repositoryUrl || null, primaryLanguage: built.runtime, tags: ["bot", ...data.platforms], nextAction: "Start the bot locally and verify its first command", pushAfterCommit: Boolean(built.repositoryUrl) }); } catch (error) { console.error(`Bot project registry link failed: ${error.message}`); }
    botMonitor.start();
    return { bot, projectPath: built.projectPath, repositoryUrl: built.repositoryUrl };
  });
  ipcMain.handle("slash-commands:list", () => store.listSlashCommands());
  ipcMain.handle("slash-commands:create", (_event, input) => store.createSlashCommand(slashCommandInput.partial().parse(input || {})));
  ipcMain.handle("slash-commands:update", (_event, id, input) => store.updateSlashCommand(z.string().parse(id), slashCommandInput.parse(input)));
  ipcMain.handle("slash-commands:remove", (_event, id) => store.deleteSlashCommand(z.string().parse(id)));
  let workshopSyncPromise = null;
  async function runWorkshopSync() {
    if (!workshopSyncPromise) workshopSyncPromise = syncWorkshop(store, projectsService.inspectFolder).finally(() => { workshopSyncPromise = null; });
    return workshopSyncPromise;
  }
  ipcMain.handle("projects:list", async () => { await runWorkshopSync(); return store.listProjects(); });
  ipcMain.handle("projects:workshop-sync", async () => ({ ...(await runWorkshopSync()), projects: store.listProjects() }));
  ipcMain.handle("projects:create", (_event, input) => store.createProject(projectInput.parse(input)));
  ipcMain.handle("projects:update", (_event, id, input) => store.updateProject(z.string().max(120).parse(id), projectPatch.parse(input)));
  ipcMain.handle("projects:reorder", (_event, ids) => store.reorderProjects(z.array(z.string().max(120)).max(1_000).parse(ids)));
  ipcMain.handle("projects:move", (_event, input) => { const data = z.object({ id: z.string().max(120), tier: z.number().int().min(1).max(4), beforeId: z.string().max(120).nullable().optional() }).parse(input); return store.moveProject(data.id, data.tier, data.beforeId || null); });
  ipcMain.handle("projects:remove", (_event, id) => store.removeProject(z.string().max(120).parse(id)));
  ipcMain.handle("projects:logo", (_event, id) => {
    const project = store.getProject(z.string().max(120).parse(id));
    if (!project?.logo_path) return null;
    return readProjectLogo(project.logo_path);
  });
  ipcMain.handle("project-tasks:create", (_event, projectId, input) => store.createProjectTask(z.string().max(120).parse(projectId), projectTaskInput.parse(input)));
  ipcMain.handle("project-tasks:update", (_event, id, input) => store.updateProjectTask(z.string().max(120).parse(id), projectTaskPatch.parse(input)));
  ipcMain.handle("project-tasks:remove", (_event, id) => store.removeProjectTask(z.string().max(120).parse(id)));
  ipcMain.handle("project-canvas:create", (_event, projectId, input) => store.createProjectCanvasItem(z.string().max(120).parse(projectId), projectCanvasInput.parse(input || {})));
  ipcMain.handle("project-canvas:update", (_event, id, input) => store.updateProjectCanvasItem(z.string().max(120).parse(id), projectCanvasPatch.parse(input)));
  ipcMain.handle("project-canvas:remove", (_event, id) => store.removeProjectCanvasItem(z.string().max(120).parse(id)));
  ipcMain.handle("projects:assign", (_event, projectId, input) => store.setProjectAssignments(z.string().max(120).parse(projectId), projectAssignments.parse(input)));
  ipcMain.handle("projects:choose-folder", async () => {
    const result = await dialog.showOpenDialog({ title: "Add local project", properties: ["openDirectory"] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return { canceled: false, project: await projectsService.inspectFolder(result.filePaths[0]) };
  });
  ipcMain.handle("projects:choose-parent", async () => {
    const result = await dialog.showOpenDialog({ title: "Discover Git repositories", properties: ["openDirectory"] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true, projects: [] };
    return { canceled: false, projects: await projectsService.discoverRepositories(result.filePaths[0]) };
  });
  ipcMain.handle("projects:inspect", (_event, value) => projectsService.inspectFolder(z.string().max(1_000).parse(value)));
  ipcMain.handle("projects:status", (_event, root) => projectsService.repositoryStatus(z.string().max(1_000).parse(root)));
  ipcMain.handle("projects:diff", (_event, input) => { const data = z.object({ root: z.string().max(1_000), path: z.string().max(2_000), staged: z.boolean().optional() }).parse(input); return projectsService.diff(data.root, data.path, data.staged); });
  ipcMain.handle("projects:stage", (_event, input) => { const data = repositoryFilesInput.parse(input); return projectsService.mutateFiles(data.root, "stage", data.files); });
  ipcMain.handle("projects:unstage", (_event, input) => { const data = repositoryFilesInput.parse(input); return projectsService.mutateFiles(data.root, "unstage", data.files); });
  ipcMain.handle("projects:commit", async (_event, input) => { const data = commitInput.parse(input); const result = await projectsService.commit(data.root, data); const project = store.listProjects().find((item) => item.git_root && path.resolve(item.git_root).toLowerCase() === path.resolve(data.root).toLowerCase()); if (project) { store.addProjectActivity(project.id, "commit", `Committed ${result.shortHash}`, result.message); store.updateProject(project.id, { lastWorkedAt: new Date().toISOString() }); } return result; });
  ipcMain.handle("projects:push", async (_event, root) => { const value = z.string().max(1_000).parse(root); const result = await projectsService.pushRepository(value); const project = store.listProjects().find((item) => item.git_root && path.resolve(item.git_root).toLowerCase() === path.resolve(value).toLowerCase()); if (project) { store.addProjectActivity(project.id, "push", "Updated GitHub", `${result.branch || "Branch"} pushed to ${result.upstream || "origin"}`); store.updateProject(project.id, { lastWorkedAt: new Date().toISOString() }); } return result; });
  ipcMain.handle("projects:publish", async (_event, input) => { const data = z.object({ root: z.string().max(1_000), projectName: z.string().max(240) }).parse(input); const result = await projectsService.publishRepository(data.root, data); const project = store.listProjects().find((item) => item.git_root && path.resolve(item.git_root).toLowerCase() === path.resolve(data.root).toLowerCase()); if (project) { store.addProjectActivity(project.id, "push", result.alreadyUpToDate ? "GitHub already current" : "Published safely to GitHub", result.commit ? `${result.commit.shortHash} · ${result.commit.message}` : `${result.status.branch || "Branch"} pushed`); store.updateProject(project.id, { lastWorkedAt: new Date().toISOString() }); } return result; });
  ipcMain.handle("projects:fetch", (_event, root) => projectsService.fetchRepository(z.string().max(1_000).parse(root)));
  ipcMain.handle("projects:github-auth-status", () => projectsService.githubAuthStatus());
  ipcMain.handle("projects:github-sign-in", () => projectsService.githubSignIn());
  ipcMain.handle("projects:github-setup", async (_event, input) => {
    const data = z.object({ projectId: z.string().max(120), root: z.string().max(1_000), repository: z.string().trim().min(1).max(140), mode: z.enum(["create", "connect"]), visibility: z.enum(["private", "public"]).optional(), initialize: z.boolean().optional(), description: z.string().max(350).optional() }).parse(input);
    const result = await projectsService.setupGithubRepository(data.root, data);
    const project = store.updateProject(data.projectId, { gitRoot: result.root, githubUrl: result.url, lastWorkedAt: new Date().toISOString() });
    store.addProjectActivity(project.id, "github", result.created ? "GitHub repository created" : "GitHub repository connected", result.url);
    return { ...result, project: store.getProject(project.id) };
  });
  ipcMain.handle("github-sync:status", () => githubSync.status());
  ipcMain.handle("github-sync:sign-in", async () => { if (overlay && !overlay.isDestroyed()) overlay.webContents.send("overlay:flush-editor"); await wait(650); const result = await githubSync.connect(); announceCloudUpdate(result); return result; });
  ipcMain.handle("github-sync:configure", (_event, input) => githubSync.configure(cloudInput.parse(input)));
  ipcMain.handle("github-sync:sync", () => performCloudSync({ manual: true, force: true }));
  ipcMain.handle("github-sync:push", () => performCloudSync({ manual: true, force: true }));
  ipcMain.handle("github-sync:pull", () => performCloudSync({ manual: true, force: true }));
  ipcMain.handle("github-sync:open", async () => { const value = await githubSync.status(); if (!value.url) throw new Error("Configure a cloud repository first."); await shell.openExternal(value.url); return true; });
  ipcMain.handle("projects:agents-read", (_event, root) => projectsService.readAgents(z.string().max(1_000).parse(root)));
  ipcMain.handle("projects:agents-write", (_event, input) => { const data = z.object({ root: z.string().max(1_000), content: z.string().max(2_000_000), version: z.string().max(128).nullable().optional() }).parse(input); const result = projectsService.writeAgents(data.root, data); const project = store.listProjects().find((item) => item.local_path && path.resolve(item.local_path).toLowerCase() === path.resolve(data.root).toLowerCase()); if (project) store.updateProject(project.id, { lastWorkedAt: new Date().toISOString() }); return result; });
  ipcMain.handle("projects:readme", (_event, root) => projectsService.readReadme(z.string().max(1_000).parse(root)));
  ipcMain.handle("projects:open", async (_event, input) => {
    const data = z.object({ kind: z.enum(["folder", "terminal", "editor", "github"]), path: z.string().max(2_000).optional(), url: z.string().url().max(2_000).optional() }).parse(input);
    if (data.kind === "github") { const url = new URL(data.url); if (url.protocol !== "https:" || url.hostname !== "github.com") throw new Error("Only GitHub repository links can be opened."); await shell.openExternal(url.toString()); return true; }
    const target = fs.realpathSync.native(path.resolve(data.path));
    if (data.kind === "folder") { const error = await shell.openPath(target); if (error) throw new Error(error); }
    else if (data.kind === "terminal") spawn("powershell.exe", ["-NoExit", "-Command", "Set-Location -LiteralPath $args[0]", target], { detached: true, windowsHide: false, stdio: "ignore" }).unref();
    else { const candidates = [path.join(process.env.LOCALAPPDATA || "", "Programs", "Microsoft VS Code", "Code.exe"), path.join(process.env.ProgramFiles || "", "Microsoft VS Code", "Code.exe")]; const editor = candidates.find((candidate) => fs.existsSync(candidate)); if (!editor) throw new Error("Visual Studio Code is not installed in a supported location."); const child = spawn(editor, [target], { detached: true, windowsHide: true, stdio: "ignore", shell: false }); child.unref(); }
    return true;
  });
  ipcMain.handle("daily:get", () => store.dailyDashboard());
  ipcMain.handle("daily:page", (_event, date) => store.dailyPage(dailyDateInput.parse(date) || undefined));
  ipcMain.handle("daily:month", (_event, month) => store.dailyMonth(dailyMonthInput.parse(month) || undefined));
  ipcMain.handle("daily:create", (_event, input, date) => store.createDailyTask(dailyTaskInput.parse(input), dailyDateInput.parse(date) || undefined));
  ipcMain.handle("daily:update", (_event, id, input, date) => store.updateDailyTask(z.string().parse(id), dailyTaskPatch.parse(input), dailyDateInput.parse(date) || undefined));
  ipcMain.handle("daily:complete", (_event, id, completed, date) => store.completeDailyTask(z.string().parse(id), z.boolean().parse(completed), dailyDateInput.parse(date) || undefined));
  ipcMain.handle("daily:remove", (_event, id, date) => store.deleteDailyTask(z.string().parse(id), dailyDateInput.parse(date) || undefined));
  ipcMain.handle("folders:list", () => store.listFolders());
  ipcMain.handle("folders:create", (_event, name) => store.createFolder(z.string().max(80).parse(name)));
  ipcMain.handle("folders:rename", (_event, id, name) => store.renameFolder(z.string().parse(id), z.string().min(1).max(80).parse(name)));
  ipcMain.handle("folders:remove", (_event, id) => store.removeFolder(z.string().parse(id)));
  ipcMain.handle("tags:list", () => store.listTags());
  ipcMain.handle("compressions:list", (_event, noteId) => store.listCompressions(z.string().parse(noteId)));
  ipcMain.handle("compressions:create", (_event, input) => store.createCompression(compressionInput.parse(input)));
  ipcMain.handle("settings:get", () => settings());
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("settings:set", (_event, input) => {
    const current = settings();
    const patch = z.object({ hotkey: z.string().min(3).max(80).optional(), startAtLogin: z.boolean().optional(), theme: z.enum(["system", "light", "dark"]).optional(), compressorDir: z.string().min(3).max(400).optional() }).parse(input);
    const next = { ...current, ...patch };
    if (next.hotkey !== current.hotkey && !hotkeys.setPreferred(next.hotkey)) throw new Error("Windows could not register that shortcut.");
    store.setSetting("app", next);
    repairStartAtLogin();
    return next;
  });
  ipcMain.handle("data:export", async (_event, format) => {
    const isMarkdown = format === "markdown";
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: "Export Notebook",
      defaultPath: `notebook-backup.${isMarkdown ? "md" : "json"}`,
      filters: isMarkdown ? [{ name: "Markdown", extensions: ["md"] }] : [{ name: "JSON", extensions: ["json"] }],
    });
    if (canceled || !filePath) return { canceled: true };
    const data = store.exportData();
    if (isMarkdown) {
      const notes = data.notes.filter((note) => !note.deleted_at).map((note) => `# ${note.title || "Untitled"}\n\n${note.body}\n\n---\n`);
      const dailyByDate = new Map();
      for (const task of data.dailyTasks.filter((item) => item.status !== "carried")) {
        const date = task.completed_on || task.task_date;
        if (!dailyByDate.has(date)) dailyByDate.set(date, []);
        dailyByDate.get(date).push(`- [${task.status === "done" ? "x" : " "}] ${task.text}`);
      }
      const daily = [...dailyByDate.entries()].sort(([left], [right]) => right.localeCompare(left)).map(([date, tasks]) => `# Daily: ${date}\n\n${tasks.join("\n")}\n\n---\n`);
      const skills = data.skills.map((skill) => `# Skill: ${skill.name || "Untitled skill"}\n\nCategory: ${skill.category || "Unsorted"}\n\n${skill.body}\n\n---\n`);
      const slashCommands = data.slashCommands.map((item) => `# Slash command: ${item.name || "Untitled command"}\n\n${item.command ? `Command: ${item.command}\n\n` : ""}${item.body}\n\n---\n`);
      fs.writeFileSync(filePath, [...daily, ...notes, ...skills, ...slashCommands].join("\n"), "utf8");
    } else {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }
    return { filePath };
  });
  ipcMain.handle("data:import", async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({ title: "Import Notebook JSON", filters: [{ name: "JSON", extensions: ["json"] }], properties: ["openFile"] });
    if (canceled || !filePaths[0]) return { canceled: true };
    let data;
    try { data = JSON.parse(fs.readFileSync(filePaths[0], "utf8")); }
    catch { throw new Error("That file is not valid JSON."); }
    return { notes: store.importData(data) };
  });
  ipcMain.handle("backups:list", () => store.listBackups());
  ipcMain.handle("backups:create", () => store.createBackup());
  ipcMain.handle("backups:restore", (_event, name) => { store.createBackup(); return store.restoreBackup(z.string().max(180).parse(name)); });
  ipcMain.handle("data:location", () => store.userDataPath);
  ipcMain.handle("clipboard:write-text", (_event, text) => { clipboard.writeText(z.string().max(2_000_000).parse(text)); });
  ipcMain.handle("clipboard:write-rich", (_event, input) => {
    const data = z.object({ text: z.string().max(2_000_000), html: z.string().max(4_000_000) }).parse(input);
    clipboard.write({ text: data.text, html: data.html });
    return true;
  });
  // Opens a blank Google Doc. The URL is fixed, never taken from the renderer.
  ipcMain.handle("docs:new", async () => { await shell.openExternal("https://docs.new"); return true; });
  ipcMain.handle("mail:show", () => {
    if (restoreNormalWindowState()) moveOverlayToCursorDisplay();
    notionView.hide();
    twitterView.hide();
    hideAiViews();
    return mailView.show();
  });
  ipcMain.handle("mail:hide", () => mailView.hide());
  ipcMain.handle("mail:reload", () => mailView.reload());
  ipcMain.handle("mail:open-external", () => mailView.openExternal());
  ipcMain.handle("notion:show", () => {
    if (restoreNormalWindowState()) moveOverlayToCursorDisplay();
    mailView.hide();
    twitterView.hide();
    hideAiViews();
    return notionView.show();
  });
  ipcMain.handle("notion:hide", () => notionView.hide());
  ipcMain.handle("notion:reload", () => notionView.reload());
  ipcMain.handle("notion:open-external", () => notionView.openExternal());
  ipcMain.handle("twitter:show", () => {
    if (restoreNormalWindowState()) moveOverlayToCursorDisplay();
    mailView.hide();
    notionView.hide();
    hideAiViews();
    return twitterView.show();
  });
  ipcMain.handle("twitter:hide", () => twitterView.hide());
  ipcMain.handle("twitter:reload", () => twitterView.reload());
  ipcMain.handle("twitter:open-external", () => twitterView.openExternal());
  for (const [id, view] of Object.entries(aiViews)) {
    ipcMain.handle(`ai:${id}:show`, () => {
      if (restoreNormalWindowState()) moveOverlayToCursorDisplay();
      mailView.hide(); notionView.hide(); twitterView.hide(); hideAiViews(id);
      return view.show();
    });
    ipcMain.handle(`ai:${id}:hide`, () => view.hide());
    ipcMain.handle(`ai:${id}:reload`, () => view.reload());
    ipcMain.handle(`ai:${id}:open-external`, () => view.openExternal());
  }
  ipcMain.handle("compressor:status", compressorStatus);
  ipcMain.handle("compressor:start", startCompressor);
  ipcMain.handle("compressor:compress", async (_event, text, rate) => {
    const response = await fetch(`${COMPRESSOR_URL}/compress`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: z.string().min(1).max(2_000_000).parse(text), rate: z.number().min(.1).max(1).parse(rate) }), signal: AbortSignal.timeout(90000) });
    const raw = await response.text(); let result;
    try { result = JSON.parse(raw); } catch { throw new Error("The local compressor returned an invalid response."); }
    if (!response.ok) throw new Error(result.error || "Compression failed.");
    if (!result || typeof result.compressed_prompt !== "string") throw new Error("The local compressor returned no compressed text.");
    return result;
  });
  ipcMain.handle("window:hide", hideOverlay);
  ipcMain.handle("window:new-note", () => showOverlay(true));
});
app.on("before-quit", (event) => {
  app.isQuitting = true;
  persistWindowBounds();
  if (!quitFlushed && overlay && !overlay.isDestroyed()) {
    event.preventDefault();
    overlay.webContents.send("overlay:flush-editor");
    quitFlushed = true;
    setTimeout(async () => {
      try { await Promise.race([githubSync?.sync({ automatic: true, force: true }), wait(4_000)]); }
      catch (error) { console.error(`Notebook final cloud sync failed: ${error.message}`); }
      app.quit();
    }, 400);
  }
});
app.on("will-quit", () => { clearTimeout(cloudSyncTimer); botMonitor?.stop(); botProcesses?.stopAll(); hotkeys?.stop(); mailHotkeys?.stop(); notionHotkeys?.stop(); twitterHotkeys?.stop(); mailView?.destroy(); notionView?.destroy(); twitterView?.destroy(); destroyAiViews(); });
app.on("window-all-closed", () => {});
app.on("activate", () => showOverlay(false));
