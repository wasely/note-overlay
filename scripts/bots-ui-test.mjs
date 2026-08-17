import { chromium } from "playwright";
import { createServer } from "vite";
import fs from "node:fs/promises";

async function launch() { try { return await chromium.launch({ channel: "chrome" }); } catch { return chromium.launch(); } }
const server = await createServer({ server: { host: "127.0.0.1", port: 5184, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await launch();
await fs.mkdir(new URL("../screenshots/", import.meta.url), { recursive: true });

try {
  for (const [tag, width, height] of [["wide", 1180, 860], ["narrow", 620, 780]]) {
    const page = await browser.newPage({ viewport: { width, height }, colorScheme: tag === "narrow" ? "dark" : "light" });
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:5184/#/bots", { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Bots", exact: true }).waitFor();
    await page.getByText("No bots registered", { exact: true }).waitFor();
    await page.screenshot({ path: new URL(`../screenshots/bots-${tag}-empty.png`, import.meta.url).pathname.slice(1), fullPage: true });

    await page.getByRole("button", { name: "Add bot", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add bot" });
    await dialog.getByRole("button", { name: "Add bot", exact: true }).click();
    await dialog.getByText("Name is required.", { exact: true }).waitFor();
    await page.getByLabel("Bot name").fill("Calendar Operations Bot With A Deliberately Long Name");
    await page.getByLabel("Bot description").fill("Publishes scheduled calendar summaries without collecting Discord or Telegram message content.");
    await page.getByLabel("Execution mode").selectOption("scheduled");
    await page.getByLabel("Bot environment").fill("production");
    await page.getByLabel("Bot tags").fill("calendar, productivity, summaries, operations, long-tag-example");
    await dialog.getByRole("checkbox", { name: "Discord", exact: true }).uncheck();
    await dialog.getByRole("checkbox", { name: "Telegram", exact: true }).check();
    await page.getByLabel("telegram username").fill("calendar_ops_bot");
    await page.getByLabel("telegram credential secret reference").fill("TELEGRAM_CALENDAR_BOT_TOKEN");
    await dialog.getByRole("button", { name: "Add job", exact: true }).click();
    await page.getByLabel("Job name").fill("Morning summary");
    await page.getByLabel("Cron expression for Morning summary").fill("0 8 * * *");
    await page.getByLabel("Timezone for Morning summary").fill("America/Edmonton");
    await dialog.getByRole("button", { name: "Add command", exact: true }).click();
    await page.getByLabel("Command name").fill("/today");
    await page.getByLabel("Description for /today").fill("Show today’s schedule.");
    await page.getByLabel("Category for /today").fill("Calendar");
    await page.getByLabel("Notes for /today").fill("Documented metadata only; no message content is collected.");
    await dialog.getByRole("checkbox", { name: "Deprecated", exact: true }).check();
    await page.screenshot({ path: new URL(`../screenshots/bots-${tag}-form.png`, import.meta.url).pathname.slice(1), fullPage: true });
    await dialog.getByRole("button", { name: "Add bot", exact: true }).click();
    await page.getByRole("heading", { name: "Calendar Operations Bot With A Deliberately Long Name", exact: true }).waitFor();
    await page.getByRole("button", { name: "Commands", exact: true }).click();
    await page.getByText("Deprecated", { exact: true }).waitFor();
    await page.getByText("Calendar", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Jobs", exact: true }).click();
    await page.getByText("Morning summary", { exact: true }).waitFor();
    await page.screenshot({ path: new URL(`../screenshots/bots-${tag}-jobs.png`, import.meta.url).pathname.slice(1), fullPage: true });
    await page.getByRole("button", { name: "Connections", exact: true }).click();
    await page.getByText("Identity verification proves credentials, not whether the real process is running.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit bot", exact: true });
    await editDialog.getByRole("button", { name: "Add job", exact: true }).click();
    await editDialog.getByLabel("Job name").last().fill("Backup summary");
    await editDialog.getByRole("button", { name: "Archive Morning summary", exact: true }).click();
    await editDialog.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByRole("button", { name: "Jobs", exact: true }).click();
    const archivedJob = page.locator(".bot-job-details article").filter({ hasText: "Morning summary" });
    await archivedJob.getByText("Archived", { exact: true }).waitFor();
    await page.getByRole("button", { name: "← Registry", exact: true }).click();
    await page.getByRole("heading", { name: "Bot registry", exact: true }).waitFor();
    await page.getByLabel("Search bots").fill("calendar_ops_bot");
    await page.locator(".bot-table-row").waitFor();
    await page.screenshot({ path: new URL(`../screenshots/bots-${tag}-registry.png`, import.meta.url).pathname.slice(1), fullPage: true });
    const overflow = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    if (overflow.document > overflow.viewport || overflow.body > overflow.viewport) throw new Error(`${tag} Bots UI overflows: ${JSON.stringify(overflow)}`);
    const filterOverflow = await page.locator(".bot-filters").evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    if (filterOverflow.scroll > filterOverflow.client + 1) throw new Error(`${tag} bot filters overflow: ${JSON.stringify(filterOverflow)}`);
    if (errors.length) throw new Error(`${tag} Bots UI console errors: ${errors.join(" | ")}`);
    await page.close();
  }
  console.log("Bots empty, validation, create, schedule preview, details, search, responsive, dark-mode UI test passed.");
} finally {
  await browser.close();
  await server.close();
}
