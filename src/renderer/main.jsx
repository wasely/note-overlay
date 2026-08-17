/*
 * Derived from FastNote's note-area / sidebar interaction model.
 * FastNote © 2024, MIT License. See THIRD_PARTY_NOTICES.md.
 */
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Archive, BookOpenCheck, Bot, CalendarCheck2, FolderGit2, Layers3, LayoutDashboard, NotebookPen, ServerCog, Sparkles, SquareTerminal } from "lucide-react";
import { siGmail, siNotion } from "simple-icons";
import { addBrowserFileDragData } from "./drag-file.mjs";
import { SKILL_STACK_GROUPS, cleanSkillCategory, displaySkillName, isArchivedSkill, skillStackReference, sortSkillsByStack } from "./skill-stack.js";
import { ProjectsPage } from "./ProjectsPage.jsx";
import { BotsWorkspace, BotSidebar, McpServersWorkspace, McpSidebar } from "./bots.jsx";
import "./styles.css";

const mockNotes = [];
const mockBots = [];
const mockMcpServers = [];
const mockSkills = SKILL_STACK_GROUPS.flatMap((group, groupIndex) => group.items.map(([name, summary], itemIndex) => ({
  id: `stack-${group.status}-${groupIndex}-${itemIndex}`,
  name: name === "Unnamed empty entry" ? "" : name,
  category: group.status === "active" ? `${String(groupIndex + 1).padStart(2, "0")} · ${group.label.replaceAll(" and ", " & ")}` : `99 · Archive — ${group.label.replaceAll(" and ", " & ")}`,
  body: summary,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
})));
const mockSlashCommands = [
  { id: "starter-gitpush", name: "Git push", command: "/prompts:gitpush", body: "Run `/prompts:gitpush` inside the Git repository you want to publish.\n\n## What it does\nStages every change, commits with `Update project files`, then pushes the current tracking branch. It does not run checks.\n\n## Related skill\n`$gitpush`", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: "starter-command-guide", name: "Markdown, skills, and slash commands", command: "", body: "## Markdown (`.md`)\nA text-file format. It can hold instructions but is not automatically a command.\n\n## Custom prompt\nA Markdown file in `.codex/prompts`. `gitpush.md` becomes `/prompts:gitpush`.\n\n## Skill\nA folder containing `SKILL.md` and optional scripts. Invoke it with `$name`.\n\n## Slash command\nA `/` command parsed by Codex. Built-ins use top-level names; custom prompts use `/prompts:<name>`.\n\n## Script\nThe executable that performs deterministic work after a prompt or skill invokes it.", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];
const mockFolders = [{ id: "inbox", name: "Inbox", is_inbox: true, note_count: 0 }];
function hydrateMockBot(input, existing = {}) {
  const timestamp = new Date().toISOString();
  const bot = { ...existing, ...structuredClone(input), id: existing.id || input.id || String(input.name || "bot").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || crypto.randomUUID(), createdAt: existing.createdAt || timestamp, updatedAt: timestamp, archivedAt: existing.archivedAt || null };
  bot.jobs = (bot.jobs || []).map((job) => ({ ...job, createdAt: job.createdAt || timestamp, updatedAt: timestamp, archivedAt: job.archivedAt || null }));
  bot.runtime = existing.runtime || null;
  const state = bot.archivedAt || bot.monitoring?.monitoringEnabled === false ? "paused" : bot.executionMode === "manual" || bot.monitoring?.adapter === "manual" ? "manual" : bot.executionMode === "scheduled" ? "on_schedule" : bot.runtime?.reportedState || "unknown";
  bot.derivedState = { state, reason: state === "manual" ? "No automatic monitoring is configured." : state === "on_schedule" ? "No expected execution has been missed." : state === "paused" ? "Monitoring is paused." : "This bot has never been checked.", source: state === "on_schedule" ? "Job history" : state === "manual" ? "Manual" : "No source", observedAt: bot.runtime?.observedAt || null, isStale: false };
  return bot;
}
function dateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function moveDate(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}
const mockDailyDate = dateKey();
const mockDailyTasks = new URLSearchParams(location.search).get("daily") === "demo" ? [
  { id: "daily-carried", task_date: mockDailyDate, text: "Finish the onboarding flow", status: "open", priority: 1, owner: "me", carried_from_id: "yesterday-task", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: "daily-agent", task_date: mockDailyDate, text: "Audit the release checklist", status: "open", priority: 2, owner: "agent", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: "daily-next", task_date: mockDailyDate, text: "Write the progress update", status: "open", priority: 2, owner: "me", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: "daily-done", task_date: mockDailyDate, text: "Review yesterday's notes", status: "done", priority: 1, owner: "me", completed_on: mockDailyDate, completed_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: "daily-tomorrow", task_date: moveDate(mockDailyDate, 1), text: "Prepare the launch checklist", status: "open", priority: 2, owner: "me", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
] : [];
const mockProjectNow = new Date().toISOString();
const mockProjects = new URLSearchParams(location.search).get("projects") === "demo" ? [
  { id: "project-notebook", name: "Note Overlay", description: "Local-first workspace for focused notes and developer workflows.", status: "active", priority: "critical", manual_rank: 0, local_path: "C:\\code\\note-overlay", git_root: "C:\\code\\note-overlay", github_url: "https://github.com/kai/note-overlay", primary_language: "JavaScript", tags: ["electron", "personal"], next_action: "Finish and verify the Projects workspace", notes: "", push_after_commit: false, created_at: mockProjectNow, updated_at: mockProjectNow, last_worked_at: mockProjectNow, skill_ids: [], slash_command_ids: ["starter-gitpush"], activity: [{ id: "activity-1", kind: "created", summary: "Project added", detail: "", created_at: mockProjectNow }], tasks: [{ id: "task-1", project_id: "project-notebook", title: "Implement project command center", description: "", status: "in_progress", priority: "critical", manual_order: 0, due_date: null, tags: [], related: "", created_at: mockProjectNow, updated_at: mockProjectNow }, { id: "task-2", project_id: "project-notebook", title: "Verify packaged Electron build", description: "", status: "todo", priority: "high", manual_order: 1, due_date: null, tags: [], related: "", created_at: mockProjectNow, updated_at: mockProjectNow }, { id: "task-3", project_id: "project-notebook", title: "Map existing storage patterns", description: "", status: "done", priority: "medium", manual_order: 0, completed_at: mockProjectNow, tags: [], related: "", created_at: mockProjectNow, updated_at: mockProjectNow }] },
  { id: "project-shader", name: "Shader Lab", description: "Procedural GLSL experiments and reusable visual studies.", status: "active", priority: "high", manual_rank: 1, local_path: "C:\\code\\shader-lab", git_root: "C:\\code\\shader-lab", github_url: null, primary_language: "GLSL", tags: ["graphics"], next_action: "Tune the atmospheric scattering pass", notes: "", push_after_commit: false, created_at: mockProjectNow, updated_at: mockProjectNow, last_worked_at: new Date(Date.now() - 86400000).toISOString(), skill_ids: [], slash_command_ids: [], activity: [], tasks: [{ id: "task-4", project_id: "project-shader", title: "Tune scattering", status: "todo", priority: "high", manual_order: 0, tags: [], created_at: mockProjectNow, updated_at: mockProjectNow }] },
  { id: "project-archive", name: "Portfolio 2025", description: "Archived portfolio site.", status: "completed", priority: "low", manual_rank: 2, local_path: "C:\\code\\portfolio", git_root: "C:\\code\\portfolio", github_url: "https://github.com/kai/portfolio", primary_language: "TypeScript", tags: ["web"], next_action: "", notes: "", push_after_commit: false, created_at: mockProjectNow, updated_at: mockProjectNow, last_worked_at: new Date(Date.now() - 86400000 * 21).toISOString(), skill_ids: [], slash_command_ids: [], activity: [], tasks: [{ id: "task-5", project_id: "project-archive", title: "Publish final build", status: "done", priority: "medium", manual_order: 0, tags: [], created_at: mockProjectNow, updated_at: mockProjectNow }] },
] : [];
function cloneProject(project) { return structuredClone(project); }
function mockProjectStatus(project) { return project?.id === "project-notebook" ? { available: true, isGit: true, clean: false, branch: "main", upstream: "origin/main", ahead: 2, behind: 0, counts: { modified: 4, added: 2, deleted: 0, untracked: 1, staged: 1, conflicts: 0 }, files: [{ path: "src/renderer/ProjectsPage.jsx", index: ".", working: "M", staged: false, unstaged: true, kind: "modified" }, { path: "src/renderer/projects.css", index: "A", working: ".", staged: true, unstaged: false, kind: "added" }], lastCommit: { hash: "d5cf012345", shortHash: "d5cf0123", message: "Polish daily workspace", committedAt: new Date(Date.now() - 3600000 * 6).toISOString() } } : { available: true, isGit: true, clean: true, branch: "main", upstream: "origin/main", ahead: 0, behind: 0, counts: { modified: 0, added: 0, deleted: 0, untracked: 0, staged: 0, conflicts: 0 }, files: [], lastCommit: { hash: "a123456789", shortHash: "a1234567", message: "Update project", committedAt: project?.last_worked_at } }; }
function mockDailyDashboard() {
  const tomorrow = moveDate(mockDailyDate, 1);
  const hydrate = (task) => ({ priority: 2, owner: "me", ...task, carried: Boolean(task.carried_from_id) });
  const history = Array.from({ length: 7 }, (_value, offset) => {
    const date = moveDate(mockDailyDate, -offset);
    return { date, completed: mockDailyTasks.filter((task) => task.status === "done" && task.completed_on === date).length };
  });
  const today = mockDailyTasks.filter((task) => task.task_date === mockDailyDate && task.status === "open").map(hydrate);
  return {
    date: mockDailyDate,
    tomorrowDate: tomorrow,
    today,
    done: mockDailyTasks.filter((task) => task.status === "done" && task.completed_on === mockDailyDate).map(hydrate),
    tomorrow: mockDailyTasks.filter((task) => task.task_date === tomorrow && task.status === "open").map(hydrate),
    history,
    carriedCount: today.filter((task) => task.carried).length,
  };
}
const mockApi = {
  notes: {
    list: async () => mockNotes.filter((note) => !note.deleted_at).map((note) => ({ ...note })),
    create: async (input = {}) => {
      const note = {
        id: crypto.randomUUID(),
        title: input.title || "",
        body: input.body || "",
        folder_id: input.folderId || "inbox",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockNotes.unshift(note);
      return { ...note };
    },
    update: async (id, input) => {
      const note = mockNotes.find((item) => item.id === id);
      Object.assign(note, { ...input, folder_id: input.folderId ?? note.folder_id, updated_at: new Date().toISOString() });
      return { ...note };
    },
    dragFile: async () => "C:\\Temp\\notebook-note.md",
    trash: async (id) => {
      const note = mockNotes.find((item) => item.id === id);
      note.deleted_at = new Date().toISOString();
    },
  },
  skills: {
    list: async () => mockSkills.map((skill) => ({ ...skill })),
    create: async (input = {}) => {
      const skill = {
        id: crypto.randomUUID(),
        name: input.name || "",
        category: input.category || "Unsorted",
        body: input.body || "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockSkills.unshift(skill);
      return { ...skill };
    },
    update: async (id, input) => {
      const skill = mockSkills.find((item) => item.id === id);
      Object.assign(skill, input, { updated_at: new Date().toISOString() });
      return { ...skill };
    },
    remove: async (id) => {
      const index = mockSkills.findIndex((item) => item.id === id);
      if (index >= 0) mockSkills.splice(index, 1);
    },
  },
  mcpServers: {
    list: async () => structuredClone(mockMcpServers),
    create: async (input) => { const timestamp = new Date().toISOString(); const server = { id: input.id || input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), description: "", transport: "stdio", command: "", url: "", body: "", ...input, createdAt: timestamp, updatedAt: timestamp }; mockMcpServers.push(server); return structuredClone(server); },
    update: async (id, input) => { const server = mockMcpServers.find((item) => item.id === id); Object.assign(server, input, { updatedAt: new Date().toISOString() }); return structuredClone(server); },
    remove: async (id) => { const index = mockMcpServers.findIndex((item) => item.id === id); if (index >= 0) mockMcpServers.splice(index, 1); },
    relatedBots: async (id) => structuredClone(mockBots.filter((bot) => bot.mcpServerIds?.includes(id))),
  },
  bots: {
    list: async () => structuredClone(mockBots),
    get: async (id) => structuredClone(mockBots.find((bot) => bot.id === id) || null),
    create: async (input) => { const bot = hydrateMockBot(input); const note = { id: crypto.randomUUID(), title: `${bot.name} bot operations`, body: "# What this bot does\n\nDocument purpose, setup, deployment, recovery, and troubleshooting here.", folder_id: "inbox", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; mockNotes.unshift(note); bot.documentationNoteId = note.id; mockBots.unshift(bot); return structuredClone(bot); },
    update: async (id, input) => { const index = mockBots.findIndex((bot) => bot.id === id); mockBots[index] = hydrateMockBot(input, mockBots[index]); return structuredClone(mockBots[index]); },
    archive: async (id) => { const bot = mockBots.find((item) => item.id === id); bot.archivedAt = new Date().toISOString(); Object.assign(bot, hydrateMockBot(bot, bot)); return structuredClone(bot); },
    restore: async (id) => { const bot = mockBots.find((item) => item.id === id); bot.archivedAt = null; bot.monitoring = { ...bot.monitoring, monitoringEnabled: true }; const next = hydrateMockBot(bot, bot); next.archivedAt = null; Object.assign(bot, next); return structuredClone(bot); },
    check: async (id) => { const bot = mockBots.find((item) => item.id === id); if (bot.monitoring?.adapter === "manual") return { ok: true, skipped: true, snapshot: bot.runtime, derivedState: bot.derivedState }; const checkedAt = new Date().toISOString(); bot.runtime = { reportedState: "healthy", activityState: "idle", observedAt: checkedAt, lastCheckedAt: checkedAt, lastSuccessfulCheckAt: checkedAt, consecutiveFailures: 0, responseLatencyMilliseconds: 34, source: bot.monitoring.adapter === "local-status" ? "Local status file" : "HTTP health response", message: "Preview check succeeded." }; bot.derivedState = { state: bot.executionMode === "scheduled" ? "on_schedule" : "healthy", reason: "Preview check succeeded.", source: bot.runtime.source, observedAt: checkedAt, isStale: false }; return { ok: true, snapshot: structuredClone(bot.runtime), derivedState: structuredClone(bot.derivedState) }; },
    checkAll: async () => { const configured = mockBots.filter((bot) => bot.monitoring?.adapter !== "manual"); for (const bot of configured) await mockApi.bots.check(bot.id); return { checked: configured.length, succeeded: configured.length, failed: 0, results: [] }; },
    testMonitoring: async (bot) => bot.monitoring?.adapter === "manual" ? { ok: true, skipped: true, source: "Manual", message: "Manual monitoring performs no check." } : { ok: true, source: bot.monitoring?.adapter === "local-status" ? "Local status file" : "HTTP health response", latencyMilliseconds: 34, parsedStatus: { state: "healthy", activity: "idle", observedAt: new Date().toISOString(), message: "Preview check succeeded.", jobCount: 0 } },
    verifyConnection: async (botId, connectionId) => { const bot = mockBots.find((item) => item.id === botId); const connection = bot.connections.find((item) => item.id === connectionId); Object.assign(connection, { credentialState: "verified", credentialVerifiedAt: new Date().toISOString(), externalBotId: connection.externalBotId || "123456789", username: connection.username || `${connection.platform}_bot`, displayName: connection.displayName || "Verified Bot" }); return structuredClone(connection); },
    activity: async (id) => [{ id: `${id}-created`, botId: id, type: "configuration_updated", timestamp: mockBots.find((bot) => bot.id === id)?.createdAt || new Date().toISOString(), summary: "Bot registry entry created.", source: "Registry", metadata: {} }],
    runs: async () => [],
    upcoming: async () => mockBots.flatMap((bot) => (bot.jobs || []).filter((job) => job.enabled && !job.archivedAt).map((job, index) => { const nextRunAt = job.authoritativeNextRunAt || new Date(Date.now() + (index + 1) * 3_600_000).toISOString(); return { botId: bot.id, botName: bot.name, platforms: bot.platforms, job: { ...job, nextCalculatedAt: nextRunAt, nextReportedAt: job.authoritativeNextRunAt || null, occurrences: [1, 2, 3].map((step) => new Date(new Date(nextRunAt).getTime() + (step - 1) * 86_400_000).toISOString()) }, nextRunAt, nextRunSource: job.authoritativeNextRunAt ? "reported" : "calculated", health: { state: "on_schedule", reason: "No expected execution has been missed." } }; })),
    openSetup: async () => true,
    openResource: async () => true,
    onStatus: () => () => {},
  },
  slashCommands: {
    list: async () => mockSlashCommands.map((item) => ({ ...item })),
    create: async (input = {}) => {
      const item = {
        id: crypto.randomUUID(),
        name: input.name || "",
        command: input.command || "",
        body: input.body || "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockSlashCommands.unshift(item);
      return { ...item };
    },
    update: async (id, input) => {
      const item = mockSlashCommands.find((entry) => entry.id === id);
      Object.assign(item, input, { updated_at: new Date().toISOString() });
      return { ...item };
    },
    remove: async (id) => {
      const index = mockSlashCommands.findIndex((item) => item.id === id);
      if (index >= 0) mockSlashCommands.splice(index, 1);
    },
  },
  projects: {
    list: async () => { const state = new URLSearchParams(location.search).get("projects"); if (state === "error") throw new Error("Project storage is unavailable in this preview."); if (state === "loading") return new Promise(() => {}); return mockProjects.map(cloneProject); },
    create: async (input) => { const timestamp = new Date().toISOString(); const item = { id: crypto.randomUUID(), name: input.name, description: input.description || "", status: input.status || "active", priority: input.priority || "none", manual_rank: mockProjects.length, local_path: input.localPath || null, git_root: input.gitRoot || null, github_url: input.githubUrl || null, primary_language: input.primaryLanguage || "", tags: input.tags || [], next_action: input.nextAction || "", notes: input.notes || "", push_after_commit: false, created_at: timestamp, updated_at: timestamp, last_worked_at: timestamp, skill_ids: [], slash_command_ids: [], tasks: [], activity: [{ id: crypto.randomUUID(), kind: "created", summary: "Project added", detail: "", created_at: timestamp }] }; mockProjects.push(item); return cloneProject(item); },
    update: async (id, input) => { const item = mockProjects.find((project) => project.id === id); const map = { manualRank: "manual_rank", localPath: "local_path", gitRoot: "git_root", githubUrl: "github_url", primaryLanguage: "primary_language", nextAction: "next_action", pushAfterCommit: "push_after_commit", lastWorkedAt: "last_worked_at" }; Object.entries(input).forEach(([key, value]) => { item[map[key] || key] = value; }); item.updated_at = new Date().toISOString(); return cloneProject(item); },
    reorder: async (ids) => { ids.forEach((id, rank) => { const item = mockProjects.find((project) => project.id === id); if (item) item.manual_rank = rank; }); return mockProjects.map(cloneProject); },
    remove: async (id) => { const index = mockProjects.findIndex((project) => project.id === id); if (index >= 0) mockProjects.splice(index, 1); },
    chooseFolder: async () => ({ canceled: false, project: { name: "New local project", description: "", localPath: "C:\\code\\new-project", gitRoot: "C:\\code\\new-project", isGit: true, branch: "main", githubUrl: null, primaryLanguage: "TypeScript", hasAgents: false, hasReadme: true } }),
    chooseParent: async () => ({ canceled: false, projects: [{ name: "Discovered app", description: "", localPath: "C:\\code\\discovered-app", gitRoot: "C:\\code\\discovered-app", isGit: true, branch: "main", githubUrl: null, primaryLanguage: "JavaScript" }] }),
    inspect: async () => null,
    status: async (root) => mockProjectStatus(mockProjects.find((project) => project.git_root === root) || mockProjects[0]),
    diff: async ({ path }) => ({ path, binary: false, truncated: false, text: `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-old line\n+new verified line` }),
    stage: async ({ root }) => mockProjectStatus(mockProjects.find((project) => project.git_root === root)),
    unstage: async ({ root }) => mockProjectStatus(mockProjects.find((project) => project.git_root === root)),
    commit: async ({ root, message, push }) => ({ hash: "f00ba4123456789", shortHash: "f00ba412", message, pushed: push, status: { ...mockProjectStatus(mockProjects.find((project) => project.git_root === root)), clean: true, files: [], counts: { modified: 0, added: 0, deleted: 0, untracked: 0, staged: 0, conflicts: 0 } } }),
    fetch: async (root) => mockProjectStatus(mockProjects.find((project) => project.git_root === root)),
    agentsRead: async (root) => ({ exists: true, path: `${root}\\AGENTS.md`, content: "# Project Instructions\n\n## Purpose\n\nBuild a calm, local-first developer workspace.\n\n## Testing and Verification\n\nRun targeted tests and inspect the real app.", version: "preview", modifiedAt: mockProjectNow, newline: "\r\n" }),
    agentsWrite: async ({ root, content }) => ({ exists: true, path: `${root}\\AGENTS.md`, content, version: crypto.randomUUID(), modifiedAt: new Date().toISOString(), newline: "\r\n" }),
    readme: async (root) => ({ path: `${root}\\README.md`, content: "# Project\n\nA focused local project with a clear next action." }),
    open: async () => true,
    tasks: {
      create: async (projectId, input) => { const project = mockProjects.find((item) => item.id === projectId); project.tasks.push({ id: crypto.randomUUID(), project_id: projectId, description: "", status: "todo", priority: "medium", manual_order: project.tasks.length, tags: [], related: "", created_at: mockProjectNow, updated_at: mockProjectNow, ...input }); return cloneProject(project); },
      update: async (id, input) => { const project = mockProjects.find((item) => item.tasks.some((task) => task.id === id)); Object.assign(project.tasks.find((task) => task.id === id), input, { updated_at: new Date().toISOString() }); return cloneProject(project); },
      remove: async (id) => { const project = mockProjects.find((item) => item.tasks.some((task) => task.id === id)); project.tasks = project.tasks.filter((task) => task.id !== id); return cloneProject(project); },
    },
    assign: async (id, input) => { const project = mockProjects.find((item) => item.id === id); if (input.skillIds) project.skill_ids = input.skillIds; if (input.slashCommandIds) project.slash_command_ids = input.slashCommandIds; return cloneProject(project); },
  },
  daily: {
    get: async () => {
      const state = new URLSearchParams(location.search).get("daily");
      if (state === "error") throw new Error("Daily preview error");
      if (state === "loading") return new Promise(() => {});
      return mockDailyDashboard();
    },
    create: async (input) => {
      const completed = Boolean(input.completed) && input.bucket !== "tomorrow";
      const timestamp = new Date().toISOString();
      mockDailyTasks.push({ id: crypto.randomUUID(), task_date: input.bucket === "tomorrow" ? moveDate(mockDailyDate, 1) : mockDailyDate, text: input.text.trim(), status: completed ? "done" : "open", priority: input.priority || 2, owner: input.owner === "agent" ? "agent" : "me", completed_on: completed ? mockDailyDate : null, completed_at: completed ? timestamp : null, created_at: timestamp, updated_at: timestamp });
      return mockDailyDashboard();
    },
    update: async (id, input) => {
      const task = mockDailyTasks.find((item) => item.id === id);
      const patch = typeof input === "string" ? { text: input } : input;
      if (patch.text !== undefined) task.text = patch.text.trim();
      if (patch.priority !== undefined) task.priority = patch.priority;
      if (patch.owner !== undefined) task.owner = patch.owner;
      if (patch.bucket !== undefined) task.task_date = patch.bucket === "tomorrow" ? moveDate(mockDailyDate, 1) : mockDailyDate;
      task.updated_at = new Date().toISOString();
      return mockDailyDashboard();
    },
    complete: async (id, completed) => {
      const task = mockDailyTasks.find((item) => item.id === id);
      task.status = completed ? "done" : "open";
      task.task_date = mockDailyDate;
      task.completed_on = completed ? mockDailyDate : null;
      task.completed_at = completed ? new Date().toISOString() : null;
      return mockDailyDashboard();
    },
    remove: async (id) => {
      const index = mockDailyTasks.findIndex((item) => item.id === id);
      if (index >= 0) mockDailyTasks.splice(index, 1);
      return mockDailyDashboard();
    },
  },
  folders: {
    list: async () => mockFolders.map((folder) => ({
      ...folder,
      note_count: mockNotes.filter((note) => !note.deleted_at && note.folder_id === folder.id).length,
    })),
    create: async (name) => {
      const folder = { id: crypto.randomUUID(), name: name.trim(), is_inbox: false, note_count: 0 };
      mockFolders.push(folder);
      return { ...folder };
    },
    rename: async (id, name) => {
      const folder = mockFolders.find((item) => item.id === id);
      folder.name = name.trim();
    },
    remove: async (id) => {
      const index = mockFolders.findIndex((item) => item.id === id);
      if (index >= 0) mockFolders.splice(index, 1);
      mockNotes.forEach((note) => { if (note.folder_id === id) note.folder_id = "inbox"; });
    },
  },
  compressor: {
    status: async () => new URLSearchParams(location.search).get("demo") === "success",
    start: async () => ({
      ready: new URLSearchParams(location.search).get("demo") === "success",
      error: "Local service is only available in the desktop app.",
    }),
    compress: async () => ({
      compressed_prompt: "Concise project update. Feature complete, tests passed, ready for review.",
      origin_tokens: 24,
      compressed_tokens: 14,
      ratio: "1.7x",
    }),
  },
  compressions: { create: async (value) => value },
  backups: {
    list: async () => [],
    create: async () => ({ name: "notebook-backup-preview.json", createdAt: new Date().toISOString(), size: 1024 }),
    restore: async () => mockNotes.map((note) => ({ ...note })),
  },
  settings: {
    version: async () => "0.7.8",
    export: async () => ({ filePath: "C:\\Temp\\notebook-backup.json" }),
    dataLocation: async () => "C:\\Notebook data",
  },
  clipboard: { writeText: async (text) => navigator.clipboard.writeText(text) },
  mail: {
    show: async () => {
      const state = new URLSearchParams(location.search).get("mail");
      if (state === "error") return { status: "error", message: "Google blocked the embedded sign-in in this preview." };
      if (state === "loading") return { status: "loading", message: "" };
      return { status: "ready", message: "" };
    },
    hide: async () => ({ status: "ready" }),
    reload: async () => ({ status: "loading" }),
    openExternal: async () => true,
  },
  notion: {
    show: async () => {
      const state = new URLSearchParams(location.search).get("notion");
      if (state === "error") return { status: "error", message: "Notion is unavailable in this preview." };
      if (state === "loading") return { status: "loading", message: "" };
      return { status: "ready", message: "" };
    },
    hide: async () => ({ status: "ready" }),
    reload: async () => ({ status: "loading" }),
    openExternal: async () => true,
  },
  window: { hide: async () => {} },
  onNewInboxNote: () => {},
  onFocusEditor: () => {},
  onFlushEditor: () => {},
  onOverlayHiding: () => {},
  onOverlayShown: () => {},
  onOpenMail: () => () => {},
  onMailStatus: () => () => {},
  onOpenNotion: () => () => {},
  onNotionStatus: () => () => {},
};
const api = window.hushnote || mockApi;

function BrandIcon({ icon }) {
  return <svg className="brand-icon" role="img" aria-hidden="true" viewBox="0 0 24 24"><path d={icon.path} /></svg>;
}

function preview(note) {
  const text = (note.body || "").trim().replace(/\s+/g, " ");
  return text || "Empty note";
}

function noteName(note) {
  return note.title?.trim() || preview(note).slice(0, 42) || "Untitled";
}

function skillName(skill) {
  return displaySkillName(skill);
}

function skillPreview(skill) {
  const text = (skill.body || "").split("\n").map((line) => line.replace(/^#{1,6}\s+/, "").trim()).filter(Boolean).join(" ");
  return text || "No instructions yet";
}

function slashCommandName(item) {
  return item.name?.trim() || item.command?.trim() || preview({ body: item.body }).slice(0, 42) || "Untitled command";
}

function SlashCommandList({ items, currentId, onSelect, onRemove }) {
  if (!items.length) return <div className="notes"><p className="empty-list">No slash items found.<br />Use + to save one.</p></div>;
  const groups = [
    { label: "Commands", items: items.filter((item) => item.command?.trim()) },
    { label: "Reference", items: items.filter((item) => !item.command?.trim()) },
  ];
  return <div className="notes slash-list" aria-live="polite">
    {groups.filter((group) => group.items.length).map((group) => <section className="slash-group" key={group.label}>
      <div className="slash-group-label"><span>{group.label}</span><small>{group.items.length}</small></div>
      {group.items.map((item) => <div className={`note-row ${currentId === item.id ? "selected" : ""}`} key={item.id}>
        <button className="note-open" onClick={() => onSelect(item)}><strong>{slashCommandName(item)}</strong><span className={item.command?.trim() ? "slash-invocation" : "slash-reference"}>{item.command?.trim() || "Guide"}</span><small>{shortTime(item.updated_at)}</small></button>
        <button className="note-delete" aria-label={`Delete ${slashCommandName(item)}`} onClick={() => onRemove(item)}>×</button>
      </div>)}
    </section>)}
  </div>;
}

function SkillList({ items, currentId, onSelect, onRemove, grouped }) {
  if (!items.length) return <div className="notes"><p className="empty-list">No skills found.<br />Use + to save one.</p></div>;
  const ordered = [...items].sort(sortSkillsByStack);
  const groups = grouped
    ? [...new Set(ordered.map((skill) => skill.category?.trim() || "Unsorted"))].sort((left, right) => left.localeCompare(right)).map((category) => ({ label: category, items: ordered.filter((skill) => (skill.category?.trim() || "Unsorted") === category) }))
    : [{ label: "", items: ordered }];
  return <div className="notes skill-list" aria-live="polite">
    {groups.map((group) => <section className="slash-group" key={group.label || "all"}>
      {group.label ? <div className="slash-group-label"><span>{cleanSkillCategory(group.label)}</span><small>{group.items.length}</small></div> : null}
      {group.items.map((skill) => <div className={`note-row ${currentId === skill.id ? "selected" : ""}${isArchivedSkill(skill) ? " is-archived" : ""}`} key={skill.id}>
        <button className="note-open" onClick={() => onSelect(skill)}><strong>{skillName(skill)}</strong><span>{skillPreview(skill)}</span><small>{shortTime(skill.updated_at)}</small></button>
        <button className="note-delete" aria-label={`Delete ${skillName(skill)}`} onClick={() => onRemove(skill)}>×</button>
      </div>)}
    </section>)}
  </div>;
}

function CategoryFilters({ categories, active, onSelect }) {
  const scroller = useRef(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });

  const refresh = () => {
    const element = scroller.current;
    if (!element) return;
    setOverflow({ left: element.scrollLeft > 1, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1 });
  };

  useEffect(() => {
    refresh();
    const element = scroller.current;
    if (!element) return;
    element.addEventListener("scroll", refresh, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(refresh) : null;
    observer?.observe(element);
    window.addEventListener("resize", refresh);
    return () => { element.removeEventListener("scroll", refresh); observer?.disconnect(); window.removeEventListener("resize", refresh); };
  }, [categories]);

  const nudge = (direction) => scroller.current?.scrollBy({ left: direction * 140, behavior: "smooth" });

  return (
    <div className="category-filters" aria-label="Skill categories">
      {overflow.left && <button type="button" className="category-arrow" onClick={() => nudge(-1)} aria-label="Scroll categories back">‹</button>}
      <div className="category-scroller" ref={scroller} onWheel={(event) => { if (event.deltaY) scroller.current.scrollLeft += event.deltaY; }}>
        {categories.map((category) => <button key={category} className={active === category ? "active" : ""} onClick={() => onSelect(category)}>{category}</button>)}
      </div>
      {overflow.right && <button type="button" className="category-arrow" onClick={() => nudge(1)} aria-label="Scroll categories forward">›</button>}
    </div>
  );
}

function SkillStackHome({ skills, onOpen, onHide }) {
  const byName = new Map(skills.map((skill) => [displaySkillName(skill).toLocaleLowerCase(), skill]));
  const activeSkills = skills.filter((skill) => !isArchivedSkill(skill));
  const archivedSkills = skills.filter(isArchivedSkill);
  const activeRank = new Map(SKILL_STACK_GROUPS.filter((group) => group.status === "active").flatMap((group) => group.items).map(([name], index) => [name.toLocaleLowerCase(), index + 1]));
  const unranked = skills.filter((skill) => !skillStackReference(skill)).sort(sortSkillsByStack);

  const rows = (group) => group.items.map(([name, summary]) => {
    const skill = byName.get(name.toLocaleLowerCase());
    const rank = activeRank.get(name.toLocaleLowerCase());
    return <button type="button" className="skill-stack-row" key={name} disabled={!skill} onClick={() => skill && onOpen(skill)}>
      <span className={`skill-stack-rank ${group.status}`}>{rank || <Archive size={12} strokeWidth={1.8} />}</span>
      <span><strong>{name}</strong><small>{summary}</small></span>
      <span className="skill-stack-open">{skill ? "Open" : "Missing"}</span>
    </button>;
  });

  return <section className="editor skill-stack-home">
    <header className="editor-bar"><span className="save-state">Ranked quick reference</span><div><button className="hide" onClick={onHide} aria-label="Hide notebook">×</button></div></header>
    <div className="skill-stack-scroll">
      <header className="skill-stack-hero">
        <span className="skill-stack-hero-icon"><Layers3 size={25} strokeWidth={1.7} /></span>
        <div><span className="daily-kicker">Main skill page</span><h1>Skill Stack</h1><p>Daily skills first. Archived skills stay searchable and ready when a matching project appears.</p></div>
        <div className="skill-stack-counts"><span><strong>{activeSkills.length}</strong> active</span><span><strong>{archivedSkills.length}</strong> archived</span></div>
      </header>
      <div className="skill-stack-rule"><Sparkles size={16} /><span><strong>Routing rule</strong> Start at the top of the matching group. Archive reduces noise; it never deletes a skill.</span></div>
      <section className="skill-stack-section">
        <header><div><span>Daily stack</span><h2>Active Skills</h2></div><strong>{activeSkills.length}</strong></header>
        <div className="skill-stack-groups">{SKILL_STACK_GROUPS.filter((group) => group.status === "active").map((group) => <section className="skill-stack-group" key={group.label}><header><span>{group.label}</span><small>{group.items.length}</small></header>{rows(group)}</section>)}</div>
      </section>
      <section className="skill-stack-section archived">
        <header><div><span>Search when needed</span><h2>Archived Skills</h2></div><strong>{archivedSkills.length}</strong></header>
        <p>Out of the daily stack, not deleted. Open any group to see why each skill is archived.</p>
        <div className="skill-stack-archive-groups">{SKILL_STACK_GROUPS.filter((group) => group.status === "archived").map((group, index) => <details key={group.label} open={index === 0}><summary><span>{group.label}</span><small>{group.items.length}</small></summary>{rows(group)}</details>)}</div>
      </section>
      {unranked.length > 0 && <section className="skill-stack-section unranked"><header><div><span>Needs placement</span><h2>Unranked Skills</h2></div><strong>{unranked.length}</strong></header>{unranked.map((skill) => <button type="button" className="skill-stack-row" key={skill.id} onClick={() => onOpen(skill)}><span className="skill-stack-rank">?</span><span><strong>{skillName(skill)}</strong><small>{cleanSkillCategory(skill.category)}</small></span><span className="skill-stack-open">Open</span></button>)}</section>}
    </div>
  </section>;
}

function shortTime(value) {
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}

function fullTime(value) {
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function bytes(value) {
  return value < 1024 ? `${value} B` : `${Math.max(1, Math.round(value / 1024))} KB`;
}

function markdownFor(note) {
  if (!note) return "";
  const title = note.title?.trim();
  const body = note.body?.trimEnd();
  return [title ? `# ${title}` : "", body || ""].filter(Boolean).join("\n\n");
}

function todoItems(body = "") {
  return body.split("\n").map((line, lineIndex) => {
    const match = line.match(/^\s*[-*]\s+\[([ xX])]\s+(.*)$/);
    return match ? { lineIndex, checked: match[1].toLowerCase() === "x", text: match[2] } : null;
  }).filter(Boolean);
}

function dailyDate(value, options = {}) {
  return new Date(`${value}T12:00:00`).toLocaleDateString([], { weekday: options.short ? "short" : "long", month: options.short ? undefined : "long", day: "numeric" });
}

function DailySidebar({ daily, status }) {
  if (!daily) return <div className="daily-sidebar"><p className="empty-list">{status}</p></div>;
  const focusCount = daily.today.filter((task) => task.priority === 1 && task.owner !== "agent").length;
  const agentCount = daily.today.filter((task) => task.owner === "agent").length;
  const maxDone = Math.max(1, ...daily.history.map((day) => day.completed));
  return <div className="daily-sidebar">
    <section className="daily-routine-card">
      <span className="daily-kicker">Control</span>
      <strong>{daily.today.length ? `${daily.today.length} open today` : "Day is clear"}</strong>
      <p>P1 is focus. P2 is next. P3 can wait. Assign work to Agent when it can run without you.</p>
      <div className="routine-step"><span>My focus</span><b>{focusCount}</b></div>
      <div className="routine-step"><span>Agent queue</span><b>{agentCount}</b></div>
      <div className="routine-step"><span>Carried</span><b>{daily.carriedCount}</b></div>
    </section>
    <section className="daily-history" aria-label="Seven day completion history">
      <span className="daily-kicker">Last 7 days</span>
      {daily.history.map((day) => <div key={day.date}><span>{day.date === daily.date ? "Today" : dailyDate(day.date, { short: true })}</span><i aria-hidden="true"><b style={{ width: `${Math.max(8, (day.completed / maxDone) * 100)}%` }} /></i><strong>{day.completed}</strong></div>)}
    </section>
    <section className="daily-rules">
      <span className="daily-kicker">Daily reset</span>
      <p><b>1</b> Choose up to three P1 tasks.</p>
      <p><b>2</b> Delegate clear work to Agent.</p>
      <p><b>3</b> Set tomorrow before stopping.</p>
    </section>
  </div>;
}

function DailyAddForm({ label, placeholder, onAdd, buttonLabel }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    const saved = await onAdd(value.trim());
    if (saved) setValue("");
    setBusy(false);
  }
  return <form className="daily-add" onSubmit={submit}>
    <input value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} aria-label={label} maxLength={500} />
    <button type="submit" disabled={!value.trim() || busy} aria-label={`Add ${label.toLowerCase()}`}>{buttonLabel || "Add"}</button>
  </form>;
}

function TodayCapture({ onAdd }) {
  const [value, setValue] = useState("");
  const [priority, setPriority] = useState(1);
  const [owner, setOwner] = useState("me");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    const saved = await onAdd(value.trim(), "today", false, { priority, owner });
    if (saved) setValue("");
    setBusy(false);
  }
  return <form className="today-capture" onSubmit={submit}>
    <label><span>Quick capture</span><input value={value} onChange={(event) => setValue(event.target.value)} placeholder="What needs to move?" aria-label="Today task" maxLength={500} /></label>
    <label><span>Priority</span><select value={priority} onChange={(event) => setPriority(Number(event.target.value))} aria-label="New task priority"><option value="1">P1 · Focus</option><option value="2">P2 · Next</option><option value="3">P3 · Later</option></select></label>
    <label><span>Owner</span><select value={owner} onChange={(event) => setOwner(event.target.value)} aria-label="New task owner"><option value="me">Me</option><option value="agent">Agent</option></select></label>
    <button type="submit" disabled={!value.trim() || busy} aria-label="Add today task">{busy ? "Adding…" : "Add task"}</button>
  </form>;
}

function DailyTaskRow({ task, completed = false, bucket = "today", onToggle, onLocalEdit, onSave, onUpdate, onRemove }) {
  return <div className={`daily-task ${completed ? "is-done" : ""}`}>
    <input type="checkbox" checked={completed} onChange={(event) => onToggle(task.id, event.target.checked)} aria-label={`${completed ? "Reopen" : "Complete"} ${task.text}`} />
    <div className="daily-task-copy">
      <textarea rows="1" value={task.text} onChange={(event) => onLocalEdit(task.id, event.target.value)} onBlur={() => onSave(task)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} aria-label={`Edit task: ${task.text}`} maxLength={500} />
      <div className="task-meta">
        {completed ? <><span>P{task.priority || 2}</span><span>{task.owner === "agent" ? "Agent" : "Me"}</span></> : <>
          <select value={task.priority || 2} onChange={(event) => onUpdate(task.id, { priority: Number(event.target.value) })} aria-label={`Priority for ${task.text}`}><option value="1">P1</option><option value="2">P2</option><option value="3">P3</option></select>
          <select value={task.owner || "me"} onChange={(event) => onUpdate(task.id, { owner: event.target.value })} aria-label={`Owner for ${task.text}`}><option value="me">Me</option><option value="agent">Agent</option></select>
          {task.carried ? <span>Carried</span> : null}
          <button type="button" onClick={() => onUpdate(task.id, { bucket: bucket === "today" ? "tomorrow" : "today" })}>{bucket === "today" ? "Tomorrow" : "Move to today"}</button>
        </>}
      </div>
    </div>
    <button className="daily-task-remove" onClick={() => onRemove(task.id)} aria-label={`Delete ${task.text}`}>×</button>
  </div>;
}

function TaskSection({ title, label, tasks, empty, tone = "", bucket = "today", taskProps }) {
  return <section className={`daily-section ${tone}`}><header><div><span>{label}</span><h2>{title}</h2></div><strong>{tasks.length}</strong></header>
    <div className="daily-tasks">{tasks.map((task) => <DailyTaskRow key={task.id} task={task} bucket={bucket} {...taskProps} />)}{!tasks.length && <p className="daily-empty">{empty}</p>}</div>
  </section>;
}

function DailyPlanner({ daily, status, onAdd, onToggle, onLocalEdit, onSave, onUpdate, onRemove, onHide, onRetry }) {
  const failed = status.startsWith("Could not");
  if (!daily) return <section className="editor daily-editor"><header className="editor-bar"><div className="editor-context"><span className={`save-state ${failed ? "failed" : ""}`}>{status}</span></div><button className="hide" onClick={onHide} aria-label="Hide notebook">×</button></header><div className="daily-loading"><strong>{failed ? "Daily plan unavailable" : "Opening today…"}</strong><span>{failed ? "Your notes are safe. Try loading the daily plan again." : "Checking yesterday and preparing today."}</span>{failed && <button className="plain-button" onClick={onRetry}>Try again</button>}</div></section>;
  const planned = daily.today.length + daily.done.length;
  const percent = planned ? Math.round((daily.done.length / planned) * 100) : 0;
  const myFocus = daily.today.filter((task) => task.owner !== "agent" && task.priority === 1);
  const myNext = daily.today.filter((task) => task.owner !== "agent" && task.priority !== 1);
  const agentQueue = daily.today.filter((task) => task.owner === "agent");
  const taskProps = { onToggle, onLocalEdit, onSave, onUpdate, onRemove };
  return <section className="editor daily-editor">
    <header className="editor-bar"><div className="editor-context"><span className={`save-state ${failed ? "failed" : ""}`}>{status}</span><span className="notebook-name">Today</span></div><button className="hide" onClick={onHide} aria-label="Hide notebook">×</button></header>
    <div className="daily-scroll">
      <header className="daily-heading"><div><span className="daily-kicker">Today</span><h1>{dailyDate(daily.date)}</h1><p>One trusted place for what matters, what moved, and what runs next.</p></div><div className="daily-progress"><strong>{daily.done.length}/{planned}</strong><span>done</span><div><i style={{ width: `${percent}%` }} /></div></div></header>
      <TodayCapture onAdd={onAdd} />
      {daily.carriedCount > 0 && <div className="daily-rollover" role="status"><span>↻</span><div><strong>{daily.carriedCount} carried forward</strong><p>Still open, still visible. Re-rank it or move it to tomorrow.</p></div></div>}
      <div className="priority-board">
        <div className="priority-main">
          <TaskSection label="P1 · Limit 3" title="My focus" tasks={myFocus} empty="Choose the one thing that makes today count." tone="daily-focus" taskProps={taskProps} />
          <TaskSection label="P2–P3" title="Next up" tasks={myNext} empty="Everything else can wait here without being lost." taskProps={taskProps} />
          <section className="daily-section daily-done"><header><div><span>Record</span><h2>Done today</h2></div><strong>{daily.done.length}</strong></header>
            <div className="daily-tasks">{daily.done.map((task) => <DailyTaskRow key={task.id} task={task} completed {...taskProps} />)}{!daily.done.length && <p className="daily-empty">Finished work becomes today’s proof.</p>}</div>
            <DailyAddForm label="Completed task" placeholder="Log something already finished…" buttonLabel="Log" onAdd={(text) => onAdd(text, "today", true, { priority: 2, owner: "me" })} />
          </section>
        </div>
        <div className="priority-rail">
          <TaskSection label="Delegated" title="Agent queue" tasks={agentQueue} empty="Assign clear, independent work here." tone="daily-agent" taskProps={taskProps} />
          <section className="daily-section daily-tomorrow"><header><div><span>Next day</span><h2>Tomorrow</h2></div><strong>{daily.tomorrow.length}</strong></header>
            <div className="daily-tasks">{daily.tomorrow.map((task) => <DailyTaskRow key={task.id} task={task} bucket="tomorrow" {...taskProps} />)}{!daily.tomorrow.length && <p className="daily-empty">Leave tomorrow a clear first move.</p>}</div>
            <DailyAddForm label="Tomorrow task" placeholder="Set up tomorrow…" onAdd={(text) => onAdd(text, "tomorrow", false, { priority: 2, owner: "me" })} />
          </section>
          <aside className="daily-loop-note"><span>Rule</span><p>Unfinished work rolls forward automatically. Nothing disappears; you only re-rank it.</p></aside>
        </div>
      </div>
    </div>
  </section>;
}

function UniversalSearchResults({ query, notes, skills, slashCommands, bots, mcpServers, daily, onOpenNote, onOpenSkill, onOpenCommand, onOpenBot, onOpenMcp, onOpenTask }) {
  const needle = query.trim().toLowerCase();
  const matches = (value) => String(value || "").toLowerCase().includes(needle);
  const noteResults = notes.filter((note) => !note.deleted_at && matches(`${noteName(note)} ${note.body || ""}`));
  const skillResults = skills.filter((skill) => matches(`${skillName(skill)} ${skill.category || ""} ${skill.body || ""}`));
  const commandResults = slashCommands.filter((item) => matches(`${slashCommandName(item)} ${item.command || ""} ${item.body || ""}`));
  const botResults = bots.filter((bot) => {
    const documentation = notes.find((note) => note.id === bot.documentationNoteId);
    const relatedMcp = (bot.mcpServerIds || []).map((id) => mcpServers.find((server) => server.id === id)?.name || id).join(" ");
    const relatedSkills = (bot.skillIds || []).map((id) => skills.find((skill) => skill.id === id)?.name || id).join(" ");
    return matches(`${bot.name} ${bot.description || ""} ${(bot.tags || []).join(" ")} ${(bot.connections || []).map((connection) => `${connection.username || ""} ${connection.displayName || ""}`).join(" ")} ${(bot.jobs || []).map((job) => job.name).join(" ")} ${(bot.commands || []).map((command) => `${command.command} ${command.description || ""}`).join(" ")} ${relatedMcp} ${relatedSkills} ${documentation?.title || ""} ${documentation?.body || ""}`);
  });
  const mcpResults = mcpServers.filter((server) => matches(`${server.name} ${server.description || ""} ${server.transport || ""} ${server.body || ""}`));
  const taskResults = daily ? [
    ...daily.today.map((task) => ({ ...task, location: "Today" })),
    ...daily.tomorrow.map((task) => ({ ...task, location: "Tomorrow" })),
    ...daily.done.map((task) => ({ ...task, location: "Done today" })),
  ].filter((task) => matches(task.text)) : [];
  const groups = [
    { label: "Tasks", items: taskResults, render: (task) => <button key={task.id} onClick={() => onOpenTask(task)}><span className="result-mark task">✓</span><div><strong>{task.text}</strong><small>{task.location} · P{task.priority || 2} · {task.owner === "agent" ? "Agent" : "Me"}</small></div></button> },
    { label: "Notes", items: noteResults, render: (note) => <button key={note.id} onClick={() => onOpenNote(note)}><span className="result-mark note">N</span><div><strong>{noteName(note)}</strong><small>{preview(note)}</small></div></button> },
    { label: "Bots", items: botResults, render: (bot) => <button key={bot.id} onClick={() => onOpenBot(bot)}><span className="result-mark bot"><Bot size={12} /></span><div><strong>{bot.name}</strong><small>{bot.derivedState?.state || "unknown"} · {bot.executionMode}</small></div></button> },
    { label: "MCP Servers", items: mcpResults, render: (server) => <button key={server.id} onClick={() => onOpenMcp(server)}><span className="result-mark mcp"><ServerCog size={12} /></span><div><strong>{server.name}</strong><small>{server.transport || "stdio"}</small></div></button> },
    { label: "Skills", items: skillResults, render: (skill) => <button key={skill.id} onClick={() => onOpenSkill(skill)}><span className="result-mark skill">S</span><div><strong>{skillName(skill)}</strong><small>{skill.category || "Unsorted"}</small></div></button> },
    { label: "Commands", items: commandResults, render: (item) => <button key={item.id} onClick={() => onOpenCommand(item)}><span className="result-mark command">/</span><div><strong>{slashCommandName(item)}</strong><small>{item.command || "Reference"}</small></div></button> },
  ].filter((group) => group.items.length);
  return <div className="global-results" aria-live="polite">
    <div className="search-summary"><span>Results for “{query.trim()}”</span><small>{groups.reduce((total, group) => total + group.items.length, 0)}</small></div>
    {groups.map((group) => <section key={group.label}><header><span>{group.label}</span><small>{group.items.length}</small></header>{group.items.slice(0, 8).map(group.render)}</section>)}
    {!groups.length && <div className="search-empty"><strong>No match</strong><span>Search checks notes, tasks, bots, jobs, commands, MCP servers, skills, and categories.</span></div>}
  </div>;
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <main className="app-error"><strong>Notebook hit a screen error.</strong><span>Your notes are still saved locally.</span><button onClick={() => location.reload()}>Reload Notebook</button></main>;
    return this.props.children;
  }
}

function hashRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const routes = { today: "daily", notes: "notes", projects: "projects", bots: "bots", "mcp-servers": "mcp-servers", skills: "skills", commands: "slash-commands" };
  return { view: routes[parts[0]] || "daily", id: parts[1] || null };
}

function App() {
  const [view, setView] = useState(() => hashRoute().view);
  const [notes, setNotes] = useState([]);
  const [notebooks, setNotebooks] = useState([]);
  const [activeNotebookId, setActiveNotebookId] = useState("inbox");
  const [current, setCurrent] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [skills, setSkills] = useState([]);
  const [currentSkill, setCurrentSkill] = useState(null);
  const [skillCategory, setSkillCategory] = useState("Active");
  const [skillHome, setSkillHome] = useState(true);
  const [slashCommands, setSlashCommands] = useState([]);
  const [currentSlashCommand, setCurrentSlashCommand] = useState(null);
  const [bots, setBots] = useState([]);
  const [mcpServers, setMcpServers] = useState([]);
  const [currentBotId, setCurrentBotId] = useState(() => hashRoute().view === "bots" ? hashRoute().id : null);
  const [currentMcpId, setCurrentMcpId] = useState(() => hashRoute().view === "mcp-servers" ? hashRoute().id : null);
  const [daily, setDaily] = useState(null);
  const [dailyStatus, setDailyStatus] = useState("Loading…");
  const [saveState, setSaveState] = useState("Loading…");
  const [compressOpen, setCompressOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [backups, setBackups] = useState([]);
  const [dataLocation, setDataLocation] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [closing, setClosing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [showTick, setShowTick] = useState(0);
  const [editorMode, setEditorMode] = useState("write");
  const [notebookEditor, setNotebookEditor] = useState(null);
  const [appVersion, setAppVersion] = useState("");
  const [mailStatus, setMailStatus] = useState({ status: "idle", message: "" });
  const [notionStatus, setNotionStatus] = useState({ status: "idle", message: "" });
  const saveTimer = useRef();
  const skillSaveTimer = useRef();
  const slashCommandSaveTimer = useRef();
  const noticeTimer = useRef();
  const editorRef = useRef();
  const searchRef = useRef();
  const surfaceRef = useRef(null);
  const currentRef = useRef(null);
  const currentSkillRef = useRef(null);
  const currentSlashCommandRef = useRef(null);
  const viewRef = useRef("daily");
  const previousViewRef = useRef("daily");

  const load = async () => {
    const [list, savedSkills, savedSlashCommands, savedNotebooks, savedBots, savedMcpServers, version] = await Promise.all([api.notes.list(), api.skills.list(), api.slashCommands.list(), api.folders.list(), api.bots.list({ includeArchived: true }), api.mcpServers.list(), api.settings.version()]);
    const inboxId = savedNotebooks.find((notebook) => notebook.is_inbox)?.id || "inbox";
    setNotes(list);
    setSkills(savedSkills);
    setSlashCommands(savedSlashCommands);
    setBots(savedBots);
    setMcpServers(savedMcpServers);
    setNotebooks(savedNotebooks);
    setAppVersion(version);
    setActiveNotebookId(inboxId);
    const inboxNote = list.find((note) => !note.deleted_at && note.folder_id === inboxId);
    if (inboxNote) setCurrent(inboxNote);
    else if (list.some((note) => !note.deleted_at)) { setActiveNotebookId("all"); setCurrent(list.find((note) => !note.deleted_at)); }
    else {
      const note = await api.notes.create({ title: "", body: "", folderId: inboxId });
      setNotes([note]); setCurrent(note);
    }
    if (savedSkills.length) setCurrentSkill(savedSkills[0]);
    if (savedSlashCommands.length) setCurrentSlashCommand(savedSlashCommands[0]);
    setSaveState("Saved");
    await loadDaily();
  };

  async function loadDaily() {
    setDailyStatus("Loading…");
    try { setDaily(await api.daily.get()); setDailyStatus("Saved"); }
    catch { setDailyStatus("Could not load daily plan"); }
  }
  async function reloadBots() { const saved = await api.bots.list({ includeArchived: true }); setBots(saved); return saved; }
  async function reloadNotes() { const saved = await api.notes.list(); setNotes(saved); return saved; }
  async function reloadMcpServers() { const saved = await api.mcpServers.list(); setMcpServers(saved); return saved; }

  useEffect(() => {
    load().catch(() => setSaveState("Could not load notes"));
    api.onNewInboxNote(() => createNote("inbox"));
    api.onFocusEditor(() => setTimeout(() => editorRef.current?.focus(), 0));
    api.onFlushEditor(() => { if (currentRef.current) saveNow(currentRef.current); if (currentSkillRef.current) saveSkillNow(currentSkillRef.current); if (currentSlashCommandRef.current) saveSlashCommandNow(currentSlashCommandRef.current); });
    api.onOverlayHiding(() => {
      setClosing(true);
      if (["mail", "notion"].includes(viewRef.current)) {
        api[viewRef.current].hide().catch(() => {});
        setView(previousViewRef.current);
      }
    });
    api.onOverlayShown(() => { setClosing(false); setShowTick((tick) => tick + 1); loadDaily(); });
    const stopBotStatus = api.bots.onStatus?.((update) => { if (update?.bot?.id) setBots((items) => items.map((item) => item.id === update.bot.id ? update.bot : item)); });
    const onHashChange = () => { const route = hashRoute(); setView(route.view); if (route.view === "bots") setCurrentBotId(route.id); if (route.view === "mcp-servers") setCurrentMcpId(route.id); };
    addEventListener("hashchange", onHashChange);
    return () => { stopBotStatus?.(); removeEventListener("hashchange", onHashChange); clearTimeout(saveTimer.current); clearTimeout(skillSaveTimer.current); clearTimeout(slashCommandSaveTimer.current); clearTimeout(noticeTimer.current); };
  }, []);

  useEffect(() => {
    setOpening(true);
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      const timer = setTimeout(() => setOpening(false), 360);
      return () => clearTimeout(timer);
    }
    const surface = surfaceRef.current;
    if (!surface?.animate) { setOpening(false); return; }
    const animation = surface.animate(
      [
        { opacity: 0, transform: "translateY(34px) scale(0.96)" },
        { opacity: 1, offset: 0.7 },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
      { duration: 360, easing: "cubic-bezier(0.22, 1.32, 0.36, 1)" }
    );
    animation.onfinish = () => setOpening(false);
    const timer = setTimeout(() => setOpening(false), 380);
    return () => { clearTimeout(timer); animation.cancel(); };
  }, [showTick]);

  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { currentSkillRef.current = currentSkill; }, [currentSkill]);
  useEffect(() => { currentSlashCommandRef.current = currentSlashCommand; }, [currentSlashCommand]);
  useEffect(() => { viewRef.current = view; if (!["mail", "notion"].includes(view)) previousViewRef.current = view; }, [view]);
  useEffect(() => {
    const stopOpen = api.onOpenMail?.(() => openMail());
    const stopStatus = api.onMailStatus?.((next) => setMailStatus(next && typeof next.status === "string" ? next : { status: "error", message: "Gmail returned an invalid status." }));
    const stopNotionOpen = api.onOpenNotion?.(() => openNotion());
    const stopNotionStatus = api.onNotionStatus?.((next) => setNotionStatus(next && typeof next.status === "string" ? next : { status: "error", message: "Notion returned an invalid status." }));
    return () => { stopOpen?.(); stopStatus?.(); stopNotionOpen?.(); stopNotionStatus?.(); };
  }, []);
  useEffect(() => {
    const closeMenus = (event) => document.querySelectorAll("details[open]").forEach((details) => { if (!details.contains(event.target)) details.open = false; });
    const handleKeys = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === "Escape") {
        document.querySelectorAll("details[open]").forEach((details) => { details.open = false; });
        if (searchQuery) { setSearchQuery(""); searchRef.current?.blur(); }
      }
    };
    document.addEventListener("pointerdown", closeMenus);
    document.addEventListener("keydown", handleKeys);
    return () => { document.removeEventListener("pointerdown", closeMenus); document.removeEventListener("keydown", handleKeys); };
  }, [searchQuery]);

  async function createNote(folderId) {
    const inboxId = notebooks.find((notebook) => notebook.is_inbox)?.id || "inbox";
    const destination = folderId || (activeNotebookId === "all" ? inboxId : activeNotebookId);
    try {
      const note = await api.notes.create({ title: "", body: "", folderId: destination });
      setNotes((items) => [note, ...items]);
      setActiveNotebookId(destination);
      setCurrent(note);
      setView("notes");
      setSearchQuery("");
      setEditorMode("write");
      setCompressOpen(false);
      setSaveState("Saved");
      setTimeout(() => editorRef.current?.focus(), 0);
    } catch { setSaveState("Could not create note"); }
  }

  async function createSkill() {
    const skill = await api.skills.create({ name: "", category: "Unsorted", body: "" });
    setSkills((items) => [skill, ...items]);
    setCurrentSkill(skill);
    setSkillHome(false);
    setSaveState("Saved");
  }

  async function createSlashCommand() {
    try {
      const item = await api.slashCommands.create({ name: "", command: "", body: "" });
      setSlashCommands((items) => [item, ...items]);
      setCurrentSlashCommand(item);
      setSaveState("Saved");
    } catch { setSaveState("Could not create command"); }
  }

  async function runDailyAction(action) {
    setDailyStatus("Saving…");
    try {
      setDaily(await action());
      setDailyStatus("Saved");
      return true;
    } catch {
      try { setDaily(await api.daily.get()); } catch { /* Keep the last visible state. */ }
      setDailyStatus("Could not save daily plan");
      return false;
    }
  }

  function addDailyTask(text, bucket, completed, details = {}) {
    return runDailyAction(() => api.daily.create({ text, bucket, completed, ...details }));
  }

  function toggleDailyTask(id, completed) {
    return runDailyAction(() => api.daily.complete(id, completed));
  }

  function editDailyTaskLocal(id, text) {
    setDaily((value) => value ? {
      ...value,
      today: value.today.map((task) => task.id === id ? { ...task, text } : task),
      done: value.done.map((task) => task.id === id ? { ...task, text } : task),
      tomorrow: value.tomorrow.map((task) => task.id === id ? { ...task, text } : task),
    } : value);
  }

  function saveDailyTask(task) {
    return runDailyAction(() => api.daily.update(task.id, { text: task.text, priority: task.priority || 2, owner: task.owner || "me" }));
  }

  function updateDailyTask(id, patch) {
    return runDailyAction(() => api.daily.update(id, patch));
  }

  function removeDailyTask(id) {
    return runDailyAction(() => api.daily.remove(id));
  }

  async function saveNow(note) {
    clearTimeout(saveTimer.current);
    setSaveState("Saving…");
    try {
      const saved = await api.notes.update(note.id, { title: note.title, body: note.body, folderId: note.folder_id });
      setNotes((items) => items.map((item) => item.id === saved.id ? saved : item));
      setCurrent((item) => item?.id === saved.id ? saved : item);
      setSaveState("Saved");
    } catch { setSaveState("Save failed"); }
  }

  function save(note) {
    clearTimeout(saveTimer.current);
    setSaveState("Saving…");
    saveTimer.current = setTimeout(() => saveNow(note), 280);
  }

  function edit(patch) {
    if (!current) return;
    const next = { ...current, ...patch, updated_at: new Date().toISOString() };
    setCurrent(next);
    setNotes((items) => items.map((item) => item.id === next.id ? next : item));
    save(next);
  }

  async function saveSkillNow(skill) {
    clearTimeout(skillSaveTimer.current);
    setSaveState("Saving…");
    try {
      const saved = await api.skills.update(skill.id, { name: skill.name, category: skill.category?.trim() || "Unsorted", body: skill.body });
      setSkills((items) => items.map((item) => item.id === saved.id ? saved : item));
      setCurrentSkill((item) => item?.id === saved.id ? saved : item);
      setSaveState("Saved");
    } catch { setSaveState("Save failed"); }
  }

  function saveSkill(skill) {
    clearTimeout(skillSaveTimer.current);
    setSaveState("Saving…");
    skillSaveTimer.current = setTimeout(() => saveSkillNow(skill), 280);
  }

  function editSkill(patch) {
    if (!currentSkill) return;
    const next = { ...currentSkill, ...patch, updated_at: new Date().toISOString() };
    setCurrentSkill(next);
    setSkills((items) => items.map((item) => item.id === next.id ? next : item));
    saveSkill(next);
  }

  async function saveSlashCommandNow(item) {
    clearTimeout(slashCommandSaveTimer.current);
    setSaveState("Saving…");
    try {
      const saved = await api.slashCommands.update(item.id, { name: item.name, command: item.command, body: item.body });
      setSlashCommands((items) => items.map((entry) => entry.id === saved.id ? saved : entry));
      setCurrentSlashCommand((entry) => entry?.id === saved.id ? saved : entry);
      setSaveState("Saved");
    } catch { setSaveState("Save failed"); }
  }

  function saveSlashCommand(item) {
    clearTimeout(slashCommandSaveTimer.current);
    setSaveState("Saving…");
    slashCommandSaveTimer.current = setTimeout(() => saveSlashCommandNow(item), 280);
  }

  function editSlashCommand(patch) {
    if (!currentSlashCommand) return;
    const next = { ...currentSlashCommand, ...patch, updated_at: new Date().toISOString() };
    setCurrentSlashCommand(next);
    setSlashCommands((items) => items.map((item) => item.id === next.id ? next : item));
    saveSlashCommand(next);
  }

  async function remove(note) {
    if (!window.confirm(`Move “${noteName(note)}” to Trash?`)) return;
    await api.notes.trash(note.id);
    const remaining = notes.filter((item) => item.id !== note.id);
    setNotes(remaining);
    const next = remaining.find((item) => activeNotebookId === "all" || item.folder_id === activeNotebookId);
    setCurrent(next || null);
    if (!remaining.length) await createNote();
  }

  function openNotebook(id) {
    setActiveNotebookId(id);
    setCurrent(notes.find((note) => !note.deleted_at && (id === "all" || note.folder_id === id)) || null);
    setEditorMode("write");
    setCompressOpen(false);
  }

  async function submitNotebook(event) {
    event.preventDefault();
    const name = notebookEditor?.value?.trim();
    if (!name) return;
    try {
      if (notebookEditor.mode === "create") {
        const notebook = await api.folders.create(name);
        setNotebooks(await api.folders.list());
        setNotebookEditor(null);
        await createNote(notebook.id);
      } else {
        await api.folders.rename(notebookEditor.id, name);
        setNotebooks(await api.folders.list());
        setNotebookEditor(null);
      }
    } catch { setSaveState(`Could not ${notebookEditor.mode} notebook`); }
  }

  function renameNotebook() {
    const notebook = notebooks.find((item) => item.id === activeNotebookId);
    if (!notebook || notebook.is_inbox) return;
    setNotebookEditor({ mode: "rename", id: notebook.id, value: notebook.name });
  }

  async function deleteNotebook() {
    const notebook = notebooks.find((item) => item.id === activeNotebookId);
    if (!notebook || notebook.is_inbox) return;
    if (!window.confirm(`Delete notebook “${notebook.name}”? Its notes will move to Inbox.`)) return;
    try {
      await api.folders.remove(notebook.id);
      const [savedNotes, savedNotebooks] = await Promise.all([api.notes.list(), api.folders.list()]);
      const inboxId = savedNotebooks.find((item) => item.is_inbox)?.id || "inbox";
      setNotes(savedNotes); setNotebooks(savedNotebooks); setActiveNotebookId(inboxId);
      setCurrent(savedNotes.find((note) => !note.deleted_at && note.folder_id === inboxId) || null);
      setSaveState("Saved");
    } catch { setSaveState("Could not delete notebook"); }
  }

  async function moveCurrentTo(folderId) {
    if (!current || folderId === current.folder_id) return;
    const next = { ...current, folder_id: folderId, updated_at: new Date().toISOString() };
    setCurrent(next);
    setNotes((items) => items.map((item) => item.id === next.id ? next : item));
    setActiveNotebookId(folderId);
    await saveNow(next);
  }

  async function removeSkill(skill) {
    if (!window.confirm(`Delete “${skillName(skill)}”?`)) return;
    await api.skills.remove(skill.id);
    const remaining = skills.filter((item) => item.id !== skill.id);
    setSkills(remaining); setCurrentSkill(remaining[0] || null); if (!remaining.length) setSkillHome(true);
  }

  async function removeSlashCommand(item) {
    if (!window.confirm(`Delete “${slashCommandName(item)}”?`)) return;
    await api.slashCommands.remove(item.id);
    const remaining = slashCommands.filter((entry) => entry.id !== item.id);
    setSlashCommands(remaining); setCurrentSlashCommand(remaining[0] || null);
  }

  async function openRecovery() {
    setRecoveryOpen(true); setCompressOpen(false); setRecoveryMessage("");
    try {
      const [savedBackups, location] = await Promise.all([api.backups.list(), api.settings.dataLocation()]);
      setBackups(savedBackups); setDataLocation(location);
    } catch { setRecoveryMessage("Could not load recovery information."); }
  }

  async function makeBackup() {
    setRecoveryMessage("Creating backup…");
    try {
      const backup = await api.backups.create();
      setBackups((items) => [backup, ...items]); setRecoveryMessage("Backup created.");
    } catch { setRecoveryMessage("Could not create backup."); }
  }

  async function restoreBackup(backup) {
    if (!window.confirm(`Replace your current notes with the backup from ${fullTime(backup.createdAt)}? A safety backup will be made first.`)) return;
    setRecoveryMessage("Restoring…");
    try {
      // Desktop returns { notes, skills, slashCommands }; the browser mock returns a notes array.
      const restored = await api.backups.restore(backup.name);
      const restoredNotes = Array.isArray(restored) ? restored : restored.notes;
      const restoredSkills = Array.isArray(restored) ? null : restored.skills;
      const restoredSlashCommands = Array.isArray(restored) ? null : restored.slashCommands;
      const restoredNotebooks = await api.folders.list();
      const inboxId = restoredNotebooks.find((notebook) => notebook.is_inbox)?.id || "inbox";
      setNotebooks(restoredNotebooks); setActiveNotebookId(inboxId);
      setNotes(restoredNotes.filter((note) => !note.deleted_at)); setCurrent(restoredNotes.find((note) => !note.deleted_at && note.folder_id === inboxId) || restoredNotes.find((note) => !note.deleted_at) || null);
      if (restoredSkills) { setSkills(restoredSkills); setCurrentSkill(restoredSkills[0] || null); }
      if (restoredSlashCommands) { setSlashCommands(restoredSlashCommands); setCurrentSlashCommand(restoredSlashCommands[0] || null); }
      await loadDaily();
      setRecoveryMessage("Backup restored.");
    } catch { setRecoveryMessage("Could not restore that backup."); }
  }

  async function exportNotes(format) {
    try { const result = await api.settings.export(format); setRecoveryMessage(result?.canceled ? "Export cancelled." : "Export saved."); }
    catch { setRecoveryMessage("Could not export notes."); }
  }

  async function copyCurrent() {
    if (!current) return;
    const text = markdownFor(current);
    if (!text) return setSaveState("Nothing to copy");
    try { await api.clipboard.writeText(text); showSaveNotice("Copied"); }
    catch { setSaveState("Copy failed"); }
  }

  async function copySkill() {
    if (!currentSkill) return;
    const text = [currentSkill.name?.trim(), currentSkill.body?.trim()].filter(Boolean).join("\n\n");
    if (!text) return setSaveState("Nothing to copy");
    try { await api.clipboard.writeText(text); showSaveNotice("Copied"); }
    catch { setSaveState("Copy failed"); }
  }

  async function copySlashCommand() {
    if (!currentSlashCommand) return;
    const text = [currentSlashCommand.command?.trim(), currentSlashCommand.body?.trim()].filter(Boolean).join("\n\n");
    if (!text) return setSaveState("Nothing to copy");
    try { await api.clipboard.writeText(text); showSaveNotice("Copied"); }
    catch { setSaveState("Copy failed"); }
  }

  function showSaveNotice(message, duration = 1100) {
    clearTimeout(noticeTimer.current);
    setSaveState(message);
    noticeTimer.current = setTimeout(() => setSaveState("Saved"), duration);
  }

  function dragCurrent(event) {
    if (!current) return;
    if (!(current.body?.trim() || current.title?.trim())) return setSaveState("Nothing to drag");
    try {
      if (typeof api.notes.dragCleanName === "function") {
        event.preventDefault();
        api.notes.dragCleanName({ id: current.id, title: current.title, body: current.body });
        setSaveState("Dragging clean filename");
      } else {
        const drag = addBrowserFileDragData(event, current);
        if (!drag) return setSaveState("Drag not supported");
        setSaveState(`Dragging ${drag.fileName}`);
      }
    }
    catch { setSaveState("Drag failed"); }
  }

  async function copyDragName() {
    if (!current || !(current.body?.trim() || current.title?.trim())) return setSaveState("Nothing to share");
    try {
      const filePath = await api.notes.dragFile({ id: current.id, title: current.title, body: current.body });
      const fileName = filePath.split(/[\\/]/).pop();
      await api.clipboard.writeText(fileName);
      showSaveNotice("Filename copied", 1400);
    } catch { setSaveState("Could not create .md"); }
  }

  async function copyDragPath() {
    if (!current || !(current.body?.trim() || current.title?.trim())) return setSaveState("Nothing to share");
    try {
      const filePath = await api.notes.dragFile({ id: current.id, title: current.title, body: current.body });
      await api.clipboard.writeText(`"${filePath}"`);
      showSaveNotice("Path copied", 1400);
    } catch { setSaveState("Could not create .md"); }
  }

  function addTodo() {
    if (!current) return;
    const body = current.body || "";
    const editor = editorRef.current;
    const start = editorMode === "write" && editor ? editor.selectionStart : body.length;
    const end = editorMode === "write" && editor ? editor.selectionEnd : body.length;
    const selected = body.slice(start, end);
    let insertion;
    if (selected) insertion = selected.split("\n").map((line) => /^\s*[-*]\s+\[[ xX]]/.test(line) ? line : `- [ ] ${line}`).join("\n");
    else insertion = `${start > 0 && body[start - 1] !== "\n" ? "\n" : ""}- [ ] `;
    const nextBody = `${body.slice(0, start)}${insertion}${body.slice(end)}`;
    const caret = start + insertion.length;
    setEditorMode("write");
    edit({ body: nextBody });
    requestAnimationFrame(() => { editorRef.current?.focus(); editorRef.current?.setSelectionRange(caret, caret); });
  }

  function toggleTodo(lineIndex, checked) {
    if (!current) return;
    const lines = (current.body || "").split("\n");
    lines[lineIndex] = lines[lineIndex].replace(/^(\s*[-*]\s+\[)[ xX](])/, `$1${checked ? "x" : " "}$2`);
    edit({ body: lines.join("\n") });
  }

  function flushOpenEditors() {
    if (currentRef.current) saveNow(currentRef.current);
    if (currentSkillRef.current) saveSkillNow(currentSkillRef.current);
    if (currentSlashCommandRef.current) saveSlashCommandNow(currentSlashCommandRef.current);
  }

  async function openMail() {
    flushOpenEditors();
    if (!["mail", "notion"].includes(viewRef.current)) previousViewRef.current = viewRef.current;
    setCompressOpen(false);
    setRecoveryOpen(false);
    setSearchQuery("");
    setMailStatus({ status: "loading", message: "" });
    setView("mail");
    try {
      const next = await api.mail.show();
      if (next?.status) setMailStatus(next);
    } catch {
      setMailStatus({ status: "error", message: "Gmail could not open." });
    }
  }

  async function openNotion() {
    flushOpenEditors();
    if (!["mail", "notion"].includes(viewRef.current)) previousViewRef.current = viewRef.current;
    setCompressOpen(false);
    setRecoveryOpen(false);
    setSearchQuery("");
    setNotionStatus({ status: "loading", message: "" });
    setView("notion");
    try {
      const next = await api.notion.show();
      if (next?.status) setNotionStatus(next);
    } catch {
      setNotionStatus({ status: "error", message: "Notion could not open." });
    }
  }

  function selectNotebookView(nextView) {
    setView(nextView);
    const routes = { daily: "today", notes: "notes", projects: "projects", bots: "bots", "mcp-servers": "mcp-servers", skills: "skills", "slash-commands": "commands" };
    const route = routes[nextView];
    if (route) {
      const existingDetail = location.hash.startsWith(`#/${route}/`);
      if (!existingDetail) location.hash = `/${route}`;
    }
    setSearchQuery("");
    setCompressOpen(false);
    if (nextView === "daily") loadDaily();
  }

  function openSearchNote(note) {
    setCurrent(note);
    setActiveNotebookId(note.folder_id);
    selectNotebookView("notes");
  }

  function openSearchSkill(skill) {
    setCurrentSkill(skill);
    setSkillCategory("All");
    setSkillHome(false);
    selectNotebookView("skills");
  }

  function openSearchCommand(item) {
    setCurrentSlashCommand(item);
    selectNotebookView("slash-commands");
  }

  function openBot(id) {
    setCurrentBotId(id || null);
    setView("bots"); setSearchQuery(""); setCompressOpen(false);
    location.hash = id ? `/bots/${id}` : "/bots";
  }

  function openMcp(serverOrId) {
    const id = typeof serverOrId === "string" ? serverOrId : serverOrId?.id;
    setCurrentMcpId(id || null);
    setView("mcp-servers"); setSearchQuery(""); setCompressOpen(false);
    location.hash = id ? `/mcp-servers/${id}` : "/mcp-servers";
  }

  async function closeMail() {
    await api.mail.hide().catch(() => {});
    setView(previousViewRef.current);
  }

  async function reloadMail() {
    setMailStatus({ status: "loading", message: "" });
    try { await api.mail.reload(); }
    catch { setMailStatus({ status: "error", message: "Gmail could not reload." }); }
  }

  async function closeNotion() {
    await api.notion.hide().catch(() => {});
    setView(previousViewRef.current);
  }

  async function reloadNotion() {
    setNotionStatus({ status: "loading", message: "" });
    try { await api.notion.reload(); }
    catch { setNotionStatus({ status: "error", message: "Notion could not reload." }); }
  }

  const visible = notes.filter((note) => !note.deleted_at && (activeNotebookId === "all" || note.folder_id === activeNotebookId));
  const activeNotebook = notebooks.find((notebook) => notebook.id === activeNotebookId);
  const tasks = todoItems(current?.body);
  const skillEditorCategories = [...new Set(skills.map((skill) => skill.category?.trim() || "Unsorted"))].sort((left, right) => left.localeCompare(right));
  const customSkillCategories = skillEditorCategories.filter((category) => !/^\d+\s*·/.test(category) && !/^99\s*·/.test(category));
  const categories = ["Active", "Archived", "All", ...customSkillCategories];
  const visibleSkills = skills.filter((skill) => skillCategory === "All" || (skillCategory === "Active" && !isArchivedSkill(skill)) || (skillCategory === "Archived" && isArchivedSkill(skill)) || (skill.category?.trim() || "Unsorted") === skillCategory).sort(sortSkillsByStack);
  const visibleSlashCommands = slashCommands;
  if (view === "mail") return <div className={`window-surface ${closing ? "is-closing" : ""}${opening ? " is-opening" : ""}`} ref={surfaceRef}><EmbeddedAppScreen appName="Gmail" status={mailStatus} preview={!window.hushnote} Preview={MailPreview} errorHint="Check your connection. Google may also block sign-in inside embedded apps." onBack={closeMail} onReload={reloadMail} onExternal={() => api.mail.openExternal()} onHide={() => api.window.hide()} /></div>;
  if (view === "notion") return <div className={`window-surface ${closing ? "is-closing" : ""}${opening ? " is-opening" : ""}`} ref={surfaceRef}><EmbeddedAppScreen appName="Notion" status={notionStatus} preview={!window.hushnote} Preview={NotionPreview} errorHint="Check your connection, then try the external browser if sign-in is blocked." onBack={closeNotion} onReload={reloadNotion} onExternal={() => api.notion.openExternal()} onHide={() => api.window.hide()} /></div>;
  return <div className={`window-surface ${closing ? "is-closing" : ""}${opening ? " is-opening" : ""}`} ref={surfaceRef}><main className="notebook">
    <aside className="note-list" aria-label={view === "notes" ? "Notes" : view === "daily" ? "Today" : view === "skills" ? "Skills" : view === "projects" ? "Projects" : view === "bots" ? "Bots" : view === "mcp-servers" ? "MCP Servers" : "Slash commands"}>
      <div className="list-top"><div className="wordmark"><span><BookOpenCheck size={15} strokeWidth={2} /></span><strong>Notebook</strong></div><div><button className="utility" onClick={openRecovery} aria-label="Backups and settings" title="Backups and settings">···</button>{["notes", "skills", "slash-commands"].includes(view) && <button className="new-note" onClick={view === "notes" ? () => createNote() : view === "skills" ? createSkill : createSlashCommand} aria-label={view === "notes" ? "New note" : view === "skills" ? "New skill" : "New slash command"}>+</button>}</div></div>
      <nav className="page-nav" aria-label="Notebook pages">
        <button aria-label="Today" className={view === "daily" ? "active" : ""} onClick={() => selectNotebookView("daily")}><span className="nav-mark today"><CalendarCheck2 /></span><strong>Today</strong><small>{daily?.today.length || 0}</small></button>
        <button aria-label="Notes" className={view === "notes" ? "active" : ""} onClick={() => selectNotebookView("notes")}><span className="nav-mark note"><NotebookPen /></span><strong>Notes</strong><small>{notes.filter((note) => !note.deleted_at).length}</small></button>
        <button aria-label="Projects" className={view === "projects" ? "active" : ""} onClick={() => selectNotebookView("projects")}><span className="nav-mark project"><FolderGit2 /></span><strong>Projects</strong><small>›</small></button>
        <button aria-label="Mail" onClick={openMail}><span className="nav-mark mail"><BrandIcon icon={siGmail} /></span><strong>Mail</strong><small>↗</small></button>
        <button aria-label="Notion" onClick={openNotion}><span className="nav-mark notion"><BrandIcon icon={siNotion} /></span><strong>Notion</strong><small>↗</small></button>
        <span className="nav-label">Automation</span>
        <button aria-label="Bots" className={view === "bots" ? "active" : ""} onClick={() => openBot(null)}><span className="nav-mark bot"><Bot /></span><strong>Bots</strong><small>{bots.filter((bot) => !bot.archivedAt).length}</small></button>
        <button aria-label="MCP Servers" className={view === "mcp-servers" ? "active" : ""} onClick={() => openMcp(null)}><span className="nav-mark mcp"><ServerCog /></span><strong>MCP Servers</strong><small>{mcpServers.length}</small></button>
        <button aria-label="Skills" className={view === "skills" ? "active" : ""} onClick={() => { setSkillHome(true); selectNotebookView("skills"); }}><span className="nav-mark skill"><Layers3 /></span><strong>Skills</strong><small>{skills.length}</small></button>
        <span className="nav-label">Library</span>
        <button aria-label="Slash commands" className={view === "slash-commands" ? "active" : ""} onClick={() => selectNotebookView("slash-commands")}><span className="nav-mark command"><SquareTerminal /></span><strong>Commands</strong><small>{slashCommands.length}</small></button>
      </nav>
      <label className="search global-search"><span>⌕</span><input ref={searchRef} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search everything" aria-label="Search everything" /><kbd>Ctrl K</kbd></label>
      {searchQuery.trim() ? <UniversalSearchResults query={searchQuery} notes={notes} skills={skills} slashCommands={slashCommands} bots={bots} mcpServers={mcpServers} daily={daily} onOpenNote={openSearchNote} onOpenSkill={openSearchSkill} onOpenCommand={openSearchCommand} onOpenBot={(bot) => openBot(bot.id)} onOpenMcp={openMcp} onOpenTask={() => selectNotebookView("daily")} /> : view === "notes" ? <>
        <div className="notebook-picker">
          <select value={activeNotebookId} onChange={(event) => openNotebook(event.target.value)} aria-label="Current notebook">
            <option value="all">All notes</option>
            {notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.name} ({notes.filter((note) => !note.deleted_at && note.folder_id === notebook.id).length})</option>)}
          </select>
          <button onClick={() => setNotebookEditor({ mode: "create", value: "" })} aria-label="New notebook" title="New notebook">+</button>
          {activeNotebook && !activeNotebook.is_inbox && <details className="action-menu notebook-actions"><summary role="button" aria-label="Notebook actions" title="Notebook actions">···</summary><div className="menu-popover"><button onClick={(event) => { event.currentTarget.closest("details").open = false; renameNotebook(); }}>Rename</button><button className="danger" onClick={(event) => { event.currentTarget.closest("details").open = false; deleteNotebook(); }}>Delete</button></div></details>}
        </div>
        {notebookEditor && <form className="notebook-editor" onSubmit={submitNotebook}><input autoFocus value={notebookEditor.value} onChange={(event) => setNotebookEditor({ ...notebookEditor, value: event.target.value })} placeholder="Notebook name" aria-label="Notebook name" /><button type="submit">{notebookEditor.mode === "create" ? "Create" : "Save"}</button><button type="button" onClick={() => setNotebookEditor(null)} aria-label="Cancel notebook edit">×</button></form>}
        <div className="notes" aria-live="polite">
          {visible.map((note) => <div className={`note-row ${current?.id === note.id ? "selected" : ""}`} key={note.id}>
            <button className="note-open" onClick={() => { setCurrent(note); setCompressOpen(false); }}><strong>{noteName(note)}</strong><span>{preview(note)}</span><small>{shortTime(note.updated_at)}</small></button>
            <button className="note-delete" aria-label={`Delete ${noteName(note)}`} onClick={() => remove(note)}>×</button>
          </div>)}
          {!visible.length && <p className="empty-list">No notes here.<br />Use + to create one.</p>}
        </div>
      </> : view === "daily" ? <DailySidebar daily={daily} status={dailyStatus} /> : view === "projects" ? <div className="projects-sidebar"><strong>Project workspace</strong><span>Repositories, next actions, tasks, changes, instructions, skills, and commands.</span></div> : view === "bots" ? <BotSidebar bots={bots} currentId={currentBotId} onSelect={openBot} /> : view === "mcp-servers" ? <McpSidebar servers={mcpServers} currentId={currentMcpId} onSelect={openMcp} /> : view === "skills" ? <>
        <button type="button" className={`skill-stack-nav ${skillHome ? "active" : ""}`} onClick={() => setSkillHome(true)}><LayoutDashboard size={14} /><span><strong>Skill Stack</strong><small>{skills.filter((skill) => !isArchivedSkill(skill)).length} active · {skills.filter(isArchivedSkill).length} archived</small></span></button>
        <CategoryFilters categories={categories} active={skillCategory} onSelect={setSkillCategory} />
        <SkillList items={visibleSkills} currentId={skillHome ? null : currentSkill?.id} onSelect={(skill) => { setCurrentSkill(skill); setSkillHome(false); }} onRemove={removeSkill} grouped={["All", "Active", "Archived"].includes(skillCategory)} />
      </> : <>
        <SlashCommandList items={visibleSlashCommands} currentId={currentSlashCommand?.id} onSelect={setCurrentSlashCommand} onRemove={removeSlashCommand} />
      </>}
    </aside>
    {view === "notes" ? <section className="editor">
      <header className="editor-bar">
        <div className="editor-context"><span className={`save-state ${saveState === "Save failed" ? "failed" : ""}`}>{saveState}</span>{current && <span className="notebook-name">{notebooks.find((notebook) => notebook.id === current.folder_id)?.name}</span>}</div>
        <div className="editor-actions">
          <button type="button" className={`drag-action ${current && (current.body?.trim() || current.title?.trim()) ? "" : "is-disabled"}`} draggable={Boolean(current && (current.body?.trim() || current.title?.trim()))} disabled={Boolean(!current || !(current.body?.trim() || current.title?.trim()))} aria-disabled={Boolean(!current || !(current.body?.trim() || current.title?.trim()))} onDragStart={dragCurrent} onDragEnd={() => showSaveNotice("Drag finished", 900)} onClick={copyDragName} title={current && (current.body?.trim() || current.title?.trim()) ? "Drag a clean Markdown filename, or click to copy it" : "Write something before dragging a Markdown file"}>⠿ Drag .md</button>
          <details className="action-menu"><summary role="button" aria-label="More note actions" title="More note actions">···</summary><div className="menu-popover editor-menu"><button onClick={(event) => { event.currentTarget.closest("details").open = false; copyCurrent(); }}>Copy Markdown</button><button onClick={(event) => { event.currentTarget.closest("details").open = false; copyDragPath(); }}>Copy .md path</button><button onClick={(event) => { event.currentTarget.closest("details").open = false; setCompressOpen((value) => !value); }}>Compress</button>{current && <label><span>Move to</span><select value={current.folder_id} onChange={(event) => { event.currentTarget.closest("details").open = false; moveCurrentTo(event.target.value); }} aria-label="Move note to notebook">{notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.name}</option>)}</select></label>}</div></details>
          <button className="hide" onClick={() => api.window.hide()} aria-label="Hide notebook">×</button>
        </div>
      </header>
      {current ? <div className="note-canvas" key={current.id}>
        <input className="title" value={current.title || ""} onChange={(event) => edit({ title: event.target.value })} placeholder="Untitled" aria-label="Note title" autoFocus />
        <div className="note-tools"><button onClick={addTodo}>+ To-do</button><button className={editorMode === "checklist" ? "active" : ""} onClick={() => setEditorMode((mode) => mode === "write" ? "checklist" : "write")}>{editorMode === "write" ? `Checklist${tasks.length ? ` ${tasks.filter((task) => task.checked).length}/${tasks.length}` : ""}` : "Back to note"}</button></div>
        {editorMode === "write" ? <textarea ref={editorRef} className="writing" value={current.body || ""} onChange={(event) => edit({ body: event.target.value })} onBlur={() => saveNow(current)} placeholder="Write Markdown. It saves automatically." aria-label="Note content" /> : <div className="checklist" aria-label="To-do checklist">
          {tasks.map((task) => <label className={task.checked ? "done" : ""} key={task.lineIndex}><input type="checkbox" checked={task.checked} onChange={(event) => toggleTodo(task.lineIndex, event.target.checked)} /><span>{task.text}</span></label>)}
          {!tasks.length && <div className="checklist-empty"><strong>No to-dos yet</strong><span>Add one and it will be stored as <code>- [ ]</code> in this Markdown note.</span><button className="plain-button" onClick={addTodo}>Add to-do</button></div>}
        </div>}
      </div> : <div className="empty-editor"><strong>{activeNotebook?.name || "This notebook"} is empty</strong><span>Create a Markdown note to get started.</span><button className="plain-button" onClick={() => createNote()}>New note</button></div>}
    </section> : view === "daily" ? <DailyPlanner daily={daily} status={dailyStatus} onAdd={addDailyTask} onToggle={toggleDailyTask} onLocalEdit={editDailyTaskLocal} onSave={saveDailyTask} onUpdate={updateDailyTask} onRemove={removeDailyTask} onHide={() => api.window.hide()} onRetry={loadDaily} /> : view === "projects" ? <ProjectsPage api={api.projects} skills={skills} commands={slashCommands} onHide={() => api.window.hide()} /> : view === "bots" ? <BotsWorkspace api={api} bots={bots} mcpServers={mcpServers} skills={skills} notes={notes} currentId={currentBotId} onCurrent={openBot} onBotsChange={reloadBots} onNotesChange={reloadNotes} onOpenNote={openSearchNote} onOpenSkill={openSearchSkill} onOpenMcp={openMcp} onHide={() => api.window.hide()} /> : view === "mcp-servers" ? <McpServersWorkspace api={api} servers={mcpServers} bots={bots} currentId={currentMcpId} onCurrent={openMcp} onServersChange={reloadMcpServers} onOpenBot={openBot} onHide={() => api.window.hide()} /> : view === "skills" ? skillHome ? <SkillStackHome skills={skills} onOpen={(skill) => { setCurrentSkill(skill); setSkillHome(false); }} onHide={() => api.window.hide()} /> : <SkillsEditor skill={currentSkill} categories={skillEditorCategories} saveState={saveState} onEdit={editSkill} onSave={saveSkillNow} onCopy={copySkill} onRemove={removeSkill} onHide={() => api.window.hide()} relatedBots={bots.filter((bot) => bot.skillIds?.includes(currentSkill?.id))} onOpenBot={openBot} /> : <SlashCommandEditor item={currentSlashCommand} saveState={saveState} onEdit={editSlashCommand} onSave={saveSlashCommandNow} onCopy={copySlashCommand} onRemove={removeSlashCommand} onHide={() => api.window.hide()} />}
    {view === "notes" && compressOpen && <Compressor note={current} onClose={() => setCompressOpen(false)} />}
    {recoveryOpen && <Recovery backups={backups} message={recoveryMessage} dataLocation={dataLocation} appVersion={appVersion} onClose={() => setRecoveryOpen(false)} onBackup={makeBackup} onRestore={restoreBackup} onExport={exportNotes} />}
  </main></div>;
}

