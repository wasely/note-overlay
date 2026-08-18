const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function createBotProcessService({ run, resolveSecret = () => undefined }) {
  const processes = new Map();
  function generatedProject(bot) {
    const root = path.resolve(String(bot?.localProjectPath || ""));
    if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error("The local bot project folder is unavailable.");
    const markerPath = path.join(root, ".notebook-bot.json");
    let marker;
    try { marker = JSON.parse(fs.readFileSync(markerPath, "utf8")); } catch { throw new Error("Start is available only for projects created by Notebook's Bot Factory."); }
    const expectedEntry = marker?.runtime === "node" ? "src/index.js" : marker?.runtime === "python" ? "bot.py" : "";
    if (marker?.schemaVersion !== 1 || marker.entry !== expectedEntry) throw new Error("The generated bot marker is invalid.");
    const entry = path.resolve(root, marker.entry); const relation = path.relative(root, entry);
    if (relation.startsWith("..") || path.isAbsolute(relation) || !fs.existsSync(entry)) throw new Error("The generated bot entry point is missing.");
    return { root: fs.realpathSync.native(root), marker, entry };
  }
  function status(bot) {
    try {
      const project = generatedProject(bot); const active = processes.get(bot.id);
      return { available: true, running: Boolean(active && !active.child.killed && active.exitCode == null), installing: Boolean(active?.installing), pid: active?.child?.pid || null, projectPath: project.root };
    } catch (error) { return { available: false, running: false, installing: false, pid: null, reason: error.message }; }
  }
  async function start(bot) {
    const project = generatedProject(bot); const current = processes.get(bot.id);
    if (current && current.exitCode == null) return status(bot);
    fs.mkdirSync(path.join(project.root, "runtime"), { recursive: true });
    if (project.marker.runtime === "node" && !fs.existsSync(path.join(project.root, "node_modules"))) await run("npm.cmd", ["install", "--no-audit", "--no-fund"], { cwd: project.root, timeout: 5 * 60_000 });
    let executable; let args;
    if (project.marker.runtime === "python") {
      const python = path.join(project.root, ".venv", "Scripts", "python.exe");
      if (!fs.existsSync(python)) await run("python.exe", ["-m", "venv", ".venv"], { cwd: project.root, timeout: 120_000 });
      await run(python, ["-m", "pip", "install", "--disable-pip-version-check", "-r", "requirements.txt"], { cwd: project.root, timeout: 5 * 60_000 });
      executable = python; args = ["bot.py"];
    } else { executable = "node.exe"; args = ["src/index.js"]; }
    const environment = { ...process.env };
    for (const connection of bot.connections || []) {
      const reference = String(connection.credentialSecretRef || "");
      if (!/^[A-Z_][A-Z0-9_]{1,127}$/.test(reference)) continue;
      const value = resolveSecret(reference) || process.env[reference];
      if (value) environment[reference] = value;
    }
    const log = fs.openSync(path.join(project.root, "runtime", "notebook-launch.log"), "a");
    const child = spawn(executable, args, { cwd: project.root, env: environment, shell: false, windowsHide: true, stdio: ["ignore", log, log] });
    const record = { child, exitCode: null, startedAt: new Date().toISOString() }; processes.set(bot.id, record);
    child.once("exit", (code) => { record.exitCode = code; try { fs.closeSync(log); } catch {} });
    child.once("error", () => { record.exitCode = -1; try { fs.closeSync(log); } catch {} });
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (record.exitCode != null) throw new Error("The bot exited during startup. Check runtime/notebook-launch.log.");
    return status(bot);
  }
  async function stop(bot) {
    const record = processes.get(bot.id); if (!record || record.exitCode != null) return status(bot);
    record.child.kill();
    await new Promise((resolve) => { const timer = setTimeout(resolve, 2_000); record.child.once("exit", () => { clearTimeout(timer); resolve(); }); });
    return status(bot);
  }
  function stopAll() { for (const record of processes.values()) if (record.exitCode == null) record.child.kill(); processes.clear(); }
  return { status, start, stop, stopAll };
}

module.exports = { createBotProcessService };
