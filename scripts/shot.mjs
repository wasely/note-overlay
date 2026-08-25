import { chromium } from "playwright";
import { createServer } from "vite";

// Screenshots every page at a narrow and a wide window, in light and dark.
const server = await createServer({ configFile: "vite.config.js", server: { host: "127.0.0.1", port: 5184, strictPort: true } });
await server.listen();
const base = "http://127.0.0.1:5184";

async function launch() {
  try { return await chromium.launch({ channel: "chrome" }); }
  catch { return chromium.launch(); }
}

const navButton = (page, view) => page.locator(".nav button").filter({ hasText: view }).first();
const browser = await launch();
try {
  for (const [tag, width, height] of [["narrow", 460, 800], ["wide", 1100, 860]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(`${base}/?daily=demo&projects=demo`, { waitUntil: "networkidle" });
    await page.locator(".paper").waitFor();
    await page.screenshot({ path: `screenshots/shot-${tag}-today.png` });
    await page.getByRole("tab", { name: /Tasks/ }).click();
    await page.screenshot({ path: `screenshots/shot-${tag}-today-tasks.png` });
    await page.getByRole("tab", { name: /Day log/ }).click();
    await page.getByRole("button", { name: "Open ChatGPT" }).click();
    await page.getByText("ChatGPT preview", { exact: true }).waitFor();
    await page.screenshot({ path: `screenshots/shot-${tag}-ai-chatgpt.png` });
    await page.getByRole("button", { name: "Notebook", exact: true }).click();
    await navButton(page, "Excalidraw").click();
    await page.getByText("Excalidraw preview", { exact: true }).waitFor();
    await page.screenshot({ path: `screenshots/shot-${tag}-app-excalidraw.png` });
    await page.getByRole("button", { name: "Notebook", exact: true }).click();
    await page.getByRole("button", { name: "Previous day" }).click();
    await page.getByRole("button", { name: "Back to today" }).waitFor();
    await page.screenshot({ path: `screenshots/shot-${tag}-today-earlier.png` });
    await page.getByRole("button", { name: "Back to today" }).click();

    await navButton(page, "Notes").click();
    await page.getByLabel("Note title").fill("Release checklist");
    await page.locator(".note-editor .ProseMirror").fill("# Ship it\n\nA **short** plan for the week.\n\n- [ ] Verify the build\n- [x] Update the notes\n\n> Everything stays on this computer.\n\n```bash\nnpm run pack:dir\n```");
    await page.getByText("Saved", { exact: true }).waitFor();
    const showNoteList = page.getByRole("button", { name: "Show note list" });
    const openedNoteList = await showNoteList.count() > 0;
    if (openedNoteList) await showNoteList.click();
    await page.locator(".library-browser").waitFor();
    await page.screenshot({ path: `screenshots/shot-${tag}-note-library.png` });
    if (openedNoteList) await page.locator(".library-browser .row.is-selected .row-open").click();
    await page.screenshot({ path: `screenshots/shot-${tag}-note-write.png` });
    await page.getByRole("button", { name: "Preview" }).click();
    await page.getByRole("heading", { name: "Ship it" }).waitFor();
    await page.screenshot({ path: `screenshots/shot-${tag}-note-preview.png` });

    await page.getByLabel("Search everything").fill("build");
    await page.locator(".results").waitFor();
    await page.screenshot({ path: `screenshots/shot-${tag}-search.png` });
    await page.getByLabel("Search everything").fill("");

    await navButton(page, "Skills").click();
    await page.screenshot({ path: `screenshots/shot-${tag}-skills.png` });
    const showSkillList = page.getByRole("button", { name: "Show skill list" });
    if (await showSkillList.count()) {
      await showSkillList.click();
      await page.locator(".skills-browser").waitFor();
      await page.screenshot({ path: `screenshots/shot-${tag}-skills-library.png` });
      await page.getByRole("navigation", { name: "Skill library" }).getByRole("button", { name: "Hide skill list" }).click();
    }
    await navButton(page, "Commands").click();
    const showCommandList = page.getByRole("button", { name: "Show command list" });
    const openedCommandList = await showCommandList.count() > 0;
    if (openedCommandList) await showCommandList.click();
    await page.locator(".library-browser").getByText("Git push", { exact: true }).waitFor();
    await page.screenshot({ path: `screenshots/shot-${tag}-command-library.png` });
    if (openedCommandList) await page.locator(".library-browser .row", { hasText: "Git push" }).locator(".row-open").click();
    await page.screenshot({ path: `screenshots/shot-${tag}-commands.png` });

    await navButton(page, "CEP Extensions").click();
    await page.getByRole("heading", { name: "Main four", exact: true }).waitFor();
    await page.screenshot({ path: `screenshots/shot-${tag}-cep-extensions.png` });

    await navButton(page, "Projects").click();
    await page.getByRole("heading", { name: "Projects", exact: true }).waitFor();
    await page.screenshot({ path: `screenshots/shot-${tag}-projects.png` });
    await page.getByRole("button", { name: "Open Notebook", exact: true }).click();
    await page.getByRole("heading", { name: "Tasks", exact: true }).waitFor();
    await page.screenshot({ path: `screenshots/shot-${tag}-project-tasks.png` });
    for (const [tabName, fileName] of [["AGENTS.md", "agents"], ["Skills & Commands", "tools"], ["Activity", "activity"], ["Settings", "settings"]]) {
      await page.getByRole("tab", { name: tabName, exact: true }).click();
      await page.screenshot({ path: `screenshots/shot-${tag}-project-${fileName}.png` });
    }
    await page.locator(".project-detail-header .back-button").click();
    await page.getByRole("button", { name: "Open ClipForge AI", exact: true }).click();
    await page.getByRole("tab", { name: "Settings", exact: true }).click();
    await page.screenshot({ path: `screenshots/shot-${tag}-projects-github.png` });
    await page.getByRole("button", { name: "Review & commit" }).click();
    await page.getByRole("dialog", { name: "Commit ClipForge AI" }).waitFor();
    await page.screenshot({ path: `screenshots/shot-${tag}-projects-commit.png` });
    await page.getByRole("dialog", { name: "Commit ClipForge AI" }).getByRole("button", { name: "Close commit dialog" }).click();

    await page.getByRole("button", { name: "Settings and backups" }).click();
    await page.getByRole("complementary", { name: "Settings" }).getByRole("heading", { name: "Settings" }).waitFor();
    await page.screenshot({ path: `screenshots/shot-${tag}-settings.png` });
    await page.getByRole("button", { name: "Dark" }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
    await page.getByRole("button", { name: "Close settings" }).click();
    await navButton(page, "Notes").click();
    await page.waitForTimeout(220);
    await page.screenshot({ path: `screenshots/shot-${tag}-note-dark.png` });
    await navButton(page, "Skills").click();
    await page.waitForTimeout(120);
    await page.screenshot({ path: `screenshots/shot-${tag}-skills-dark.png` });
    await navButton(page, "Commands").click();
    await page.waitForTimeout(220);
    await page.screenshot({ path: `screenshots/shot-${tag}-commands-dark.png` });
    await navButton(page, "Today").click();
    await page.screenshot({ path: `screenshots/shot-${tag}-today-dark.png` });
    await navButton(page, "CEP Extensions").click();
    await page.getByRole("heading", { name: "Main four", exact: true }).waitFor();
    await page.screenshot({ path: `screenshots/shot-${tag}-cep-extensions-dark.png` });
    await navButton(page, "Projects").click();
    if (await page.locator(".project-detail-header .back-button").count()) await page.locator(".project-detail-header .back-button").click();
    await page.screenshot({ path: `screenshots/shot-${tag}-projects-dark.png` });
    await navButton(page, "Excalidraw").click();
    await page.getByText("Excalidraw preview", { exact: true }).waitFor();
    await page.screenshot({ path: `screenshots/shot-${tag}-app-excalidraw-dark.png` });
    await page.close();
  }
  console.log("Screenshots written to screenshots/.");
} finally {
  await browser.close();
  await server.close();
}
