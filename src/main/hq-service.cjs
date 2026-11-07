// HQ is the master app for the websites, sign-ups and cold email: a local Node server in
// C:\code\coldsend on 127.0.0.1:4510. Notebook shows it as a page (an iframe of its ?embed=1 view),
// so all the main process has to do is make sure the server is answering, starting it if not.
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const HQ_URL = "http://127.0.0.1:4510";
const DEFAULT_HQ_DIR = "C:\\code\\coldsend";

function createHqService({ hqDir = DEFAULT_HQ_DIR, fetchImpl = fetch, spawnImpl = spawn, waitMs = 250, attempts = 48 } = {}) {
  let starting = null;

  async function isUp() {
    try { return (await fetchImpl(`${HQ_URL}/api/up`, { signal: AbortSignal.timeout(1500) })).ok; }
    catch { return false; }
  }

  async function start() {
    const server = path.join(hqDir, "server.mjs");
    if (!fs.existsSync(server)) return { ready: false, error: `HQ is not installed at ${hqDir}.` };
    // Same as HQ's own start.cmd: plain node, detached, so HQ outlives Notebook and its tray keeps working.
    const child = spawnImpl("node", [server], { cwd: hqDir, detached: true, windowsHide: true, stdio: "ignore" });
    child.on?.("error", () => {});
    child.unref?.();
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      if (await isUp()) return { ready: true, started: true };
    }
    return { ready: false, error: "HQ did not answer within 12 seconds. Run start.cmd in C:\\code\\coldsend to see why." };
  }

  // Concurrent callers share one start, so two quick clicks never launch two servers.
  async function ensure() {
    if (await isUp()) return { ready: true };
    starting ||= start().finally(() => { starting = null; });
    return starting;
  }

  return { ensure, isUp, url: HQ_URL };
}

function isHqUrl(value) {
  try { return new URL(value).origin === HQ_URL; }
  catch { return false; }
}

module.exports = { HQ_URL, DEFAULT_HQ_DIR, createHqService, isHqUrl };