function EmbeddedAppScreen({ appName, status, preview, Preview, errorHint, onBack, onReload, onExternal, onHide }) {
  const loading = status.status === "loading" || status.status === "idle";
  const failed = status.status === "error";
  return <main className="mail-screen">
    <header className="mail-toolbar">
      <button className="mail-back" onClick={onBack} aria-label="Back to Notebook">← <span>Notebook</span></button>
      <span className={`mail-state ${failed ? "failed" : ""}`}>{loading ? `Loading ${appName}…` : failed ? `${appName} unavailable` : appName}</span>
      <div className="mail-toolbar-actions"><button onClick={onReload} aria-label={`Reload ${appName}`}>Reload</button><button onClick={onExternal} aria-label={`Open ${appName} externally`}>Open external</button><button className="hide" onClick={onHide} aria-label="Hide notebook">×</button></div>
    </header>
    {failed ? <section className="mail-error"><strong>{appName} couldn’t load</strong><span>{status.message || errorHint}</span><div><button className="plain-button" onClick={onReload}>Try again</button><button className="text-action" onClick={onExternal}>Open {appName} externally</button></div></section> : preview && !loading ? <Preview /> : <section className="mail-underlay" aria-live="polite"><span>{loading ? `Connecting to ${appName}…` : `${appName} is open.`}</span></section>}
  </main>;
}

