import { chromium } from "playwright";

async function launch() { try { return await chromium.launch({ channel: "chrome" }); } catch { return chromium.launch(); } }
const browser = await launch();
try {
  for (const [name, width, height] of [["narrow", 440, 800], ["wide", 1200, 900]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    page.on("pageerror", (error) => console.error("PAGE ERROR", error.stack));
    page.on("console", (message) => { if (message.type() === "error") console.error("BROWSER", message.text()); });
    await page.goto("http://127.0.0.1:5181/?projects=demo", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "GitHub @blixvip connected", exact: true }).waitFor();
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    try { await page.getByRole("heading", { name: "Projects", exact: true }).waitFor({ timeout: 5000 }); }
    catch (error) { await page.screenshot({ path: `screenshots/projects-${name}-debug.png` }); console.error((await page.locator("body").innerText()).slice(0, 4000)); throw error; }
    for (const lane of ["1st place", "2nd place", "3rd place", "Queue"]) await page.getByRole("heading", { name: lane, exact: true }).waitFor();
    await page.getByText("Local-first notes, planning, and project control.", { exact: true }).waitFor();
    const projectCards = page.locator(".project-simple-card");
    const fallbackLogos = projectCards.locator('[data-fallback-logo="true"]');
    if (await fallbackLogos.count() !== await projectCards.count()) throw new Error(`${name} Projects does not give every missing-logo project a fallback mark.`);
    if (await page.locator(".project-repo-icon").filter({ hasText: "◇" }).count()) throw new Error(`${name} Projects still shows generic diamond placeholders.`);
    const projectBoardText = await page.locator(".project-rank-board").innerText();
    if (/GitHub current|open tasks|Electron|JavaScript|next action|focus queue/i.test(projectBoardText)) throw new Error(`${name} Projects still shows removed card metadata.`);
    const overflow = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    if (overflow.document > overflow.viewport || overflow.body > overflow.viewport) throw new Error(`${name} Projects overflow: ${JSON.stringify(overflow)}`);
    await page.screenshot({ path: `screenshots/projects-${name}.png` });
    if (name === "narrow") {
      const activeVisible = await page.locator('.nav button[data-view="projects"]').evaluate((button) => {
        const buttonBox = button.getBoundingClientRect();
        const navBox = button.closest(".nav").getBoundingClientRect();
        return buttonBox.left >= navBox.left && buttonBox.right <= navBox.right;
      });
      if (!activeVisible) throw new Error("Narrow navigation does not reveal the active Projects tab.");
    }
    await page.getByRole("tab", { name: "All projects (4)" }).click();
    if (await page.locator(".project-tile").count() !== 4) throw new Error("All projects does not show the full directory.");
    await page.getByLabel("Search projects").fill("ClipForge");
    if (await page.locator(".project-tile").count() !== 1) throw new Error("Project search does not filter the directory.");
    await page.getByLabel("Search projects").fill("");
    await page.getByRole("tab", { name: "Priority queue" }).click();
    const clipForgeCard = page.locator(".project-simple-card").filter({ hasText: "ClipForge AI" });
    await clipForgeCard.getByRole("button", { name: "Open ClipForge AI", exact: true }).dragTo(page.locator('.project-rank-row[aria-label="1st place"]'));
    await page.locator('.project-rank-row[aria-label="1st place"]').getByText("ClipForge AI", { exact: true }).waitFor();
    await page.getByText("Notebook", { exact: true }).last().click();
    await page.getByRole("heading", { name: "Notebook", exact: true }).waitFor();
    await page.getByRole("heading", { name: "Tasks", exact: true }).waitFor();
    for (const tab of ["Tasks", "AGENTS.md", "Skills & Commands", "Activity", "Settings"]) {
      const trigger = page.getByRole("tab", { name: tab === "Tasks" ? /Tasks/ : tab });
      await trigger.click();
      await page.waitForTimeout(80);
      const detailOverflow = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      if (detailOverflow.document > detailOverflow.viewport || detailOverflow.body > detailOverflow.viewport) throw new Error(`${name} ${tab} overflow: ${JSON.stringify(detailOverflow)}`);
    }
    if (await page.getByRole("tab", { name: "Overview", exact: true }).count()) throw new Error(`${name} Projects still shows Overview.`);
    await page.getByRole("tab", { name: /Tasks/ }).focus();
    await page.keyboard.press("ArrowRight");
    if (await page.getByRole("tab", { name: "AGENTS.md", exact: true }).getAttribute("aria-selected") !== "true") throw new Error(`${name} project tabs do not support arrow-key navigation.`);
    await page.getByRole("tab", { name: /Tasks/ }).click();
    await page.getByLabel("New project task").fill("Verify task workflow");
    await page.getByRole("button", { name: "Add task" }).click();
    await page.getByLabel("Task Verify task workflow").waitFor();
    await page.locator(".project-detail-header .back-button").click();
    await page.getByText("ClipForge AI", { exact: true }).first().click();
    await page.getByRole("heading", { name: "ClipForge AI", exact: true }).waitFor();
    await page.getByRole("tab", { name: "Settings", exact: true }).click();
    await page.getByText("@blixvip · push credentials ready", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Review & commit", exact: true }).click();
    await page.getByRole("dialog", { name: "Commit ClipForge AI" }).waitFor();
    await page.getByText("src/export.py", { exact: true }).waitFor();
    await page.getByText("Push to GitHub as @blixvip after commit", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Commit & push", exact: true }).click();
    await page.getByText(/Committed f00ba412 and pushed/).waitFor();
    await page.getByRole("tab", { name: "AGENTS.md", exact: true }).click();
    await page.getByRole("tab", { name: "Edit", exact: true }).click();
    await page.getByLabel("AGENTS.md editor").fill("# Project Instructions\n\nVerified in rendered UI.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("AGENTS.md saved.", { exact: true }).waitFor();
    if (name === "wide") {
      await page.screenshot({ path: "screenshots/projects-detail-wide.png" });
      await page.locator(".project-detail-header .back-button").click();
      await page.getByText("Claude proxy", { exact: true }).click();
      await page.getByRole("tab", { name: "Settings", exact: true }).click();
      await page.getByRole("button", { name: "Connect @blixvip", exact: true }).click();
      await page.getByRole("dialog", { name: "Connect Claude proxy to GitHub" }).waitFor();
      await page.getByLabel("GitHub repository name").fill("claude-code-proxy");
      await page.getByRole("button", { name: "Create & connect", exact: true }).click();
      await page.getByText("blixvip/claude-code-proxy connected. Push is ready.", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Push to GitHub", exact: true }).click();
      await page.getByText("GitHub is up to date through @blixvip.", { exact: true }).waitFor();
    }
    await context.close();
  }
  for (const state of ["", "loading", "error"]) {
    const context = await browser.newContext({ viewport: { width: 900, height: 700 } });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:5181/${state ? `?projects=${state}` : ""}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    const expected = state === "loading" ? "Loading projects" : state === "error" ? "Projects unavailable" : "Build your project list";
    await page.getByText(expected, { exact: true }).waitFor();
    await context.close();
  }
  console.log("Projects four-row ranking, minimal cards, drag persistence, drill-in workspace, responsive, empty, loading, and error UI checks passed.");
} finally { await browser.close(); }
