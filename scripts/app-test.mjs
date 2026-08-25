import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
import { createServer } from "node:http";
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
const aiServer = createServer((request, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(`<!doctype html><title>${request.url}</title><main>${request.url}</main>`);
});
await new Promise((resolve) => aiServer.listen(0, "127.0.0.1", resolve));
const aiBase = `http://127.0.0.1:${aiServer.address().port}`;
const app = await electron.launch({
  executablePath: packagedExecutable || electronPath,
  args: [`--user-data-dir=${userData}`, ...(packagedExecutable ? [] : ["."])],
  env: {
    ...process.env,
    NOTEBOOK_TEST_ISOLATED: "1",
    NOTEBOOK_DISABLE_STARTUP_REGISTRATION: "1",
    NOTEBOOK_MAIL_URL: `${aiBase}/mail`,
    NOTEBOOK_NOTION_URL: `${aiBase}/notion`,
    NOTEBOOK_TWITTER_URL: `${aiBase}/twitter`,
    NOTEBOOK_EXCALIDRAW_URL: `${aiBase}/excalidraw`,
    NOTEBOOK_AI_CHATGPT_URL: `${aiBase}/chatgpt`,
    NOTEBOOK_AI_GEMINI_URL: `${aiBase}/gemini`,
    NOTEBOOK_AI_DEEPSEEK_URL: `${aiBase}/deepseek`,
  },
});
const navButton = (page, view) => page.locator(".nav button").filter({ hasText: view }).first();

