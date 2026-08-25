const fs = require("node:fs");
const path = require("node:path");
const { parseStructuredStatus, redactSecrets, sanitizeHttpUrl } = require("./bot-domain.cjs");

const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_REDIRECTS = 3;
const MIN_CHECK_INTERVAL_SECONDS = 30;
const MAX_CHECK_INTERVAL_SECONDS = 86_400;

function now() { return new Date().toISOString(); }
function safeMessage(error, fallback = "The check could not be completed.") {
  const text = redactSecrets(String(error?.message || fallback)).replace(/https?:\/\/[^\s]+/gi, (value) => {
    try { const url = new URL(value); url.search = ""; url.hash = ""; return url.toString(); } catch { return "[URL]"; }
  });
  return text.slice(0, 1000) || fallback;
}
function errorCategory(error) {
  if (error?.name === "AbortError" || /timed out/i.test(error?.message || "")) return "timeout";
  if (/HTTP \d{3}/.test(error?.message || "")) return "http_status";
  if (/JSON|payload|response|too large/i.test(error?.message || "")) return "invalid_response";
  if (/file|ENOENT|locked/i.test(error?.message || "")) return "local_file";
  if (/configuration|URL|environment variable|adapter/i.test(error?.message || "")) return "configuration";
  return "network";
}
function safeError(error) { return { category: errorCategory(error), message: safeMessage(error) }; }
function secretReference(value) { return typeof value === "string" && /^[A-Z_][A-Z0-9_]{1,127}$/.test(value) ? value : null; }

async function readLimitedBody(response, limit = MAX_RESPONSE_BYTES) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > limit) throw new Error("The status response is too large.");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = []; let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) { await reader.cancel(); throw new Error("The status response is too large."); }
    chunks.push(value);
  }
  const output = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(output);
}

async function fetchLimited(fetchImpl, rawUrl, options = {}) {
  let url = sanitizeHttpUrl(rawUrl);
  let headers = { ...(options.headers || {}) };
  const timeout = Math.max(250, Math.min(60_000, Number(options.timeoutMilliseconds) || 5000));
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout); timer.unref?.();
    let response;
    try { response = await fetchImpl(url, { method: options.method || "GET", headers, signal: controller.signal, redirect: "manual" }); }
    catch (error) {
      if (controller.signal.aborted) { const timeoutError = new Error(`Request timed out after ${timeout} ms.`); timeoutError.name = "AbortError"; throw timeoutError; }
      throw error;
    } finally { clearTimeout(timer); }
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      if (redirects === MAX_REDIRECTS) throw new Error("The status endpoint exceeded the redirect limit.");
      const next = sanitizeHttpUrl(new URL(response.headers.get("location"), url).toString());
      if (next.origin !== url.origin) {
        headers = { ...headers };
        delete headers.Authorization; delete headers.authorization;
      }
      url = next;
      continue;
    }
    return response;
  }
  throw new Error("The status endpoint exceeded the redirect limit.");
}

function resolveLocalStatusPath(bot) {
  const configured = String(bot.monitoring?.filePath || "").trim();
  if (!configured) throw new Error("Local status-file configuration is missing a file path.");
  if (path.isAbsolute(configured)) return path.resolve(configured);
  const projectRoot = String(bot.localProjectPath || "").trim();
  if (!path.isAbsolute(projectRoot)) throw new Error("A relative status file requires an absolute local project path.");
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, configured);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("The local status file resolves outside the project folder.");
  return resolved;
}

