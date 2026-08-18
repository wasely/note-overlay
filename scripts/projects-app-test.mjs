import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const userData = await fs.mkdtemp(path.join(os.tmpdir(), "notebook-projects-app-"));
const app = await electron.launch({
  executablePath: electronPath,
  args: [".", `--user-data-dir=${userData}`],
  env: { ...process.env, NOTEBOOK_TEST_ISOLATED: "1", NOTEBOOK_DISABLE_STARTUP_REGISTRATION: "1" },
});
const navButton = (page, view) => page.locator(".nav button").filter({ hasText: view }).first();

try {
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await page.bringToFront();
  await page.getByText("Notebook", { exact: true }).waitFor();
  await page.evaluate(async () => {
    await window.hushnote.projects.create({ name: "Alpha app", category: "Apps", tier: 1, description: "Current product", nextAction: "Ship the board" });
    await window.hushnote.projects.create({ name: "Beta tool", category: "Tools", tier: 3, description: "Later utility", nextAction: "Write the first command" });
  });
  await navButton(page, "Projects").click();
  await page.getByRole("heading", { name: "Now" }).waitFor();
  await page.getByText("Alpha app", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByText("Beta tool", { exact: true }).waitFor();
  await page.getByRole("button", { name: /All/ }).click();
  await page.locator(".priority-card", { hasText: "Beta tool" }).locator(".priority-drag").dragTo(page.locator(".priority-lane.tier-1"));
  await page.waitForTimeout(500);
  const moved = await page.evaluate(async () => (await window.hushnote.projects.list()).find((project) => project.name === "Beta tool"));
  if (moved?.tier !== 1) throw new Error(`Dragged tier did not persist: ${JSON.stringify(moved)}`);
  const bridge = await page.evaluate(() => ({ move: typeof window.hushnote.projects.move, setup: typeof window.hushnote.projects.githubSetup }));
  if (bridge.move !== "function" || bridge.setup !== "function") throw new Error(`Projects bridge is incomplete: ${JSON.stringify(bridge)}`);
  await page.getByRole("button", { name: "GitHub", exact: true }).click();
  await page.getByRole("heading", { name: "Needs setup" }).waitFor();
  await page.getByText("Alpha app", { exact: true }).waitFor();
  console.log("Real Electron Projects test passed: storage, categories, drag persistence, preload bridge, and GitHub queue.");
} finally {
  await app.close().catch(() => {});
  await fs.rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
