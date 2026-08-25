const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createBotFactory } = require("../src/main/bot-factory.cjs");

const parentPath = fs.mkdtempSync(path.join(os.tmpdir(), "notebook-bot-runtime-"));
const commands = [];
const factory = createBotFactory({
  run: async (command, args, options) => {
    commands.push({ command, args, options });
    return { code: 0, stdout: "", stderr: "" };
  },
});

function input(overrides) {
  return {
    name: "Working Bot",
    description: "Runtime regression fixture.",
    parentPath,
    folderName: "working-bot",
    botId: "working-bot-2",
    platforms: ["discord"],
    runtime: "node",
    discordSecretRef: "NOTEBOOK_DISCORD_CONTROLLER_TOKEN",
    discordApplicationId: "1234567890",
    discordPermissions: "2048",
    telegramSecretRef: "NOTEBOOK_TELEGRAM_WORKING_BOT_TOKEN",
    publishToGithub: false,
    githubRepository: "",
    githubVisibility: "private",
    commitMessage: "Create bot runtime fixture",
    ...overrides,
  };
}

(async () => {
  try {
    const nodeProject = await factory.scaffold(input({}));
    const marker = JSON.parse(fs.readFileSync(path.join(nodeProject.projectPath, ".notebook-bot.json"), "utf8"));
    const nodeSource = fs.readFileSync(path.join(nodeProject.projectPath, "src", "index.js"), "utf8");
    assert.equal(marker.botId, "working-bot-2", "generated status identity must match the registry ID");
    assert.match(nodeSource, /application\.commands\.set\(\[\{ name: 'ping'/, "Discord /ping must be registered, not only handled");
    assert.match(nodeSource, /let state = 'unknown'/, "startup must not claim healthy before platform readiness");
    assert.match(nodeSource, /Discord login/);
    const nodeCheck = spawnSync(process.execPath, ["--check", path.join(nodeProject.projectPath, "src", "index.js")], { encoding: "utf8" });
    assert.equal(nodeCheck.status, 0, nodeCheck.stderr);

    const pythonProject = await factory.scaffold(input({ folderName: "working-python-bot", botId: "working-python-bot", runtime: "python", platforms: ["discord", "telegram"] }));
    const pythonSource = fs.readFileSync(path.join(pythonProject.projectPath, "bot.py"), "utf8");
    assert.match(pythonSource, /app_commands\.CommandTree/);
    assert.match(pythonSource, /await self\.tree\.sync\(\)/, "Python Discord /ping must be registered");
    assert.match(pythonSource, /mark_ready\('telegram'/);
    const pythonCheck = spawnSync("python.exe", ["-m", "py_compile", path.join(pythonProject.projectPath, "bot.py")], { encoding: "utf8" });
    if (pythonCheck.error?.code !== "ENOENT") assert.equal(pythonCheck.status, 0, pythonCheck.stderr);

    assert.equal(commands.filter((item) => item.command === "git.exe").length, 6);
    console.log("Bot Factory generates syntax-valid Node/Python bots with registered /ping commands and truthful startup status.");
  } finally {
    fs.rmSync(parentPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
