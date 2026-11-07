import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const packagedPath = process.env.NOTEBOOK_TEST_EXECUTABLE || "";
const electronPath = packagedPath || require("electron");
const userData = await fs.mkdtemp(path.join(os.tmpdir(), "notebook-hotkey-"));
const accelerator = "Control+Alt+Shift+F10";
let application;

function pressShortcut() {
  execFileSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    "$keys = New-Object -ComObject WScript.Shell; $keys.SendKeys('^%+{F10}')",
  ], { windowsHide: true });
}

async function windowState() {
  const state = await application.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find((window) => window.getTitle() === "Notebook");
    return JSON.stringify({ visible: main?.isVisible() || false, focused: main?.isFocused() || false });
  });
  return JSON.parse(state);
}

async function waitForState(expected) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await windowState();
    if (state.visible === expected.visible && state.focused === expected.focused) return state;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Window did not reach ${JSON.stringify(expected)}; got ${JSON.stringify(await windowState())}`);
}

try {
  application = await electron.launch({
    executablePath: electronPath,
    args: [`--user-data-dir=${userData}`, ...(packagedPath ? [] : ["."])],
    env: { ...process.env, NOTEBOOK_TEST_ISOLATED: "1", NOTEBOOK_DISABLE_STARTUP_REGISTRATION: "1" },
  });
  const mainPage = await application.firstWindow();
  await mainPage.getByText("Notebook", { exact: true }).waitFor();
  const voiceRegistered = await application.evaluate(({ globalShortcut }) => globalShortcut.isRegistered("Control+Alt+Shift+F11"));
  if (!voiceRegistered) throw new Error("The quick voice-log shortcut was not registered.");
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await mainPage.bringToFront();
  await mainPage.evaluate((hotkey) => window.hushnote.settings.set({ hotkey }), accelerator);
  const registered = await application.evaluate(({ globalShortcut }, hotkey) => globalShortcut.isRegistered(hotkey), accelerator);
  if (!registered) throw new Error(`${accelerator} was not registered.`);

  const sinkCreated = application.waitForEvent("window");
  await application.evaluate(({ BrowserWindow }) => {
    const sink = new BrowserWindow({ width: 260, height: 160, x: 20, y: 20, title: "Hotkey focus sink", alwaysOnTop: true });
    sink.setAlwaysOnTop(true, "screen-saver", 1);
    sink.loadURL("data:text/html,<title>Hotkey focus sink</title><body>Shortcut test</body>");
  });
  const sinkPage = await sinkCreated;
  await sinkPage.waitForLoadState();
  await application.evaluate(({ BrowserWindow }) => {
    const notebook = BrowserWindow.getAllWindows().find((window) => window.getTitle() !== "Hotkey focus sink");
    notebook?.setAlwaysOnTop(false);
    const sink = BrowserWindow.getAllWindows().find((window) => window.getTitle() === "Hotkey focus sink");
    sink?.show();
    sink?.focus();
  });
  await sinkPage.bringToFront();
  await waitForState({ visible: true, focused: false });

  pressShortcut();
  await waitForState({ visible: true, focused: true });

  pressShortcut();
  await waitForState({ visible: false, focused: false });

  await application.evaluate(({ BrowserWindow }) => {
    const notebook = BrowserWindow.getAllWindows().find((window) => window.getTitle() === "Notebook");
    notebook?.setAlwaysOnTop(false);
    const sink = BrowserWindow.getAllWindows().find((window) => window.getTitle() === "Hotkey focus sink");
    sink?.show();
    sink?.focus();
  });
  await sinkPage.bringToFront();
  pressShortcut();
  await waitForState({ visible: true, focused: true });
  console.log("Global shortcut brings a visible background Notebook forward, hides a focused Notebook, and restores a hidden Notebook.");
} finally {
  if (application) {
    await application.evaluate(({ app, BrowserWindow }) => {
      app.isQuitting = true;
      for (const window of BrowserWindow.getAllWindows()) window.destroy();
      app.quit();
    }).catch(() => {});
    await application.close().catch(() => {});
  }
  await fs.rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
