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
    await page.goto(`${base}/?daily=demo`, { waitUntil: "networkidle" });
    await page.locator(".capture").waitFor();
    await page.screenshot({ path: `screenshots/shot-${tag}-today.png` });

    await navButton(page, "Notes").click();
    await page.getByLabel("Note title").fill("Release checklist");
    await page.getByLabel("Note content").fill("# Ship it\n\nA **short** plan for the week.\n\n- [ ] Verify the build\n- [x] Update the notes\n\n> Everything stays on this computer.\n\n```bash\nnpm run pack:dir\n```");
    await page.getByText("Saved", { exact: true }).waitFor();
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
    await navButton(page, "Commands").click();
    await page.getByText("Git push", { exact: true }).first().waitFor();
    await page.screenshot({ path: `screenshots/shot-${tag}-commands.png` });

    await page.getByRole("button", { name: "Settings and backups" }).click();
    await page.getByRole("heading", { name: "Settings" }).waitFor();
    await page.screenshot({ path: `screenshots/shot-${tag}-settings.png` });
    await page.getByRole("button", { name: "Dark" }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
    await page.getByRole("button", { name: "Close settings" }).click();
    await navButton(page, "Notes").click();
    await page.screenshot({ path: `screenshots/shot-${tag}-note-dark.png` });
    await navButton(page, "Today").click();
    await page.screenshot({ path: `screenshots/shot-${tag}-today-dark.png` });
    await page.close();
  }
  console.log("Screenshots written to screenshots/.");
} finally {
  await browser.close();
  await server.close();
}
