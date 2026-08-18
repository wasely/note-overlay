import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Full smoke test against the real Electron app and its SQLite storage.
const require = createRequire(import.meta.url);
const electronPath = require("electron");
const { boundsForDisplay } = require("../src/main/window-bounds.cjs");
const packageJson = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));
const userData = await fs.mkdtemp(path.join(os.tmpdir(), "notebook-test-"));
const packagedExecutable = process.env.NOTEBOOK_EXECUTABLE;
const app = await electron.launch({
  executablePath: packagedExecutable || electronPath,
  args: packagedExecutable ? [`--user-data-dir=${userData}`] : [".", `--user-data-dir=${userData}`],
  env: { ...process.env, NOTEBOOK_DISABLE_STARTUP_REGISTRATION: "1" },
});
const navButton = (page, view) => page.locator(".nav button").filter({ hasText: view }).first();

try {
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await page.bringToFront();
  await page.getByText("Notebook", { exact: true }).waitFor();

  // Window drag regions: the title strip drags the window, controls do not.
  await navButton(page, "Notes").click();
  const dragRegions = await page.evaluate(() => ({
    file: getComputedStyle(document.querySelector(".drag-action")).getPropertyValue("-webkit-app-region"),
    bar: getComputedStyle(document.querySelector(".editor-bar")).getPropertyValue("-webkit-app-region"),
  }));
  if (dragRegions.file !== "no-drag" || dragRegions.bar !== "drag") throw new Error(`Window drag regions are wrong: ${JSON.stringify(dragRegions)}`);

  // An oversized window is pulled back into the work area on the next show.
  const workArea = await app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const area = screen.getDisplayMatching(window.getBounds()).workArea;
    window.setBounds({ x: area.x + 16, y: area.y + 16, width: Math.max(1200, area.width - 32), height: Math.max(900, area.height - 32) });
    return area;
  });
  await page.waitForTimeout(450);
  const closingState = await page.evaluate(async () => {
    await window.hushnote.window.hide();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const closing = document.querySelector(".window-surface").classList.contains("is-closing");
    await window.hushnote.window.newNote();
    return closing;
  });
  if (!closingState) throw new Error("Overlay hide animation state was not applied.");
  await page.waitForTimeout(300);
  const repairedBounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  const expectedBounds = boundsForDisplay({ saved: { x: workArea.x + 16, y: workArea.y + 16, width: Math.max(1200, workArea.width - 32), height: Math.max(900, workArea.height - 32) }, fallback: {}, workArea });
  if (JSON.stringify(repairedBounds) !== JSON.stringify(expectedBounds)) throw new Error(`Oversized window was not reset and centered: ${JSON.stringify(repairedBounds)}`);

  const overflow = await page.evaluate(() => ({ viewportWidth: innerWidth, viewportHeight: innerHeight, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight }));
  if (overflow.documentWidth > overflow.viewportWidth || overflow.documentHeight > overflow.viewportHeight) throw new Error(`Window content overflows: ${JSON.stringify(overflow)}`);

  const hotkeyRegistered = await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered("Control+Alt+Shift+N"));
  if (!hotkeyRegistered) console.log("Global hotkey is already owned by another running Notebook instance.");
  // The workspaces removed in 0.9.0 were deliberately brought back; assert the bridge
  // still exposes every surface the renderer actually renders.
  const missingChannels = await page.evaluate(() => ["notes", "projects", "skills", "slashCommands", "daily"].filter((key) => !window.hushnote[key]));
  if (missingChannels.length) throw new Error(`Preload bridge is missing: ${missingChannels.join(", ")}`);
  const logoBridge = await page.evaluate(() => typeof window.hushnote.projects.logo === "function");
  if (!logoBridge) throw new Error("Project logo bridge is missing from the preload API.");

  // Notebooks and notes.
  const folders = await page.evaluate(() => window.hushnote.folders.list());
  if (!folders.some((folder) => folder.name === "Inbox")) throw new Error("Inbox folder missing.");
  await navButton(page, "Notes").click();
  await page.getByRole("button", { name: "New notebook" }).click();
  await page.getByLabel("Notebook name").fill("To-do");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.waitForFunction(() => [...document.querySelector('[aria-label="Current notebook"]').options].some((option) => option.textContent.includes("To-do")));
  await page.getByLabel("Note title").fill("Overlay smoke test");
  await page.getByLabel("Note content").fill("This note proves local autosave works.\n\n- [ ] Verify checklist");
  await page.waitForTimeout(900);
  await page.getByText("Saved", { exact: true }).waitFor();

  // Drag-out filename copy.
  await page.getByRole("button", { name: /Drag \.md/ }).click();
  await page.getByText("Filename copied", { exact: true }).waitFor();

  // Markdown preview writes checkbox state back into the stored note.
  await page.getByRole("button", { name: "Preview" }).click();
  await page.getByRole("checkbox", { name: "Verify checklist" }).check();
  await page.waitForTimeout(600);
  const savedTaskBody = await page.evaluate(async () => (await window.hushnote.notes.list()).find((note) => note.title === "Overlay smoke test")?.body);
  if (!savedTaskBody?.includes("- [x] Verify checklist")) throw new Error("Interactive Markdown checklist did not save.");
  await page.getByRole("button", { name: "Edit" }).click();

  // Pinning persists through storage.
  await page.getByRole("button", { name: "Pin note" }).click();
  await page.waitForTimeout(500);
  const pinned = await page.evaluate(async () => (await window.hushnote.notes.list())[0]);
  if (!pinned?.pinned || pinned.title !== "Overlay smoke test") throw new Error(`Pinned note did not persist or sort first: ${JSON.stringify(pinned)}`);

  // Today plan.
  await navButton(page, "Today").click();
  await page.getByRole("textbox", { name: "Today task", exact: true }).fill("Ship the daily flow");
  await page.getByLabel("New task owner").selectOption("agent");
  await page.getByRole("button", { name: "Add today task" }).click();
  await page.getByLabel("Complete Ship the daily flow").click();
  await page.getByRole("textbox", { name: "Tomorrow task", exact: true }).fill("Review the next priority");
  await page.getByRole("button", { name: "Add tomorrow task" }).click();
  await page.waitForTimeout(400);
  const daily = await page.evaluate(() => window.hushnote.daily.get());
  if (!daily.done.some((task) => task.text === "Ship the daily flow" && task.owner === "agent" && task.priority === 1) || !daily.tomorrow.some((task) => task.text === "Review the next priority")) throw new Error("Today priority/owner/done/tomorrow workflow did not save.");

  // Copy the open note through the clipboard bridge.
  await navButton(page, "Notes").click();
  await page.getByRole("button", { name: "More note actions" }).click();
  await page.getByRole("button", { name: "Copy Markdown", exact: true }).click();
  await page.getByText("Copied", { exact: true }).waitFor();

  // Skills.
  await navButton(page, "Skills").click();
  await page.getByRole("button", { name: "New skill" }).first().click();
  await page.getByLabel("Skill name").fill("Terminal helper");
  await page.getByLabel("Skill category").fill("Automation");
  await page.getByLabel("Skill notes").fill("Run this command safely.");
  await page.waitForTimeout(900);
  await page.getByText("Saved", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await page.getByText("Copied", { exact: true }).waitFor();

  // Search reaches skills, notes, and tasks.
  await page.getByLabel("Search everything").fill("Terminal");
  await page.locator(".results").getByText("Terminal helper", { exact: true }).waitFor();
  await page.getByLabel("Search everything").fill("Ship the daily");
  await page.locator(".results").getByText("Ship the daily flow", { exact: true }).waitFor();
  await page.getByLabel("Search everything").fill("");

  // Commands, including the seeded starter pages.
  await navButton(page, "Commands").click();
  await page.getByText("Git push", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "New command" }).first().click();
  await page.getByLabel("Slash command name").fill("Deploy preview");
  await page.getByLabel("Slash command invocation").fill("/prompts:deploy-preview");
  await page.getByLabel("Slash command notes").fill("Publish the current preview without extra checks.");
  await page.waitForTimeout(900);
  await page.getByText("Saved", { exact: true }).waitFor();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Deploy preview" }).first().click();
  await page.waitForTimeout(400);
  const commandsLeft = await page.evaluate(() => window.hushnote.slashCommands.list());
  if (commandsLeft.some((item) => item.name === "Deploy preview")) throw new Error("Deleting a slash command did not persist.");

  // Settings: theme, version, and a real backup.
  await page.getByRole("button", { name: "Settings and backups" }).click();
  await page.getByText(`Notebook v${packageJson.version} · local-first`, { exact: true }).waitFor();
  await page.getByRole("button", { name: "Dark" }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  const storedTheme = await page.evaluate(() => window.hushnote.settings.get());
  if (storedTheme.theme !== "dark") throw new Error(`Theme choice did not persist: ${JSON.stringify(storedTheme)}`);
  await page.getByRole("button", { name: "System" }).click();
  await page.getByRole("button", { name: "Back up now" }).click();
  await page.getByText("Backup created.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Close settings" }).click();

  // Drag-out file contents.
  const draggedFile = await page.evaluate(() => window.hushnote.notes.dragFile({ id: "terminal-drop", title: "terminal drop", body: "echo hello\n\n- [ ] verify it" }));
  if (!draggedFile.endsWith("terminal drop.md") || !draggedFile.includes("Markdown Notes")) throw new Error(`Drag-out Markdown path is wrong: ${draggedFile}`);
  const draggedMarkdown = await fs.readFile(draggedFile, "utf8");
  if (draggedMarkdown !== "# terminal drop\n\necho hello\n\n- [ ] verify it\n") throw new Error(`Drag-out Markdown content was incomplete: ${JSON.stringify(draggedMarkdown)}`);
  const cleanDragAvailable = await page.evaluate(() => typeof window.hushnote.notes.dragCleanName === "function");
  if (!cleanDragAvailable) throw new Error("Windows clean filename drag bridge is unavailable.");

  console.log("Electron smoke test passed: notes, notebooks, Markdown preview write-back, pinning, Today, skills, commands, search, theme, backups, and drag-out.");
} finally {
  await app.evaluate(({ app }) => app.quit()).catch(() => {});
  await app.close().catch(() => {});
  await fs.rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
