# Notebook Bot Connector

Always-on connector for Notebook's one-click bot flow.

- Discord: one user OAuth/install, then unlimited named logical agents under one Discord application identity.
- Telegram: receives managed-bot updates, exports each managed token without storing it, and returns it to the authenticated Notebook device.
- D1 stores pairing/agent metadata. Device tokens are stored only as SHA-256 hashes. Discord and Telegram master credentials remain Worker secrets.

## Setup

```powershell
cd C:\Code\note-overlay\services\bot-connector
npm install
npx wrangler login
npx wrangler d1 create notebook-bot-connector
```

Put the returned database ID in `wrangler.jsonc`. Copy `.dev.vars.example` to `.dev.vars` for local work. For production, set every secret with `wrangler secret put`; never commit `.dev.vars`.

Set `PUBLIC_BASE_URL` to the deployed Worker URL and `TELEGRAM_MANAGER_USERNAME` to the manager bot username. Configure these platform URLs:

- Discord redirect: `<PUBLIC_BASE_URL>/v1/discord/oauth/callback`
- Discord interactions: `<PUBLIC_BASE_URL>/v1/interactions/discord`
- Telegram webhook: `<PUBLIC_BASE_URL>/v1/webhooks/telegram`, with `TELEGRAM_WEBHOOK_SECRET` as the Bot API webhook secret token and `managed_bot` in `allowed_updates`.

The Discord application must allow both User Install and Guild Install. User Install uses `applications.commands`; Guild Install uses `applications.commands bot` with zero Discord permissions. The Telegram manager bot must have Bot Management Mode enabled before its token is configured.

Then:

```powershell
npm run db:migrate:remote
npm run deploy
Invoke-RestMethod -Method Post -Uri "$env:NOTEBOOK_CONNECTOR_URL/v1/admin/discord/register" -Headers @{ Authorization = "Bearer $env:NOTEBOOK_CONNECTOR_ADMIN_TOKEN" }
```

Register the Telegram webhook after deployment:

```powershell
$body = @{ url = "$env:NOTEBOOK_CONNECTOR_URL/v1/webhooks/telegram"; secret_token = $env:TELEGRAM_WEBHOOK_SECRET; allowed_updates = @("managed_bot") } | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$env:TELEGRAM_MANAGER_BOT_TOKEN/setWebhook" -ContentType "application/json" -Body $body
```

Desktop runtime configuration:

```text
NOTEBOOK_BOT_CONNECTOR_URL=https://<worker>.workers.dev
NOTEBOOK_TELEGRAM_API_ID=<publisher API ID>
NOTEBOOK_TELEGRAM_API_HASH=<publisher API hash>
NOTEBOOK_TELEGRAM_MANAGER_USERNAME=<manager username>
```

The Telegram API credentials belong to the Notebook publisher. End users authorize their Telegram account once through QR login; their saved MTProto session is encrypted by Electron's OS-backed secret store.

`npm test` validates pure connector rules. `npx wrangler deploy --dry-run` validates the production Worker bundle without publishing it. Deployment requires replacing the D1 placeholder ID and supplying the credentials above.