function MailPreview() {
  return <section className="mail-preview" aria-label="Gmail preview">
    <div className="mail-preview-top"><strong>Gmail</strong><label><span>⌕</span><input readOnly placeholder="Search mail" aria-label="Search mail preview" /></label><span className="mail-avatar">K</span></div>
    <div className="mail-preview-body">
      <aside><button>＋ Compose</button><strong>Inbox <span>3</span></strong><span>Starred</span><span>Sent</span><span>Drafts</span></aside>
      <div className="mail-inbox"><header><span>☐</span><span>↻</span><small>1–3 of 3</small></header>{[
        ["Project Team", "Launch notes are ready", "The final review is complete and everything is ready to share.", "10:42 AM"],
        ["Google Calendar", "Reminder: Weekly planning", "Your event starts in 30 minutes.", "9:30 AM"],
        ["Design Updates", "New feedback on Notebook", "Two comments were added to the latest mockup.", "Yesterday"],
      ].map(([sender, subject, excerpt, time]) => <article key={subject}><strong>{sender}</strong><div><b>{subject}</b><span> — {excerpt}</span></div><small>{time}</small></article>)}</div>
    </div>
  </section>;
}

function NotionPreview() {
  return <section className="notion-preview" aria-label="Notion preview">
    <aside>
      <header><span>K</span><strong>Kai’s Notion</strong><small>⌄</small></header>
      <button className="active"><span>⌂</span> Home</button>
      <button><span>⌕</span> Search</button>
      <button><span>◫</span> Inbox</button>
      <p>Private</p>
      <button><span>▤</span> Project HQ</button>
      <button><span>✓</span> Tasks</button>
      <button><span>＋</span> New page</button>
    </aside>
    <div className="notion-page">
      <header><span>Project HQ</span><div><button>Share</button><button>☆</button><button>···</button></div></header>
      <article>
        <div className="notion-page-icon">◎</div>
        <h1>Project HQ</h1>
        <p>One place for active work, notes, and decisions.</p>
        <section className="notion-callout"><span>→</span><div><strong>This week</strong><p>Review launch notes and clear the final blockers.</p></div></section>
        <h2>Active work</h2>
        <div className="notion-table"><header><span>Name</span><span>Status</span></header><div><strong>Notebook launch</strong><span>In progress</span></div><div><strong>Website refresh</strong><span>Planning</span></div><div><strong>Customer notes</strong><span>Ready</span></div></div>
      </article>
    </div>
  </section>;
}

