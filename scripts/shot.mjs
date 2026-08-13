import { chromium } from "playwright";

async function launch() {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    return chromium.launch();
  }
}

const browser = await launch();
for (const [tag, width, height] of [["narrow", 440, 800], ["wide", 1100, 860]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto("http://127.0.0.1:5181/", { waitUntil: "networkidle" });
  const emptyDrag = await page.locator(".drag-action").evaluate((element) => ({ draggable: element.draggable, disabled: element.getAttribute("aria-disabled") }));
  if (emptyDrag.draggable || emptyDrag.disabled !== "true") throw new Error(`Empty note drag control is not disabled: ${JSON.stringify(emptyDrag)}`);
  await page.screenshot({ path: `shot-${tag}-empty.png`, fullPage: true });
  await page.getByRole("button", { name: "New notebook" }).click();
  await page.screenshot({ path: `shot-${tag}-notebook-create.png`, fullPage: true });
  await page.getByLabel("Notebook name").fill("Projects");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByLabel("Note title").fill("Project dump");
  await page.getByLabel("Note content").fill("Keep this simple. It saves automatically and stays on this computer.\n\n- [ ] Send draft\n- [x] Collect references");
  await page.getByText("Saved", { exact: true }).waitFor();
  const browserDrag = await page.locator(".drag-action").evaluate((element) => {
    const dataTransfer = new DataTransfer();
    element.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer }));
    return { draggable: element.draggable, disabled: element.getAttribute("aria-disabled"), types: [...dataTransfer.types], text: dataTransfer.getData("text/plain"), download: dataTransfer.getData("DownloadURL") };
  });
  if (!browserDrag.draggable || browserDrag.disabled !== "false" || !browserDrag.types.includes("Files") || !browserDrag.download.includes("Project dump.md") || browserDrag.text !== "Project dump.md") throw new Error(`Browser Markdown drag payload is incomplete: ${JSON.stringify(browserDrag)}`);
  await page.screenshot({ path: `shot-${tag}-note.png`, fullPage: true });
  await page.getByRole("button", { name: "More note actions" }).click();
  await page.screenshot({ path: `shot-${tag}-menu.png`, fullPage: true });
  await page.getByRole("button", { name: "More note actions" }).click();
  await page.getByRole("button", { name: /Checklist/ }).click();
  await page.waitForTimeout(180);
  await page.screenshot({ path: `shot-${tag}-checklist.png`, fullPage: true });
  await page.goto("http://127.0.0.1:5181/?demo=success", { waitUntil: "networkidle" });
  await page.getByLabel("Note content").fill("Write a clear project update. The feature is complete and ready for review.");
  await page.getByRole("button", { name: "More note actions" }).click();
  await page.getByRole("button", { name: "Compress" }).click();
  await page.getByRole("button", { name: "Compress note" }).click();
  await page.screenshot({ path: `shot-${tag}-compressor.png`, fullPage: true });
  await page.goto("http://127.0.0.1:5181/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Backups and settings" }).click();
  await page.screenshot({ path: `shot-${tag}-backups.png`, fullPage: true });
  await page.goto("http://127.0.0.1:5181/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Skills" }).click();
  await page.getByRole("button", { name: "New skill" }).click();
  await page.getByLabel("Skill name").fill("Terminal workflow");
  await page.getByLabel("Skill category").fill("Automation");
  await page.getByLabel("Skill notes").fill("Open the terminal, verify the working folder, then run the checked command.");
  await page.waitForTimeout(400);
  await page.getByText("Saved", { exact: true }).waitFor();
  await page.screenshot({ path: `shot-${tag}-skills.png`, fullPage: true });
  await page.getByRole("button", { name: "Slash commands" }).click();
  await page.getByText("Git push", { exact: true }).waitFor();
  await page.screenshot({ path: `shot-${tag}-slash-commands.png`, fullPage: true });
  await page.getByText("Markdown, skills, and slash commands", { exact: true }).click();
  await page.screenshot({ path: `shot-${tag}-command-guide.png`, fullPage: true });
  await page.close();
}
await browser.close();
