const { randomUUID } = require("node:crypto");
const { deriveBotState, deriveJobState, nextOccurrences } = require("./bot-domain.cjs");

const EVENT_RETENTION = 500;
const EVENT_RETENTION_DAYS = 90;

function now() { return new Date().toISOString(); }
function parseJson(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }
function slugify(value, fallback = "bot") {
  return String(value || fallback).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || fallback;
}
function uniqueStrings(values) { return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value).trim()).filter(Boolean))]; }
function asBoolean(value, fallback = false) { return value === undefined ? fallback : Boolean(value); }

function documentationTemplate(name) {
  return [
    "# What this bot does",
    "",
    `${name} operational documentation. Replace this line with the bot's purpose and boundaries.`,
    "",
    "## Why it exists",
    "",
    "## Trigger or input",
    "",
    "## Output or destination",
    "",
    "## Main workflow",
    "",
    "## Data sources",
    "",
    "## Commands",
    "",
    "## Scheduled jobs",
    "",
    "## Discord or Telegram setup",
    "",
    "## MCP servers used",
    "",
    "## Skills used",
    "",
    "## External dependencies",
    "",
    "## Required environment-variable names",
    "",
    "## Local development instructions",
    "",
    "## Production deployment instructions",
    "",
    "## Start instructions",
    "",
    "## Restart instructions",
    "",
    "## Recovery instructions",
    "",
    "## Common failure modes",
    "",
    "## Troubleshooting checklist",
    "",
    "- [ ] Confirm the status source is fresh.",
    "- [ ] Check redacted logs.",
    "- [ ] Verify required environment-variable names exist on the host.",
    "",
    "## Logs",
    "",
    "## Ownership or maintenance notes",
    "",
    "## Last manually verified date",
    "",
  ].join("\n");
}