function SkillsEditor({ skill, categories, saveState, onEdit, onSave, onCopy, onRemove, onHide, relatedBots = [], onOpenBot }) {
  if (!skill) return <section className="editor skill-empty"><strong>No skill selected</strong><span>Create one with + to save a prompt, workflow, or command.</span></section>;
  return <section className="editor">
    <header className="editor-bar">
      <span className={`save-state ${saveState === "Save failed" ? "failed" : ""}`}>{saveState}</span>
      <div><button className="text-action" onClick={onCopy}>Copy</button><button className="text-action danger" onClick={() => onRemove(skill)}>Delete</button><button className="hide" onClick={onHide} aria-label="Hide notebook">×</button></div>
    </header>
    <input className="title" value={skill.name || ""} onChange={(event) => onEdit({ name: event.target.value })} placeholder="Skill name" aria-label="Skill name" autoFocus />
    <label className="skill-category"><span>Category</span><input value={skill.category || ""} onChange={(event) => onEdit({ category: event.target.value })} onBlur={() => onSave(skill)} list="skill-categories" placeholder="Unsorted" aria-label="Skill category" /><datalist id="skill-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist></label>
    <div className="slash-notes-heading"><span>Instructions</span><small>Markdown supported</small></div>
    <textarea className="writing skill-writing" value={skill.body || ""} onChange={(event) => onEdit({ body: event.target.value })} onBlur={() => onSave(skill)} placeholder="Paste the prompt, workflow, command, or instructions here." aria-label="Skill notes" />
    <div className="skill-related-bots"><strong>Used by bots</strong>{relatedBots.map((bot) => <button key={bot.id} onClick={() => onOpenBot(bot.id)}>{bot.name}</button>)}{!relatedBots.length && <span>No linked bots</span>}</div>
  </section>;
}

