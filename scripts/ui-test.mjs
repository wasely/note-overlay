import { chromium } from "playwright";
import { createServer } from "vite";

// Boots the browser preview (mocked bridge) and checks layout, legibility, and the core flows.
const server = await createServer({ configFile: "vite.config.js", server: { host: "127.0.0.1", port: 5182, strictPort: true } });
await server.listen();
const base = "http://127.0.0.1:5182";

async function launch() {
  try { return await chromium.launch({ channel: "chrome" }); }
  catch { return chromium.launch(); }
}

async function assertNoOverflow(page, label) {
  const result = await page.evaluate(() => ({ viewport: innerWidth, root: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  if (result.root > result.viewport || result.body > result.viewport) throw new Error(`${label}: horizontal overflow ${JSON.stringify(result)}`);
}

async function assertLegible(page, label) {
  const problems = await page.evaluate(() => {
    const small = [];
    const tiny = [];
    for (const element of document.querySelectorAll("body *")) {
      if (!(element instanceof HTMLElement) || element.offsetParent === null) continue;
      const text = [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent.trim()).join("");
      const size = Number.parseFloat(getComputedStyle(element).fontSize);
      if (text && size < 11) small.push(`${element.className || element.tagName} ${size}px "${text.slice(0, 24)}"`);
      const interactive = element.matches("button, select, input:not([type=checkbox]), textarea, [role=button]");
      // Bare inputs inherit their hit area from the label wrapping them.
      const box = (element.closest("label") || element).getBoundingClientRect();
      if (interactive && box.height < 22) tiny.push(`${element.className || element.tagName} ${Math.round(box.height)}px`);
    }
    return { small, tiny };
  });
  if (problems.small.length) throw new Error(`${label}: text under 11px — ${problems.small.slice(0, 6).join(" | ")}`);
  if (problems.tiny.length) throw new Error(`${label}: controls under 22px tall — ${problems.tiny.slice(0, 6).join(" | ")}`);
}

async function assertLibraryRail(page, label) {
  const geometry = await page.evaluate(() => {
    const box = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect && { left: rect.left, right: rect.right, width: rect.width };
    };
    return { navigation: box(".sidebar"), library: box(".library-browser"), editor: box(".library-workspace > .pane") };
  });
  if (!geometry.library || geometry.library.width < 180) throw new Error(`${label}: library rail is missing or collapsed.`);
  if (Math.abs(geometry.navigation.right - geometry.library.left) > 2 || Math.abs(geometry.library.right - geometry.editor.left) > 2) {
    throw new Error(`${label}: chooser is not a separate rail between navigation and editor — ${JSON.stringify(geometry)}`);
  }
}

const navButton = (page, view) => page.locator(".nav button").filter({ hasText: view }).first();

const browser = await launch();
try {
  for (const [label, width, height] of [["narrow", 340, 760], ["compact", 460, 800], ["medium", 780, 820], ["wide", 1180, 880]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await page.goto(`${base}/?daily=demo&projects=demo`, { waitUntil: "networkidle" });
    for (const view of ["Today", "Notes", "Skills", "Commands", "Projects"]) {
      await navButton(page, view).click();
      await page.waitForTimeout(120);
      await assertNoOverflow(page, `${view} @ ${width}`);
      await assertLegible(page, `${view} @ ${width}`);
    }
    const aiButtons = page.locator(".ai-panel-buttons button");
    if (await aiButtons.count() !== 3) throw new Error(`AI panel @ ${width}: expected three services.`);
    await assertLegible(page, `AI panel @ ${width}`);
    await page.getByRole("button", { name: "Settings and backups" }).click();
    await page.getByRole("heading", { name: "Settings" }).waitFor();
    await assertNoOverflow(page, `Settings @ ${width}`);
    await assertLegible(page, `Settings @ ${width}`);
    await page.screenshot({ path: `screenshots/ui-${label}-settings.png` });
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 1100, height: 860 } });
  const page = await context.newPage();
  await page.goto(`${base}/?daily=demo&projects=demo`, { waitUntil: "networkidle" });

  // The compact bottom panel switches among three live-service placeholders.
  await page.getByRole("button", { name: "Open ChatGPT" }).click();
  await page.getByRole("group", { name: "Switch AI" }).waitFor();
  await page.getByText("ChatGPT preview", { exact: true }).waitFor();
  await page.getByRole("group", { name: "Switch AI" }).getByRole("button", { name: /Gemini/ }).click();
  await page.getByText("Gemini preview", { exact: true }).waitFor();
  await assertNoOverflow(page, "AI service screen");
  await assertLegible(page, "AI service screen");
  await page.getByRole("button", { name: "Notebook", exact: true }).click();

  // Today: write a line, check it off, and page back and forth through the days.
  await navButton(page, "Today").click();
  await page.locator(".paper").waitFor();
  const todayHeading = await page.locator(".paper-date h1").innerText();
  await page.getByLabel(/^Task for /).first().fill("Test the paper page");
  await page.locator(".line-add button").first().click();
  await page.getByLabel("Check off Test the paper page").waitFor();
  await page.getByLabel("Check off Test the paper page").check();
  await page.locator(".line.is-done", { hasText: "Test the paper page" }).waitFor();
  await page.getByRole("button", { name: "Previous day" }).click();
  await page.waitForFunction((heading) => document.querySelector(".paper-date h1")?.textContent !== heading, todayHeading);
  await page.getByRole("button", { name: "Back to today" }).click();
  await page.waitForFunction((heading) => document.querySelector(".paper-date h1")?.textContent === heading, todayHeading);
  if (await page.locator(".paper-kicker", { hasText: "Today" }).count() !== 1) throw new Error("The daily page lost its Today marker.");
  const selectedDay = await page.locator(".calendar-day.is-selected").innerText();
  if (Number(selectedDay) !== new Date().getDate()) throw new Error(`Calendar selection is on the wrong day: ${selectedDay}`);

  // Notes: writing, Markdown preview, interactive checkboxes, pinning.
  await navButton(page, "Notes").click();
  await assertLibraryRail(page, "Notes");
  await page.getByRole("button", { name: "Hide note list" }).click();
  if (await page.locator(".library-browser").count()) throw new Error("Notes: hide-list control did not close the library rail.");
  await page.getByRole("button", { name: "Show note list" }).click();
  await page.locator(".library-browser").waitFor();
  await page.getByLabel("Note title").fill("Release checklist");
  await page.getByLabel("Note content").fill("# Ship it\n\nA **short** plan.\n\n- [ ] Verify the build\n- [x] Update the notes");
  await page.getByText("Saved", { exact: true }).waitFor();
  const counted = await page.locator(".note-meta").innerText();
  if (!/\d+ words/.test(counted) || !counted.includes("1/2 done")) throw new Error(`Note meta line is wrong: ${counted}`);

  await page.getByRole("button", { name: "Preview" }).click();
  await page.getByRole("heading", { name: "Ship it" }).waitFor();
  if (await page.locator(".note-reading strong", { hasText: "short" }).count() !== 1) throw new Error("Bold text did not render in preview.");
  await page.getByRole("checkbox", { name: "Verify the build" }).check();
  await page.waitForTimeout(400);
  const savedBody = await page.evaluate(async () => (await window.hushnote?.notes?.list?.() ?? [])[0]?.body ?? document.querySelector(".note-reading").textContent);
  if (!/Verify the build/.test(savedBody)) throw new Error("Preview checkbox toggle lost the task text.");
  const checkedState = await page.getByRole("checkbox", { name: "Verify the build" }).isChecked();
  if (!checkedState) throw new Error("Preview checkbox did not stay checked after writing back to the note.");
  await page.getByRole("button", { name: "Edit" }).click();
  const editorText = await page.getByLabel("Note content").inputValue();
  if (!editorText.includes("- [x] Verify the build")) throw new Error(`Checkbox did not write back into Markdown: ${editorText}`);

  await page.getByRole("button", { name: "Pin note" }).click();
  await page.locator(".row.is-selected .row-pin").waitFor();

  // Search reaches every kind of content.
  await page.getByLabel("Search everything").fill("Release");
  await page.locator(".results").getByText("Release checklist", { exact: true }).waitFor();
  await page.getByLabel("Search everything").fill("");

  await navButton(page, "Commands").click();
  await assertLibraryRail(page, "Commands");
  await page.locator(".library-browser").getByText("Git push", { exact: true }).waitFor();

  // Projects: category filtering, cross-tier drag, and the review-before-push flow.
  await navButton(page, "Projects").click();
  await page.getByRole("heading", { name: "Now" }).waitFor();
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByText("Claude proxy", { exact: true }).waitFor();
  await page.getByRole("button", { name: /All/ }).click();
  await page.locator(".priority-card", { hasText: "Claude proxy" }).locator(".priority-drag").dragTo(page.locator(".priority-lane.tier-1"));
  await page.locator(".priority-lane.tier-1 .priority-card", { hasText: "Claude proxy" }).waitFor();
  await page.getByRole("button", { name: "GitHub", exact: true }).click();
  await page.getByRole("button", { name: "Review & commit" }).click();
  await page.getByRole("dialog", { name: "Commit ClipForge AI" }).waitFor();
  await page.getByText("diff --git", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Commit & push" }).click();
  await page.getByText(/Committed f00ba412 and pushed/).waitFor();
  await page.getByRole("button", { name: "Set up", exact: true }).click();
  await page.getByRole("dialog", { name: "Set up GitHub for Claude proxy" }).waitFor();
  await page.getByRole("button", { name: "Create repository" }).click();
  await page.getByText(/Created wasely\/claude-proxy on GitHub/).waitFor();
  await assertNoOverflow(page, "Projects GitHub flow");
  await assertLegible(page, "Projects GitHub flow");
  await navButton(page, "Notes").click();

  // Keyboard: Ctrl+2..4 switch pages, Ctrl+E toggles preview.
  await page.keyboard.press("Control+3");
  await navButton(page, "Skills").and(page.locator(".is-active")).waitFor();
  await page.keyboard.press("Control+2");
  await navButton(page, "Notes").and(page.locator(".is-active")).waitFor();
  await page.keyboard.press("Control+e");
  await page.getByRole("button", { name: "Edit" }).waitFor();
  await page.keyboard.press("Control+e");
  await page.getByRole("button", { name: "Preview" }).waitFor();

  // Theme control writes a real theme onto the document.
  await page.getByRole("button", { name: "Settings and backups" }).click();
  await page.getByRole("button", { name: "Dark" }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  const darkCanvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.getByRole("button", { name: "Light" }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
  const lightCanvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (darkCanvas === lightCanvas) throw new Error("Theme switch did not change the canvas colour.");
  await page.getByRole("button", { name: "Close settings" }).click();

  await context.close();
  console.log("UI test passed: layout at 4 widths, 11px minimum type, Projects drag/GitHub flow, daily page capture/check/paging, Markdown preview write-back, pinning, search, keyboard, and theme.");
} finally {
  await browser.close();
  await server.close();
}
