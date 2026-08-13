import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const { boundsForDisplay } = require("../src/main/window-bounds.cjs");
const packageJson = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));
const userData = await fs.mkdtemp(path.join(os.tmpdir(), "notebook-test-"));
const server = http.createServer((request, response) => {
  if (request.url === "/health") { response.writeHead(200).end("ok"); return; }
  if (request.url === "/compress") { response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ compressed_prompt: "Compressed test note.", origin_tokens: 8, compressed_tokens: 3, ratio: "2.7x" })); return; }
  response.writeHead(404).end();
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const packagedExecutable = process.env.NOTEBOOK_EXECUTABLE;
const app = await electron.launch({ executablePath: packagedExecutable || electronPath, args: packagedExecutable ? [`--user-data-dir=${userData}`] : [".", `--user-data-dir=${userData}`], env: { ...process.env, NOTEBOOK_COMPRESSOR_URL: `http://127.0.0.1:${port}`, NOTEBOOK_DISABLE_STARTUP_REGISTRATION: "1" } });

try {
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await page.bringToFront();
  await page.getByText("Notebook", { exact: true }).waitFor();
  await page.getByText(`Local only · v${packageJson.version}`, { exact: true }).waitFor();
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
  await page.getByRole("button", { name: "Skills" }).click();
  await page.getByRole("button", { name: "New skill" }).click();
  await page.getByLabel("Skill name").fill("Terminal helper");
  await page.getByLabel("Skill category").fill("Automation");
  await page.getByLabel("Skill notes").fill("Run this command safely.");
  await page.waitForTimeout(900);
  await page.getByText("Saved", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Copy" }).click();
  await page.getByText("Copied", { exact: true }).waitFor();
  await page.getByLabel("Find a skill").fill("Terminal");
  await page.getByText("Terminal helper", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Automation", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByText(/No skills found/).waitFor();
  await page.getByRole("button", { name: "Slash commands" }).click();
  await page.getByText("Git push", { exact: true }).waitFor();
  await page.getByText("Markdown, skills, and slash commands", { exact: true }).waitFor();
  await page.getByRole("button", { name: "New slash command" }).click();
  await page.getByLabel("Slash command name").fill("Deploy preview");
  await page.getByLabel("Slash command invocation").fill("/prompts:deploy-preview");
  await page.getByLabel("Slash command notes").fill("Publish the current preview without extra checks.");
  await page.waitForTimeout(900);
  await page.getByText("Saved", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Copy" }).click();
  await page.getByText("Copied", { exact: true }).waitFor();
  await page.getByLabel("Find a slash command").fill("Deploy preview");
  await page.getByText("Deploy preview", { exact: true }).waitFor();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByText(/No slash items found/).waitFor();
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
  console.log("Electron Markdown notes, notebooks, checklists, skills, slash commands, and compressor smoke test passed.");
} finally {
  await app.evaluate(({ app }) => app.quit()).catch(() => {});
  await app.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
