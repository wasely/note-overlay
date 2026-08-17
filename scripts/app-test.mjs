import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const { boundsForDisplay } = require("../src/main/window-bounds.cjs");
const packageJson = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));
const userData = await fs.mkdtemp(path.join(os.tmpdir(), "notebook-test-"));
const projectRoot = path.join(userData, "project repo");
await fs.mkdir(projectRoot, { recursive: true });
await fs.writeFile(path.join(projectRoot, "package.json"), JSON.stringify({ name: "electron-project", description: "Real Electron project test." }));
await fs.writeFile(path.join(projectRoot, "app.js"), "export const ready = false;\n");
const projectGit = (...args) => execFileSync("git.exe", args, { cwd: projectRoot, windowsHide: true, encoding: "utf8" });
projectGit("init"); projectGit("config", "user.name", "Notebook Test"); projectGit("config", "user.email", "notebook@example.test"); projectGit("add", "."); projectGit("commit", "-m", "Initial project");
await fs.writeFile(path.join(projectRoot, "app.js"), "export const ready = true;\n");
const server = http.createServer((request, response) => {
  if (request.url === "/health") { response.writeHead(200).end("ok"); return; }
  if (request.url === "/compress") { response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ compressed_prompt: "Compressed test note.", origin_tokens: 8, compressed_tokens: 3, ratio: "2.7x" })); return; }
  if (request.url === "/mail") { response.writeHead(200, { "Content-Type": "text/html" }).end("<!doctype html><html><body><h1>Gmail test inbox</h1></body></html>"); return; }
  if (request.url === "/notion") { response.writeHead(200, { "Content-Type": "text/html" }).end("<!doctype html><html><body><h1>Notion test workspace</h1></body></html>"); return; }
  response.writeHead(404).end();
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const packagedExecutable = process.env.NOTEBOOK_EXECUTABLE;
const app = await electron.launch({ executablePath: packagedExecutable || electronPath, args: packagedExecutable ? [`--user-data-dir=${userData}`] : [".", `--user-data-dir=${userData}`], env: { ...process.env, NOTEBOOK_COMPRESSOR_URL: `http://127.0.0.1:${port}`, NOTEBOOK_MAIL_URL: `http://127.0.0.1:${port}/mail`, NOTEBOOK_NOTION_URL: `http://127.0.0.1:${port}/notion`, NOTEBOOK_DISABLE_STARTUP_REGISTRATION: "1" } });