function createBotRepository({ db, createNote, getNote }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      transport TEXT NOT NULL DEFAULT 'stdio',
      command TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bots (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      definition_json TEXT NOT NULL,
      documentation_note_id TEXT,
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bot_relations (
      bot_id TEXT NOT NULL,
      relation_type TEXT NOT NULL CHECK(relation_type IN ('mcp', 'skill')),
      relation_id TEXT NOT NULL,
      PRIMARY KEY(bot_id, relation_type, relation_id),
      FOREIGN KEY(bot_id) REFERENCES bots(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS bot_runtime (
      bot_id TEXT PRIMARY KEY,
      snapshot_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(bot_id) REFERENCES bots(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS bot_job_runs (
      id TEXT PRIMARY KEY,
      bot_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      external_run_id TEXT,
      scheduled_for TEXT,
      started_at TEXT,
      completed_at TEXT,
      status TEXT NOT NULL,
      duration_milliseconds INTEGER,
      summary TEXT NOT NULL DEFAULT '',
      redacted_error_summary TEXT NOT NULL DEFAULT '',
      logs_location TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'Manual',
      created_at TEXT NOT NULL,
      FOREIGN KEY(bot_id) REFERENCES bots(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS bot_job_runs_external ON bot_job_runs(bot_id, job_id, external_run_id) WHERE external_run_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS bot_job_runs_bot_time ON bot_job_runs(bot_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS bot_events (
      id TEXT PRIMARY KEY,
      bot_id TEXT NOT NULL,
      job_id TEXT,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      summary TEXT NOT NULL,
      source TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY(bot_id) REFERENCES bots(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS bot_events_bot_time ON bot_events(bot_id, timestamp DESC);
  `);

  function uniqueId(table, preferred, fallback) {
    const base = slugify(preferred, fallback);
    let id = base; let suffix = 2;
    while (db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id)) { id = `${base}-${suffix}`; suffix += 1; }
    return id;
  }

  function normalizeDefinition(input, existing = null, id) {
    const merged = { ...(existing || {}), ...(input || {}) };
    const name = String(merged.name || "").trim();
    if (!name) throw new Error("Bot name is required.");
    const connections = (Array.isArray(merged.connections) ? merged.connections : []).map((connection) => ({
      ...(connection || {}),
      id: connection?.id || `${id}-${connection?.platform || randomUUID()}`,
      platform: connection?.platform,
      credentialState: connection?.credentialState || "not_configured",
      credentialVerifiedAt: connection?.credentialVerifiedAt || null,
      credentialErrorSummary: connection?.credentialErrorSummary || "",
      installPermissions: String(connection?.installPermissions || "0"),
    }));
    const jobs = (Array.isArray(merged.jobs) ? merged.jobs : []).map((job, index) => ({
      ...(job || {}),
      id: job?.id || `${id}-${slugify(job?.name, `job-${index + 1}`)}`,
      enabled: asBoolean(job?.enabled, true),
      critical: asBoolean(job?.critical, false),
      timezone: job?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      schedulerSource: job?.schedulerSource || merged.schedulerSource || "Unknown",
      gracePeriodSeconds: Math.max(0, Number(job?.gracePeriodSeconds) || 0),
      createdAt: job?.createdAt || now(),
      updatedAt: now(),
      archivedAt: job?.archivedAt || null,
    }));
    const commands = (Array.isArray(merged.commands) ? merged.commands : []).map((command, index) => ({
      ...(command || {}),
      id: command?.id || `${id}-${slugify(command?.platform || "bot")}-${slugify(command?.command, `command-${index + 1}`)}`,
      enabled: asBoolean(command?.enabled, true),
      deprecated: asBoolean(command?.deprecated, false),
    }));
    const monitoring = {
      adapter: "manual",
      httpMethod: "GET",
      intervalSeconds: 60,
      timeoutMilliseconds: 5000,
      staleAfterSeconds: 180,
      failuresBeforeOffline: 3,
      monitoringEnabled: true,
      ...(merged.monitoring || {}),
    };
    return {
      ...merged,
      id,
      name,
      slug: merged.slug || slugify(name),
      description: String(merged.description || ""),
      platforms: uniqueStrings(merged.platforms?.length ? merged.platforms : connections.map((connection) => connection.platform)),
      executionMode: merged.executionMode || "continuous",
      environment: merged.environment || "development",
      enabled: asBoolean(merged.enabled, true),
      tags: uniqueStrings(merged.tags),
      connections,
      jobs,
      commands,
      monitoring,
      mcpServerIds: uniqueStrings(merged.mcpServerIds),
      skillIds: uniqueStrings(merged.skillIds),
      createdAt: merged.createdAt || now(),
      updatedAt: now(),
    };
  }

  function relationIds(botId, type) {
    return db.prepare("SELECT relation_id FROM bot_relations WHERE bot_id = ? AND relation_type = ? ORDER BY rowid").all(botId, type).map((row) => row.relation_id);
  }

  function listBotRuns(botId, limit = 500) {
    return db.prepare("SELECT * FROM bot_job_runs WHERE bot_id = ? ORDER BY COALESCE(started_at, scheduled_for, created_at) DESC LIMIT ?").all(botId, Math.max(1, Math.min(2000, Number(limit) || 500))).map((row) => ({
      id: row.id, botId: row.bot_id, jobId: row.job_id, externalRunId: row.external_run_id,
      scheduledFor: row.scheduled_for, startedAt: row.started_at, completedAt: row.completed_at,
      status: row.status, durationMilliseconds: row.duration_milliseconds, summary: row.summary,
      redactedErrorSummary: row.redacted_error_summary, logsLocation: row.logs_location, source: row.source, createdAt: row.created_at,
    }));
  }

  function runtimeFor(botId) {
    const row = db.prepare("SELECT snapshot_json FROM bot_runtime WHERE bot_id = ?").get(botId);
    return row ? parseJson(row.snapshot_json, null) : null;
  }

  function hydrateBot(row) {
    if (!row) return null;
    const definition = parseJson(row.definition_json, {});
    const mcpServerIds = relationIds(row.id, "mcp");
    const skillIds = relationIds(row.id, "skill");
    const runtime = runtimeFor(row.id);
    const runs = listBotRuns(row.id);
    const bot = {
      ...definition,
      runtimeLanguage: typeof definition.runtime === "string" ? definition.runtime : String(definition.runtimeLanguage || ""),
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      documentationNoteId: row.documentation_note_id,
      archivedAt: row.archived_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      mcpServerIds,
      skillIds,
      runtime,
    };
    return { ...bot, derivedState: deriveBotState({ bot, snapshot: runtime, jobs: bot.jobs, runs }) };
  }

  function getBot(id) { return hydrateBot(db.prepare("SELECT * FROM bots WHERE id = ?").get(id)); }
  function listBots(options = {}) {
    const rows = options.includeArchived
      ? db.prepare("SELECT * FROM bots ORDER BY updated_at DESC, name COLLATE NOCASE").all()
      : db.prepare("SELECT * FROM bots WHERE archived_at IS NULL ORDER BY updated_at DESC, name COLLATE NOCASE").all();
    return rows.map(hydrateBot);
  }

  function writeRelations(botId, type, values) {
    db.prepare("DELETE FROM bot_relations WHERE bot_id = ? AND relation_type = ?").run(botId, type);
    const insert = db.prepare("INSERT INTO bot_relations (bot_id, relation_type, relation_id) VALUES (?, ?, ?)");
    for (const value of uniqueStrings(values)) insert.run(botId, type, value);
  }

  function createBot(input) {
    const id = input?.id && /^[a-z0-9][a-z0-9-]{0,79}$/.test(input.id) ? uniqueId("bots", input.id, "bot") : uniqueId("bots", input?.name, "bot");
    const definition = normalizeDefinition(input, null, id);
    const timestamp = now();
    let noteId = input?.documentationNoteId || null;
    if (!noteId || !getNote(noteId)) noteId = createNote({ title: `${definition.name} bot operations`, body: documentationTemplate(definition.name) }).id;
    const transaction = db.transaction(() => {
      db.prepare("INSERT INTO bots (id, slug, name, description, definition_json, documentation_note_id, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, definition.slug, definition.name, definition.description, JSON.stringify(definition), noteId, definition.archivedAt || null, timestamp, timestamp);
      writeRelations(id, "mcp", definition.mcpServerIds);
      writeRelations(id, "skill", definition.skillIds);
    });
    transaction();
    recordBotEvent({ botId: id, type: "configuration_updated", summary: "Bot registry entry created.", source: "Registry" });
    return getBot(id);
  }

  function updateBot(id, input) {
    const existing = getBot(id);
    if (!existing) throw new Error("Bot not found.");
    const definition = normalizeDefinition(input, existing, id);
    const transaction = db.transaction(() => {
      db.prepare("UPDATE bots SET slug = ?, name = ?, description = ?, definition_json = ?, updated_at = ? WHERE id = ?").run(definition.slug, definition.name, definition.description, JSON.stringify(definition), now(), id);
      writeRelations(id, "mcp", definition.mcpServerIds);
      writeRelations(id, "skill", definition.skillIds);
    });
    transaction();
    recordBotEvent({ botId: id, type: "configuration_updated", summary: "Bot configuration updated.", source: "Registry" });
    return getBot(id);
  }

  function archiveBot(id) {
    if (!getBot(id)) throw new Error("Bot not found.");
    const timestamp = now();
    db.prepare("UPDATE bots SET archived_at = ?, updated_at = ? WHERE id = ?").run(timestamp, timestamp, id);
    recordBotEvent({ botId: id, type: "monitoring_paused", summary: "Bot archived; automatic checks stopped.", source: "Registry" });
    return getBot(id);
  }
  function restoreBot(id) {
    if (!getBot(id)) throw new Error("Bot not found.");
    db.prepare("UPDATE bots SET archived_at = NULL, updated_at = ? WHERE id = ?").run(now(), id);
    recordBotEvent({ botId: id, type: "monitoring_resumed", summary: "Bot restored to the active registry.", source: "Registry" });
    return getBot(id);
  }

  function saveBotRuntime(botId, snapshot) {
    if (!getBot(botId)) throw new Error("Bot not found.");
    db.prepare("INSERT INTO bot_runtime (bot_id, snapshot_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(bot_id) DO UPDATE SET snapshot_json = excluded.snapshot_json, updated_at = excluded.updated_at").run(botId, JSON.stringify(snapshot), now());
    return runtimeFor(botId);
  }

  function recordBotRun(input) {
    if (!getBot(input.botId)) throw new Error("Bot not found.");
    if (input.externalRunId) {
      const existing = db.prepare("SELECT id FROM bot_job_runs WHERE bot_id = ? AND job_id = ? AND external_run_id = ?").get(input.botId, input.jobId, input.externalRunId);
      if (existing) return listBotRuns(input.botId).find((run) => run.id === existing.id);
    }
    const id = input.id || randomUUID();
    db.prepare("INSERT INTO bot_job_runs (id, bot_id, job_id, external_run_id, scheduled_for, started_at, completed_at, status, duration_milliseconds, summary, redacted_error_summary, logs_location, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, input.botId, input.jobId, input.externalRunId || null, input.scheduledFor || null, input.startedAt || null, input.completedAt || null, input.status, input.durationMilliseconds ?? null, input.summary || "", input.redactedErrorSummary || "", input.logsLocation || "", input.source || "Manual", input.createdAt || now());
    return listBotRuns(input.botId).find((run) => run.id === id);
  }

  function recordBotEvent(input) {
    const timestamp = input.timestamp || now();
    const id = input.id || randomUUID();
    db.prepare("INSERT INTO bot_events (id, bot_id, job_id, type, timestamp, summary, source, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, input.botId, input.jobId || null, input.type, timestamp, input.summary || "", input.source || "Registry", JSON.stringify(input.metadata || {}));
    const cutoff = new Date(Date.now() - EVENT_RETENTION_DAYS * 86_400_000).toISOString();
    db.prepare("DELETE FROM bot_events WHERE bot_id = ? AND timestamp < ?").run(input.botId, cutoff);
    db.prepare("DELETE FROM bot_events WHERE bot_id = ? AND id NOT IN (SELECT id FROM bot_events WHERE bot_id = ? ORDER BY timestamp DESC LIMIT ?)").run(input.botId, input.botId, EVENT_RETENTION);
    return id;
  }

  function getBotActivity(botId, limit = 200) {
    return db.prepare("SELECT * FROM bot_events WHERE bot_id = ? ORDER BY timestamp DESC LIMIT ?").all(botId, Math.max(1, Math.min(500, Number(limit) || 200))).map((row) => ({ id: row.id, botId: row.bot_id, jobId: row.job_id, type: row.type, timestamp: row.timestamp, summary: row.summary, source: row.source, metadata: parseJson(row.metadata_json, {}) }));
  }

  function updateConnectionVerification(botId, connectionId, patch) {
    const bot = getBot(botId);
    if (!bot) throw new Error("Bot not found.");
    const connections = bot.connections.map((connection) => connection.id === connectionId ? { ...connection, ...patch } : connection);
    if (!connections.some((connection) => connection.id === connectionId)) throw new Error("Platform connection not found.");
    return updateBot(botId, { ...bot, connections });
  }

  function getUpcomingJobs(reference = new Date(), limit = 20) {
    const upcoming = [];
    for (const bot of listBots()) {
      const runs = listBotRuns(bot.id);
      for (const job of bot.jobs.filter((item) => item.enabled && !item.archivedAt)) {
        let calculated = [];
        try { calculated = nextOccurrences(job, reference, 3); } catch { /* Invalid configuration remains visible in job health. */ }
        const reportedJob = bot.runtime?.reportedJobs?.find((item) => item.id === job.id);
        const reportedCandidate = reportedJob?.nextRunAt || job.authoritativeNextRunAt;
        const reported = reportedCandidate && new Date(reportedCandidate) > reference ? reportedCandidate : null;
        const next = reported || calculated[0];
        if (!next) continue;
        upcoming.push({ botId: bot.id, botName: bot.name, platforms: bot.platforms, job: { ...job, nextCalculatedAt: calculated[0] || null, nextReportedAt: reported, occurrences: calculated }, nextRunAt: next, nextRunSource: reported ? "reported" : "calculated", health: deriveJobState(job, runs, reference) });
      }
    }
    return upcoming.sort((left, right) => left.nextRunAt.localeCompare(right.nextRunAt)).slice(0, Math.max(1, Math.min(100, Number(limit) || 20)));
  }

  function listMcpServers() { return db.prepare("SELECT * FROM mcp_servers ORDER BY name COLLATE NOCASE").all().map((row) => ({ ...row, createdAt: row.created_at, updatedAt: row.updated_at })); }
  function getMcpServer(id) { return listMcpServers().find((server) => server.id === id) || null; }
  function createMcpServer(input) {
    const name = String(input?.name || "").trim(); if (!name) throw new Error("MCP server name is required.");
    const id = input.id && /^[a-z0-9][a-z0-9-]{0,79}$/.test(input.id) ? uniqueId("mcp_servers", input.id, "mcp-server") : uniqueId("mcp_servers", name, "mcp-server");
    const timestamp = now();
    db.prepare("INSERT INTO mcp_servers (id, name, description, transport, command, url, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, name, input.description || "", input.transport || "stdio", input.command || "", input.url || "", input.body || "", timestamp, timestamp);
    return getMcpServer(id);
  }
  function updateMcpServer(id, input) {
    const existing = getMcpServer(id); if (!existing) throw new Error("MCP server not found.");
    db.prepare("UPDATE mcp_servers SET name = ?, description = ?, transport = ?, command = ?, url = ?, body = ?, updated_at = ? WHERE id = ?").run(input.name ?? existing.name, input.description ?? existing.description, input.transport ?? existing.transport, input.command ?? existing.command, input.url ?? existing.url, input.body ?? existing.body, now(), id);
    return getMcpServer(id);
  }
  function deleteMcpServer(id) { db.prepare("DELETE FROM mcp_servers WHERE id = ?").run(id); }

  function listRelatedBots(type, relationId) {
    if (!new Set(["mcp", "skill"]).has(type)) throw new Error("Invalid relation type.");
    return db.prepare("SELECT b.* FROM bots b JOIN bot_relations r ON r.bot_id = b.id WHERE r.relation_type = ? AND r.relation_id = ? ORDER BY b.name COLLATE NOCASE").all(type, relationId).map(hydrateBot);
  }

  function exportBotData() {
    return {
      bots: listBots({ includeArchived: true }),
      mcpServers: listMcpServers(),
      botRuns: db.prepare("SELECT * FROM bot_job_runs ORDER BY created_at").all(),
      botEvents: db.prepare("SELECT * FROM bot_events ORDER BY timestamp").all(),
    };
  }

  function importBotData(data, options = {}) {
    const replace = Boolean(options.replace);
    const transaction = db.transaction(() => {
      if (replace) {
        db.prepare("DELETE FROM bots").run();
        db.prepare("DELETE FROM mcp_servers").run();
      }
      for (const server of data?.mcpServers || []) {
        const id = /^[a-z0-9][a-z0-9-]{0,79}$/.test(server?.id || "") ? server.id : uniqueId("mcp_servers", server?.name, "mcp-server");
        db.prepare("INSERT OR IGNORE INTO mcp_servers (id, name, description, transport, command, url, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, String(server?.name || "Untitled MCP server"), server?.description || "", server?.transport || "stdio", server?.command || "", server?.url || "", server?.body || "", server?.created_at || server?.createdAt || now(), server?.updated_at || server?.updatedAt || now());
      }
      for (const source of data?.bots || []) {
        const id = /^[a-z0-9][a-z0-9-]{0,79}$/.test(source?.id || "") ? source.id : uniqueId("bots", source?.name, "bot");
        if (db.prepare("SELECT 1 FROM bots WHERE id = ?").get(id)) continue;
        const runtimeSnapshot = source?.runtime && typeof source.runtime === "object" ? source.runtime : null;
        const definitionInput = { ...source, runtime: source?.runtimeLanguage || (typeof source?.runtime === "string" ? source.runtime : "") };
        delete definitionInput.derivedState;
        delete definitionInput.runtimeLanguage;
        const definition = normalizeDefinition(definitionInput, null, id);
        const timestamp = source?.createdAt || source?.created_at || now();
        let noteId = source?.documentationNoteId || source?.documentation_note_id || null;
        if (!noteId || !getNote(noteId)) noteId = createNote({ title: `${definition.name} bot operations`, body: documentationTemplate(definition.name) }).id;
        db.prepare("INSERT INTO bots (id, slug, name, description, definition_json, documentation_note_id, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, definition.slug, definition.name, definition.description, JSON.stringify(definition), noteId, source?.archivedAt || source?.archived_at || null, timestamp, source?.updatedAt || source?.updated_at || timestamp);
        writeRelations(id, "mcp", source?.mcpServerIds || []);
        writeRelations(id, "skill", source?.skillIds || []);
        if (runtimeSnapshot) db.prepare("INSERT INTO bot_runtime (bot_id, snapshot_json, updated_at) VALUES (?, ?, ?)").run(id, JSON.stringify(runtimeSnapshot), source?.updatedAt || now());
      }
      for (const run of data?.botRuns || []) {
        const botId = run.bot_id || run.botId;
        const jobId = run.job_id || run.jobId;
        if (!botId || !jobId || !db.prepare("SELECT 1 FROM bots WHERE id = ?").get(botId)) continue;
        db.prepare("INSERT OR IGNORE INTO bot_job_runs (id, bot_id, job_id, external_run_id, scheduled_for, started_at, completed_at, status, duration_milliseconds, summary, redacted_error_summary, logs_location, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(run.id || randomUUID(), botId, jobId, run.external_run_id || run.externalRunId || null, run.scheduled_for || run.scheduledFor || null, run.started_at || run.startedAt || null, run.completed_at || run.completedAt || null, run.status || "unknown", run.duration_milliseconds ?? run.durationMilliseconds ?? null, run.summary || "", run.redacted_error_summary || run.redactedErrorSummary || "", run.logs_location || run.logsLocation || "", run.source || "Imported", run.created_at || run.createdAt || now());
      }
      for (const event of data?.botEvents || []) {
        const botId = event.bot_id || event.botId;
        if (!botId || !db.prepare("SELECT 1 FROM bots WHERE id = ?").get(botId)) continue;
        const metadata = event.metadata_json || JSON.stringify(event.metadata || {});
        db.prepare("INSERT OR IGNORE INTO bot_events (id, bot_id, job_id, type, timestamp, summary, source, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(event.id || randomUUID(), botId, event.job_id || event.jobId || null, event.type || "configuration_updated", event.timestamp || now(), event.summary || "", event.source || "Imported", metadata);
      }
    });
    transaction();
    return { bots: listBots({ includeArchived: true }), mcpServers: listMcpServers() };
  }

  return {
    archiveBot, createBot, createMcpServer, deleteMcpServer, exportBotData, importBotData, getBot, getBotActivity,
    getMcpServer, getUpcomingJobs, listBotRuns, listBots, listMcpServers, listRelatedBots,
    recordBotEvent, recordBotRun, restoreBot, saveBotRuntime, updateBot, updateConnectionVerification, updateMcpServer,
  };
}

module.exports = { createBotRepository, documentationTemplate };
