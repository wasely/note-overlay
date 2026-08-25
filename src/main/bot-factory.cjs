const fs = require("fs");
const path = require("path");

function slugify(value) {
  return String(value || "bot").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "bot";
}

function safeParent(value) {
  const resolved = path.resolve(String(value || ""));
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) throw new Error("Choose an existing parent folder.");
  return fs.realpathSync.native(resolved);
}

function envExample(input) {
  const lines = ["# Copy to .env. Never commit .env."];
  if (input.platforms.includes("discord")) {
    lines.push(`${input.discordSecretRef}=replace-with-discord-bot-token`);
    lines.push(`DISCORD_APPLICATION_ID=${input.discordApplicationId || "replace-with-application-id"}`);
  }
  if (input.platforms.includes("telegram")) lines.push(`${input.telegramSecretRef}=replace-with-telegram-bot-token`);
  return `${lines.join("\n")}\n`;
}

function nodeFiles(input, slug) {
  const imports = ["import 'dotenv/config';", "import fs from 'node:fs';", "import path from 'node:path';"];
  if (input.platforms.includes("discord")) imports.push("import { Client, Events, GatewayIntentBits } from 'discord.js';");
  if (input.platforms.includes("telegram")) imports.push("import { Bot } from 'grammy';");
  const starts = [];
  const stops = [];
  if (input.platforms.includes("discord")) {
    starts.push(`const discordToken = required('${input.discordSecretRef}');\nconst discord = new Client({ intents: [GatewayIntentBits.Guilds] });\ndiscord.once(Events.ClientReady, async client => {\n  try {\n    await client.application.commands.set([{ name: 'ping', description: 'Confirm the bot is online.' }]);\n    markReady('discord', \`Discord connected as \${client.user.tag}; /ping registered\`);\n  } catch (error) { fail('Discord command registration', error); }\n});\ndiscord.on(Events.InteractionCreate, async interaction => { if (interaction.isChatInputCommand() && interaction.commandName === 'ping') await interaction.reply({ content: 'Pong', ephemeral: true }); });\ndiscord.on(Events.Error, error => fail('Discord connection', error));\ndiscord.login(discordToken).catch(error => fail('Discord login', error));`);
    stops.push("discord.destroy();");
  }
  if (input.platforms.includes("telegram")) {
    starts.push(`const telegram = new Bot(required('${input.telegramSecretRef}'));\ntelegram.command('ping', context => context.reply('Pong'));\ntelegram.catch(error => fail('Telegram update', error.error || error));\ntelegram.start({ onStart: info => markReady('telegram', \`Telegram connected as @\${info.username}\`) }).catch(error => fail('Telegram login', error));`);
    stops.push("telegram.stop();");
  }
  const source = `${imports.join("\n")}\n\nconst startedAt = new Date().toISOString();\nconst expectedPlatforms = ${input.platforms.length};\nconst readyPlatforms = new Set();\nlet state = 'unknown';\nlet activity = 'running';\nlet message = 'Starting';\nfunction required(name) { const value = process.env[name]; if (!value) throw new Error(\`Missing required environment variable: \${name}\`); return value; }\nfunction writeStatus() {\n  const directory = path.resolve('runtime'); fs.mkdirSync(directory, { recursive: true });\n  const payload = { schemaVersion: 1, botId: '${slug}', observedAt: new Date().toISOString(), state, activity, message, startedAt, version: '1.0.0', jobs: [] };\n  const temporary = path.join(directory, 'status.json.tmp'); fs.writeFileSync(temporary, JSON.stringify(payload, null, 2)); fs.renameSync(temporary, path.join(directory, 'status.json'));\n}\nfunction markReady(platform, detail) { readyPlatforms.add(platform); state = readyPlatforms.size === expectedPlatforms ? 'healthy' : 'unknown'; activity = readyPlatforms.size === expectedPlatforms ? 'idle' : 'running'; message = detail; writeStatus(); }\nfunction fail(stage, error) { state = 'degraded'; activity = 'idle'; message = \`\${stage} failed\`; writeStatus(); console.error(error?.message || message); setTimeout(() => process.exit(1), 25); }\nwriteStatus(); setInterval(writeStatus, 30000).unref();\n\n${starts.join("\n\n")}\n\nprocess.on('SIGINT', () => { state = 'offline'; activity = 'idle'; message = 'Stopped normally'; writeStatus(); ${stops.map((line) => `try { ${line} } catch {}`).join(" ")} process.exit(0); });\n`;
  return {
    "package.json": `${JSON.stringify({ name: slug, version: "1.0.0", private: true, type: "module", scripts: { start: "node src/index.js", dev: "node --watch src/index.js" }, dependencies: { ...(input.platforms.includes("discord") ? { "discord.js": "^14.22.1" } : {}), ...(input.platforms.includes("telegram") ? { grammy: "^1.38.2" } : {}), dotenv: "^17.2.2" } }, null, 2)}\n`,
    "src/index.js": source,
  };
}

