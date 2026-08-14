const { app, BrowserWindow, WebContentsView, Tray, Menu, globalShortcut, ipcMain, dialog, nativeImage, screen, clipboard, powerMonitor, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { z } = require("zod");
const { createStorage } = require("./storage.cjs");
const { validBounds, boundsForDisplay } = require("./window-bounds.cjs");
const { createHotkeyManager } = require("./hotkey-manager.cjs");
const { DEFAULT_MAIL_URL, createMailViewController } = require("./mail-view.cjs");
const { syncStartAtLogin } = require("./startup.cjs");

const DEFAULT_SETTINGS = { hotkey: "Control+Alt+Shift+N", startAtLogin: true, compressorDir: "C:\\Code\\llmlingua-local" };
const FALLBACK_HOTKEYS = ["Control+Alt+N"];
const MAIL_HOTKEY = "Control+Alt+Shift+M";
const RETIRED_HOTKEYS = new Set(["Control+Shift+Space", "Control+Alt+N", "F8"]);
const COMPRESSOR_URL = process.env.NOTEBOOK_COMPRESSOR_URL || "http://127.0.0.1:8787";
const noteInput = z.object({ title: z.string().max(240).optional(), body: z.string().max(2_000_000).optional(), folderId: z.string().max(120).optional(), pinned: z.boolean().optional(), archived: z.boolean().optional() });
const skillInput = z.object({ name: z.string().max(240).optional(), category: z.string().max(80).optional(), body: z.string().max(2_000_000).optional() });
const slashCommandInput = z.object({ name: z.string().max(240).optional(), command: z.string().max(1_000).optional(), body: z.string().max(2_000_000).optional() });
const dailyTaskInput = z.object({ text: z.string().trim().min(1).max(500), bucket: z.enum(["today", "tomorrow"]), completed: z.boolean().optional() });
const dragNoteInput = z.object({ id: z.string().max(120).optional(), title: z.string().max(240).optional(), body: z.string().max(2_000_000).optional() });
const compressionInput = z.object({ noteId: z.string().nullable().optional(), sourceText: z.string().min(1).max(2_000_000), compressedText: z.string().min(1).max(2_000_000), preset: z.string().max(40), rate: z.number().min(0.1).max(1), originTokens: z.number().optional(), compressedTokens: z.number().optional(), ratio: z.string().optional() });
let overlay; let tray; let store; let boundsTimer; let hideTimer; let hotkeys; let mailHotkeys; let mailView; let quitFlushed = false;
const isPrimaryInstance = app.requestSingleInstanceLock();
const openedInBackground = process.argv.includes("--background");

function settings() { return { ...DEFAULT_SETTINGS, ...store.getSetting("app", {}) }; }
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
function restoreNormalWindowState() {
  if (!overlay || overlay.isDestroyed()) return false;
  let restored = false;
  if (overlay.isFullScreen()) { overlay.setFullScreen(false); restored = true; }
  if (overlay.isMaximized()) { overlay.unmaximize(); restored = true; }
  if (overlay.isMinimized()) { overlay.restore(); restored = true; }
  return restored;
}
function moveOverlayToCursorDisplay() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const saved = savedBoundsByDisplay()[display.id];
  overlay.setBounds(boundsForDisplay({ saved, fallback: savedWindowBounds() || overlay.getBounds(), workArea: display.workArea }));
}
function showOverlay(newNote = false) {
  if (!overlay || overlay.isDestroyed()) { createOverlay(true, newNote); return; }
  clearTimeout(hideTimer);
  restoreNormalWindowState();
  moveOverlayToCursorDisplay();
  overlay.show(); overlay.focus(); overlay.webContents.send("overlay:focus-editor"); overlay.webContents.send("overlay:shown");
  if (newNote) overlay.webContents.send("overlay:new-inbox");
}
function hideOverlay() {
  if (!overlay || overlay.isDestroyed()) return;
  overlay.webContents.send("overlay:flush-editor");
  overlay.webContents.send("overlay:hiding");
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { overlay?.hide(); overlay?.blur(); }, 130);
}
function toggleOverlay() { if (overlay?.isVisible()) hideOverlay(); else showOverlay(false); }
function toggleMailOverlay() {
  if (overlay?.isVisible() && mailView?.isActive()) { hideOverlay(); return; }
  showOverlay(false);
  const openMail = () => overlay?.webContents.send("overlay:open-mail");
  if (overlay?.webContents.isLoadingMainFrame()) overlay.webContents.once("did-finish-load", openMail);
  else openMail();
}
function readableHotkey(hotkey) { return hotkey ? hotkey.replaceAll("Control", "Ctrl").replaceAll("+", " + ") : "Unavailable"; }
function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Notebook: ${readableHotkey(hotkeys?.getActive())}`, enabled: false },
    { label: `Mail: ${readableHotkey(mailHotkeys?.getActive())}`, enabled: false },
    { type: "separator" },
    { label: "New Inbox note", click: () => showOverlay(true) },
    { label: "Show Notebook", click: () => showOverlay(false) },
    { label: "Open Gmail", click: toggleMailOverlay },
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
  overlay.on("resize", () => { scheduleBoundsSave(); mailView?.resize(); }); overlay.on("move", scheduleBoundsSave);
  overlay.on("close", (event) => { if (!app.isQuitting) { event.preventDefault(); hideOverlay(); } });
  overlay.on("closed", () => { mailView?.destroy(); mailView = null; overlay = null; });
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
app.on("second-instance", () => showOverlay(false));

app.whenReady().then(() => {
  if (!isPrimaryInstance) return;
  app.setAppUserModelId("com.notebook.local");
  app.on("web-contents-created", (_event, contents) => {
    contents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  });
  store = createStorage(app.getPath("userData"));
  try { store.ensureDailyBackup(); } catch (error) { console.error(`Notebook automatic backup failed: ${error.message}`); }
  const backupInterval = setInterval(() => { try { store.ensureDailyBackup(); } catch (error) { console.error(`Notebook automatic backup failed: ${error.message}`); } }, 6 * 60 * 60 * 1000);
  backupInterval.unref();
  const savedSettings = store.getSetting("app", {});
  if (!savedSettings.hotkey || RETIRED_HOTKEYS.has(savedSettings.hotkey)) store.setSetting("app", { ...savedSettings, hotkey: DEFAULT_SETTINGS.hotkey });
  createOverlay();
  mailView = createMailViewController({
    WebContentsView,
    parentWindow: overlay,
    shell,
    devTools: !app.isPackaged,
    mailUrl: !app.isPackaged && process.env.NOTEBOOK_MAIL_URL ? process.env.NOTEBOOK_MAIL_URL : DEFAULT_MAIL_URL,
    emitStatus: (status) => overlay?.webContents.send("mail:status", status),
  });
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
  createTray();
  const hotkeyRepairInterval = setInterval(() => { hotkeys.repair(); mailHotkeys.repair(); }, 15_000); hotkeyRepairInterval.unref();
  const repairAfterWake = () => setTimeout(() => { hotkeys?.repair(); mailHotkeys?.repair(); }, 1_000);
  powerMonitor.on("resume", repairAfterWake); powerMonitor.on("unlock-screen", repairAfterWake);
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
  ipcMain.handle("slash-commands:list", () => store.listSlashCommands());
  ipcMain.handle("slash-commands:create", (_event, input) => store.createSlashCommand(slashCommandInput.partial().parse(input || {})));
  ipcMain.handle("slash-commands:update", (_event, id, input) => store.updateSlashCommand(z.string().parse(id), slashCommandInput.parse(input)));
  ipcMain.handle("slash-commands:remove", (_event, id) => store.deleteSlashCommand(z.string().parse(id)));
  ipcMain.handle("daily:get", () => store.dailyDashboard());
  ipcMain.handle("daily:create", (_event, input) => store.createDailyTask(dailyTaskInput.parse(input)));
  ipcMain.handle("daily:update", (_event, id, text) => store.updateDailyTask(z.string().parse(id), z.string().trim().min(1).max(500).parse(text)));
  ipcMain.handle("daily:complete", (_event, id, completed) => store.completeDailyTask(z.string().parse(id), z.boolean().parse(completed)));
  ipcMain.handle("daily:remove", (_event, id) => store.deleteDailyTask(z.string().parse(id)));
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
    const patch = z.object({ hotkey: z.string().min(3).max(80).optional(), startAtLogin: z.boolean().optional(), compressorDir: z.string().min(3).max(400).optional() }).parse(input);
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
  ipcMain.handle("mail:show", () => {
    if (restoreNormalWindowState()) moveOverlayToCursorDisplay();
    return mailView.show();
  });
  ipcMain.handle("mail:hide", () => mailView.hide());
  ipcMain.handle("mail:reload", () => mailView.reload());
  ipcMain.handle("mail:open-external", () => mailView.openExternal());
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
    setTimeout(() => app.quit(), 400);
  }
});
app.on("will-quit", () => { hotkeys?.stop(); mailHotkeys?.stop(); mailView?.destroy(); });
app.on("window-all-closed", () => {});
app.on("activate", () => showOverlay(false));
