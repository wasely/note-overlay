const { app, BrowserWindow, globalShortcut, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const COMPRESSOR_URL = "http://127.0.0.1:8787";
const COMPRESSOR_DIR = process.env.LOCAL_COMPRESSOR_DIR || "C:\\Code\\llmlingua-local";
let overlay;

function notesPath() {
  return path.join(app.getPath("userData"), "notes.json");
}

function readNotes() {
  try {
    const data = JSON.parse(fs.readFileSync(notesPath(), "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeNotes(notes) {
  fs.writeFileSync(notesPath(), JSON.stringify(notes, null, 2), "utf8");
  return notes;
}

function createOverlay() {
  overlay = new BrowserWindow({
    width: 880,
    height: 660,
    minWidth: 390,
    minHeight: 520,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#101827e8",
    alwaysOnTop: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  overlay.setAlwaysOnTop(true, "floating");
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.loadFile("index.html");
  overlay.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      overlay.hide();
    }
  });
}

function toggleOverlay() {
  if (!overlay) return;
  if (overlay.isVisible()) overlay.hide();
  else {
    overlay.show();
    overlay.focus();
  }
}

async function compressorStatus() {
  try {
    const response = await fetch(`${COMPRESSOR_URL}/health`, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function startCompressor() {
  if (await compressorStatus()) return { ready: true };
  const script = path.join(COMPRESSOR_DIR, "start.ps1");
  if (!fs.existsSync(script)) {
    return { ready: false, error: `Could not find ${script}` };
  }
  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
    { detached: true, windowsHide: true, stdio: "ignore" },
  );
  child.unref();

  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (await compressorStatus()) return { ready: true };
  }
  return { ready: false, error: "The local compressor did not start within 90 seconds." };
}

app.whenReady().then(() => {
  createOverlay();
  globalShortcut.register("Control+Shift+Space", toggleOverlay);

  ipcMain.handle("notes:list", () => readNotes());
  ipcMain.handle("notes:save", (_event, note) => {
    const notes = readNotes();
    const index = notes.findIndex((item) => item.id === note.id);
    const saved = { ...note, updatedAt: new Date().toISOString() };
    if (index === -1) notes.unshift(saved);
    else notes[index] = saved;
    return writeNotes(notes);
  });
  ipcMain.handle("notes:delete", (_event, id) => writeNotes(readNotes().filter((note) => note.id !== id)));
  ipcMain.handle("overlay:hide", () => overlay?.hide());
  ipcMain.handle("compressor:status", compressorStatus);
  ipcMain.handle("compressor:start", startCompressor);
  ipcMain.handle("compressor:compress", async (_event, text, rate) => {
    const response = await fetch(`${COMPRESSOR_URL}/compress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, rate }),
      signal: AbortSignal.timeout(60000),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Compression failed.");
    return payload;
  });
});

app.on("before-quit", () => { app.isQuitting = true; });
app.on("window-all-closed", () => {});
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("activate", () => toggleOverlay());