function pythonFiles(input, slug) {
  const imports = ["import asyncio", "import json", "import os", "from datetime import datetime, timezone", "from pathlib import Path", "from dotenv import load_dotenv"];
  if (input.platforms.includes("discord")) imports.push("import discord", "from discord import app_commands");
  if (input.platforms.includes("telegram")) imports.push("from telegram import Update", "from telegram.ext import Application, CommandHandler, ContextTypes");
  const functions = [];
  const starts = [];
  if (input.platforms.includes("discord")) {
    functions.push(`class DiscordClient(discord.Client):\n    def __init__(self):\n        super().__init__(intents=discord.Intents.none())\n        self.tree = app_commands.CommandTree(self)\n\n    async def setup_hook(self):\n        @self.tree.command(name='ping', description='Confirm the bot is online.')\n        async def ping(interaction: discord.Interaction):\n            await interaction.response.send_message('Pong', ephemeral=True)\n        await self.tree.sync()\n\n    async def on_ready(self):\n        mark_ready('discord', f'Discord connected as {self.user}; /ping registered')`);
    starts.push(`discord_client = DiscordClient()\ntasks.append(discord_client.start(required('${input.discordSecretRef}')))`);
  }
  if (input.platforms.includes("telegram")) {
    functions.push("async def telegram_ping(update: Update, context: ContextTypes.DEFAULT_TYPE):\n    await update.message.reply_text('Pong')");
    starts.push(`telegram_app = Application.builder().token(required('${input.telegramSecretRef}')).build()\ntelegram_app.add_handler(CommandHandler('ping', telegram_ping))\nawait telegram_app.initialize()\nawait telegram_app.start()\nawait telegram_app.updater.start_polling()\nmark_ready('telegram', f'Telegram connected as @{telegram_app.bot.username}')`);
  }
  const startBlock = starts.join("\n").split("\n").map((line) => `        ${line}`).join("\n");
  const source = `${imports.join("\n")}\n\nload_dotenv()\nSTARTED_AT = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')\nEXPECTED_PLATFORMS = ${input.platforms.length}\nREADY_PLATFORMS = set()\n\ndef required(name):\n    value = os.getenv(name)\n    if not value:\n        raise RuntimeError(f'Missing required environment variable: {name}')\n    return value\n\ndef write_status(state='unknown', activity='running', message='Starting'):\n    directory = Path('runtime'); directory.mkdir(exist_ok=True)\n    payload = {'schemaVersion': 1, 'botId': '${slug}', 'observedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'), 'state': state, 'activity': activity, 'message': message, 'startedAt': STARTED_AT, 'version': '1.0.0', 'jobs': []}\n    temporary = directory / 'status.json.tmp'; temporary.write_text(json.dumps(payload, indent=2), encoding='utf-8'); temporary.replace(directory / 'status.json')\n\ndef mark_ready(platform, detail):\n    READY_PLATFORMS.add(platform)\n    ready = len(READY_PLATFORMS) == EXPECTED_PLATFORMS\n    write_status('healthy' if ready else 'unknown', 'idle' if ready else 'running', detail)\n\n${functions.join("\n\n")}\n\nasync def main():\n    tasks = []\n    write_status()\n    try:\n${startBlock}\n        if tasks:\n            await asyncio.gather(*tasks)\n        else:\n            await asyncio.Event().wait()\n    except Exception as error:\n        write_status('degraded', 'idle', f'Startup failed: {type(error).__name__}')\n        raise\n\nif __name__ == '__main__':\n    asyncio.run(main())\n`;
  const requirements = [input.platforms.includes("discord") ? "discord.py==2.6.3" : "", input.platforms.includes("telegram") ? "python-telegram-bot==22.3" : "", "python-dotenv==1.1.1"].filter(Boolean).join("\n");
  return { "bot.py": source, "requirements.txt": `${requirements}\n` };
}

