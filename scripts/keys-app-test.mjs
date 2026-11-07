import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const packagedExecutable = process.env.NOTEBOOK_EXECUTABLE;
const userData = await fs.mkdtemp(path.join(os.tmpdir(), "notebook-keys-test-"));
const server = createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end("<!doctype html><title>Notebook test service</title>");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const serviceBase = `http://127.0.0.1:${server.address().port}`;
const app = await electron.launch({
  executablePath: packagedExecutable || electronPath,
  args: [`--user-data-dir=${userData}`, ...(packagedExecutable ? [] : ["."])],
  env: {
    ...process.env,
    NOTEBOOK_TEST_ISOLATED: "1",
    NOTEBOOK_DISABLE_STARTUP_REGISTRATION: "1",
    NOTEBOOK_MAIL_URL: `${serviceBase}/mail`,
    NOTEBOOK_NOTION_URL: `${serviceBase}/notion`,
    NOTEBOOK_TWITTER_URL: `${serviceBase}/twitter`,
    NOTEBOOK_EXCALIDRAW_URL: `${serviceBase}/excalidraw`,
    NOTEBOOK_AI_CHATGPT_URL: `${serviceBase}/chatgpt`,
    NOTEBOOK_AI_GEMINI_URL: `${serviceBase}/gemini`,
    NOTEBOOK_AI_DEEPSEEK_URL: `${serviceBase}/deepseek`,
  },
});
const navButton = (page, label) => page.locator(".nav button").filter({ hasText: label }).first();

try {
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await page.getByText("Notebook", { exact: true }).waitFor();

  const navLabels = await page.locator(".nav button strong").allTextContents();
  if (!navLabels.includes("Skills & Commands") || navLabels.includes("Skills") || navLabels.includes("Commands")) throw new Error(`Top-level tools navigation was not combined: ${JSON.stringify(navLabels)}`);
  await navButton(page, "Skills & Commands").click();
  await page.getByRole("heading", { name: "My skills", exact: true }).waitFor();
  await page.getByRole("tab", { name: /^Commands/ }).click();
  await page.getByText("Git push", { exact: true }).first().waitFor();

  const sources = await page.evaluate(() => window.hushnote.keys.list());
  for (const keyName of ["build-a-key", "thumbnail-extension-fix"]) {
    const expected = await fs.readFile(path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "skills", keyName, "SKILL.md"), "utf8");
    const actual = sources.find((item) => item.id === keyName);
    if (!actual?.exists || actual.content !== expected) throw new Error(`${keyName} was not loaded byte-for-byte.`);
  }

  await navButton(page, "Keys").click();
  await page.getByRole("heading", { name: "Keys", exact: true }).waitFor();
  await page.getByRole("button", { name: /Thumbnail Extension Fix/ }).click();
  const expectedThumbnailKey = sources.find((item) => item.id === "thumbnail-extension-fix").content;
  const displayedThumbnailKey = await page.locator(".key-source").textContent();
  if (displayedThumbnailKey !== expectedThumbnailKey) throw new Error("Keys page altered the selected SKILL.md source.");
  await page.getByRole("button", { name: /Copy source/ }).click();
  await page.getByRole("button", { name: /Copied/ }).waitFor();
  await page.screenshot({ path: "screenshots/shot-electron-keys.png" });

  console.log("Keys Electron test passed: combined tools navigation and exact installed key sources.");
} finally {
  await app.evaluate(({ app: electronApp }) => electronApp.quit()).catch(() => {});
  await app.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