function SlashCommandEditor({ item, saveState, onEdit, onSave, onCopy, onRemove, onHide }) {
  if (!item) return <section className="editor skill-empty"><strong>No slash command selected</strong><span>Create one with + to save its invocation and instructions.</span></section>;
  return <section className="editor slash-editor">
    <header className="editor-bar">
      <span className={`save-state ${saveState === "Save failed" ? "failed" : ""}`}>{saveState}</span>
      <div><button className="text-action" onClick={onCopy}>Copy</button><button className="text-action danger" onClick={() => onRemove(item)}>Delete</button><button className="hide" onClick={onHide} aria-label="Hide notebook">×</button></div>
    </header>
    <input className="title" value={item.name || ""} onChange={(event) => onEdit({ name: event.target.value })} placeholder="Slash item name" aria-label="Slash command name" autoFocus />
    <div className="slash-fields"><label className="slash-field"><span>Invocation <small>optional for reference pages</small></span><input value={item.command || ""} onChange={(event) => onEdit({ command: event.target.value })} onBlur={() => onSave(item)} placeholder="/prompts:name" aria-label="Slash command invocation" spellCheck="false" /></label></div>
    <div className="slash-notes-heading"><span>Notes</span><small>Markdown supported</small></div>
    <textarea className="writing slash-writing" value={item.body || ""} onChange={(event) => onEdit({ body: event.target.value })} onBlur={() => onSave(item)} placeholder="Explain what it does, where it lives, and how to use it." aria-label="Slash command notes" />
  </section>;
}

