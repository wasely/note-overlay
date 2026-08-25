import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const packagedExecutable = process.env.NOTEBOOK_EXECUTABLE;
const userData = await fs.mkdtemp(path.join(os.tmpdir(), "notebook-mail-window-test-"));
const server = http.createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/html" }).end("<!doctype html><title>Mail bounds test</title>");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const app = await electron.launch({
  executablePath: packagedExecutable || electronPath,
  args: packagedExecutable
    ? [`--user-data-dir=${userData}`, "--background"]
    : [`--user-data-dir=${userData}`, ".", "--background"],
  env: {
    ...process.env,
    ...(packagedExecutable ? {} : { NOTEBOOK_MAIL_URL: `http://127.0.0.1:${port}/mail` }),
    NOTEBOOK_DISABLE_STARTUP_REGISTRATION: "1",
  },
});

async function windowState() {
  return app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return {
      maximized: window.isMaximized(),
      fullScreen: window.isFullScreen(),
      minimized: window.isMinimized(),
      bounds: window.getBounds(),
    };
  });
}

function assertNormal(state, source) {
  if (state.maximized || state.fullScreen || state.minimized || state.bounds.width > 1100 || state.bounds.height > 800) {
    throw new Error(`Gmail kept the ${source} window state: ${JSON.stringify(state)}`);
  }
}

try {
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.show();
    window.setFullScreen(true);
  });
  await page.waitForTimeout(250);
  if (!(await windowState()).fullScreen) throw new Error("Fullscreen setup failed.");
  await page.evaluate(() => window.hushnote.mail.show());
  await page.waitForTimeout(250);
  assertNormal(await windowState(), "fullscreen");

  await page.evaluate(() => window.hushnote.mail.hide());
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
  await page.waitForTimeout(250);
  const maximizedState = await windowState();
  if (maximizedState.maximized) {
    await page.evaluate(() => window.hushnote.mail.show());
    await page.waitForTimeout(250);
    assertNormal(await windowState(), "maximized");
  }

  console.log("Gmail always restores normal Notebook window bounds.");
} finally {
  await app.evaluate(({ app }) => app.quit()).catch(() => {});
  await app.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