try {
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await page.bringToFront();
  await page.getByText("Notebook", { exact: true }).waitFor();

  // Window drag regions: the title strip drags the window, controls do not.
  await navButton(page, "Notes").click();
  await page.getByRole("button", { name: "New note" }).first().click();
  await page.locator(".drag-action").waitFor();
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
  // Assert the bridge still exposes every local workspace the renderer actually renders.
  const missingChannels = await page.evaluate(() => ["notes", "projects", "skills", "slashCommands", "daily"].filter((key) => !window.hushnote[key]));
  if (missingChannels.length) throw new Error(`Preload bridge is missing: ${missingChannels.join(", ")}`);
  const logoBridge = await page.evaluate(() => typeof window.hushnote.projects.logo === "function");
  if (!logoBridge) throw new Error("Project logo bridge is missing from the preload API.");
  const cloudBridge = await page.evaluate(() => ({ sync: typeof window.hushnote.githubSync?.sync, updated: typeof window.hushnote.githubSync?.onUpdated }));
  if (cloudBridge.sync !== "function" || cloudBridge.updated !== "function") throw new Error(`Cloud sync preload shape is wrong: ${JSON.stringify(cloudBridge)}`);
  const serviceBridge = await page.evaluate(() => ({
    hasMcp: "mcpServers" in window.hushnote,
    apps: ["mail", "notion", "twitter", "excalidraw"].filter((id) => typeof window.hushnote[id]?.show !== "function"),
    ai: ["chatgpt", "gemini", "deepseek"].filter((id) => typeof window.hushnote.ai?.[id]?.show !== "function"),
  }));
  if (serviceBridge.hasMcp || serviceBridge.apps.length || serviceBridge.ai.length) throw new Error(`App/AI preload shape is wrong: ${JSON.stringify(serviceBridge)}`);

  // Every app is already loading while detached, then attaches on first click.
  await page.waitForTimeout(600);
  const warmedApps = await app.evaluate(({ webContents }, urls) => {
    const loaded = new Set(webContents.getAllWebContents().map((contents) => contents.getURL()));
    return urls.filter((url) => !loaded.has(url));
  }, ["mail", "notion", "twitter", "excalidraw"].map((id) => `${aiBase}/${id}`));
  if (warmedApps.length) throw new Error(`App views were not preloaded: ${warmedApps.join(", ")}`);
  for (const [label, id] of [["Gmail", "mail"], ["Notion", "notion"], ["Twitter", "twitter"], ["Excalidraw", "excalidraw"]]) {
    await navButton(page, label).click();
    await page.getByRole("group", { name: "Switch app" }).waitFor();
    const attached = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.length);
    if (attached !== 1) throw new Error(`${label} did not attach instantly.`);
    const loaded = await app.evaluate(({ webContents }, url) => webContents.getAllWebContents().some((contents) => contents.getURL() === url), `${aiBase}/${id}`);
    if (!loaded) throw new Error(`${label} did not load in its embedded view.`);
    await page.getByRole("button", { name: "Notebook", exact: true }).click();
    await page.locator(".notebook").waitFor();
  }

  // Quick AI panel and native embedded-view switching.
  await page.getByRole("button", { name: "Open ChatGPT" }).click();
  await page.getByRole("group", { name: "Switch AI" }).waitFor();
  for (const id of ["chatgpt", "gemini", "deepseek"]) {
    if (id !== "chatgpt") await page.getByRole("group", { name: "Switch AI" }).getByRole("button", { name: new RegExp(id, "i") }).click();
    await page.waitForTimeout(200);
    const loaded = await app.evaluate(({ webContents }, url) => webContents.getAllWebContents().some((contents) => contents.getURL() === url), `${aiBase}/${id}`);
    if (!loaded) throw new Error(`${id} did not load in its embedded view.`);
  }
  await page.getByRole("button", { name: "Notebook", exact: true }).click();
  await page.locator(".notebook").waitFor();
  const attachedAiViews = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.length);
  if (attachedAiViews) throw new Error(`${attachedAiViews} AI view(s) stayed attached after returning to Notebook.`);

  // Notebooks and notes.
  const folders = await page.evaluate(() => window.hushnote.folders.list());
  if (!folders.some((folder) => folder.name === "Inbox")) throw new Error("Inbox folder missing.");
  await navButton(page, "Notes").click();
  await page.getByRole("button", { name: "New notebook" }).click();
  await page.getByLabel("Notebook name").fill("To-do");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.waitForFunction(() => [...document.querySelector('[aria-label="Current notebook"]').options].some((option) => option.textContent.includes("To-do")));
  await page.getByLabel("Note title").fill("Overlay smoke test");
  const noteEditor = page.locator(".note-editor .ProseMirror");
  await noteEditor.click();
  await page.keyboard.type("This note proves local autosave works.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- [ ] Verify checklist");
  await page.waitForTimeout(900);
  await page.getByText("Saved", { exact: true }).waitFor();

  // Drag-out filename copy.
  await page.locator(".drag-action").click();
  await page.getByText("Filename copied", { exact: true }).waitFor();

  // Markdown preview writes checkbox state back into the stored note.
  await page.getByRole("button", { name: "Preview" }).click();
  await page.getByRole("checkbox", { name: "Verify checklist" }).check();
  let savedTaskBody = "";
  for (let attempt = 0; attempt < 100; attempt += 1) {
    savedTaskBody = await page.evaluate(async () => (await window.hushnote.notes.list()).find((note) => note.title === "Overlay smoke test")?.body || "");
    if (savedTaskBody.includes("- [x] Verify checklist")) break;
    await page.waitForTimeout(100);
  }
  if (!savedTaskBody?.includes("- [x] Verify checklist")) throw new Error("Interactive Markdown checklist did not save.");
  await page.getByRole("button", { name: "Edit" }).evaluate((button) => button.click());

  // Pinning persists through storage.
  await page.getByRole("button", { name: "Pin note" }).click();
  await page.waitForTimeout(500);
  const pinned = await page.evaluate(async () => (await window.hushnote.notes.list())[0]);
  if (!pinned?.pinned || pinned.title !== "Overlay smoke test") throw new Error(`Pinned note did not persist or sort first: ${JSON.stringify(pinned)}`);

  // Today plan.
  await navButton(page, "Today").click();
  await page.getByLabel("What were you doing?").fill("Verified the daily log");
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await page.getByLabel("Edit activity: Verified the daily log").waitFor();
  await page.getByRole("tab", { name: /Tasks/ }).click();
  await page.getByLabel(/^Task for /).first().fill("Ship the daily flow");
  await page.locator(".line-add button").first().click();
  await page.getByLabel("Check off Ship the daily flow").click();
  await page.getByLabel(/^Task for /).nth(1).fill("Review the next priority");
  await page.locator(".line-add button").nth(1).click();
  await page.waitForTimeout(400);
  const daily = await page.evaluate(() => window.hushnote.daily.get());
  if (!daily.done.some((task) => task.text === "Ship the daily flow") || !daily.tomorrow.some((task) => task.text === "Review the next priority")) throw new Error("Today done/tomorrow workflow did not save.");
  if (!daily.activities.some((activity) => activity.text === "Verified the daily log")) throw new Error("Today activity log did not save.");

  // Copy the open note through the clipboard bridge.
  await navButton(page, "Notes").click();
  await page.getByRole("button", { name: "More note actions" }).click();
  await page.getByRole("button", { name: "Copy Markdown", exact: true }).click();
  await page.getByText("Copied", { exact: true }).waitFor();

  // Skills.
  await navButton(page, "Skills").click();
  await page.getByRole("heading", { name: "My skills", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Other skills", exact: true }).waitFor();
  const ownedSkills = await page.evaluate(async () => (await window.hushnote.skills.list()).filter((item) => item.ownership === "mine"));
  if (ownedSkills.length !== 20) throw new Error(`Expected 20 blixvip skills, found ${ownedSkills.length}.`);
  await page.locator(".skills-card li button").first().click();
  await page.getByRole("heading", { name: "1", exact: true }).waitFor();
  await page.getByRole("button", { name: "View source on GitHub", exact: true }).waitFor();
  await page.getByText("My skill", { exact: true }).waitFor();
  await page.getByRole("button", { name: "New skill" }).first().click();
  await page.getByLabel("Skill name").fill("Terminal helper");
  await page.getByLabel("Skill category").fill("Automation");
  await page.getByLabel("Skill source link").fill("https://github.com/blixvip/skills");
  await page.getByLabel("Skill instructions").fill("Run this command safely.");
  await page.getByLabel("Skill instructions").press("Tab");
  await page.waitForFunction(async () => (await window.hushnote.skills.list()).some((item) => item.name === "Terminal helper" && item.category === "Automation" && item.source_url === "https://github.com/blixvip/skills" && item.ownership === "mine" && item.body === "Run this command safely."));
  await page.getByRole("button", { name: "Copy skill", exact: true }).click();
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
  await page.getByRole("button", { name: "Delete Deploy preview" }).first().evaluate((button) => button.click());
  await page.waitForTimeout(400);
  const commandsLeft = await page.evaluate(() => window.hushnote.slashCommands.list());
  if (commandsLeft.some((item) => item.name === "Deploy preview")) throw new Error("Deleting a slash command did not persist.");

  // Settings: theme, version, and a real backup.
  await page.getByRole("button", { name: "Settings and backups" }).click();
  await page.getByText(`Notebook v${packageJson.version} · local-first`, { exact: true }).waitFor();
  await page.getByText("Blixvip cloud sync", { exact: true }).waitFor();
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
  await new Promise((resolve) => aiServer.close(resolve));
  await fs.rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
