# Bot operations

The **Bots** page (`#/bots`) is a local registry and runbook for Discord and Telegram bots. It separates platform credential verification from runtime health, tracks real check/job evidence, calculates schedules, and links bots to Skill records.

## Storage and privacy

This repository stores records in the existing local Notebook database at `%APPDATA%\note-overlay\hushnote.sqlite`:

- Bot definitions, jobs, commands, secret-reference names, and stable relations use the `bots` and `bot_relations` tables.
- Each bot owns a normal Markdown note body in the existing Notes system. **Open note** uses the existing Markdown editor; editing bot configuration never replaces this body.
- Runtime snapshots, job runs, and bounded operational events use separate `bot_runtime`, `bot_job_runs`, and `bot_events` tables. Checks do not rewrite the Markdown body.
- Events retain at most 500 records per bot and 90 days.
- JSON export, import, and rotating backups include bot definitions, documentation notes, skill links, runtime snapshots, runs, and events.

The app does not collect Discord/Telegram messages, conversations, attachments, or member data. Raw credentials are never saved. The renderer receives only secret-reference names and redacted results.

## Runtime meanings

Credential state answers only whether Discord or Telegram accepted the configured token. It never makes runtime health healthy.

Runtime states:

- **Healthy**: recent successful continuous/webhook health evidence.
- **On schedule**: no tracked scheduled execution is missed.
- **Running**: a real job-start record exists and has not exceeded expected duration plus grace.
- **Degraded**: recent failure, reported degraded state, or failed latest job.
- **Offline**: repeated continuous/webhook checks exceeded the configured threshold, explicit offline evidence, or stale heartbeat evidence.
- **Overdue**: an expected scheduled execution passed its grace period without matching run evidence.
- **Paused**: monitoring is disabled or the bot is archived.
- **Manual / Unknown**: no trustworthy automatic evidence is available.

Every state includes a reason, source, observed time, and freshness. Remote network failure means the endpoint was unreachable from this computer; it is not definitive proof that the process crashed. Monitoring and timers run only while Notebook is open. This is not 24/7 uptime monitoring.

## Monitoring

### Simple HTTP health

Notebook sends `GET` or `HEAD`, applies the configured timeout, follows at most three redirects, caps the response at 256 KiB, and accepts the configured status code or any 2xx response. A successful response proves endpoint reachability only.

### Structured HTTP status

Notebook validates JSON like this:

```json
{
  "schemaVersion": 1,
  "botId": "calendar-assistant",
  "observedAt": "2026-08-17T15:20:00.000Z",
  "state": "healthy",
  "activity": "idle",
  "message": "Connected and waiting for events",
  "startedAt": "2026-08-17T12:00:00.000Z",
  "version": "1.4.2",
  "jobs": [
    {
      "id": "morning-summary",
      "state": "success",
      "lastRunAt": "2026-08-17T14:00:00.000Z",
      "nextRunAt": "2026-08-18T14:00:00.000Z",
      "lastDurationMs": 1280,
      "message": "Daily summary completed"
    }
  ]
}
```

`schemaVersion` must be `1`; `botId` must match the registry ID. Timestamps are ISO-8601 instants. Runtime state is `healthy`, `degraded`, `offline`, or `unknown`. Activity is `running`, `idle`, `recently_active`, or `unknown`. Job state is `scheduled`, `running`, `success`, `failed`, `skipped`, or `cancelled`. Reported next runs remain visibly separate from calculated next runs.

### Local status file

Choose **Local status file**, set an absolute project folder, then use a file path relative to that folder (or an absolute file path). The file uses the same schema. Notebook checks containment for relative paths and handles missing, locked, oversized, partially-written, or malformed files without exposing arbitrary file access to the renderer. Writers should replace a temporary file atomically.

### Manual

Manual monitoring performs no network or file check. It stays visibly Manual/Unknown.

## Secret references and identity verification

Enter an environment-variable name, not a token—for example `DISCORD_CALENDAR_BOT_TOKEN` or `TELEGRAM_REMINDER_BOT_TOKEN`. Set the variable before launching Notebook. The Electron main process resolves it only while checking/verifying.