function commonFiles(input, slug) {
  const runtime = input.runtime === "python" ? "Python 3.11+" : "Node.js 20+";
  const install = input.runtime === "python" ? "python -m pip install -r requirements.txt" : "npm install";
  const start = input.runtime === "python" ? "python bot.py" : "npm start";
  return {
    ".notebook-bot.json": `${JSON.stringify({ schemaVersion: 1, botId: slug, runtime: input.runtime, entry: input.runtime === "python" ? "bot.py" : "src/index.js" }, null, 2)}\n`,
    ".gitignore": ".env\nnode_modules/\n.venv/\n__pycache__/\nruntime/*.json\n!runtime/.gitkeep\n",
    ".env.example": envExample(input),
    "runtime/.gitkeep": "",
    "README.md": `# ${input.name}\n\n${input.description || "Discord / Telegram bot created by Notebook."}\n\n## Platforms\n\n${input.platforms.map((platform) => `- ${platform === "discord" ? "Discord" : "Telegram"}`).join("\n")}\n\n## Local setup\n\nRequires ${runtime}.\n\n\`\`\`powershell\n${install}\nCopy-Item .env.example .env\n${start}\n\`\`\`\n\nAdd real tokens only to \`.env\`. Notebook stores environment-variable names, never token values. **Start local** in Notebook installs declared dependencies when needed, then starts this generated entry point while Notebook remains open. The process writes the supported operational payload atomically to \`runtime/status.json\`; no message content is stored.\n\n## Discord install\n\nCreate/select the app in the Discord Developer Portal, add the application ID to Notebook, choose only required permission bits, then use **Install to server**. Discord shows the server picker for servers you can manage.\n\n## Telegram setup\n\nCreate the bot with BotFather, put the token in the configured environment variable, then start this project.\n`,
    "BOT.md": `# Purpose\n\n${input.description || "Describe this bot's purpose."}\n\n## Bot ID\n\n${slug}\n\n## Permissions\n\nUse the smallest Discord permissions and Telegram access needed. Never commit tokens.\n`,
  };
}

function createBotFactory({ run }) {
  async function scaffold(input) {
    const parent = safeParent(input.parentPath);
    const slug = slugify(input.folderName || input.name);
    const botId = slugify(input.botId || slug);
    const target = path.join(parent, slug);
    const relation = path.relative(parent, target);
    if (!relation || relation.startsWith("..") || path.isAbsolute(relation)) throw new Error("Project folder must stay inside the selected parent.");
    if (fs.existsSync(target)) throw new Error(`A folder named ${slug} already exists.`);
    fs.mkdirSync(target, { recursive: false });
    try {
      const files = { ...commonFiles(input, botId), ...(input.runtime === "python" ? pythonFiles(input, botId) : nodeFiles(input, botId)) };
      for (const [relative, content] of Object.entries(files)) {
        const destination = path.join(target, relative); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, content, "utf8");
      }
      await run("git.exe", ["init", "-b", "main"], { cwd: target, timeout: 30_000, stripGithubTokens: true });
      await run("git.exe", ["add", "--all"], { cwd: target, timeout: 30_000, stripGithubTokens: true });
      await run("git.exe", ["-c", "user.name=Notebook Bot Factory", "-c", "user.email=notebook@local.invalid", "commit", "-m", input.commitMessage || "Create bot project"], { cwd: target, timeout: 30_000, stripGithubTokens: true });
      let repositoryUrl = "";
      if (input.publishToGithub) {
        const account = await run("gh.exe", ["api", "user", "--jq", ".login"], { allowFailure: true, timeout: 20_000, stripGithubTokens: true });
        if (account.code || !account.stdout.trim()) throw new Error("Sign in to GitHub before publishing this bot.");
        const repository = input.githubRepository.includes("/") ? input.githubRepository : `${account.stdout.trim()}/${input.githubRepository}`;
        await run("gh.exe", ["repo", "create", repository, input.githubVisibility === "public" ? "--public" : "--private", "--source", target, "--remote", "origin", "--push", "--description", input.description || `${input.name} bot`], { timeout: 120_000, stripGithubTokens: true });
        repositoryUrl = `https://github.com/${repository}`;
      }
      return { projectPath: target, slug, botId, repositoryUrl, runtime: input.runtime === "python" ? "Python" : "Node.js" };
    } catch (error) {
      try { fs.rmSync(target, { recursive: true, force: true }); } catch {}
      throw error;
    }
  }
  return { scaffold };
}

module.exports = { createBotFactory, slugify };
