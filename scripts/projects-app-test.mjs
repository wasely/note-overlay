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
const launchArgs = [`--user-data-dir=${userData}`, ...(packagedPath ? [] : ["."])];
if (!launchArgs[0].startsWith("--user-data-dir=")) throw new Error("Project app test must select its isolated user-data directory before the Electron app path.");

const app = await electron.launch({
  executablePath: electronPath,
  args: launchArgs,
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
  await page.getByRole("tab", { name: /Tasks/ }).waitFor();
  if (await page.getByRole("tab", { name: "Overview", exact: true }).count()) throw new Error("Removed Overview tab is still visible.");
  if (await page.getByRole("button", { name: "Changes", exact: true }).count()) throw new Error("Removed Changes tab is still visible.");

  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await page.screenshot({ path: "screenshots/projects-settings-wide.png" });
  await page.locator(".project-profile-settings").getByRole("button", { name: "Edit", exact: true }).evaluate((button) => button.click());
  await page.locator(".project-details-form textarea").first().fill("Updated project overview");
  await page.getByRole("button", { name: "Save changes", exact: true }).evaluate((button) => button.click());
  await page.waitForFunction(async () => {
    const project = (await window.hushnote.projects.list()).find((item) => item.name === "Workspace fixture");
    return project?.description === "Updated project overview";
  });

  await page.getByRole("tab", { name: /Tasks/ }).evaluate((button) => button.click());
  for (const lane of ["To do", "Doing", "Done"]) await page.locator(".kanban-column > header strong", { hasText: lane }).waitFor();
  await page.getByLabel("New project task").fill("Manage restored task");
  await page.getByRole("button", { name: "Add task", exact: true }).evaluate((button) => button.click());
  await page.getByLabel("Task Manage restored task").waitFor();
  await page.getByRole("button", { name: "Actions for Manage restored task" }).click();
  await page.getByRole("button", { name: "Move to Doing", exact: true }).click();
  await page.waitForFunction(async () => (await window.hushnote.projects.list()).find((item) => item.name === "Workspace fixture")?.tasks?.some((task) => task.title === "Manage restored task" && task.status === "in_progress"));
  await page.screenshot({ path: "screenshots/projects-tasks-wide.png" });

  await page.getByRole("tab", { name: "AGENTS.md", exact: true }).evaluate((button) => button.click());
  await page.getByRole("tab", { name: "Edit", exact: true }).click();
  await page.getByLabel("AGENTS.md editor").fill("# Project instructions\n\nRestored and verified.");
  await page.getByRole("button", { name: "Save", exact: true }).evaluate((button) => button.click());
  await page.getByText("AGENTS.md saved.", { exact: true }).waitFor();
  await page.screenshot({ path: "screenshots/projects-detail-wide.png" });
  await page.getByRole("tab", { name: "Skills & Commands", exact: true }).click();
  await page.getByLabel("Search project tools").fill("OnlyOffice");
  let onlyOffice = page.locator(".tool-card", { hasText: "OnlyOffice" });
  await onlyOffice.getByRole("button", { name: "Attach", exact: true }).click();
  onlyOffice = page.locator(".tool-card", { hasText: "OnlyOffice" });
  await onlyOffice.getByRole("button", { name: "Install", exact: true }).click();
  await onlyOffice.getByText("Installed", { exact: true }).waitFor();
  await page.screenshot({ path: "screenshots/projects-tools-wide.png" });

  const savedAgents = await fs.readFile(path.join(projectRoot, "AGENTS.md"), "utf8");
  if (!savedAgents.includes("Restored and verified.")) throw new Error("AGENTS.md did not save to the real project folder.");
  const installedSkill = await fs.readFile(path.join(projectRoot, ".agents", "skills", "onlyoffice", "SKILL.md"), "utf8");
  if (!installedSkill.includes("Best overall office suite")) throw new Error("Attached project skill was not installed to the repository.");
  const stored = await page.evaluate(async () => (await window.hushnote.projects.list()).find((item) => item.name === "Workspace fixture"));
  if (!stored?.tasks?.some((task) => task.title === "Manage restored task")) throw new Error("Project task did not persist.");
  console.log("Real Electron project list passed: four-row tier persistence, task-first detail, Settings editing, tasks, and AGENTS.md persistence.");
} finally {
  await app.close().catch(() => {});
  await fs.rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  await fs.rm(projectRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