Discord verification calls `GET https://discord.com/api/v10/users/@me` with the bot authorization header. Telegram verification calls the Bot API `getMe` method. Only safe identity fields (ID, username, display name, avatar, verification time/error) return to the UI.

## Fast platform setup

For Discord, configure the application ID and minimum numeric permission bitfield. **Open setup** opens the application in the Discord Developer Portal. **Install to server** creates the official OAuth authorization URL with `bot applications.commands` scopes and the configured permissions. Discord performs the server selection and authorization.

For Telegram, **Open setup** opens BotFather and **Open bot** opens `t.me/<username>`. Add the bot to a group and grant only required administrator rights in Telegram.

These actions onboard an existing platform bot. Notebook deliberately does not execute project commands, deploy code, start processes, or mutate external schedulers. Start/restart/recovery commands belong in the Markdown runbook unless a separate secure action system is added.

## Jobs, cron, and timezones

Jobs can be cron, interval, one-time, external, or manual. Cron expressions are parsed by `cron-parser` with a required IANA timezone, including DST handling. New jobs default to the system timezone. The form previews three occurrences. Registry calculations distinguish calculated times from bot-reported authoritative times.

**Track job** changes tracking in Notebook only. It does not enable, disable, run, or reschedule the real task. Record its true source (Windows Task Scheduler, GitHub Actions, hosting cron, internal bot scheduler, or external automation) and optional dashboard link.

## Skills and documentation

Select Skills from the existing registry. Relations store stable IDs. Missing records remain visible as **Missing reference** until relinked; records are never copied into a bot. Skill details show **Used by bots** backlinks.

Saving a new bot creates a Markdown runbook template covering purpose, workflow, commands, jobs, platform setup, skills, dependencies, environment-variable names, development, deployment, start/restart/recovery, failures, troubleshooting, logs, ownership, and manual verification. Use **Documentation → Open note** to edit it.

## Node.js status endpoint example

```js
import http from "node:http";

const botId = "calendar-assistant";
const startedAt = new Date().toISOString();

http.createServer((request, response) => {
  if (request.url !== "/status") {
    response.writeHead(404).end();
    return;
  }
  const observedAt = new Date().toISOString();
  const payload = {
    schemaVersion: 1,
    botId,
    observedAt,
    state: "healthy",
    activity: "idle",
    message: "Connected and waiting for events",
    startedAt,
    version: process.env.BOT_VERSION || "development",
    jobs: [],
  };
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}).listen(8788, "127.0.0.1");
```

This exposes operational metadata only—no token or message content.

## Python local status example

```python
import json
import os
from datetime import datetime, timezone
from pathlib import Path

def iso_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

target = Path(os.environ.get("BOT_STATUS_FILE", "status.json")).resolve()
temporary = target.with_suffix(target.suffix + ".tmp")
payload = {
    "schemaVersion": 1,
    "botId": "telegram-reminder",
    "observedAt": iso_now(),
    "state": "healthy",
    "activity": "idle",
    "message": "Waiting for the next scheduled job",
    "version": os.environ.get("BOT_VERSION", "development"),
    "jobs": [],
}
temporary.write_text(json.dumps(payload), encoding="utf-8")
temporary.replace(target)
```

## Troubleshooting

- **Never checked**: configure a non-manual adapter and use **Check now** or **Refresh all**.
- **Environment variable missing**: set the named variable before starting Notebook; never paste the value into the record.
- **Malformed structured status**: verify schema version, matching bot/job IDs, enum values, and ISO timestamps.
- **Local file error**: verify the absolute project folder, contained relative path, permissions, size, and atomic writes.
- **Overdue**: verify cron/timezone/grace, scheduler source, and that the reported job ID matches the registry job ID.
- **Identity verified but Unknown runtime**: expected; configure health/status evidence separately.
- **Stale**: Notebook retained the last useful observation, but it exceeded the configured freshness threshold.

Archive from bot details to stop checks while keeping its note and history. Restore from the same details view. Archived bots are hidden by the registry's default **Active only** filter.