function createBotMonitorService({ store, fetchImpl = globalThis.fetch, env = process.env, resolveSecret = () => undefined, emit = () => {} }) {
  const timers = new Map();

  function credential(reference) {
    if (!reference) return null;
    try { return resolveSecret(reference) || env[reference] || null; }
    catch { return null; }
  }

  async function structuredHttp(bot, started) {
    const monitoring = bot.monitoring;
    const headers = { Accept: "application/json" };
    const reference = secretReference(monitoring.authSecretRef);
    if (reference) {
      const value = credential(reference);
      if (!value) throw new Error(`Authentication credential ${reference} is unavailable.`);
      headers.Authorization = `Bearer ${value}`;
    }
    const response = await fetchLimited(fetchImpl, monitoring.url, { method: monitoring.httpMethod || "GET", headers, timeoutMilliseconds: monitoring.timeoutMilliseconds });
    const raw = await readLimitedBody(response);
    if (!response.ok) throw new Error(`HTTP ${response.status} returned by the configured status endpoint.`);
    let value;
    try { value = JSON.parse(raw); } catch { throw new Error("The structured status endpoint did not return valid JSON."); }
    const payload = parseStructuredStatus(value, bot.id || null);
    return { payload, latency: Date.now() - started, source: "Reported by bot" };
  }

  async function simpleHttp(bot, started) {
    const monitoring = bot.monitoring;
    const headers = {};
    const reference = secretReference(monitoring.authSecretRef);
    if (reference) {
      const value = credential(reference);
      if (!value) throw new Error(`Authentication credential ${reference} is unavailable.`);
      headers.Authorization = `Bearer ${value}`;
    }
    const response = await fetchLimited(fetchImpl, monitoring.url, { method: monitoring.httpMethod || "GET", headers, timeoutMilliseconds: monitoring.timeoutMilliseconds });
    const expected = monitoring.expectedResponseCode == null || monitoring.expectedResponseCode === "" ? null : Number(monitoring.expectedResponseCode);
    const accepted = expected ? response.status === expected : response.ok;
    if (!accepted) { await readLimitedBody(response, 4096).catch(() => ""); throw new Error(`HTTP ${response.status} returned by the configured health endpoint.`); }
    return {
      payload: { observedAt: now(), state: "healthy", activity: "unknown", message: `HTTP ${response.status} reached from this computer.`, jobs: [] },
      latency: Date.now() - started,
      source: "HTTP health response",
    };
  }

  async function localStatus(bot, started) {
    const filePath = resolveLocalStatusPath(bot);
    let stat; let raw;
    try {
      stat = fs.statSync(filePath);
      if (!stat.isFile()) throw new Error("The configured local status path is not a file.");
      if (stat.size > MAX_RESPONSE_BYTES) throw new Error("The local status file is too large.");
      raw = fs.readFileSync(filePath, "utf8");
    } catch (error) { throw new Error(error.code === "ENOENT" ? "The configured local status file does not exist." : `Could not read the local status file: ${safeMessage(error)}`); }
    let value;
    try { value = JSON.parse(raw); } catch { throw new Error("The local status file does not contain valid JSON; it may be partially written."); }
    const payload = parseStructuredStatus(value, bot.id || null);
    return { payload, latency: Date.now() - started, source: "Local status file", fileModifiedAt: stat.mtime.toISOString() };
  }

  function saveReportedRuns(bot, payload) {
    const knownRuns = new Set(store.listBotRuns(bot.id).map((run) => run.externalRunId).filter(Boolean));
    const previousJobs = new Map((bot.runtime?.reportedJobs || []).map((job) => [job.id, job]));
    for (const reported of payload.jobs || []) {
      const previousJob = previousJobs.get(reported.id);
      if (reported.nextRunAt && previousJob?.nextRunAt !== reported.nextRunAt) store.recordBotEvent({ botId: bot.id, jobId: reported.id, type: "job_scheduled", summary: `Next run reported for ${reported.nextRunAt}.`, source: "Reported by bot" });
      if (!reported.lastRunAt || !bot.jobs.some((job) => job.id === reported.id)) continue;
      const externalRunId = `reported:${reported.id}:${reported.lastRunAt}:${reported.state}`;
      if (knownRuns.has(externalRunId)) continue;
      const completed = new Set(["success", "failed", "skipped", "cancelled"]).has(reported.state);
      store.recordBotRun({
        botId: bot.id,
        jobId: reported.id,
        externalRunId,
        scheduledFor: reported.lastRunAt,
        startedAt: reported.lastRunAt,
        completedAt: completed ? reported.lastRunAt : null,
        status: reported.state,
        durationMilliseconds: reported.lastDurationMs,
        summary: reported.state === "failed" ? "" : reported.message || "",
        redactedErrorSummary: reported.state === "failed" ? redactSecrets(reported.message || "Reported job failure.") : "",
        source: "Reported by bot",
      });
      const eventType = { scheduled: "job_scheduled", running: "job_started", success: "job_succeeded", failed: "job_failed", skipped: "job_skipped", cancelled: "job_cancelled" }[reported.state];
      store.recordBotEvent({ botId: bot.id, jobId: reported.id, type: eventType, timestamp: reported.lastRunAt, summary: redactSecrets(reported.message || `Job ${reported.state}.`), source: "Reported by bot" });
      knownRuns.add(externalRunId);
    }
  }

  function saveReportedConnections(bot, payload) {
    for (const reported of payload.connections || []) {
      const connection = bot.connections?.find((item) => item.platform === reported.platform && item.verificationMode === "runtime");
      if (!connection) continue;
      const patch = {
        credentialState: reported.state,
        credentialVerifiedAt: reported.verifiedAt || null,
        credentialErrorSummary: reported.state === "verified" ? "" : redactSecrets(reported.message || "Runtime could not verify this connection."),
        displayName: reported.displayName || connection.displayName || "",
        username: reported.username || connection.username || "",
        externalBotId: reported.externalBotId || connection.externalBotId || "",
        avatarUrl: reported.avatarUrl || connection.avatarUrl || "",
      };
      const changed = Object.entries(patch).some(([key, value]) => connection[key] !== value);
      if (!changed) continue;
      store.updateConnectionVerification(bot.id, connection.id, patch);
      store.recordBotEvent({ botId: bot.id, type: "platform_identity_verified", summary: `${reported.platform === "discord" ? "Discord" : "Telegram"} connection ${reported.state} according to the deployed runtime.`, source: "Reported by bot" });
    }
  }

  function recordDerivedTransitions(before, after) {
    const previousState = before?.derivedState?.state;
    const nextState = after?.derivedState?.state;
    if (previousState && nextState && previousState !== nextState) store.recordBotEvent({ botId: after.id, type: "state_changed", summary: `Runtime state changed from ${previousState} to ${nextState}.`, source: after.derivedState.source || "Status derivation" });
    if (nextState === "overdue" && previousState !== "overdue") store.recordBotEvent({ botId: after.id, type: "job_became_overdue", summary: after.derivedState.reason, source: "Schedule calculation" });
    if (after?.derivedState?.isStale && !before?.derivedState?.isStale) store.recordBotEvent({ botId: after.id, type: "bot_became_stale", summary: after.derivedState.reason, source: after.derivedState.source || "Status derivation" });
  }

  async function checkBot(botId) {
    const bot = store.getBot(botId);
    if (!bot) throw new Error("Bot not found.");
    const adapter = bot.monitoring?.adapter || "manual";
    if (bot.archivedAt || bot.monitoring?.monitoringEnabled === false || adapter === "manual") {
      return { ok: true, skipped: true, botId, snapshot: bot.runtime, derivedState: bot.derivedState };
    }
    const started = Date.now();
    try {
      let observed;
      if (adapter === "http-status") observed = await structuredHttp(bot, started);
      else if (adapter === "http-health") observed = await simpleHttp(bot, started);
      else if (adapter === "local-status") observed = await localStatus(bot, started);
      else throw new Error("Monitoring adapter configuration is invalid.");
      saveReportedRuns(bot, observed.payload);
      saveReportedConnections(bot, observed.payload);
      const previous = bot.runtime;
      const snapshot = {
        reportedState: observed.payload.state,
        activityState: observed.payload.activity || "unknown",
        stateReason: observed.payload.message || "Configured check succeeded.",
        source: observed.source,
        observedAt: observed.payload.observedAt,
        lastCheckedAt: now(),
        lastSuccessfulCheckAt: now(),
        lastFailedCheckAt: previous?.lastFailedCheckAt || null,
        consecutiveFailures: 0,
        responseLatencyMilliseconds: observed.latency,
        reportedStartedAt: observed.payload.startedAt || null,
        reportedUptimeSeconds: observed.payload.startedAt ? Math.max(0, Math.floor((Date.parse(observed.payload.observedAt) - Date.parse(observed.payload.startedAt)) / 1000)) : null,
        reportedVersion: observed.payload.version || null,
        message: observed.payload.message || "Configured check succeeded.",
        isStale: Date.now() - Date.parse(observed.payload.observedAt) > Math.max(30, Number(bot.monitoring?.staleAfterSeconds) || 180) * 1000,
        fileModifiedAt: observed.fileModifiedAt || null,
        reportedJobs: (observed.payload.jobs || []).map((job) => ({ id: job.id, nextRunAt: job.nextRunAt || null, state: job.state, lastRunAt: job.lastRunAt || null })),
      };
      store.saveBotRuntime(botId, snapshot);
      store.recordBotEvent({ botId, type: "status_check_succeeded", summary: `${observed.source} check succeeded in ${observed.latency} ms.`, source: observed.source });
      const refreshed = store.getBot(botId);
      recordDerivedTransitions(bot, refreshed);
      const result = { ok: true, botId, snapshot, derivedState: refreshed.derivedState };
      emit({ type: "bot_status_updated", botId, bot: refreshed });
      return result;
    } catch (error) {
      const previous = store.getBot(botId)?.runtime;
      const checkedAt = now();
      const diagnostic = safeError(error);
      const snapshot = {
        ...(previous || {}),
        reportedState: previous?.reportedState || "unknown",
        activityState: previous?.activityState || "unknown",
        stateReason: diagnostic.message,
        source: previous?.source || (adapter === "local-status" ? "Local status file" : adapter === "http-status" ? "Reported by bot" : "HTTP health response"),
        observedAt: previous?.observedAt || checkedAt,
        lastCheckedAt: checkedAt,
        lastSuccessfulCheckAt: previous?.lastSuccessfulCheckAt || null,
        lastFailedCheckAt: checkedAt,
        consecutiveFailures: (Number(previous?.consecutiveFailures) || 0) + 1,
        responseLatencyMilliseconds: Date.now() - started,
        message: diagnostic.message,
        lastError: diagnostic,
        isStale: previous?.observedAt ? Date.now() - Date.parse(previous.observedAt) > Math.max(30, Number(bot.monitoring?.staleAfterSeconds) || 180) * 1000 : false,
      };
      store.saveBotRuntime(botId, snapshot);
      store.recordBotEvent({ botId, type: "status_check_failed", summary: diagnostic.message, source: snapshot.source, metadata: { category: diagnostic.category } });
      const refreshed = store.getBot(botId);
      recordDerivedTransitions(bot, refreshed);
      const result = { ok: false, botId, snapshot, derivedState: refreshed.derivedState, error: diagnostic };
      emit({ type: "bot_status_updated", botId, bot: refreshed });
      return result;
    }
  }

  async function checkAllBots() {
    const ids = store.listBots().filter((bot) => bot.monitoring?.monitoringEnabled !== false && bot.monitoring?.adapter && bot.monitoring.adapter !== "manual").map((bot) => bot.id);
    const results = new Array(ids.length); let cursor = 0;
    async function worker() {
      while (cursor < ids.length) { const index = cursor; cursor += 1; results[index] = await checkBot(ids[index]); }
    }
    await Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker));
    return { checked: results.length, succeeded: results.filter((result) => result.ok).length, failed: results.filter((result) => !result.ok).length, results };
  }

  async function testConfiguration(bot) {
    const adapter = bot.monitoring?.adapter || "manual";
    if (adapter === "manual") return { ok: true, skipped: true, source: "Manual", message: "Manual monitoring performs no automatic check." };
    const started = Date.now();
    try {
      let observed;
      if (adapter === "http-status") observed = await structuredHttp(bot, started);
      else if (adapter === "http-health") observed = await simpleHttp(bot, started);
      else if (adapter === "local-status") observed = await localStatus(bot, started);
      else throw new Error("Monitoring adapter configuration is invalid.");
      return {
        ok: true,
        source: observed.source,
        latencyMilliseconds: observed.latency,
        parsedStatus: {
          state: observed.payload.state,
          activity: observed.payload.activity || "unknown",
          observedAt: observed.payload.observedAt,
          message: observed.payload.message || "Configured check succeeded.",
          version: observed.payload.version || null,
          jobCount: observed.payload.jobs?.length || 0,
        },
      };
    } catch (error) { return { ok: false, error: safeError(error), latencyMilliseconds: Date.now() - started }; }
  }

  async function verifyPlatformConnection(botId, connectionId) {
    const bot = store.getBot(botId);
    if (!bot) throw new Error("Bot not found.");
    const connection = bot.connections.find((item) => item.id === connectionId);
    if (!connection) throw new Error("Platform connection not found.");
    if (connection.verificationMode === "runtime") {
      await checkBot(botId);
      return store.getBot(botId).connections.find((item) => item.id === connectionId);
    }
    const reference = secretReference(connection.credentialSecretRef);
    const token = credential(reference);
    if (!reference || !token) {
      const updated = store.updateConnectionVerification(botId, connectionId, { credentialState: "not_configured", credentialVerifiedAt: now(), credentialErrorSummary: reference ? `Saved credential or environment variable ${reference} is unavailable.` : "No credential secret reference is configured." });
      return updated.connections.find((item) => item.id === connectionId);
    }
    try {
      let identity;
      if (connection.platform === "discord") {
        const response = await fetchLimited(fetchImpl, "https://discord.com/api/v10/users/@me", { headers: { Authorization: `Bot ${token}`, Accept: "application/json" }, timeoutMilliseconds: 8000 });
        const raw = await readLimitedBody(response, 64 * 1024);
        if (!response.ok) throw new Error(`Discord credential verification returned HTTP ${response.status}.`);
        const value = JSON.parse(raw);
        if (!value?.id || !value?.username) throw new Error("Discord returned a malformed identity response.");
        identity = { externalBotId: String(value.id), username: value.username, displayName: value.global_name || value.username, avatarUrl: value.avatar ? `https://cdn.discordapp.com/avatars/${value.id}/${value.avatar}.png?size=128` : connection.avatarUrl || "" };
      } else if (connection.platform === "telegram") {
        const response = await fetchLimited(fetchImpl, `https://api.telegram.org/bot${token}/getMe`, { headers: { Accept: "application/json" }, timeoutMilliseconds: 8000 });
        const raw = await readLimitedBody(response, 64 * 1024);
        if (!response.ok) throw new Error(`Telegram credential verification returned HTTP ${response.status}.`);
        const value = JSON.parse(raw);
        if (!value?.ok || !value?.result?.id || !value?.result?.username) throw new Error(value?.description || "Telegram returned a malformed identity response.");
        identity = { externalBotId: String(value.result.id), username: value.result.username, displayName: [value.result.first_name, value.result.last_name].filter(Boolean).join(" ") || value.result.username };
      } else throw new Error("Unsupported platform connection.");
      const verifiedAt = now();
      const updated = store.updateConnectionVerification(botId, connectionId, { ...identity, credentialState: "verified", credentialVerifiedAt: verifiedAt, credentialErrorSummary: "" });
      store.recordBotEvent({ botId, type: "platform_identity_verified", summary: `${connection.platform === "discord" ? "Discord" : "Telegram"} identity verified. Runtime health was not changed.`, source: "Platform identity" });
      return updated.connections.find((item) => item.id === connectionId);
    } catch (error) {
      const message = safeMessage(error, "Credential verification failed.");
      const updated = store.updateConnectionVerification(botId, connectionId, { credentialState: "invalid", credentialVerifiedAt: now(), credentialErrorSummary: message });
      return updated.connections.find((item) => item.id === connectionId);
    }
  }

  function stop() { for (const timer of timers.values()) clearInterval(timer); timers.clear(); }
  function start() {
    stop();
    for (const bot of store.listBots()) {
      if (bot.archivedAt || bot.monitoring?.monitoringEnabled === false || !bot.monitoring?.adapter || bot.monitoring.adapter === "manual") continue;
      const seconds = Math.max(MIN_CHECK_INTERVAL_SECONDS, Math.min(MAX_CHECK_INTERVAL_SECONDS, Number(bot.monitoring.intervalSeconds) || 60));
      const timer = setInterval(() => checkBot(bot.id).catch(() => {}), seconds * 1000); timer.unref?.();
      timers.set(bot.id, timer);
    }
  }

  return { activeTimerCount: () => timers.size, checkAllBots, checkBot, start, stop, testConfiguration, verifyPlatformConnection };
}

module.exports = { MAX_RESPONSE_BYTES, createBotMonitorService, fetchLimited, resolveLocalStatusPath };
