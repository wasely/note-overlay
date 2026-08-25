import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const userData = await fs.mkdtemp(path.join(os.tmpdir(), "notebook-handy-voice-"));
let application;

function dateKey(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

try {
  application = await electron.launch({
    executablePath: electronPath,
    args: [`--user-data-dir=${userData}`, "."],
    env: { ...process.env, NOTEBOOK_TEST_ISOLATED: "1", NOTEBOOK_DISABLE_STARTUP_REGISTRATION: "1" },
  });
  const page = await application.firstWindow();
  await page.getByText("Notebook", { exact: true }).waitFor();
  const registered = await application.evaluate(({ globalShortcut }) => globalShortcut.isRegistered("Control+Alt+Shift+L"));
  if (!registered) throw new Error("Quick voice-log shortcut is not registered.");

  await application.evaluate(({ BrowserWindow }) => {
    const notebook = BrowserWindow.getAllWindows().find((window) => window.getTitle() === "Notebook");
    notebook.webContents.send("overlay:quick-voice-log", { id: "voice-app-test", phase: "recording" });
  });
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "What were you doing?");
  await application.evaluate(({ BrowserWindow }) => {
    const notebook = BrowserWindow.getAllWindows().find((window) => window.getTitle() === "Notebook");
    notebook.webContents.send("overlay:quick-voice-log", { id: "voice-app-test", phase: "transcribing" });
  });
  await page.getByText("Transcribing locally…", { exact: false }).waitFor();
  await page.getByLabel("What were you doing?").fill("Logged by Handy integration test");
  await page.getByLabel("Edit activity: Logged by Handy integration test").waitFor({ state: "attached" });
  const saved = await page.evaluate((date) => window.hushnote.daily.page(date), dateKey());
  if (!saved.activities.some((activity) => activity.text === "Logged by Handy integration test")) throw new Error("Voice transcript was not saved to the day log.");
  const hidden = await application.evaluate(({ BrowserWindow }) => !BrowserWindow.getAllWindows().find((window) => window.getTitle() === "Notebook")?.isVisible());
  if (!hidden) throw new Error("Notebook did not close after saving the voice log.");
  console.log("Handy voice shortcut is registered; transcript focus, auto-save, and auto-close passed in Electron.");
} finally {
  if (application) {
    await application.evaluate(({ app, BrowserWindow }) => { app.isQuitting = true; BrowserWindow.getAllWindows().forEach((window) => window.destroy()); app.quit(); }).catch(() => {});
    await application.close().catch(() => {});
  }
  await fs.rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
