const path = require("node:path");
const { createStorage } = require("../src/main/storage.cjs");

const userData = process.argv[2] || path.join(process.env.APPDATA || "", "note-overlay");
const deploymentUrl = "https://x-virality-tracker.kaiguy432.workers.dev";
const dashboardRoot = "https://dash.cloudflare.com/1dad3c7d60b166f3642c8cb3b6bbc62a/workers/services/view/x-virality-tracker/production";
const store = createStorage(userData);

try {
  const definition = {
    id: "x-virality-tracker",
    name: "X Virality Tracker",
    slug: "x-virality-tracker",
    description: "Finds fast-rising AI and crypto posts on X and sends duplicate-safe Discord alerts. Topics scan every 3 minutes; saved accounts every 5 minutes.",
    icon: { type: "symbol", value: "🔥", color: "amber" },
    platforms: ["discord"],
    permissions: [],
    executionMode: "continuous",
    environment: "production",
    enabled: true,
    tags: ["x", "virality", "discord", "cloudflare", "always-on"],
    repositoryUrl: "https://github.com/wasely/twitter-viral-bot",
    localProjectPath: "C:\\Code\\x-virality-tracker",
    deploymentUrl,
    hostingProvider: "Cloudflare Workers Free",
    runtime: "TypeScript / Cloudflare Worker",
    version: "2.0.0",
    logsLocation: `${dashboardRoot}/observability/logs`,
    schedulerSource: "Hosting-provider cron",
    schedulerUrl: `${dashboardRoot}/triggers`,
    monitoring: { adapter: "http-status", url: `${deploymentUrl}/status`, httpMethod: "GET", authSecretRef: "", intervalSeconds: 60, timeoutMilliseconds: 8_000, staleAfterSeconds: 900, failuresBeforeOffline: 3, monitoringEnabled: true },
    connections: [{ platform: "discord", displayName: "X Virality Alerts", credentialSecretRef: "", credentialState: "unknown", credentialVerifiedAt: null, credentialErrorSummary: "", installPermissions: "0", verificationMode: "runtime" }],
    jobs: [
      { id: "topic-scan", name: "Topic discovery", description: "Scan grouped AI and crypto topics, then recheck rising candidates.", scheduleType: "cron", cronExpression: "*/3 * * * *", timezone: "UTC", enabled: true, critical: true, schedulerSource: "Hosting-provider cron", schedulerUrl: `${dashboardRoot}/triggers`, expectedDurationSeconds: 120, gracePeriodSeconds: 240, retryDescription: "Rotates healthy public mirrors; retries Discord delivery up to four times.", logsLocation: "Cloudflare Workers logs" },
      { id: "people-scan", name: "Saved-account scan", description: "Scan seven saved X accounts.", scheduleType: "cron", cronExpression: "*/5 * * * *", timezone: "UTC", enabled: true, critical: false, schedulerSource: "Hosting-provider cron", schedulerUrl: `${dashboardRoot}/triggers`, expectedDurationSeconds: 120, gracePeriodSeconds: 300, retryDescription: "Continues when some accounts or mirrors fail.", logsLocation: "Cloudflare Workers logs" },
    ],
    commands: [],
    skillIds: [],
  };
  const existing = store.getBot("x-virality-tracker");
  const bot = existing
    ? store.updateBot(existing.id, { ...existing, ...definition, documentationNoteId: existing.documentationNoteId })
    : store.createBot(definition);
  const body = `# X Virality Tracker operations

## What this bot does

Finds fast-rising AI and crypto posts on X and sends one Discord alert per post. Topic discovery is prioritized.

## Runtime

- Production: Cloudflare Worker + D1
- Topics: every 3 minutes
- Saved accounts: every 5 minutes
- Deployment: ${deploymentUrl}
- Status: ${deploymentUrl}/status
- Local source: C:\\Code\\x-virality-tracker

## Topics and people

Topic groups cover Bitcoin/crypto/Web3/DeFi, Solana/Ethereum/altcoins, AI/LLMs/AGI/AI agents, and memecoins/tokens/NFTs. Saved accounts: elonmusk, VitalikButerin, CZ_Binance, sama, pmarca, basedbeffjebus, and bitboy_crypto.

## Alert rules

- At least 5 likes per minute during the first hour, with at least 5 likes.
- Relative engagement score at least 0.3 when a trustworthy follower count is available.
- At least 500 likes.

Unqualified posts remain candidates for 90 minutes and are rechecked. D1 atomically claims alerts; the X post ID is also Discord's nonce.

## Data-source limitation

This is the requested $0 design. It uses rotating public Nitter mirrors because X does not provide free read access. Status changes to degraded/offline when mirrors are blocked, empty, or stale. Coverage cannot be guaranteed during mirror outages.

## Secrets

DISCORD_WEBHOOK_URL exists only as a Cloudflare Worker secret. Never place it in source, notes, logs, or Wrangler variables. The inherited webhook was previously committed and must be replaced when Discord permits creating a new webhook in the destination channel; revoke the old webhook immediately after replacement.

## Deployment

From C:\\Code\\x-virality-tracker:

\`\`\`powershell
npm install
npm test
npm run check
npx wrangler d1 migrations apply x-virality-tracker --remote
npx wrangler deploy
\`\`\`

Set or rotate the Discord secret with \`npx wrangler secret put DISCORD_WEBHOOK_URL\`.

## Recovery

1. Open this bot in Notebook and run Refresh.
2. Check source health and both jobs at /status.
3. Inspect Cloudflare logs and D1.
4. Verify the Discord webhook secret.
5. Redeploy the last known-good Git commit if a release caused the failure.

## Last manually verified date

2026-08-21
`;
  store.updateNote(bot.documentationNoteId, { title: "X Virality Tracker bot operations", body });
  console.log(JSON.stringify({ id: bot.id, noteId: bot.documentationNoteId, deploymentUrl: bot.deploymentUrl }));
} finally {
  store.close();
}
