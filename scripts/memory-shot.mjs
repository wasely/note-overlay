import { chromium } from "playwright";
import { createServer } from "vite";

// Headless screenshots of the Memory page: narrow and wide, light and dark, read and edit.
const server = await createServer({ configFile: "vite.config.js", server: { host: "127.0.0.1", port: 5186, strictPort: true } });
await server.listen();
const browser = await chromium.launch();
try {
  for (const [tag, width, height] of [["narrow", 460, 800], ["wide", 1100, 860]]) {
    for (const theme of ["light", "dark"]) {
      const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme });
      await page.goto("http://127.0.0.1:5186/#/memory", { waitUntil: "networkidle" });
      await page.locator(".nav button").filter({ hasText: "Memory" }).first().click();
      await page.locator(".memory-workspace").waitFor();
      await page.getByText("Agent memories").waitFor();
      await page.screenshot({ path: `screenshots/shot-${tag}-memory${theme === "dark" ? "-dark" : ""}.png` });
      if (theme === "light") {
        await page.locator(".memory-workspace").getByRole("button", { name: "Edit", exact: true }).click();
        await page.getByLabel("Master memory Markdown").fill("# Master Memory\n\n- Edited in the page\n");
        await page.screenshot({ path: `screenshots/shot-${tag}-memory-edit.png` });
        await page.locator(".memory-workspace").getByRole("button", { name: "Save", exact: true }).click();
        await page.locator(".memory-rendered").getByText("Edited in the page").waitFor();
      }
      await page.close();
    }
  }
  console.log("Memory screenshots written.");
} finally { await browser.close(); await server.close(); }
