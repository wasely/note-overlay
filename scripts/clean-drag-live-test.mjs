import { _electron as electron } from "playwright";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(scriptDir);
const hostPath = path.join(scriptDir, "clean-drag-test-host.exe");
const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "notebook-clean-drag-"));
const userData = path.join(testDir, "user-data");
const readyPath = path.join(testDir, "ready.txt");
const resultPath = path.join(testDir, "result.txt");
const expected = "Token and Efficiency maxxing.md";
const helperLogPath = path.join(testDir, "helper.log");
const dropSignalPath = path.join(testDir, "drop.signal");
const targetFile = path.join(testDir, "target.hwnd");
const app = await electron.launch({ executablePath: electronPath, args: [root, `--user-data-dir=${userData}`], env: { ...process.env, NOTEBOOK_DISABLE_STARTUP_REGISTRATION: "1", NOTEBOOK_CLEAN_DRAG_LOG: helperLogPath, NOTEBOOK_CLEAN_DRAG_DROP_SIGNAL: dropSignalPath, NOTEBOOK_CLEAN_DRAG_TARGET_FILE: targetFile } });
let receiver;

async function waitForFile(filePath, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { return await fs.readFile(filePath, "utf8"); } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

async function waitForText(filePath, pattern, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fs.readFile(filePath, "utf8").catch(() => "");
    if (value.includes(pattern)) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${pattern} in ${filePath}`);
}

try {
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setBounds({ x: 80, y: 80, width: 640, height: 520 });
    window.show();
    window.focus();
  });
  await page.waitForFunction(() => innerWidth <= 640 && innerHeight <= 520);
  await page.waitForTimeout(300);
  await page.getByLabel("Note title").fill("Token and Efficiency maxxing");
  await page.getByLabel("Note content").fill("Clean cross-process drag test.");
  await page.getByText("Saved", { exact: true }).waitFor();
  const rect = await page.locator(".drag-action").evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
  const sourceInfo = await app.evaluate(({ BrowserWindow, screen }, point) => {
    const bounds = BrowserWindow.getAllWindows()[0].getBounds();
    const dipPoint = { x: Math.round(bounds.x + point.x), y: Math.round(bounds.y + point.y) };
    const targetDipPoint = { x: Math.max(240, bounds.x - 250), y: dipPoint.y };
    return { bounds, dipPoint, point: screen.dipToScreenPoint(dipPoint), targetPoint: screen.dipToScreenPoint(targetDipPoint) };
  }, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
  let source = sourceInfo.point;
  await page.evaluate(() => {
    window.__cleanDragEvents = [];
    for (const type of ["pointerdown", "mousedown", "dragstart", "dragend"]) document.addEventListener(type, (event) => window.__cleanDragEvents.push(`${type}:${event.target?.className || event.target?.tagName}`), true);
  });
  const targetX = sourceInfo.targetPoint.x - 220;
  const targetY = Math.max(0, sourceInfo.targetPoint.y - 210);
  receiver = spawn(hostPath, ["--receive", readyPath, resultPath, expected, String(targetX), String(targetY)], { windowsHide: true, stdio: "ignore" });
  const target = (await waitForFile(readyPath)).split(",");
  await fs.writeFile(targetFile, target[3]);
  console.log(`Window ${JSON.stringify(sourceInfo.bounds)}, element ${JSON.stringify(rect)}, drag ${source.x},${source.y} -> ${target[0]},${target[1]}`);
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 - 30, rect.y + rect.height / 2 + 10, { steps: 12 });
  await waitForText(helperLogPath, "started", 5000);
  execFileSync(hostPath, ["--move", target[0], target[1]], { windowsHide: true });
  await fs.writeFile(dropSignalPath, "drop");
  const browserEvents = await page.evaluate(() => window.__cleanDragEvents);
  let dropped;
  try { dropped = await waitForFile(resultPath, 15000); await page.mouse.up().catch(() => {}); }
  catch (error) {
    const helperLog = await fs.readFile(helperLogPath, "utf8").catch(() => "no helper log");
    const receiverLog = await fs.readFile(`${resultPath}.events`, "utf8").catch(() => "no receiver events");
    throw new Error(`${error.message}\nBrowser: ${JSON.stringify(browserEvents)}\nHelper: ${helperLog}\nReceiver: ${receiverLog}`);
  }
  if (dropped !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(dropped)}.`);
  console.log(`Windows cross-process clean drag passed: ${dropped}`);
} finally {
  receiver?.kill();
  await app.evaluate(({ app }) => app.quit()).catch(() => {});
  await app.close().catch(() => {});
  await fs.rm(testDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 }).catch(() => {});
}