try {
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await page.bringToFront();
  await page.getByText("Notebook", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Backups and settings" }).click();
  await page.getByText(`Notebook v${packageJson.version} · local only`, { exact: true }).waitFor();
  await page.getByRole("button", { name: "Close backups" }).click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  const dragRegions = await page.evaluate(() => ({
    file: getComputedStyle(document.querySelector(".drag-action")).getPropertyValue("-webkit-app-region"),
    header: getComputedStyle(document.querySelector(".editor-bar")).getPropertyValue("-webkit-app-region"),
    window: getComputedStyle(document.querySelector(".editor-context")).getPropertyValue("-webkit-app-region"),
  }));
  if (dragRegions.file !== "no-drag" || dragRegions.header === "drag" || dragRegions.window !== "drag") throw new Error(`File/window drag regions overlap: ${JSON.stringify(dragRegions)}`);
  const workArea = await app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const area = screen.getDisplayMatching(window.getBounds()).workArea;
    window.setBounds({ x: area.x + 16, y: area.y + 16, width: Math.max(1200, area.width - 32), height: Math.max(900, area.height - 32) });
    return area;
  });
  await page.waitForTimeout(450);
  const motionState = await page.evaluate(async () => {
    await window.hushnote.window.hide();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const closing = document.querySelector(".window-surface").classList.contains("is-closing");
    await window.hushnote.window.newNote();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const opening = document.querySelector(".window-surface").classList.contains("is-opening");
    return { closing, opening };
  });
  if (!motionState.closing || !motionState.opening) throw new Error(`Overlay motion states missing: ${JSON.stringify(motionState)}`);
  await page.waitForTimeout(250);
  const repairedBounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  const expectedBounds = boundsForDisplay({ saved: { x: workArea.x + 16, y: workArea.y + 16, width: Math.max(1200, workArea.width - 32), height: Math.max(900, workArea.height - 32) }, fallback: {}, workArea });
  if (JSON.stringify(repairedBounds) !== JSON.stringify(expectedBounds)) throw new Error(`Oversized window was not reset and centered: ${JSON.stringify(repairedBounds)}`);
  const overflow = await page.evaluate(() => ({ viewportWidth: innerWidth, viewportHeight: innerHeight, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight, bodyWidth: document.body.scrollWidth, bodyHeight: document.body.scrollHeight }));
  if (overflow.documentWidth > overflow.viewportWidth || overflow.documentHeight > overflow.viewportHeight || overflow.bodyWidth > overflow.viewportWidth || overflow.bodyHeight > overflow.viewportHeight) throw new Error(`Window content overflows: ${JSON.stringify(overflow)}`);
  const hotkeyRegistered = await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered("Control+Alt+Shift+N"));
  if (!hotkeyRegistered) console.log("Global hotkey is already owned by the running Notebook instance.");
  const mailHotkeyRegistered = await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered("Control+Alt+Shift+M"));
  if (!mailHotkeyRegistered) console.log("Global mail hotkey is already owned by another application.");
  const notionHotkeyRegistered = await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered("Control+Alt+Shift+O"));
  if (!notionHotkeyRegistered) console.log("Global Notion hotkey is already owned by another application.");
  const folders = await page.evaluate(async () => window.hushnote.folders.list());
  if (!folders.some((folder) => folder.name === "Inbox")) throw new Error("Inbox folder missing.");
  await page.getByRole("button", { name: "New notebook" }).click();
  await page.getByLabel("Notebook name").fill("To-do");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.waitForFunction(() => [...document.querySelector('[aria-label="Current notebook"]').options].some((option) => option.textContent.includes("To-do")));
  await page.getByLabel("Note title").fill("Overlay smoke test");
  await page.getByLabel("Note content").fill("This note proves local autosave works.\n\n- [ ] Verify checklist");
  await page.waitForTimeout(900);
  await page.getByText("Saved", { exact: true }).waitFor();
  await page.getByRole("button", { name: /Drag \.md/ }).click();
  await page.getByText("Filename copied", { exact: true }).waitFor();
  await page.getByRole("button", { name: /Checklist/ }).click();
  await page.getByRole("checkbox", { name: "Verify checklist" }).check();
  await page.waitForTimeout(500);
  const savedTaskBody = await page.evaluate(async () => (await window.hushnote.notes.list()).find((note) => note.title === "Overlay smoke test")?.body);
  if (!savedTaskBody?.includes("- [x] Verify checklist")) throw new Error("Interactive Markdown checklist did not save.");
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.getByRole("textbox", { name: "Today task", exact: true }).fill("Ship the daily flow");
  await page.getByLabel("New task owner").selectOption("agent");
  await page.getByRole("button", { name: "Add today task" }).click();
  await page.getByLabel("Complete Ship the daily flow").click();
  await page.getByRole("textbox", { name: "Tomorrow task", exact: true }).fill("Review the next priority");
  await page.getByRole("button", { name: "Add tomorrow task" }).click();
  const daily = await page.evaluate(() => window.hushnote.daily.get());
  if (!daily.done.some((task) => task.text === "Ship the daily flow" && task.owner === "agent" && task.priority === 1) || !daily.tomorrow.some((task) => task.text === "Review the next priority")) throw new Error("Today priority/owner/done/tomorrow workflow did not save.");
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: "Back to note", exact: true }).click();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "More note actions" }).click();
  await page.locator(".editor-menu").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Copy Markdown", exact: true }).click();
  await page.getByText("Copied", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Backups and settings" }).click();
  await page.getByRole("button", { name: "Back up now" }).click();
  await page.getByText("Backup created.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Close backups" }).click();
  await page.getByRole("button", { name: "Skills", exact: true }).click();
  await page.getByRole("heading", { name: "Skill Stack", exact: true }).waitFor();
  await page.getByRole("button", { name: "New skill" }).click();
  await page.getByLabel("Skill name").fill("Terminal helper");
  await page.getByLabel("Skill category").fill("Automation");
  await page.getByLabel("Skill notes").fill("Run this command safely.");
  await page.waitForTimeout(900);
  await page.getByText("Saved", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await page.getByText("Copied", { exact: true }).waitFor();
  await page.getByLabel("Search everything").fill("Terminal");
  await page.getByText("Terminal helper", { exact: true }).waitFor();
  await page.getByLabel("Search everything").fill("");
  await page.getByRole("button", { name: "Automation", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByText(/No skills found/).waitFor();
  await page.getByRole("button", { name: "Slash commands", exact: true }).click();
  await page.getByText("Git push", { exact: true }).waitFor();
  await page.getByText("Markdown, skills, and slash commands", { exact: true }).waitFor();
  await page.getByRole("button", { name: "New slash command" }).click();
  await page.getByLabel("Slash command name").fill("Deploy preview");
  await page.getByLabel("Slash command invocation").fill("/prompts:deploy-preview");
  await page.getByLabel("Slash command notes").fill("Publish the current preview without extra checks.");
  await page.waitForTimeout(900);
  await page.getByText("Saved", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await page.getByText("Copied", { exact: true }).waitFor();
  await page.getByLabel("Search everything").fill("Deploy preview");
  await page.getByText("Deploy preview", { exact: true }).waitFor();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByText("No match", { exact: true }).waitFor();
  const importedProject = await page.evaluate(async (root) => {
    const inspected = await window.hushnote.projects.inspect(root);
    return window.hushnote.projects.create({ ...inspected, status: "active", priority: "high", tags: ["electron"], nextAction: "Verify the real window" });
  }, projectRoot);
  if (importedProject.name !== "project repo" || !importedProject.git_root) throw new Error(`Project import failed: ${JSON.stringify(importedProject)}`);
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("heading", { name: "Projects", exact: true }).waitFor();
  await page.getByText("project repo", { exact: true }).first().click();
  await page.getByRole("button", { name: /Tasks/ }).click();
  await page.getByLabel("New project task").fill("Verify durable project task");
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByLabel("Task Verify durable project task").waitFor();
  await page.getByRole("button", { name: /Changes/ }).click();
  await page.getByText("app.js", { exact: true }).waitFor();
  await page.getByRole("button", { name: "AGENTS.md", exact: true }).click();
  await page.getByLabel("AGENTS.md editor").fill("# Project Instructions\n\nVerified in Electron.\n");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("AGENTS.md saved.", { exact: true }).waitFor();
  const durableProjects = await page.evaluate(() => window.hushnote.projects.list());
  if (!durableProjects[0]?.tasks.some((task) => task.title === "Verify durable project task")) throw new Error("Project task did not persist through Electron IPC.");
  await page.getByRole("button", { name: "Mail", exact: true }).click();
  await page.getByRole("button", { name: "Back to Notebook" }).waitFor();
  let mailLoaded = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    mailLoaded = await app.evaluate(({ webContents }, expectedUrl) => webContents.getAllWebContents().some((contents) => {
      const url = contents.getURL();
      if (expectedUrl) return url === expectedUrl;
      try { return ["mail.google.com", "accounts.google.com"].includes(new URL(url).hostname); }
      catch { return false; }
    }), packagedExecutable ? null : `http://127.0.0.1:${port}/mail`);
    if (mailLoaded) break;
    await page.waitForTimeout(100);
  }
  if (!mailLoaded) throw new Error("Embedded Gmail view did not load.");
  await page.getByRole("button", { name: "Reload Gmail" }).click();
  await page.getByRole("button", { name: "Back to Notebook" }).click();
  await page.getByRole("button", { name: "Notes", exact: true }).waitFor();
  await page.getByRole("button", { name: "Notion", exact: true }).click();
  await page.getByRole("button", { name: "Back to Notebook" }).waitFor();
  let notionLoaded = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    notionLoaded = await app.evaluate(({ webContents }, expectedUrl) => webContents.getAllWebContents().some((contents) => {
      const url = contents.getURL();
      if (expectedUrl) return url === expectedUrl;
      try { return ["notion.com", "notion.so"].some((domain) => new URL(url).hostname === domain || new URL(url).hostname.endsWith(`.${domain}`)); }
      catch { return false; }
    }), packagedExecutable ? null : `http://127.0.0.1:${port}/notion`);
    if (notionLoaded) break;
    await page.waitForTimeout(100);
  }
  if (!notionLoaded) throw new Error("Embedded Notion view did not load.");
  await page.getByRole("button", { name: "Reload Notion" }).click();
  await page.getByRole("button", { name: "Back to Notebook" }).click();
  await page.getByRole("button", { name: "Notes", exact: true }).waitFor();
  await page.getByRole("button", { name: "Notes" }).click();
  const draggedFile = await page.evaluate(() => window.hushnote.notes.dragFile({ id: "terminal-drop", title: "terminal drop", body: "echo hello\n\n- [ ] verify it" }));
  if (!draggedFile.endsWith("terminal drop.md")) throw new Error(`Drag-out Markdown filename was not clean: ${draggedFile}`);
  if (!draggedFile.includes("Markdown Notes")) throw new Error(`Drag-out Markdown file is not persistent: ${draggedFile}`);
  const draggedMarkdown = await fs.readFile(draggedFile, "utf8");
  if (draggedMarkdown !== "# terminal drop\n\necho hello\n\n- [ ] verify it\n") throw new Error(`Drag-out Markdown content was incomplete: ${JSON.stringify(draggedMarkdown)}`);
  const cleanDragAvailable = await page.evaluate(() => typeof window.hushnote.notes.dragCleanName === "function");
  if (!cleanDragAvailable) throw new Error("Windows clean filename drag bridge is unavailable.");
  await page.getByRole("button", { name: "More note actions" }).click();
  await page.locator(".editor-menu").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Compress" }).click();
  const start = page.getByRole("button", { name: "Start compressor" });
  if (await start.isVisible()) await start.click();
  await page.getByText("Ready", { exact: true }).waitFor({ timeout: 90000 });
  await page.getByRole("button", { name: "Compress note" }).click();
  await page.getByLabel("Compressed note").waitFor({ timeout: 90000 });
  const result = await page.getByLabel("Compressed note").inputValue();
  if (!result.trim()) throw new Error("Compressor returned an empty result.");
  console.log("Electron notes, Today priority OS, projects/Git/AGENTS.md, search, notebooks, checklists, skills, slash commands, Gmail, Notion, and compressor smoke test passed.");
} finally {
  await app.evaluate(({ app }) => app.quit()).catch(() => {});
  await app.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
