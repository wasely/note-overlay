import { chromium } from "playwright";
import { createServer } from "vite";
import fs from "node:fs/promises";

async function launch() { try { return await chromium.launch({ channel: "chrome" }); } catch { return chromium.launch(); } }
const server = await createServer({ server: { host: "127.0.0.1", port: 5184, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await launch();
await fs.mkdir(new URL("../screenshots/", import.meta.url), { recursive: true });

async function assertClean(page, tag) {
  const overflow = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  if (overflow.document > overflow.viewport || overflow.body > overflow.viewport) throw new Error(`${tag} Bots UI overflows: ${JSON.stringify(overflow)}`);
  const unlabeled = await page.locator("button").evaluateAll((buttons) => buttons.filter((button) => !button.textContent.trim() && !button.getAttribute("aria-label") && !button.getAttribute("title")).length);
  if (unlabeled) throw new Error(`${tag} has ${unlabeled} unlabeled icon buttons.`);
}

try {
  for (const [tag, width, height, platform, name] of [
    ["wide", 1180, 860, "discord", "Daily Brief"],
    ["narrow", 600, 780, "telegram", "Pocket Researcher"],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, colorScheme: tag === "narrow" ? "dark" : "light" });
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:5184/#/bots", { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Bots", exact: true }).waitFor();
    await page.getByText("Create Your First Bot", { exact: true }).waitFor();
    await page.screenshot({ path: new URL(`../screenshots/bots-${tag}-empty.png`, import.meta.url).pathname.slice(1), fullPage: true });

    await page.getByRole("button", { name: "Create Bot", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Create Bot" });
    await dialog.getByText("Connect once. After that: name, access, create.", { exact: true }).waitFor();
    await dialog.getByText("Discord agent", { exact: true }).waitFor();
    await dialog.getByText("Telegram bot", { exact: true }).waitFor();
    if (platform === "telegram") await dialog.getByText("Telegram bot", { exact: true }).click();
    await dialog.getByText(platform === "discord" ? "Discord connected" : "Telegram connected", { exact: true }).waitFor();
    if (await dialog.getByLabel("Application ID").count() || await dialog.getByLabel("Bot Token").count()) throw new Error("Developer credentials remain in managed bot creation.");
    await dialog.getByLabel("Bot name").fill(name);
    await dialog.getByLabel("Description").fill("Turns trusted Notebook context into a concise answer.");
    await dialog.getByRole("button", { name: tag === "wide" ? "Use ⚡ icon" : "Use 🧭 icon", exact: true }).click();
    await dialog.getByText("Edit notes", { exact: true }).click();
    await dialog.getByText("Run skills", { exact: true }).click();
    await page.screenshot({ path: new URL(`../screenshots/bots-${tag}-create.png`, import.meta.url).pathname.slice(1), fullPage: true });
    await dialog.getByRole("button", { name: platform === "discord" ? "Create Discord Agent" : "Create Telegram Bot", exact: true }).click();

    const successDialog = page.locator(".bot-create");
    await successDialog.getByRole("heading", { name: "Bot Created", exact: true }).waitFor();
    await successDialog.getByRole("button", { name: platform === "discord" ? "Add Notebook Bot to Server" : "Open Telegram Bot", exact: true }).waitFor();
    const firstLink = await successDialog.getByLabel("Private bot link").inputValue();
    if (!/^notebook:\/\/bot\/.+\?key=/.test(firstLink)) throw new Error(`Private link was not generated: ${firstLink}`);
    await successDialog.getByRole("button", { name: "Reset Link", exact: true }).click();
    const resetLink = await successDialog.getByLabel("Private bot link").inputValue();
    if (resetLink === firstLink) throw new Error("Reset Link did not rotate the private link.");
    await page.screenshot({ path: new URL(`../screenshots/bots-${tag}-success.png`, import.meta.url).pathname.slice(1), fullPage: true });
    await successDialog.getByRole("button", { name: "Open Bot", exact: true }).click();

    await page.getByRole("heading", { name, exact: true }).waitFor();
    await page.getByText("Registered with Notebook Connector.", { exact: true }).waitFor();
    await page.screenshot({ path: new URL(`../screenshots/bots-${tag}-overview.png`, import.meta.url).pathname.slice(1), fullPage: true });
    await page.locator(".bot-tabs").getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByText("Private bot link", { exact: true }).first().waitFor();
    await page.getByText("Verified", { exact: true }).waitFor();
    for (const permission of ["Read notes", "Edit notes", "Run skills"]) await page.getByText(permission, { exact: true }).waitFor();
    const detailHeader = await page.locator(".bot-details-header").boundingBox();
    if (!detailHeader || detailHeader.y < 0) throw new Error(`${tag} bot header scrolled out of view: ${JSON.stringify(detailHeader)}`);
    await page.screenshot({ path: new URL(`../screenshots/bots-${tag}-settings.png`, import.meta.url).pathname.slice(1), fullPage: true });

    await page.getByRole("button", { name: "← Bots", exact: true }).click();
    await page.getByLabel("Search bots").fill(tag === "wide" ? "daily" : "pocket");
    const row = page.locator(".bot-list-row");
    await row.waitFor();
    await row.getByText(platform === "discord" ? "@Notebook agent" : `@${name.replace(/[^A-Za-z0-9]+/g, "")}Bot`, { exact: true }).waitFor();
    await page.screenshot({ path: new URL(`../screenshots/bots-${tag}-registry.png`, import.meta.url).pathname.slice(1), fullPage: true });
    await assertClean(page, tag);
    if (errors.length) throw new Error(`${tag} Bots UI console errors: ${errors.join(" | ")}`);
    await page.close();
  }

  const setupPage = await browser.newPage({ viewport: { width: 740, height: 780 }, colorScheme: "light" });
  await setupPage.goto("http://127.0.0.1:5184/?botsetup=missing#/bots", { waitUntil: "networkidle" });
  await setupPage.getByRole("button", { name: "Create Bot", exact: true }).first().click();
  const setupDialog = setupPage.getByRole("dialog", { name: "Create Bot" });
  await setupDialog.getByRole("button", { name: "Connect Discord", exact: true }).click();
  await setupDialog.getByText("Discord connected", { exact: true }).waitFor();
  await setupDialog.getByText("Telegram bot", { exact: true }).click();
  await setupDialog.getByRole("button", { name: "Connect Telegram", exact: true }).click();
  await setupDialog.getByAltText("Telegram login QR code").waitFor();
  await setupPage.screenshot({ path: new URL("../screenshots/bots-one-time-connect.png", import.meta.url).pathname.slice(1), fullPage: true });
  await setupDialog.getByText("Telegram connected", { exact: true }).waitFor();
  await assertClean(setupPage, "one-time-connect");
  await setupPage.close();
  console.log("Discord agent, Telegram managed bot, one-time connection, private links, responsive, and dark-mode UI passed.");
} finally {
  await browser.close();
  await server.close();
}
