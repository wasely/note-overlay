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
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    try { await page.getByRole("heading", { name: "Projects", exact: true }).waitFor({ timeout: 5000 }); }
    catch (error) { await page.screenshot({ path: `screenshots/projects-${name}-debug.png` }); console.error((await page.locator("body").innerText()).slice(0, 4000)); throw error; }
    await page.getByText("Focus Queue", { exact: true }).waitFor();
    const overflow = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    if (overflow.document > overflow.viewport || overflow.body > overflow.viewport) throw new Error(`${name} Projects overflow: ${JSON.stringify(overflow)}`);
    await page.screenshot({ path: `screenshots/projects-${name}.png` });
    await page.getByText("Note Overlay", { exact: true }).first().click();
    await page.getByRole("heading", { name: "Note Overlay", exact: true }).waitFor();
    await page.getByRole("button", { name: /Tasks/ }).click();
    await page.getByLabel("New project task").fill("Verify task workflow");
    await page.getByRole("button", { name: "Add task" }).click();
    await page.getByLabel("Task Verify task workflow").waitFor();
    await page.getByRole("button", { name: /Changes/ }).click();
    await page.getByText("src/renderer/ProjectsPage.jsx", { exact: true }).click();
    await page.getByText(/new verified line/).waitFor();
    await page.getByRole("button", { name: "Commit changes", exact: true }).click();
    await page.getByRole("dialog", { name: "Commit changes" }).waitFor();
    await page.getByRole("button", { name: "Commit locally", exact: true }).click();
    await page.getByText(/Committed f00ba412/).waitFor();
    await page.getByRole("button", { name: "AGENTS.md", exact: true }).click();
    await page.getByLabel("AGENTS.md editor").fill("# Project Instructions\n\nVerified in rendered UI.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("AGENTS.md saved.", { exact: true }).waitFor();
    if (name === "wide") await page.screenshot({ path: "screenshots/projects-detail-wide.png" });
    await context.close();
  }
  for (const state of ["", "loading", "error"]) {
    const context = await browser.newContext({ viewport: { width: 900, height: 700 } });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:5181/${state ? `?projects=${state}` : ""}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    const expected = state === "loading" ? "Loading projects" : state === "error" ? "Projects unavailable" : "Build your project command center";
    await page.getByText(expected, { exact: true }).waitFor();
    await context.close();
  }
  console.log("Projects responsive collection, task, changes, commit, AGENTS.md, empty, loading, and error UI checks passed.");
} finally { await browser.close(); }
