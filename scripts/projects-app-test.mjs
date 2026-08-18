import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const packagedPath = process.env.NOTEBOOK_TEST_EXECUTABLE || "";
const electronPath = packagedPath || require("electron");
const userData = await fs.mkdtemp(path.join(os.tmpdir(), "notebook-projects-app-"));
const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "notebook-project-root-"));
await fs.writeFile(path.join(projectRoot, "README.md"), "# Workspace fixture\n\nProject overview.", "utf8");
await fs.writeFile(path.join(projectRoot, "AGENTS.md"), "# Original instructions\n", "utf8");

const app = await electron.launch({
  executablePath: electronPath,
  args: packagedPath ? [`--user-data-dir=${userData}`] : [".", `--user-data-dir=${userData}`],
  env: { ...process.env, NOTEBOOK_TEST_ISOLATED: "1", NOTEBOOK_DISABLE_STARTUP_REGISTRATION: "1" },
});
const navButton = (page, view) => page.locator(".nav button").filter({ hasText: view }).first();

try {
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await page.bringToFront();
  await page.getByText("Notebook", { exact: true }).waitFor();
  await page.evaluate(async (root) => {
    await window.hushnote.projects.create({
      name: "Workspace fixture",
      description: "Original overview",
      status: "active",
      priority: "high",
      tier: 4,
      primaryLanguage: "TypeScript",
      tags: ["desktop"],
      localPath: root,
      gitRoot: root,
    });
  }, projectRoot);

  await navButton(page, "Projects").click();
  await page.getByRole("heading", { name: "Projects", exact: true }).waitFor();
  const simpleFixtureCard = page.locator(".project-simple-card").filter({ hasText: "Workspace fixture" });
  await simpleFixtureCard.getByText("Original overview", { exact: true }).waitFor();
  if (await simpleFixtureCard.getByText(/Desktop|TypeScript|GitHub current|open tasks/i).count()) throw new Error("Project card still shows removed metadata.");
  await page.evaluate(async () => {
    const project = (await window.hushnote.projects.list()).find((item) => item.name === "Workspace fixture");
    await window.hushnote.projects.move({ id: project.id, tier: 1 });
  });
  await page.waitForFunction(async () => (await window.hushnote.projects.list()).find((item) => item.name === "Workspace fixture")?.tier === 1);
  await navButton(page, "Today").evaluate((button) => button.click());
  await navButton(page, "Projects").evaluate((button) => button.click());
  await page.locator('.project-rank-row[aria-label="1st place"]').getByText("Workspace fixture", { exact: true }).waitFor({ state: "attached" });
  await simpleFixtureCard.getByRole("button", { name: "Open Workspace fixture", exact: true }).evaluate((button) => button.click());
  await page.getByRole("heading", { name: "Workspace fixture", exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Overview", exact: true }).waitFor();

  await page.getByText("Project overview", { exact: true }).waitFor();
  await page.locator(".project-overview-form textarea").first().fill("Updated project overview");
  await page.getByRole("button", { name: "Save changes", exact: true }).evaluate((button) => button.click());
  await page.waitForFunction(async () => {
    const project = (await window.hushnote.projects.list()).find((item) => item.name === "Workspace fixture");
    return project?.description === "Updated project overview";
  });

  await page.getByRole("button", { name: /Tasks/ }).evaluate((button) => button.click());
  await page.getByLabel("New project task").fill("Manage restored task");
  await page.getByRole("button", { name: "Add task", exact: true }).evaluate((button) => button.click());
  await page.getByLabel("Task Manage restored task").waitFor();

  await page.getByRole("button", { name: "AGENTS.md", exact: true }).evaluate((button) => button.click());
  await page.getByLabel("AGENTS.md editor").fill("# Project instructions\n\nRestored and verified.");
  await page.getByRole("button", { name: "Save", exact: true }).evaluate((button) => button.click());
  await page.getByText("AGENTS.md saved.", { exact: true }).waitFor();
  await page.screenshot({ path: "screenshots/projects-detail-wide.png" });

  const savedAgents = await fs.readFile(path.join(projectRoot, "AGENTS.md"), "utf8");
  if (!savedAgents.includes("Restored and verified.")) throw new Error("AGENTS.md did not save to the real project folder.");
  const stored = await page.evaluate(async () => (await window.hushnote.projects.list()).find((item) => item.name === "Workspace fixture"));
  if (!stored?.tasks?.some((task) => task.title === "Manage restored task")) throw new Error("Project task did not persist.");
  console.log("Real Electron project list passed: four-row tier persistence, minimal cards, click-through, overview, tasks, and AGENTS.md persistence.");
} finally {
  await app.close().catch(() => {});
  await fs.rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  await fs.rm(projectRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