function Recovery({ backups, message, dataLocation, appVersion, onClose, onBackup, onRestore, onExport }) {
  return <aside className="recovery" aria-label="Backups and settings">
    <header><div><strong>Backups</strong><span>Stored only on this computer</span></div><button className="hide" onClick={onClose} aria-label="Close backups">×</button></header>
    <p className="recovery-copy">Notebook makes one rotating backup per day and keeps the latest 21.</p>
    <div className="recovery-actions"><button className="plain-button" onClick={onBackup}>Back up now</button><button className="text-action" onClick={() => onExport("json")}>Export JSON</button><button className="text-action" onClick={() => onExport("markdown")}>Export Markdown</button></div>
    {message && <p className="message">{message}</p>}
    <div className="backup-list">
      {backups.map((backup) => <div className="backup-row" key={backup.name}><div><strong>{fullTime(backup.createdAt)}</strong><span>{bytes(backup.size)}</span></div><button className="text-action" onClick={() => onRestore(backup)}>Restore</button></div>)}
      {!backups.length && <p className="empty-list">No backups yet.</p>}
    </div>
    {dataLocation && <p className="data-location" title={dataLocation}>Data: {dataLocation}</p>}
    {appVersion && <p className="data-location">Notebook v{appVersion} · local only</p>}
  </aside>;
}

