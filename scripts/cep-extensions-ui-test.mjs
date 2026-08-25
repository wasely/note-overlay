import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({ configFile: "vite.config.js", server: { host: "127.0.0.1", port: 5190, strictPort: true } });
await server.listen();
let browser;
try {
  try { browser = await chromium.launch({ channel: "chrome" }); }
  catch { browser = await chromium.launch(); }
  for (const [size, width, height] of [["wide", 1100, 860], ["narrow", 460, 800]]) {
    for (const theme of ["light", "dark"]) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.goto("http://127.0.0.1:5190/?projects=demo#/cep-extensions", { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "CEP Extensions", exact: true }).waitFor();
      await page.getByRole("heading", { name: "Main four", exact: true }).waitFor();
      if (theme === "dark") await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
      const mainNames = await page.locator(".cep-main-card h3").allTextContents();
      const secondaryNames = await page.locator(".cep-secondary-card h3").allTextContents();
      assert.deepEqual(mainNames, ["Null Motion", "Buzzroll Studio", "ClipForge AI", "Asset Board / Kinetic Core"]);
      assert.deepEqual(secondaryNames, ["OpenScreen Bridge", "YouTube Uploader", "Motion Highlighter"]);
      assert.equal(await page.locator(".cep-nav-mark").count(), 1);
      assert.equal(await page.locator('.cep-product-mark [data-fallback-logo="true"]').count(), mainNames.length + secondaryNames.length);
      assert.equal(await page.locator(".cep-product-mark > b").count(), 0, "CEP Extensions still shows initials-only placeholders.");
      const { overflow, separated } = await page.evaluate(() => {
        const sidebar = document.querySelector(".sidebar").getBoundingClientRect();
        const content = document.querySelector(".cep-page").getBoundingClientRect();
        const stacked = getComputedStyle(document.querySelector(".notebook")).flexDirection === "column";
        return { overflow: document.documentElement.scrollWidth - window.innerWidth, separated: stacked ? sidebar.bottom <= content.top + 1 : sidebar.right <= content.left + 1 };
      });
      assert(overflow <= 1, `${size}/${theme} has ${overflow}px horizontal overflow`);
      assert(separated, `${size}/${theme} sidebar overlaps the CEP page`);
      await page.screenshot({ path: `screenshots/shot-${size}-cep-extensions${theme === "dark" ? "-dark" : ""}.png` });
      await page.locator(".cep-main-card").first().hover();
      await page.locator(".cep-main-card button").first().focus();
      assert(await page.locator(".cep-main-card button").first().evaluate((button) => button === document.activeElement));
      await page.close();
    }
  }
  const errorPage = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await errorPage.goto("http://127.0.0.1:5190/?cep=error#/cep-extensions", { waitUntil: "networkidle" });
  await errorPage.getByText("CEP library unavailable", { exact: true }).waitFor();
  assert.equal(await errorPage.getByRole("button", { name: "Try again" }).count(), 1);
  await errorPage.close();
  console.log("CEP extension UI passed");
} finally {
  await browser?.close();
  await server.close();
}