function Compressor({ note, onClose }) {
  const [status, setStatus] = useState("checking");
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  useEffect(() => { api.compressor.status().then((ready) => setStatus(ready ? "ready" : "offline")).catch(() => { setStatus("offline"); setMessage("Could not check the local compressor."); }); }, []);
  async function start() {
    setStatus("starting"); setMessage("");
    try { const answer = await api.compressor.start(); setStatus(answer.ready ? "ready" : "offline"); setMessage(answer.error || ""); }
    catch { setStatus("offline"); setMessage("Could not start the local compressor."); }
  }
  async function compress() {
    const source = note?.body?.trim();
    if (!source) return setMessage("Write or paste something first.");
    if (status !== "ready") return setMessage("Start the local compressor first.");
    setStatus("working"); setMessage("");
    try {
      const output = await api.compressor.compress(source, 0.6);
      if (!output || typeof output.compressed_prompt !== "string" || !output.compressed_prompt.trim()) throw new Error("The local compressor returned no text.");
      setResult(output); setStatus("ready");
      try { await api.compressions.create({ noteId: note.id, sourceText: source, compressedText: output.compressed_prompt, preset: "Balanced", rate: 0.6, originTokens: output.origin_tokens, compressedTokens: output.compressed_tokens, ratio: output.ratio }); }
      catch { setMessage("Compressed successfully, but its local history could not be saved."); }
    } catch (error) { setStatus("ready"); setMessage(error.message || "Compression failed."); }
  }
  return <aside className="compressor" aria-label="Local compressor">
    <header><div><strong>Local compressor</strong><span>{status === "ready" ? "Ready" : status === "working" ? "Compressing…" : status === "checking" ? "Checking…" : "Offline"}</span></div><button className="hide" onClick={onClose} aria-label="Close compressor">×</button></header>
    <p>Compresses the open note locally. Your original stays as-is.</p>
    {message && <p className="message">{message}</p>}
    {status === "offline" ? <button className="plain-button" onClick={start}>Start compressor</button> : <button className="plain-button" onClick={compress} disabled={status === "working" || status === "starting"}>Compress note</button>}
    {result && <><div className="result-meta">{result.origin_tokens} → {result.compressed_tokens} tokens · {result.ratio}</div><textarea className="result" value={result.compressed_prompt} readOnly aria-label="Compressed note" /><button className="copy" onClick={async () => { try { await api.clipboard.writeText(result.compressed_prompt); } catch { setMessage("Could not copy. Select the text and copy it normally."); } }}>Copy</button></>}
  </aside>;
}

createRoot(document.getElementById("root")).render(<ErrorBoundary><App /></ErrorBoundary>);
