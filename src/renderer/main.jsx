/*
 * Derived from FastNote's note-area / sidebar interaction model.
 * FastNote © 2024, MIT License. See THIRD_PARTY_NOTICES.md.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, ArrowRight, Bold, Bot, CalendarCheck2, Check, ChevronLeft, ChevronRight, Cloud, Code, Copy, Ellipsis, ExternalLink, Eye, FileText, FolderGit2, GripVertical, Heading1, Heading2, Heading3, Italic, Keyboard, Layers3, Link2, List, ListOrdered, ListTodo, Monitor, Moon, Pencil, Pin, Plus, Quote, RefreshCw, RotateCcw, Search, ServerCog, Settings, Shrink, SquareTerminal, Strikethrough, Sun, Trash2, X } from "lucide-react";
import { siGmail, siNotion, siX } from "simple-icons";
import notebookIconUrl from "../../build/notebook.ico";
import { addBrowserFileDragData } from "./drag-file.mjs";
import { cleanSkillCategory, displaySkillName } from "./skill-stack.js";
import { Markdown } from "./markdown.jsx";
import { markdownToHtml, markdownToText } from "./markdown-html.js";
import { applyMarkdownFormat } from "./format.js";
import { BotsWorkspace, BotSidebar, McpServersWorkspace, McpSidebar } from "./bots.jsx";
import { ProjectsPage } from "./ProjectsPage.jsx";
import { SkillsWorkspace } from "./skills.jsx";
import "./styles.css";
import "./workspaces.css";
import "./skills.css";

const mockNotes = [];
// The browser preview ships a small stand-in library so the Skills page can be seen without Electron.
const mockSkillShelves = [
  ["01 · Core Workflow", [
    ["grill-with-docs", "Pressure-test an idea against the repository and build shared vocabulary before planning."],
    ["to-spec", "Turn an agreed conversation into a concrete build specification."],
    ["implement", "Execute a specification, typecheck often, then run the full suite."],
    ["diagnosing-bugs", "Create one reliable red feedback loop, find the cause, then lock the fix with a test."],
    ["code-review", "Review a diff against repository standards and the originating specification."],
  ]],
  ["02 · Engineering Judgment", [
    ["ponytail", "Cut speculative abstractions and write the least code that solves today's problem."],
    ["codebase-design", "Design deep modules: substantial behaviour behind small interfaces."],
    ["prototype", "Write the smallest throwaway program that answers one design question."],
  ]],
  ["03 · UI & Design", [
    ["hallmark", "Apply opinionated rules that make an interface feel deliberately designed."],
    ["ui-ux-pro-max", "Search styles, palettes, font pairings, and motion guidance."],
  ]],
  ["05 · Writing & Context", [
    ["handoff", "Save a portable, redacted context summary so another session can continue."],
    ["writing-for-agents", "Write reliable skills and agent-facing reference documents."],
  ]],
  ["99 · Archive · Personas & Meta", [
    ["caveman", "Redundant: the global rules already require extreme concision."],
    ["grilling", "Superseded by grill-with-docs, which keeps a paper trail."],
  ]],
  ["99 · Archive · UI & Design", [
    ["shadcn", "Reactivate when a repository actually has components.json."],
  ]],
];
const mockSkills = mockSkillShelves.flatMap(([category, items]) => items.map(([name, summary], index) => ({
  id: `skill-${name}`,
  name,
  category,
  body: `## What it does

${summary}

## When to use it

Reach for it when the task matches the name and you want the same result twice.

## Steps

1. Open the repository you are working in.
2. Invoke \`$${name}\`.
3. Check what it changed before moving on.`,
  pinned: index === 0 && !category.startsWith("99"),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
})));
const mockBots = [];
const mockMcpServers = [];
const mockProjectNow = new Date().toISOString();
const mockProjects = new URLSearchParams(location.search).get("projects") === "demo" ? [
  { id: "project-notebook", name: "note-overlay", description: "The Notebook overlay itself: notes, Today, projects, bots.", status: "active", priority: "critical", manual_rank: 0, local_path: "C:\code\note-overlay", git_root: "C:\code\note-overlay", github_url: "https://github.com/wasely/note-overlay", primary_language: "JavaScript", tags: ["electron"], next_action: "Ship the ranked projects view", notes: "", push_after_commit: false, created_at: mockProjectNow, updated_at: mockProjectNow, last_worked_at: mockProjectNow, skill_ids: [], slash_command_ids: [], tasks: [], activity: [] },
  { id: "project-clipforge", name: "ClipForge AI", description: "Turn a YouTube URL into captioned vertical shorts.", status: "active", priority: "high", manual_rank: 1, local_path: "C:\live\clipforge-ai", git_root: "C:\live\clipforge-ai", github_url: null, primary_language: "Python", tags: ["live", "mine"], next_action: "Run one clean end-to-end export", notes: "", push_after_commit: false, created_at: mockProjectNow, updated_at: mockProjectNow, last_worked_at: mockProjectNow, skill_ids: [], slash_command_ids: [], tasks: [], activity: [] },
  { id: "project-proxy", name: "claude-code-proxy-src", description: "", status: "active", priority: "none", manual_rank: 2, local_path: "C:\else\claude-code-proxy", git_root: "C:\else\claude-code-proxy", github_url: null, primary_language: "Rust", tags: [], next_action: "", notes: "", push_after_commit: false, created_at: mockProjectNow, updated_at: mockProjectNow, last_worked_at: mockProjectNow, skill_ids: [], slash_command_ids: [], tasks: [], activity: [] },
  { id: "project-meme", name: "reddit-meme-finder-review", description: "", status: "active", priority: "medium", manual_rank: 3, local_path: "C:\else\reddit-meme-finder", git_root: "C:\else\reddit-meme-finder", github_url: null, primary_language: "TypeScript", tags: [], next_action: "", notes: "", push_after_commit: false, created_at: mockProjectNow, updated_at: mockProjectNow, last_worked_at: mockProjectNow, skill_ids: [], slash_command_ids: [], tasks: [], activity: [] },
] : [];
const mockSlashCommands = [
  { id: "starter-gitpush", name: "Git push", command: "/prompts:gitpush", body: "Run `/prompts:gitpush` inside the Git repository you want to publish.\n\n## What it does\nStages every change, commits with `Update project files`, then pushes the current tracking branch. It does not run checks.\n\n## Related skill\n`$gitpush`", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: "starter-command-guide", name: "Markdown, skills, and slash commands", command: "", body: "## Markdown (`.md`)\nA text-file format. It can hold instructions but is not automatically a command.\n\n## Custom prompt\nA Markdown file in `.codex/prompts`. `gitpush.md` becomes `/prompts:gitpush`.\n\n## Skill\nA folder containing `SKILL.md` and optional scripts. Invoke it with `$name`.\n\n## Slash command\nA `/` command parsed by Codex. Built-ins use top-level names; custom prompts use `/prompts:<name>`.", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];
const mockFolders = [{ id: "inbox", name: "Inbox", is_inbox: true, note_count: 0 }];
let mockSettings = { hotkey: "Control+Alt+Shift+N", startAtLogin: true, theme: "system" };

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
const mockNow = new Date().toISOString();
let mockTaskSeed = 0;
function mockTask(dayOffset, text, status, extra = {}) {
  mockTaskSeed += 1;
  const date = moveDate(mockDailyDate, dayOffset);
  return {
    id: `daily-${mockTaskSeed}`,
    task_date: date,
    text,
    status,
    priority: 2,
    owner: "me",
    completed_on: status === "done" ? date : null,
    completed_at: status === "done" ? mockNow : null,
    carried_from_id: extra.carried ? `daily-source-${mockTaskSeed}` : null,
    created_at: mockNow,
    updated_at: mockNow,
  };
}
const mockDailyTasks = new URLSearchParams(location.search).get("daily") === "demo" ? [
  mockTask(-3, "Cut the intro of the tutorial", "done"),
  mockTask(-3, "Reply to the sponsor email", "done"),
  mockTask(-2, "Storyboard the B-roll", "done"),
  mockTask(-2, "Rewrite the hook", "carried"),
  mockTask(-1, "Rewrite the hook", "done", { carried: true }),
  mockTask(-1, "Render the thumbnail set", "carried"),
  mockTask(0, "Render the thumbnail set", "open", { carried: true }),
  mockTask(0, "Finish the notes app checklist page", "open"),
  mockTask(0, "Review yesterday's footage", "done"),
  mockTask(0, "Send the edit to review", "open"),
  mockTask(1, "Record the voiceover", "open"),
] : [];
function mockDailyPage(viewDate = mockDailyDate) {
  const hydrate = (task) => ({ ...task, carried: Boolean(task.carried_from_id), moved: task.status === "carried" });
  const items = mockDailyTasks.filter((task) => task.task_date === viewDate).map(hydrate);
  const tomorrowDate = moveDate(viewDate, 1);
  return {
    date: viewDate,
    today: mockDailyDate,
    tomorrowDate,
    isToday: viewDate === mockDailyDate,
    isFuture: viewDate > mockDailyDate,
    items,
    tomorrow: mockDailyTasks.filter((task) => task.task_date === tomorrowDate && task.status !== "carried").map(hydrate),
    openCount: items.filter((task) => task.status === "open").length,
    doneCount: items.filter((task) => task.status === "done").length,
    movedCount: items.filter((task) => task.status === "carried").length,
    carriedCount: items.filter((task) => task.carried && task.status !== "carried").length,
  };
}
function mockDailyMonth(month = mockDailyDate.slice(0, 7)) {
  const days = new Map();
  for (const task of mockDailyTasks) {
    if (!task.task_date.startsWith(`${month}-`)) continue;
    const entry = days.get(task.task_date) || { date: task.task_date, total: 0, done: 0 };
    entry.total += 1;
    if (task.status === "done") entry.done += 1;
    days.set(task.task_date, entry);
  }
  return { month, days: [...days.values()].sort((left, right) => left.date.localeCompare(right.date)) };
}

// Browser-only stand-in for the preload bridge, used by `npm run preview` and screenshots.
const mockApi = {
  notes: {
    list: async () => mockNotes.filter((note) => !note.deleted_at).map((note) => ({ ...note })),
    create: async (input = {}) => {
      const note = { id: crypto.randomUUID(), title: input.title || "", body: input.body || "", folder_id: input.folderId || "inbox", pinned: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
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
      const skill = { id: crypto.randomUUID(), name: input.name || "", category: input.category || "Unsorted", body: input.body || "", pinned: Boolean(input.pinned), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
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
  slashCommands: {
    list: async () => mockSlashCommands.map((item) => ({ ...item })),
    create: async (input = {}) => {
      const item = { id: crypto.randomUUID(), name: input.name || "", command: input.command || "", body: input.body || "", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
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
  daily: {
    get: async () => mockDailyPage(),
    page: async (date = mockDailyDate) => {
      const state = new URLSearchParams(location.search).get("daily");
      if (state === "error") throw new Error("Daily preview error");
      if (state === "loading") return new Promise(() => {});
      return mockDailyPage(date);
    },
    month: async (month) => mockDailyMonth(month),
    create: async (input, date = mockDailyDate) => {
      const completed = Boolean(input.completed) && input.bucket !== "tomorrow";
      const taskDate = input.bucket === "tomorrow" ? moveDate(date, 1) : date;
      const timestamp = new Date().toISOString();
      mockDailyTasks.push({ id: crypto.randomUUID(), task_date: taskDate, text: input.text.trim(), status: completed ? "done" : "open", priority: input.priority || 2, owner: input.owner === "agent" ? "agent" : "me", completed_on: completed ? taskDate : null, completed_at: completed ? timestamp : null, carried_from_id: null, created_at: timestamp, updated_at: timestamp });
      return mockDailyPage(date);
    },
    update: async (id, input, date = mockDailyDate) => {
      const task = mockDailyTasks.find((item) => item.id === id);
      const patch = typeof input === "string" ? { text: input } : input;
      if (patch.text !== undefined) task.text = patch.text.trim();
      if (patch.bucket !== undefined) task.task_date = patch.bucket === "tomorrow" ? moveDate(date, 1) : date;
      task.updated_at = new Date().toISOString();
      return mockDailyPage(date);
    },
    complete: async (id, completed, date = mockDailyDate) => {
      const task = mockDailyTasks.find((item) => item.id === id);
      task.status = completed ? "done" : "open";
      task.completed_on = completed ? date : null;
      task.completed_at = completed ? new Date().toISOString() : null;
      return mockDailyPage(date);
    },
    remove: async (id, date = mockDailyDate) => {
      const index = mockDailyTasks.findIndex((item) => item.id === id);
      if (index >= 0) mockDailyTasks.splice(index, 1);
      return mockDailyPage(date);
    },
  },
  folders: {
    list: async () => mockFolders.map((folder) => ({ ...folder, note_count: mockNotes.filter((note) => !note.deleted_at && note.folder_id === folder.id).length })),
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
  backups: {
    list: async () => [],
    create: async () => ({ name: "notebook-backup-preview.json", createdAt: new Date().toISOString(), size: 1024 }),
    restore: async () => mockNotes.map((note) => ({ ...note })),
  },
  githubSync: {
    status: async () => ({ available: true, authenticated: true, login: "preview-user", repository: "preview-user/notebook-cloud", visibility: "private", autoUpload: false, remoteExists: true, lastPushedAt: null, lastPulledAt: null, url: "https://github.com/preview-user/notebook-cloud" }),
    signIn: async () => ({ available: true, authenticated: true, login: "preview-user" }),
    configure: async (input) => ({ available: true, authenticated: true, login: "preview-user", repository: input.repository, visibility: input.visibility || "private", remoteExists: false }),
    push: async (input) => ({ available: true, authenticated: true, login: "preview-user", repository: input.repository, visibility: input.visibility || "private", remoteExists: true, changed: true, lastPushedAt: new Date().toISOString() }),
    pull: async (input) => ({ sync: { available: true, authenticated: true, login: "preview-user", repository: input.repository, lastPulledAt: new Date().toISOString() }, restored: { notes: mockNotes } }),
    open: async () => true,
  },
  settings: {
    get: async () => ({ ...mockSettings }),
    set: async (patch) => { mockSettings = { ...mockSettings, ...patch }; return { ...mockSettings }; },
    version: async () => "0.8.0",
    export: async () => ({ filePath: "C:\\Temp\\notebook-backup.json" }),
    dataLocation: async () => "C:\\Notebook data",
  },
  bots: {
    list: async () => structuredClone(mockBots),
    get: async (id) => structuredClone(mockBots.find((bot) => bot.id === id) || null),
    create: async (input) => { const bot = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), archivedAt: null, jobs: [], connections: [], commands: [], runtime: null, derivedState: { state: "manual", reason: "No automatic monitoring is configured.", source: "Manual", observedAt: null, isStale: false }, ...structuredClone(input) }; mockBots.unshift(bot); return structuredClone(bot); },
    update: async (id, input) => { const index = mockBots.findIndex((bot) => bot.id === id); mockBots[index] = { ...mockBots[index], ...structuredClone(input), updatedAt: new Date().toISOString() }; return structuredClone(mockBots[index]); },
    archive: async (id) => { const bot = mockBots.find((item) => item.id === id); bot.archivedAt = new Date().toISOString(); return structuredClone(bot); },
    restore: async (id) => { const bot = mockBots.find((item) => item.id === id); bot.archivedAt = null; return structuredClone(bot); },
    check: async () => ({ ok: true, skipped: true }),
    checkAll: async () => ({ checked: 0, succeeded: 0, failed: 0, results: [] }),
    testMonitoring: async () => ({ ok: true, skipped: true, source: "Manual", message: "Manual monitoring performs no check." }),
    verifyConnection: async (botId, connectionId) => { const bot = mockBots.find((item) => item.id === botId); return structuredClone(bot.connections.find((item) => item.id === connectionId)); },
    activity: async () => [],
    runs: async () => [],
    upcoming: async () => [],
    openSetup: async () => true,
    openResource: async () => true,
    onStatus: () => () => {},
  },
  mcpServers: {
    list: async () => structuredClone(mockMcpServers),
    create: async (input) => { const server = { id: input.id || String(input.name || "server").toLowerCase().replace(/[^a-z0-9]+/g, "-"), description: "", transport: "stdio", command: "", url: "", body: "", ...input, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; mockMcpServers.push(server); return structuredClone(server); },
    update: async (id, input) => { const server = mockMcpServers.find((item) => item.id === id); Object.assign(server, input, { updatedAt: new Date().toISOString() }); return structuredClone(server); },
    remove: async (id) => { const index = mockMcpServers.findIndex((item) => item.id === id); if (index >= 0) mockMcpServers.splice(index, 1); },
    relatedBots: async () => [],
  },
  projects: {
    logo: async () => null,
    list: async () => { const state = new URLSearchParams(location.search).get("projects"); if (state === "error") throw new Error("Project storage is unavailable in this preview."); if (state === "loading") return new Promise(() => {}); return structuredClone(mockProjects); },
    create: async (input) => { const timestamp = new Date().toISOString(); const item = { id: crypto.randomUUID(), name: input.name, description: input.description || "", status: input.status || "active", priority: input.priority || "none", manual_rank: mockProjects.length, local_path: input.localPath || null, git_root: input.gitRoot || null, github_url: input.githubUrl || null, primary_language: input.primaryLanguage || "", tags: input.tags || [], next_action: input.nextAction || "", notes: input.notes || "", push_after_commit: false, created_at: timestamp, updated_at: timestamp, last_worked_at: timestamp, skill_ids: [], slash_command_ids: [], tasks: [], activity: [] }; mockProjects.push(item); return structuredClone(item); },
    update: async (id, input) => { const item = mockProjects.find((project) => project.id === id); Object.assign(item, input, { updated_at: new Date().toISOString() }); return structuredClone(item); },
    reorder: async () => structuredClone(mockProjects),
    remove: async (id) => { const index = mockProjects.findIndex((project) => project.id === id); if (index >= 0) mockProjects.splice(index, 1); },
    chooseFolder: async () => ({ canceled: true }),
    chooseParent: async () => ({ canceled: true, projects: [] }),
    inspect: async () => null,
    status: async () => ({ available: true, isGit: true, clean: true, branch: "main", upstream: "origin/main", ahead: 0, behind: 0, counts: { modified: 0, added: 0, deleted: 0, untracked: 0, staged: 0, conflicts: 0 }, files: [], lastCommit: { shortHash: "a1234567", message: "Update project", committedAt: new Date().toISOString() } }),
    diff: async (input) => ({ path: input.path, binary: false, truncated: false, text: "" }),
    stage: async () => ({ files: [] }),
    unstage: async () => ({ files: [] }),
    commit: async (input) => ({ shortHash: "f00ba412", message: input.message, pushed: false }),
    fetch: async () => ({ ahead: 0, behind: 0 }),
    agentsRead: async () => ({ exists: false, path: "AGENTS.md", content: "", version: null, modifiedAt: null, newline: "\r\n" }),
    agentsWrite: async (input) => ({ exists: true, path: "AGENTS.md", content: input.content, version: crypto.randomUUID(), modifiedAt: new Date().toISOString(), newline: "\r\n" }),
    readme: async () => ({ path: "README.md", content: "" }),
    open: async () => true,
    tasks: {
      create: async (projectId, input) => { const project = mockProjects.find((item) => item.id === projectId); project.tasks.push({ id: crypto.randomUUID(), project_id: projectId, description: "", status: "todo", priority: "medium", manual_order: project.tasks.length, tags: [], related: "", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...input }); return structuredClone(project); },
      update: async (id, input) => { const project = mockProjects.find((item) => item.tasks.some((task) => task.id === id)); Object.assign(project.tasks.find((task) => task.id === id), input); return structuredClone(project); },
      remove: async (id) => { const project = mockProjects.find((item) => item.tasks.some((task) => task.id === id)); project.tasks = project.tasks.filter((task) => task.id !== id); return structuredClone(project); },
    },
    assign: async (id, input) => { const project = mockProjects.find((item) => item.id === id); if (input.skillIds) project.skill_ids = input.skillIds; if (input.slashCommandIds) project.slash_command_ids = input.slashCommandIds; return structuredClone(project); },
  },
  compressor: {
    status: async () => new URLSearchParams(location.search).get("demo") === "success",
    start: async () => ({ ready: new URLSearchParams(location.search).get("demo") === "success", error: "The local compressor only runs in the desktop app." }),
    compress: async () => ({ compressed_prompt: "Concise project update. Feature complete, tests passed, ready for review.", origin_tokens: 24, compressed_tokens: 14, ratio: "1.7x" }),
  },
  compressions: { create: async (value) => value },
  mail: {
    show: async () => { const state = new URLSearchParams(location.search).get("mail"); if (state === "error") return { status: "error", message: "This service is unavailable in the preview." }; if (state === "loading") return { status: "loading", message: "" }; return { status: "ready", message: "" }; },
    hide: async () => ({ status: "ready" }), reload: async () => ({ status: "loading" }), openExternal: async () => true,
  },
  notion: {
    show: async () => { const state = new URLSearchParams(location.search).get("notion"); if (state === "error") return { status: "error", message: "This service is unavailable in the preview." }; if (state === "loading") return { status: "loading", message: "" }; return { status: "ready", message: "" }; },
    hide: async () => ({ status: "ready" }), reload: async () => ({ status: "loading" }), openExternal: async () => true,
  },
  twitter: {
    show: async () => { const state = new URLSearchParams(location.search).get("twitter"); if (state === "error") return { status: "error", message: "This service is unavailable in the preview." }; if (state === "loading") return { status: "loading", message: "" }; return { status: "ready", message: "" }; },
    hide: async () => ({ status: "ready" }), reload: async () => ({ status: "loading" }), openExternal: async () => true,
  },
  clipboard: { writeText: async (text) => navigator.clipboard.writeText(text), writeRich: async ({ text }) => navigator.clipboard.writeText(text) },
  googleDocs: { create: async () => true },
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
  onOpenTwitter: () => () => {},
  onTwitterStatus: () => () => {},
};
const api = window.hushnote || mockApi;

const VIEWS = [
  { id: "daily", label: "Today", route: "today", Icon: CalendarCheck2 },
  { id: "notes", label: "Notes", route: "notes", Icon: FileText },
  { id: "skills", label: "Skills", route: "skills", Icon: Layers3 },
  { id: "commands", label: "Commands", route: "commands", Icon: SquareTerminal },
  { id: "projects", label: "Projects", route: "projects", Icon: FolderGit2, group: "Workspace" },
  { id: "bots", label: "Bots", route: "bots", Icon: Bot, group: "Workspace" },
  { id: "mcp-servers", label: "MCP", route: "mcp-servers", Icon: ServerCog, group: "Workspace" },
];
// Full-window embedded services. These are windows, not pages, so they sit under their own heading.
// Brand marks ship with the app (simple-icons), so they render offline and never depend on a
// service being reachable. Each keeps its own signed-in session and stays loaded once opened.
const SERVICES = [
  { id: "mail", label: "Gmail", brand: siGmail, tone: "gmail", hotkey: "Ctrl+Alt+Shift+M" },
  { id: "notion", label: "Notion", brand: siNotion, tone: "notion", hotkey: "Ctrl+Alt+Shift+O" },
  { id: "twitter", label: "Twitter", brand: siX, tone: "twitter", hotkey: "Ctrl+Alt+Shift+X" },
];
const SERVICE_IDS = new Set(SERVICES.map((service) => service.id));
const LIBRARY_VIEWS = new Set(["notes", "skills", "commands"]);
const NEW_LABEL = { notes: "New note", skills: "New skill", commands: "New command" };

// List previews read as prose, not as raw Markdown syntax.
function preview(note) {
  const text = (note.body || "")
    .replace(/```[\s\S]*?```/g, " ")
    .split("\n")
    .map((line) => line
      .replace(/^\s{0,3}#{1,6}\s+/, "")
      .replace(/^\s*[-*+]\s+\[[ xX]]\s+/, "")
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
      .replace(/^\s*>\s?/, ""))
    .join(" ")
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, "$1")
    .replace(/\*\*|__|~~|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text || "Empty note";
}
function noteName(note) {
  return note.title?.trim() || preview(note).slice(0, 42) || "Untitled";
}
function skillName(skill) {
  return displaySkillName(skill);
}
function slashCommandName(item) {
  return item.name?.trim() || item.command?.trim() || preview({ body: item.body }).slice(0, 42) || "Untitled command";
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
function countWords(body = "") {
  const words = body.trim().match(/[^\s]+/g);
  return words ? words.length : 0;
}
function dailyDate(value, options = {}) {
  return new Date(`${value}T12:00:00`).toLocaleDateString([], options.short ? { weekday: "short", month: "short", day: "numeric" } : { weekday: "long", month: "long", day: "numeric" });
}

const TOOLBAR = [
  [["bold", "Bold", "Ctrl+B", Bold], ["italic", "Italic", "Ctrl+I", Italic], ["strike", "Strikethrough", "", Strikethrough], ["code", "Inline code", "", Code]],
  [["h1", "Heading 1", "", Heading1], ["h2", "Heading 2", "", Heading2], ["h3", "Heading 3", "", Heading3]],
  [["bullet", "Bulleted list", "", List], ["number", "Numbered list", "", ListOrdered], ["todo", "Checklist", "", ListTodo]],
  [["quote", "Quote", "", Quote], ["codeblock", "Code block", "", Code], ["link", "Link", "Ctrl+K", Link2]],
];

function FormatToolbar({ onFormat, disabled }) {
  return <div className="format-bar" role="toolbar" aria-label="Formatting">
    {TOOLBAR.map((group, index) => <div className="format-group" key={index}>
      {group.map(([action, label, shortcut, Icon]) => <button
        type="button"
        key={action}
        className="format-button"
        disabled={disabled}
        aria-label={label}
        title={shortcut ? `${label} (${shortcut})` : label}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onFormat(action)}
      ><Icon size={15} strokeWidth={1.9} /></button>)}
    </div>)}
  </div>;
}

function IconButton({ label, onClick, children, className = "", ...rest }) {
  return <button type="button" className={`icon-button ${className}`} onClick={onClick} aria-label={label} title={label} {...rest}>{children}</button>;
}

function ListRow({ selected, title, detail, meta, badge, onOpen, onRemove, removeLabel, className = "" }) {
  return <div className={`row ${selected ? "is-selected" : ""} ${className}`}>
    <button type="button" className="row-open" onClick={onOpen}>
      <span className="row-title">{badge}<strong>{title}</strong></span>
      <span className="row-detail">{detail}</span>
      <span className="row-meta">{meta}</span>
    </button>
    {onRemove && <IconButton className="row-remove" label={removeLabel} onClick={onRemove}><Trash2 size={14} strokeWidth={1.8} /></IconButton>}
  </div>;
}

function EmptyState({ title, body, action }) {
  return <div className="empty-state"><strong>{title}</strong><p>{body}</p>{action}</div>;
}

function SearchResults({ query, notes, skills, slashCommands, daily, onOpenNote, onOpenSkill, onOpenCommand, onOpenTask }) {
  const needle = query.trim().toLowerCase();
  const matches = (value) => String(value || "").toLowerCase().includes(needle);
  const taskResults = daily ? [
    ...daily.items.filter((task) => task.status !== "carried").map((task) => ({ ...task, location: task.status === "done" ? "Checked off" : dailyDate(daily.date, { short: true }) })),
    ...daily.tomorrow.map((task) => ({ ...task, location: "Next day" })),
  ].filter((task) => matches(task.text)) : [];
  const groups = [
    { label: "Tasks", items: taskResults, render: (task) => <button type="button" key={task.id} onClick={onOpenTask}><span className="result-mark task"><ListTodo size={13} strokeWidth={1.8} /></span><span><strong>{task.text}</strong><small>{task.location}{task.status === "done" ? "" : task.carried ? " · carried over" : ""}</small></span></button> },
    { label: "Notes", items: notes.filter((note) => !note.deleted_at && matches(`${noteName(note)} ${note.body || ""}`)), render: (note) => <button type="button" key={note.id} onClick={() => onOpenNote(note)}><span className="result-mark note"><FileText size={13} strokeWidth={1.8} /></span><span><strong>{noteName(note)}</strong><small>{preview(note)}</small></span></button> },
    { label: "Skills", items: skills.filter((skill) => matches(`${skillName(skill)} ${skill.category || ""} ${skill.body || ""}`)), render: (skill) => <button type="button" key={skill.id} onClick={() => onOpenSkill(skill)}><span className="result-mark skill"><Layers3 size={13} strokeWidth={1.8} /></span><span><strong>{skillName(skill)}</strong><small>{cleanSkillCategory(skill.category)}</small></span></button> },
    { label: "Commands", items: slashCommands.filter((item) => matches(`${slashCommandName(item)} ${item.command || ""} ${item.body || ""}`)), render: (item) => <button type="button" key={item.id} onClick={() => onOpenCommand(item)}><span className="result-mark command"><SquareTerminal size={13} strokeWidth={1.8} /></span><span><strong>{slashCommandName(item)}</strong><small>{item.command || "Reference"}</small></span></button> },
  ].filter((group) => group.items.length);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  return <div className="results" aria-live="polite">
    <p className="results-summary">{total} {total === 1 ? "match" : "matches"} for “{query.trim()}”</p>
    {groups.map((group) => <section key={group.label}>
      <h2>{group.label}<span>{group.items.length}</span></h2>
      {group.items.slice(0, 8).map(group.render)}
    </section>)}
    {!groups.length && <EmptyState title="No match" body="Search covers note titles and text, tasks, skills, and commands." />}
  </div>;
}

function NotesList({ notes, currentId, onSelect, onRemove, onCreate }) {
  if (!notes.length) return <EmptyState title="No notes here" body="Start one and it saves as you type." action={<button type="button" className="button" onClick={onCreate}><Plus size={15} strokeWidth={2} />New note</button>} />;
  return <div className="list" aria-live="polite">
    {notes.map((note) => <ListRow
      key={note.id}
      selected={currentId === note.id}
      title={noteName(note)}
      badge={note.pinned ? <Pin className="row-pin" size={12} strokeWidth={2} aria-label="Pinned" /> : null}
      detail={preview(note)}
      meta={shortTime(note.updated_at)}
      onOpen={() => onSelect(note)}
      onRemove={() => onRemove(note)}
      removeLabel={`Delete ${noteName(note)}`}
    />)}
  </div>;
}

function SlashCommandList({ items, currentId, onSelect, onRemove, onCreate }) {
  if (!items.length) return <EmptyState title="No commands saved" body="Keep the invocation and what it does in one place." action={<button type="button" className="button" onClick={onCreate}><Plus size={15} strokeWidth={2} />New command</button>} />;
  const groups = [
    { label: "Commands", items: items.filter((item) => item.command?.trim()) },
    { label: "Reference", items: items.filter((item) => !item.command?.trim()) },
  ].filter((group) => group.items.length);
  return <div className="list" aria-live="polite">
    {groups.map((group) => <section className="list-group" key={group.label}>
      <h2>{group.label}<span>{group.items.length}</span></h2>
      {group.items.map((item) => <ListRow
        key={item.id}
        selected={currentId === item.id}
        title={slashCommandName(item)}
        detail={item.command?.trim() || "Reference page"}
        meta={shortTime(item.updated_at)}
        onOpen={() => onSelect(item)}
        onRemove={() => onRemove(item)}
        removeLabel={`Delete ${slashCommandName(item)}`}
        className={item.command?.trim() ? "has-invocation" : ""}
      />)}
    </section>)}
  </div>;
}

function EditorBar({ status, context, children, onHide }) {
  return <header className="editor-bar">
    <div className="editor-status"><span className={`save-state ${status === "Save failed" ? "is-failed" : ""}`}>{status}</span>{context && <span className="editor-context">{context}</span>}</div>
    <div className="editor-actions">{children}<IconButton className="close" label="Hide Notebook" onClick={onHide}><X size={18} strokeWidth={1.8} /></IconButton></div>
  </header>;
}

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

function monthOf(date) { return date.slice(0, 7); }
function monthLabel(month) {
  return new Date(`${month}-01T12:00:00`).toLocaleDateString([], { month: "long", year: "numeric" });
}
function shiftMonth(month, delta) {
  const date = new Date(`${month}-01T12:00:00`);
  date.setMonth(date.getMonth() + delta);
  return dateKey(date).slice(0, 7);
}
function monthCells(month) {
  const first = new Date(`${month}-01T12:00:00`);
  const length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: first.getDay() }, () => null);
  for (let day = 1; day <= length; day += 1) cells.push(`${month}-${String(day).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}
function relativeDay(date, today) {
  if (date === today) return "Today";
  if (date === moveDate(today, -1)) return "Yesterday";
  if (date === moveDate(today, 1)) return "Tomorrow";
  return null;
}
function dayState(entry) {
  if (!entry || !entry.total) return "empty";
  if (entry.done >= entry.total) return "clear";
  if (entry.done > 0) return "partial";
  return "open";
}

function DailySidebar({ page, month, days, status, onSelectDate, onMonth }) {
  if (!page) return <div className="side-panel"><p className="side-note">{status}</p></div>;
  const byDate = new Map(days.map((entry) => [entry.date, entry]));
  const monthDone = days.reduce((total, entry) => total + entry.done, 0);
  const monthOpen = days.reduce((total, entry) => total + Math.max(0, entry.total - entry.done), 0);
  return <div className="side-panel">
    <section className="calendar" aria-label="Daily pages">
      <header className="calendar-head">
        <IconButton label="Previous month" onClick={() => onMonth(shiftMonth(month, -1))}><ChevronLeft size={15} strokeWidth={1.9} /></IconButton>
        <strong>{monthLabel(month)}</strong>
        <IconButton label="Next month" onClick={() => onMonth(shiftMonth(month, 1))}><ChevronRight size={15} strokeWidth={1.9} /></IconButton>
      </header>
      <div className="calendar-grid">
        {WEEKDAY_LETTERS.map((letter, index) => <span className="calendar-weekday" key={index} aria-hidden="true">{letter}</span>)}
        {monthCells(month).map((date, index) => date ? <button
          type="button"
          key={date}
          className={`calendar-day is-${dayState(byDate.get(date))} ${date === page.date ? "is-selected" : ""} ${date === page.today ? "is-today" : ""}`}
          aria-current={date === page.date ? "date" : undefined}
          aria-label={`${dailyDate(date)}${byDate.get(date) ? ` · ${byDate.get(date).done} of ${byDate.get(date).total} checked` : " · nothing written"}`}
          title={byDate.get(date) ? `${byDate.get(date).done}/${byDate.get(date).total} checked` : "Nothing written"}
          onClick={() => onSelectDate(date)}
        >{Number(date.slice(8))}</button> : <span className="calendar-blank" key={`blank-${index}`} aria-hidden="true" />)}
      </div>
    </section>
    <p className="calendar-summary"><strong>{monthDone}</strong> checked off in {monthLabel(month)} · <strong>{monthOpen}</strong> still open</p>
    <p className="calendar-hint"><RotateCcw size={13} strokeWidth={1.8} />Anything unchecked at midnight moves to the next day.</p>
  </div>;
}

function DailyLine({ task, onToggle, onLocalEdit, onSave, onRemove, onMove, moveLabel }) {
  const done = task.status === "done";
  const moved = task.status === "carried";
  return <li className={`line ${done ? "is-done" : ""} ${moved ? "is-moved" : ""}`}>
    <label className="line-check">
      <input type="checkbox" checked={done} disabled={moved} onChange={(event) => onToggle(task.id, event.target.checked)} aria-label={`${done ? "Uncheck" : "Check off"} ${task.text}`} />
      <span className="line-box" aria-hidden="true"><Check size={13} strokeWidth={2.8} /></span>
    </label>
    <textarea
      className="line-text"
      rows="1"
      value={task.text}
      readOnly={moved}
      onChange={(event) => onLocalEdit(task.id, event.target.value)}
      onBlur={() => onSave(task)}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }}
      aria-label={`Edit task: ${task.text}`}
      maxLength={500}
    />
    <span className="line-tools">
      {task.carried && !moved ? <span className="line-mark" title="Carried over from an earlier day"><RotateCcw size={12} strokeWidth={1.9} />carried</span> : null}
      {moved ? <span className="line-mark" title="Unfinished, so it moved to the next day">moved on</span> : <>
        {onMove && <IconButton className="line-move" label={`${moveLabel} — ${task.text}`} onClick={() => onMove(task.id)}><ArrowRight size={14} strokeWidth={1.8} /></IconButton>}
        <IconButton className="line-remove" label={`Delete ${task.text}`} onClick={() => onRemove(task.id)}><Trash2 size={13} strokeWidth={1.8} /></IconButton>
      </>}
    </span>
  </li>;
}

function DailyAddLine({ label, placeholder, onAdd }) {
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
  return <form className="line-add" onSubmit={submit}>
    <span className="line-box is-blank" aria-hidden="true"><Plus size={13} strokeWidth={2.2} /></span>
    <input value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} aria-label={label} maxLength={500} />
    <button type="submit" className="button subtle" disabled={!value.trim() || busy}>{busy ? "Adding…" : "Add"}</button>
  </form>;
}

function TodayPage({ page, status, onSelectDate, onAdd, onToggle, onLocalEdit, onSave, onMove, onRemove, onHide, onRetry }) {
  const failed = status.startsWith("Could not");
  if (!page) return <section className="pane">
    <EditorBar status={status} onHide={onHide} />
    <div className="pane-scroll"><EmptyState title={failed ? "Daily page unavailable" : "Opening today…"} body={failed ? "Your notes are safe. Try loading the daily page again." : "Carrying yesterday's unfinished work into today."} action={failed ? <button type="button" className="button" onClick={onRetry}><RotateCcw size={15} strokeWidth={1.8} />Try again</button> : null} /></div>
  </section>;
  const listed = page.items.filter((task) => task.status !== "carried");
  const moved = page.items.filter((task) => task.status === "carried");
  const percent = listed.length ? Math.round((page.doneCount / listed.length) * 100) : 0;
  const relative = relativeDay(page.date, page.today);
  const lineProps = { onToggle, onLocalEdit, onSave, onRemove };
  return <section className="pane">
    <EditorBar status={status} context={relative || dailyDate(page.date, { short: true })} onHide={onHide} />
    <div className="pane-scroll paper-scroll">
      <article className="paper">
        <header className="paper-head">
          <IconButton className="paper-step" label="Previous day" onClick={() => onSelectDate(moveDate(page.date, -1))}><ChevronLeft size={17} strokeWidth={1.9} /></IconButton>
          <div className="paper-date">
            {relative && <span className="paper-kicker">{relative}</span>}
            <h1>{dailyDate(page.date)}</h1>
            <p>{page.doneCount} of {listed.length} checked off{page.carriedCount ? ` · ${page.carriedCount} carried over` : ""}</p>
          </div>
          <IconButton className="paper-step" label="Next day" onClick={() => onSelectDate(moveDate(page.date, 1))}><ChevronRight size={17} strokeWidth={1.9} /></IconButton>
        </header>
        <div className="paper-progress" role="img" aria-label={`${percent}% of this day checked off`}><i style={{ width: `${percent}%` }} /></div>
        {!page.isToday && <button type="button" className="button subtle paper-back" onClick={() => onSelectDate(page.today)}><CalendarCheck2 size={15} strokeWidth={1.8} />Back to today</button>}
        <ol className="checklist">
          {listed.map((task) => <DailyLine key={task.id} task={task} {...lineProps} onMove={(id) => onMove(id, "tomorrow")} moveLabel="Move to the next day" />)}
        </ol>
        {!listed.length && <p className="paper-empty">Nothing written on this page yet. Add the first thing below.</p>}
        <DailyAddLine label={`Task for ${dailyDate(page.date)}`} placeholder={page.isToday ? "Add to today's list…" : `Add to ${dailyDate(page.date, { short: true })}…`} onAdd={(text) => onAdd(text, "today")} />
        {moved.length > 0 && <section className="paper-moved">
          <h2>Moved to the next day</h2>
          <ol className="checklist is-quiet">{moved.map((task) => <DailyLine key={task.id} task={task} {...lineProps} />)}</ol>
        </section>}
        <section className="paper-next">
          <h2>{relativeDay(page.tomorrowDate, page.today) || dailyDate(page.tomorrowDate, { short: true })}<small>{page.tomorrow.length}</small></h2>
          <ol className="checklist is-quiet">
            {page.tomorrow.map((task) => <DailyLine key={task.id} task={task} {...lineProps} onMove={(id) => onMove(id, "today")} moveLabel="Pull back to this page" />)}
          </ol>
          <DailyAddLine label={`Task for ${dailyDate(page.tomorrowDate)}`} placeholder="Line something up for the next day…" onAdd={(text) => onAdd(text, "tomorrow")} />
        </section>
        <footer className="paper-foot"><RotateCcw size={13} strokeWidth={1.8} />Unchecked items roll onto the next page at midnight.</footer>
      </article>
    </div>
  </section>;
}

function NotePage({ note, notebooks, status, mode, onMode, onEdit, onSave, onCopy, onCopyPath, onCompress, onFormat, onGoogleDoc, onDrag, onDragEnd, onTogglePin, onMove, onRemove, onAddTodo, onToggleTodo, onCreate, onHide, editorRef, notebookName }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (event) => { if (!menuRef.current?.contains(event.target)) setMenuOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpen]);
  if (!note) return <section className="pane">
    <EditorBar status={status} onHide={onHide} />
    <div className="pane-scroll"><EmptyState title={`${notebookName || "This notebook"} is empty`} body="Create a Markdown note. It saves itself as you type." action={<button type="button" className="button primary" onClick={onCreate}><Plus size={15} strokeWidth={2} />New note</button>} /></div>
  </section>;
  const hasContent = Boolean(note.body?.trim() || note.title?.trim());
  const tasks = todoItems(note.body);
  const words = countWords(note.body);
  return <section className="pane">
    <EditorBar status={status} context={notebookName} onHide={onHide}>
      <IconButton label={note.pinned ? "Unpin note" : "Pin note"} className={note.pinned ? "is-active" : ""} aria-pressed={Boolean(note.pinned)} onClick={onTogglePin}><Pin size={16} strokeWidth={1.8} /></IconButton>
      <button type="button" className="button subtle" onClick={() => onMode(mode === "write" ? "read" : "write")} aria-pressed={mode === "read"} title="Toggle Markdown preview (Ctrl+E)">
        {mode === "write" ? <><Eye size={15} strokeWidth={1.8} />Preview</> : <><Pencil size={15} strokeWidth={1.8} />Edit</>}
      </button>
      <button type="button" className={`button subtle drag-action ${hasContent ? "" : "is-disabled"}`} draggable={hasContent} disabled={!hasContent} aria-disabled={!hasContent} onDragStart={onDrag} onDragEnd={onDragEnd} onClick={onCopy && (() => onCopyPath("name"))} title={hasContent ? "Drag a clean Markdown file out, or click to copy its filename" : "Write something before dragging a Markdown file"}>
        <GripVertical size={15} strokeWidth={1.8} />Drag .md
      </button>
      <div className="menu" ref={menuRef}>
        <IconButton label="More note actions" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><Ellipsis size={18} strokeWidth={1.8} /></IconButton>
        {menuOpen && <div className="menu-popover" role="menu">
          <button type="button" onClick={() => { setMenuOpen(false); onCopy(); }}><Copy size={14} strokeWidth={1.8} />Copy Markdown</button>
          <button type="button" onClick={() => { setMenuOpen(false); onCopyPath("path"); }}><Copy size={14} strokeWidth={1.8} />Copy .md path</button>
          <button type="button" onClick={() => { setMenuOpen(false); onGoogleDoc(); }}><ExternalLink size={14} strokeWidth={1.8} />Open in Google Docs</button>
          <button type="button" onClick={() => { setMenuOpen(false); onCompress(); }}><Shrink size={14} strokeWidth={1.8} />Compress note</button>
          <label><span>Move to notebook</span><select value={note.folder_id} onChange={(event) => { setMenuOpen(false); onMove(event.target.value); }} aria-label="Move note to notebook">{notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.name}</option>)}</select></label>
          <button type="button" className="is-danger" onClick={() => { setMenuOpen(false); onRemove(note); }}><Trash2 size={14} strokeWidth={1.8} />Delete note</button>
        </div>}
      </div>
    </EditorBar>
    <div className="note-canvas" key={note.id}>
      <input className="note-title" value={note.title || ""} onChange={(event) => onEdit({ title: event.target.value })} placeholder="Untitled" aria-label="Note title" autoFocus />
      {mode === "write" && <FormatToolbar onFormat={onFormat} disabled={!note} />}
      <div className="note-meta">
        <span>{words} {words === 1 ? "word" : "words"}</span>
        {tasks.length > 0 && <span><Check size={13} strokeWidth={2} />{tasks.filter((task) => task.checked).length}/{tasks.length} done</span>}
        <span>Edited {fullTime(note.updated_at)}</span>
        <button type="button" className="link-button" onClick={onAddTodo}><ListTodo size={14} strokeWidth={1.8} />Add to-do</button>
      </div>
      {mode === "write"
        ? <textarea ref={editorRef} className="note-writing" value={note.body || ""} onChange={(event) => onEdit({ body: event.target.value })} onBlur={() => onSave(note)} placeholder="Write Markdown. It saves automatically." aria-label="Note content" />
        : <div className="note-reading" aria-label="Rendered note">
          {note.body?.trim()
            ? <Markdown source={note.body} onToggleTask={onToggleTodo} />
            : <EmptyState title="Nothing to preview" body="Switch back to editing and write something first." action={<button type="button" className="button" onClick={() => onMode("write")}><Pencil size={15} strokeWidth={1.8} />Edit note</button>} />}
        </div>}
    </div>
  </section>;
}

function CommandPage({ item, status, onEdit, onSave, onCopy, onRemove, onCreate, onHide }) {
  if (!item) return <section className="pane">
    <EditorBar status={status} onHide={onHide} />
    <div className="pane-scroll"><EmptyState title="No command selected" body="Save an invocation with a short note on what it does." action={<button type="button" className="button primary" onClick={onCreate}><Plus size={15} strokeWidth={2} />New command</button>} /></div>
  </section>;
  return <section className="pane">
    <EditorBar status={status} context={item.command?.trim() || "Reference"} onHide={onHide}>
      <button type="button" className="button subtle" onClick={onCopy}><Copy size={15} strokeWidth={1.8} />Copy</button>
      <IconButton className="is-danger" label={`Delete ${slashCommandName(item)}`} onClick={() => onRemove(item)}><Trash2 size={16} strokeWidth={1.8} /></IconButton>
    </EditorBar>
    <div className="note-canvas">
      <input className="note-title" value={item.name || ""} onChange={(event) => onEdit({ name: event.target.value })} placeholder="Command name" aria-label="Slash command name" autoFocus />
      <label className="field inline"><span>Invocation</span><input className="mono" value={item.command || ""} onChange={(event) => onEdit({ command: event.target.value })} onBlur={() => onSave(item)} placeholder="/prompts:name" aria-label="Slash command invocation" spellCheck="false" /><small>Leave empty for a reference page</small></label>
      <div className="field-heading"><span>Notes</span><small>Markdown supported</small></div>
      <textarea className="note-writing" value={item.body || ""} onChange={(event) => onEdit({ body: event.target.value })} onBlur={() => onSave(item)} placeholder="Explain what it does, where it lives, and how to use it." aria-label="Slash command notes" />
    </div>
  </section>;
}

const SHORTCUTS = [
  ["Ctrl + Alt + Shift + N", "Show or hide Notebook anywhere in Windows"],
  ["Ctrl + K", "Search everything"],
  ["Ctrl + N", "New note, skill, or command"],
  ["Ctrl + E", "Switch between writing and Markdown preview"],
  ["Alt + ← / →", "Previous or next skill"],
  ["Ctrl + 1 – 4", "Jump to Today, Notes, Skills, Commands"],
  ["Esc", "Clear search, close a panel, or hide the window"],
];

function SettingsPanel({ backups, message, dataLocation, appVersion, settings, github, githubBusy, onTheme, onStartAtLogin, onGithubConnect, onGithubConfigure, onGithubPush, onGithubPull, onGithubOpen, onClose, onBackup, onRestore, onExport }) {
  const [repository, setRepository] = useState(github?.repository || "");
  const [visibility, setVisibility] = useState(github?.visibility || "private");
  const [autoUpload, setAutoUpload] = useState(Boolean(github?.autoUpload));
  useEffect(() => {
    if (github?.repository) setRepository(github.repository);
    else if (github?.login) setRepository(`${github.login}/notebook-cloud`);
    if (github?.visibility) setVisibility(github.visibility);
    setAutoUpload(Boolean(github?.autoUpload));
  }, [github?.repository, github?.visibility, github?.login, github?.autoUpload]);
  const cloudInput = { repository, visibility, autoUpload };
  const themes = [["system", "System", Monitor], ["light", "Light", Sun], ["dark", "Dark", Moon]];
  return <aside className="settings" aria-label="Settings">
    <header><h2>Settings</h2><IconButton className="close" label="Close settings" onClick={onClose}><X size={18} strokeWidth={1.8} /></IconButton></header>
    <div className="settings-scroll">
      <section>
        <h3>Appearance</h3>
        <div className="segmented" role="group" aria-label="Theme">
          {themes.map(([value, label, Icon]) => <button type="button" key={value} className={settings.theme === value ? "is-active" : ""} aria-pressed={settings.theme === value} onClick={() => onTheme(value)}><Icon size={15} strokeWidth={1.8} />{label}</button>)}
        </div>
        <label className="switch"><input type="checkbox" checked={Boolean(settings.startAtLogin)} onChange={(event) => onStartAtLogin(event.target.checked)} /><span>Start Notebook when Windows starts</span></label>
      </section>

      <section>
        <h3><Keyboard size={15} strokeWidth={1.8} />Keyboard</h3>
        <dl className="shortcuts">{SHORTCUTS.map(([keys, description]) => <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{description}</dd></div>)}</dl>
      </section>

      <section>
        <h3>Backups</h3>
        <p className="settings-copy">Notebook keeps one local backup per day and holds the newest 21. Everything stays on this computer.</p>
        <div className="button-row">
          <button type="button" className="button" onClick={onBackup}>Back up now</button>
          <button type="button" className="button subtle" onClick={() => onExport("json")}>Export JSON</button>
          <button type="button" className="button subtle" onClick={() => onExport("markdown")}>Export Markdown</button>
        </div>
        <div className="backup-list">
          {backups.map((backup) => <div className="backup-row" key={backup.name}>
            <div><strong>{fullTime(backup.createdAt)}</strong><span>{bytes(backup.size)}</span></div>
            <button type="button" className="button subtle" onClick={() => onRestore(backup)}>Restore</button>
          </div>)}
          {!backups.length && <p className="settings-copy">No backups yet.</p>}
        </div>
      </section>

      <section>
        <h3><Cloud size={15} strokeWidth={1.8} />GitHub backup</h3>
        <p className="settings-copy">Optional. Copies this Notebook into a private GitHub repository so another computer can download it.</p>
        <div className="cloud-account">
          <span className={github?.authenticated ? "is-connected" : ""}>{github?.authenticated ? `Signed in as @${github.login}` : github?.available === false ? "GitHub CLI required" : "Not connected"}</span>
          <button type="button" className="button subtle" onClick={onGithubConnect} disabled={githubBusy === "connect" || github?.available === false}>{githubBusy === "connect" ? "Signing in…" : github?.authenticated ? "Reconnect" : "Sign in"}</button>
        </div>
        <label className="field"><span>Repository</span><input value={repository} onChange={(event) => setRepository(event.target.value)} placeholder={github?.login ? `${github.login}/notebook-cloud` : "owner/notebook-cloud"} /></label>
        <label className="field"><span>Visibility</span><select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="private">Private (recommended)</option><option value="public">Public</option></select></label>
        <label className="switch"><input type="checkbox" checked={autoUpload} onChange={(event) => setAutoUpload(event.target.checked)} /><span>Upload automatically every 5 minutes</span></label>
        <div className="button-row">
          <button type="button" className="button" onClick={() => onGithubConfigure(cloudInput)} disabled={!github?.authenticated || !repository || Boolean(githubBusy)}>Save</button>
          <button type="button" className="button subtle" onClick={() => onGithubPush(cloudInput)} disabled={!github?.authenticated || !repository || Boolean(githubBusy)}>{githubBusy === "push" ? "Uploading…" : "Upload"}</button>
          <button type="button" className="button subtle" onClick={() => onGithubPull(cloudInput)} disabled={!github?.authenticated || !repository || Boolean(githubBusy)}>{githubBusy === "pull" ? "Downloading…" : "Download"}</button>
          {github?.url && <button type="button" className="link-button" onClick={onGithubOpen}>Open repository</button>}
        </div>
        <p className="settings-copy">{github?.lastPushedAt ? `Last upload ${fullTime(github.lastPushedAt)}` : "Never uploaded"}{github?.lastPulledAt ? ` · Last download ${fullTime(github.lastPulledAt)}` : ""}</p>
      </section>

      {message && <p className="settings-message" role="status">{message}</p>}
      <footer>
        {dataLocation && <p title={dataLocation}>Data: {dataLocation}</p>}
        {appVersion && <p>Notebook v{appVersion} · local-first</p>}
      </footer>
    </div>
  </aside>;
}

function BrandIcon({ icon, size = 16, className = "" }) {
  return <svg className={`brand-icon ${className}`} role="img" aria-hidden="true" viewBox="0 0 24 24" width={size} height={size}><path d={icon.path} /></svg>;
}

function ServiceScreen({ appName, activeId, loadedServices, status, preview, Preview, errorHint, onBack, onSwitch, onReload, onExternal, onHide }) {
  const loading = status.status === "loading" || status.status === "idle";
  const failed = status.status === "error";
  return <main className="service-screen">
    <header className="service-bar">
      <button type="button" className="button subtle" onClick={onBack}><ArrowLeft size={15} strokeWidth={1.8} />Notebook</button>
      <div className="service-switch" role="group" aria-label="Switch app">
        {SERVICES.map(({ id, label, brand, tone }) => <button
          type="button"
          key={id}
          className={`${id === activeId ? "is-active" : ""} brand-${tone}`}
          aria-pressed={id === activeId}
          title={loadedServices.has(id) && id !== activeId ? `${label} · already loaded` : label}
          onClick={() => id !== activeId && onSwitch(id)}
        ><BrandIcon icon={brand} size={15} /><span>{label}</span></button>)}
      </div>
      <span className={`save-state ${failed ? "is-failed" : ""}`}>{loading ? `Loading ${appName}…` : failed ? `${appName} unavailable` : ""}</span>
      <div className="editor-actions">
        <button type="button" className="button subtle" onClick={onReload}><RefreshCw size={15} strokeWidth={1.8} />Reload</button>
        <button type="button" className="button subtle" onClick={onExternal}><ExternalLink size={15} strokeWidth={1.8} />Open in browser</button>
        <IconButton className="close" label="Hide Notebook" onClick={onHide}><X size={18} strokeWidth={1.8} /></IconButton>
      </div>
    </header>
    {failed
      ? <div className="service-body"><EmptyState title={`${appName} could not load`} body={status.message || errorHint} action={<div className="button-row"><button type="button" className="button" onClick={onReload}><RotateCcw size={15} strokeWidth={1.8} />Try again</button><button type="button" className="button subtle" onClick={onExternal}>Open {appName} in your browser</button></div>} /></div>
      : preview && !loading
        ? <Preview />
        : <div className="service-body" aria-live="polite"><EmptyState title={loading ? `Connecting to ${appName}…` : `${appName} is open`} body={loading ? "The service is loading in this window." : "This window is showing the live service."} /></div>}
  </main>;
}

// Browser-preview stand-ins. In Electron the real service renders in a sandboxed view above this.
function ServicePreview({ name }) {
  return <div className="service-body"><EmptyState title={`${name} preview`} body={`The real ${name} window only exists in the desktop app. This placeholder keeps the browser preview honest.`} /></div>;
}
const MailPreview = () => <ServicePreview name="Gmail" />;
const NotionPreview = () => <ServicePreview name="Notion" />;
const TwitterPreview = () => <ServicePreview name="Twitter" />;

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
  return <aside className="settings" aria-label="Local compressor">
    <header><h2>Compressor</h2><IconButton className="close" label="Close compressor" onClick={onClose}><X size={18} strokeWidth={1.8} /></IconButton></header>
    <div className="settings-scroll">
      <section>
        <h3><Shrink size={15} strokeWidth={1.8} />{status === "ready" ? "Ready" : status === "working" ? "Compressing…" : status === "checking" ? "Checking…" : "Offline"}</h3>
        <p className="settings-copy">Shortens the open note using the local LLMLingua service. Your original note is never changed.</p>
        {message && <p className="settings-message" role="status">{message}</p>}
        {status === "offline"
          ? <button type="button" className="button" onClick={start}>Start compressor</button>
          : <button type="button" className="button primary" onClick={compress} disabled={status === "working" || status === "starting"}>Compress this note</button>}
      </section>
      {result && <section>
        <h3>Result</h3>
        <p className="settings-copy">{result.origin_tokens} → {result.compressed_tokens} tokens · {result.ratio}</p>
        <textarea className="compressor-result" value={result.compressed_prompt} readOnly aria-label="Compressed note" />
        <button type="button" className="button" onClick={async () => { try { await api.clipboard.writeText(result.compressed_prompt); } catch { setMessage("Could not copy. Select the text and copy it normally."); } }}><Copy size={15} strokeWidth={1.8} />Copy</button>
      </section>}
    </div>
  </aside>;
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <main className="app-error"><strong>Notebook hit a screen error.</strong><span>Your notes are still saved locally.</span><button type="button" className="button primary" onClick={() => location.reload()}>Reload Notebook</button></main>;
    return this.props.children;
  }
}

function hashRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: VIEWS.find((entry) => entry.route === parts[0])?.id || "daily", id: parts[1] || null };
}
function hashView() { return hashRoute().view; }

function App() {
  const [view, setView] = useState(hashView);
  const [notes, setNotes] = useState([]);
  const [notebooks, setNotebooks] = useState([]);
  const [activeNotebookId, setActiveNotebookId] = useState("inbox");
  const [current, setCurrent] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [skills, setSkills] = useState([]);
  const [currentSkill, setCurrentSkill] = useState(null);
  const [slashCommands, setSlashCommands] = useState([]);
  const [currentSlashCommand, setCurrentSlashCommand] = useState(null);
  const [bots, setBots] = useState([]);
  const [mcpServers, setMcpServers] = useState([]);
  const [currentBotId, setCurrentBotId] = useState(null);
  const [currentMcpId, setCurrentMcpId] = useState(null);
  const [mailStatus, setMailStatus] = useState({ status: "idle", message: "" });
  const [notionStatus, setNotionStatus] = useState({ status: "idle", message: "" });
  const [twitterStatus, setTwitterStatus] = useState({ status: "idle", message: "" });
  const [compressOpen, setCompressOpen] = useState(false);
  // Services stay loaded and signed in for the session once opened; the view is only detached.
  const [loadedServices, setLoadedServices] = useState(() => new Set());
  const [daily, setDaily] = useState(null);
  const [dailyMonth, setDailyMonth] = useState({ month: dateKey().slice(0, 7), days: [] });
  const [dailyStatus, setDailyStatus] = useState("Loading…");
  const [midnightTick, setMidnightTick] = useState(0);
  const dailyDateRef = useRef(dateKey());
  const dailyMonthRef = useRef(dateKey().slice(0, 7));
  const [saveState, setSaveState] = useState("Loading…");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [backups, setBackups] = useState([]);
  const [dataLocation, setDataLocation] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [appSettings, setAppSettings] = useState({ theme: "system", startAtLogin: true, hotkey: "Control+Alt+Shift+N" });
  const [githubCloud, setGithubCloud] = useState(null);
  const [githubCloudBusy, setGithubCloudBusy] = useState("");
  const [closing, setClosing] = useState(false);
  const [showTick, setShowTick] = useState(0);
  const [editorMode, setEditorMode] = useState("write");
  const [notebookEditor, setNotebookEditor] = useState(null);
  const [appVersion, setAppVersion] = useState("");
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
    const [list, savedSkills, savedSlashCommands, savedNotebooks, savedBots, savedMcpServers, version, saved] = await Promise.all([api.notes.list(), api.skills.list(), api.slashCommands.list(), api.folders.list(), api.bots.list({ includeArchived: true }), api.mcpServers.list(), api.settings.version(), api.settings.get()]);
    setBots(savedBots);
    setMcpServers(savedMcpServers);
    const inboxId = savedNotebooks.find((notebook) => notebook.is_inbox)?.id || "inbox";
    setNotes(list);
    setSkills(savedSkills);
    setSlashCommands(savedSlashCommands);
    setNotebooks(savedNotebooks);
    setAppVersion(version);
    if (saved) setAppSettings((value) => ({ ...value, ...saved }));
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

  async function readDaily(date = dailyDateRef.current, month = dailyMonthRef.current) {
    const [page, calendar] = await Promise.all([api.daily.page(date), api.daily.month(month)]);
    dailyDateRef.current = page.date;
    dailyMonthRef.current = calendar.month;
    setDaily(page);
    setDailyMonth(calendar);
    return page;
  }
  async function loadDaily(date = dailyDateRef.current) {
    setDailyStatus("Loading…");
    try { await readDaily(date, monthOf(date)); setDailyStatus("Saved"); }
    catch { setDailyStatus("Could not load daily page"); }
  }
  function selectDailyDate(date) {
    dailyDateRef.current = date;
    loadDaily(date);
  }
  function selectDailyMonth(month) {
    dailyMonthRef.current = month;
    api.daily.month(month).then(setDailyMonth).catch(() => setDailyStatus("Could not load the calendar"));
  }

  useEffect(() => {
    load().catch(() => setSaveState("Could not load notes"));
    api.onNewInboxNote(() => createNote("inbox"));
    api.onFocusEditor(() => setTimeout(() => editorRef.current?.focus(), 0));
    api.onFlushEditor(flushOpenEditors);
    api.onOverlayHiding(() => {
      setClosing(true);
      if (SERVICE_IDS.has(viewRef.current)) { api[viewRef.current].hide().catch(() => {}); setView(previousViewRef.current); }
    });
    api.onOverlayShown(() => { setClosing(false); setShowTick((tick) => tick + 1); loadDaily(); });
    const onHashChange = () => { const route = hashRoute(); setView(route.view); if (route.view === "bots") setCurrentBotId(route.id); if (route.view === "mcp-servers") setCurrentMcpId(route.id); };
    addEventListener("hashchange", onHashChange);
    const stopBotStatus = api.bots.onStatus?.((update) => { if (update?.bot?.id) setBots((items) => items.map((item) => item.id === update.bot.id ? update.bot : item)); });
    const stopServiceEvents = [
      api.onOpenMail?.(() => openService("mail")),
      api.onMailStatus?.((next) => setMailStatus(next && typeof next.status === "string" ? next : { status: "error", message: "Gmail returned an invalid status." })),
      api.onOpenNotion?.(() => openService("notion")),
      api.onNotionStatus?.((next) => setNotionStatus(next && typeof next.status === "string" ? next : { status: "error", message: "Notion returned an invalid status." })),
      api.onOpenTwitter?.(() => openService("twitter")),
      api.onTwitterStatus?.((next) => setTwitterStatus(next && typeof next.status === "string" ? next : { status: "error", message: "Twitter returned an invalid status." })),
    ];
    return () => { stopBotStatus?.(); stopServiceEvents.forEach((stop) => stop?.()); removeEventListener("hashchange", onHashChange); clearTimeout(saveTimer.current); clearTimeout(skillSaveTimer.current); clearTimeout(slashCommandSaveTimer.current); clearTimeout(noticeTimer.current); };
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = appSettings.theme === "dark" || (appSettings.theme === "system" && media?.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    media?.addEventListener?.("change", apply);
    return () => media?.removeEventListener?.("change", apply);
  }, [appSettings.theme]);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const surface = surfaceRef.current;
    if (!surface?.animate) return undefined;
    const animation = surface.animate(
      [
        { opacity: 0, transform: "translateY(24px) scale(0.975)" },
        { opacity: 1, offset: 0.7 },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
      { duration: 280, easing: "cubic-bezier(0.22, 1.15, 0.36, 1)" }
    );
    return () => animation.cancel();
  }, [showTick]);

  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { currentSkillRef.current = currentSkill; }, [currentSkill]);
  useEffect(() => { currentSlashCommandRef.current = currentSlashCommand; }, [currentSlashCommand]);
  useEffect(() => { viewRef.current = view; if (!SERVICE_IDS.has(view)) previousViewRef.current = view; }, [view]);

  useEffect(() => {
    const handleKeys = (event) => {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName);
      const inEditor = event.target === editorRef.current;
      if ((event.ctrlKey || event.metaKey) && inEditor && ["b", "i", "k"].includes(event.key.toLowerCase())) {
        event.preventDefault();
        formatSelection({ b: "bold", i: "italic", k: "link" }[event.key.toLowerCase()]);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") { event.preventDefault(); createForView(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "e" && viewRef.current === "notes") { event.preventDefault(); setEditorMode((mode) => mode === "write" ? "read" : "write"); return; }
      if ((event.ctrlKey || event.metaKey) && /^[1-4]$/.test(event.key)) { event.preventDefault(); selectView(VIEWS[Number(event.key) - 1].id); return; }
      if (event.key === "/" && !typing) { event.preventDefault(); searchRef.current?.focus(); return; }
      if (event.key === "Escape") {
        if (settingsOpen) { setSettingsOpen(false); return; }
        if (searchQuery) { setSearchQuery(""); searchRef.current?.blur(); return; }
        if (!typing) api.window.hide();
      }
    };
    document.addEventListener("keydown", handleKeys);
    return () => document.removeEventListener("keydown", handleKeys);
  }, [searchQuery, settingsOpen, activeNotebookId, notebooks]);

  const serviceStatus = { mail: mailStatus, notion: notionStatus, twitter: twitterStatus };
  const setServiceStatus = { mail: setMailStatus, notion: setNotionStatus, twitter: setTwitterStatus };
  async function openService(id) {
    flushOpenEditors();
    if (!SERVICE_IDS.has(viewRef.current)) previousViewRef.current = viewRef.current;
    setCompressOpen(false); setSettingsOpen(false); setSearchQuery("");
    setServiceStatus[id]({ status: loadedServices.has(id) ? "ready" : "loading", message: "" });
    setView(id);
    try {
      const next = await api[id].show();
      if (next?.status) setServiceStatus[id](next);
      setLoadedServices((current) => current.has(id) ? current : new Set(current).add(id));
    }
    catch { setServiceStatus[id]({ status: "error", message: "This service could not open." }); }
  }
  async function closeService(id) { await api[id].hide().catch(() => {}); setView(previousViewRef.current); }
  async function reloadService(id) {
    setServiceStatus[id]({ status: "loading", message: "" });
    try { await api[id].reload(); }
    catch { setServiceStatus[id]({ status: "error", message: "This service could not reload." }); }
  }
  async function reloadBots() { const saved = await api.bots.list({ includeArchived: true }); setBots(saved); return saved; }
  async function reloadNotes() { const saved = await api.notes.list(); setNotes(saved); return saved; }
  async function reloadMcpServers() { const saved = await api.mcpServers.list(); setMcpServers(saved); return saved; }
  function openBot(id) { setCurrentBotId(id || null); setView("bots"); setSearchQuery(""); setCompressOpen(false); location.hash = id ? `/bots/${id}` : "/bots"; }
  function openMcp(serverOrId) {
    const id = typeof serverOrId === "string" ? serverOrId : serverOrId?.id;
    setCurrentMcpId(id || null); setView("mcp-servers"); setSearchQuery(""); setCompressOpen(false);
    location.hash = id ? `/mcp-servers/${id}` : "/mcp-servers";
  }

  function flushOpenEditors() {
    if (currentRef.current) saveNow(currentRef.current);
    if (currentSkillRef.current) saveSkillNow(currentSkillRef.current);
    if (currentSlashCommandRef.current) saveSlashCommandNow(currentSlashCommandRef.current);
  }

  async function createNote(folderId) {
    const inboxId = notebooks.find((notebook) => notebook.is_inbox)?.id || "inbox";
    const destination = folderId || (activeNotebookId === "all" ? inboxId : activeNotebookId);
    try {
      const note = await api.notes.create({ title: "", body: "", folderId: destination });
      setNotes((items) => [note, ...items]);
      setActiveNotebookId(destination);
      setCurrent(note);
      selectView("notes");
      setEditorMode("write");
      setSaveState("Saved");
      setTimeout(() => editorRef.current?.focus(), 0);
    } catch { setSaveState("Could not create note"); }
  }

  async function createSkill() {
    try {
      const skill = await api.skills.create({ name: "", category: "Unsorted", body: "" });
      setSkills((items) => [skill, ...items]);
      setCurrentSkill(skill);
      selectView("skills");
      setSaveState("Saved");
    } catch { setSaveState("Could not create skill"); }
  }

  async function createSlashCommand() {
    try {
      const item = await api.slashCommands.create({ name: "", command: "", body: "" });
      setSlashCommands((items) => [item, ...items]);
      setCurrentSlashCommand(item);
      selectView("commands");
      setSaveState("Saved");
    } catch { setSaveState("Could not create command"); }
  }

  function createForView() {
    if (viewRef.current === "skills") return createSkill();
    if (viewRef.current === "commands") return createSlashCommand();
    return createNote();
  }

  useEffect(() => {
    const startedOn = dateKey();
    const midnight = new Date();
    midnight.setHours(24, 0, 2, 0);
    const timer = setTimeout(() => {
      const today = dateKey();
      loadDaily(dailyDateRef.current === startedOn ? today : dailyDateRef.current);
      setMidnightTick((tick) => tick + 1);
    }, Math.max(1_000, midnight.getTime() - Date.now()));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [midnightTick]);

  async function runDailyAction(action) {
    setDailyStatus("Saving…");
    try {
      await action();
      await readDaily();
      setDailyStatus("Saved");
      return true;
    } catch {
      try { await readDaily(); } catch { /* Keep the last visible state. */ }
      setDailyStatus("Could not save this page");
      return false;
    }
  }
  const addDailyTask = (text, bucket = "today") => runDailyAction(() => api.daily.create({ text, bucket }, dailyDateRef.current));
  const toggleDailyTask = (id, completed) => runDailyAction(() => api.daily.complete(id, completed, dailyDateRef.current));
  const saveDailyTask = (task) => runDailyAction(() => api.daily.update(task.id, { text: task.text }, dailyDateRef.current));
  const moveDailyTask = (id, bucket) => runDailyAction(() => api.daily.update(id, { bucket }, dailyDateRef.current));
  const removeDailyTask = (id) => runDailyAction(() => api.daily.remove(id, dailyDateRef.current));
  function editDailyTaskLocal(id, text) {
    const edit = (task) => task.id === id ? { ...task, text } : task;
    setDaily((value) => value ? { ...value, items: value.items.map(edit), tomorrow: value.tomorrow.map(edit) } : value);
  }

  async function saveNow(note) {
    clearTimeout(saveTimer.current);
    setSaveState("Saving…");
    try {
      const saved = await api.notes.update(note.id, { title: note.title, body: note.body, folderId: note.folder_id, pinned: Boolean(note.pinned) });
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
  function togglePin() {
    if (!current) return;
    const next = { ...current, pinned: !current.pinned, updated_at: new Date().toISOString() };
    setCurrent(next);
    setNotes((items) => items.map((item) => item.id === next.id ? next : item));
    saveNow(next);
    showSaveNotice(next.pinned ? "Pinned" : "Unpinned");
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
  async function toggleSkillStar(skill) {
    try {
      const saved = await api.skills.update(skill.id, { pinned: !skill.pinned });
      setSkills((items) => items.map((item) => item.id === saved.id ? saved : item));
      setCurrentSkill((item) => item?.id === saved.id ? saved : item);
      showSaveNotice(saved.pinned ? "Starred" : "Star removed");
    } catch { setSaveState("Save failed"); }
  }
  function editSkill(patch) {
    if (!currentSkill) return;
    const next = { ...currentSkill, ...patch, updated_at: new Date().toISOString() };
    setCurrentSkill(next);
    setSkills((items) => items.map((item) => item.id === next.id ? next : item));
    clearTimeout(skillSaveTimer.current);
    setSaveState("Saving…");
    skillSaveTimer.current = setTimeout(() => saveSkillNow(next), 280);
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
  function editSlashCommand(patch) {
    if (!currentSlashCommand) return;
    const next = { ...currentSlashCommand, ...patch, updated_at: new Date().toISOString() };
    setCurrentSlashCommand(next);
    setSlashCommands((items) => items.map((item) => item.id === next.id ? next : item));
    clearTimeout(slashCommandSaveTimer.current);
    setSaveState("Saving…");
    slashCommandSaveTimer.current = setTimeout(() => saveSlashCommandNow(next), 280);
  }

  async function remove(note) {
    if (!window.confirm(`Move “${noteName(note)}” to Trash?`)) return;
    await api.notes.trash(note.id);
    const remaining = notes.filter((item) => item.id !== note.id);
    setNotes(remaining);
    setCurrent(remaining.find((item) => activeNotebookId === "all" || item.folder_id === activeNotebookId) || null);
    if (!remaining.length) await createNote();
  }
  async function removeSkill(skill) {
    if (!window.confirm(`Delete “${skillName(skill)}”?`)) return;
    await api.skills.remove(skill.id);
    const remaining = skills.filter((item) => item.id !== skill.id);
    setSkills(remaining); setCurrentSkill(remaining[0] || null);
  }
  async function removeSlashCommand(item) {
    if (!window.confirm(`Delete “${slashCommandName(item)}”?`)) return;
    await api.slashCommands.remove(item.id);
    const remaining = slashCommands.filter((entry) => entry.id !== item.id);
    setSlashCommands(remaining); setCurrentSlashCommand(remaining[0] || null);
  }

  function openNotebook(id) {
    setActiveNotebookId(id);
    setCurrent(notes.find((note) => !note.deleted_at && (id === "all" || note.folder_id === id)) || null);
    setEditorMode("write");
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
  async function deleteNotebook() {
    const notebook = notebooks.find((item) => item.id === activeNotebookId);
    if (!notebook || notebook.is_inbox) return;
    if (!window.confirm(`Delete notebook “${notebook.name}”? Its notes move to Inbox.`)) return;
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

  async function openSettings() {
    setSettingsOpen(true); setSettingsMessage("");
    try {
      const [savedBackups, location, cloud, saved] = await Promise.all([api.backups.list(), api.settings.dataLocation(), api.githubSync.status(), api.settings.get()]);
      setBackups(savedBackups); setDataLocation(location); setGithubCloud(cloud);
      if (saved) setAppSettings((value) => ({ ...value, ...saved }));
    } catch { setSettingsMessage("Could not load settings information."); }
  }
  async function updateSettings(patch) {
    const previous = appSettings;
    setAppSettings((value) => ({ ...value, ...patch }));
    try { const next = await api.settings.set(patch); if (next) setAppSettings((value) => ({ ...value, ...next })); }
    catch (error) { setAppSettings(previous); setSettingsMessage(error.message || "Could not save that setting."); }
  }
  async function connectGithubCloud() {
    setGithubCloudBusy("connect"); setSettingsMessage("Opening secure GitHub sign-in…");
    try { await api.githubSync.signIn(); const cloud = await api.githubSync.status(); setGithubCloud(cloud); setSettingsMessage(`Connected as @${cloud.login}.`); }
    catch (error) { setSettingsMessage(error.message || "GitHub sign-in failed."); }
    finally { setGithubCloudBusy(""); }
  }
  async function configureGithubCloud(input) {
    setGithubCloudBusy("configure"); setSettingsMessage("Saving cloud repository…");
    try { const cloud = await api.githubSync.configure(input); setGithubCloud(cloud); setSettingsMessage("Cloud repository saved."); }
    catch (error) { setSettingsMessage(error.message || "Could not configure cloud backup."); }
    finally { setGithubCloudBusy(""); }
  }
  async function pushGithubCloud(input) {
    setGithubCloudBusy("push"); setSettingsMessage("Uploading to GitHub…");
    try { const cloud = await api.githubSync.push(input); setGithubCloud(cloud); setSettingsMessage(cloud.changed ? "Uploaded this Notebook to GitHub." : "GitHub already has the current data."); }
    catch (error) { setSettingsMessage(error.message || "GitHub upload failed."); }
    finally { setGithubCloudBusy(""); }
  }
  async function pullGithubCloud(input) {
    if (!window.confirm("Replace this computer’s Notebook data with the GitHub copy? A local safety backup is made first.")) return;
    setGithubCloudBusy("pull"); setSettingsMessage("Downloading and restoring GitHub data…");
    try { await api.githubSync.pull(input); setSettingsMessage("Downloaded. Reloading Notebook…"); window.location.reload(); }
    catch (error) { setSettingsMessage(error.message || "GitHub download failed."); setGithubCloudBusy(""); }
  }
  async function makeBackup() {
    setSettingsMessage("Creating backup…");
    try { const backup = await api.backups.create(); setBackups((items) => [backup, ...items]); setSettingsMessage("Backup created."); }
    catch { setSettingsMessage("Could not create backup."); }
  }
  async function restoreBackup(backup) {
    if (!window.confirm(`Replace your current notes with the backup from ${fullTime(backup.createdAt)}? A safety backup is made first.`)) return;
    setSettingsMessage("Restoring…");
    try {
      // Desktop returns { notes, skills, slashCommands }; the browser mock returns a notes array.
      const restored = await api.backups.restore(backup.name);
      const restoredNotes = Array.isArray(restored) ? restored : restored.notes;
      const restoredSkills = Array.isArray(restored) ? null : restored.skills;
      const restoredSlashCommands = Array.isArray(restored) ? null : restored.slashCommands;
      const restoredNotebooks = await api.folders.list();
      const inboxId = restoredNotebooks.find((notebook) => notebook.is_inbox)?.id || "inbox";
      setNotebooks(restoredNotebooks); setActiveNotebookId(inboxId);
      setNotes(restoredNotes.filter((note) => !note.deleted_at));
      setCurrent(restoredNotes.find((note) => !note.deleted_at && note.folder_id === inboxId) || restoredNotes.find((note) => !note.deleted_at) || null);
      if (restoredSkills) { setSkills(restoredSkills); setCurrentSkill(restoredSkills[0] || null); }
      if (restoredSlashCommands) { setSlashCommands(restoredSlashCommands); setCurrentSlashCommand(restoredSlashCommands[0] || null); }
      await loadDaily();
      setSettingsMessage("Backup restored.");
    } catch { setSettingsMessage("Could not restore that backup."); }
  }
  async function exportNotes(format) {
    try { const result = await api.settings.export(format); setSettingsMessage(result?.canceled ? "Export cancelled." : "Export saved."); }
    catch { setSettingsMessage("Could not export notes."); }
  }

  function showSaveNotice(message, duration = 1100) {
    clearTimeout(noticeTimer.current);
    setSaveState(message);
    noticeTimer.current = setTimeout(() => setSaveState("Saved"), duration);
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
  async function copyDragTarget(kind) {
    if (!current || !(current.body?.trim() || current.title?.trim())) return setSaveState("Nothing to share");
    try {
      const filePath = await api.notes.dragFile({ id: current.id, title: current.title, body: current.body });
      const value = kind === "path" ? `"${filePath}"` : filePath.split(/[\\/]/).pop();
      await api.clipboard.writeText(value);
      showSaveNotice(kind === "path" ? "Path copied" : "Filename copied", 1400);
    } catch { setSaveState("Could not create .md"); }
  }

  function formatSelection(action) {
    if (!current) return;
    const editor = editorRef.current;
    const body = current.body || "";
    const from = editor ? editor.selectionStart : body.length;
    const to = editor ? editor.selectionEnd : body.length;
    const result = applyMarkdownFormat(body, from, to, action);
    setEditorMode("write");
    edit({ body: result.body });
    requestAnimationFrame(() => { editorRef.current?.focus(); editorRef.current?.setSelectionRange(result.start, result.end); });
  }

  async function openInGoogleDocs() {
    if (!current || !(current.body?.trim() || current.title?.trim())) return setSaveState("Nothing to send");
    try {
      const html = markdownToHtml(current.body || "", current.title || "");
      const text = markdownToText(current.body || "", current.title || "");
      if (api.clipboard.writeRich) await api.clipboard.writeRich({ text, html });
      else await api.clipboard.writeText(text);
      if (api.googleDocs?.create) await api.googleDocs.create();
      showSaveNotice("Copied — paste into the new Google Doc", 3200);
    } catch { setSaveState("Could not open Google Docs"); }
  }

  function addTodo() {
    if (!current) return;
    const body = current.body || "";
    const editor = editorRef.current;
    const start = editorMode === "write" && editor ? editor.selectionStart : body.length;
    const end = editorMode === "write" && editor ? editor.selectionEnd : body.length;
    const selected = body.slice(start, end);
    const insertion = selected
      ? selected.split("\n").map((line) => /^\s*[-*]\s+\[[ xX]]/.test(line) ? line : `- [ ] ${line}`).join("\n")
      : `${start > 0 && body[start - 1] !== "\n" ? "\n" : ""}- [ ] `;
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

  function selectView(nextView) {
    setView(nextView);
    const route = VIEWS.find((entry) => entry.id === nextView)?.route;
    if (route) location.hash = `/${route}`;
    setSearchQuery("");
    setCompressOpen(false);
    if (nextView === "daily") loadDaily();
  }
  function openSearchNote(note) { setCurrent(note); setActiveNotebookId(note.folder_id); selectView("notes"); }
  function openSearchSkill(skill) { setCurrentSkill(skill); selectView("skills"); }
  function openSearchCommand(item) { setCurrentSlashCommand(item); selectView("commands"); }

  const visibleNotes = useMemo(() => notes
    .filter((note) => !note.deleted_at && (activeNotebookId === "all" || note.folder_id === activeNotebookId))
    .sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) || new Date(right.updated_at) - new Date(left.updated_at)),
  [notes, activeNotebookId]);
  const activeNotebook = notebooks.find((notebook) => notebook.id === activeNotebookId);
  const skillEditorCategories = [...new Set(skills.map((skill) => skill.category?.trim() || "Unsorted"))].sort((left, right) => left.localeCompare(right));
  const todayCounts = dailyMonth.days.find((day) => day.date === dateKey());
  const counts = {
    daily: todayCounts ? Math.max(0, todayCounts.total - todayCounts.done) : 0,
    notes: notes.filter((note) => !note.deleted_at).length,
    skills: skills.length,
    commands: slashCommands.length,
    projects: null,
    bots: bots.filter((bot) => !bot.archivedAt).length,
    "mcp-servers": mcpServers.length,
  };

  const service = SERVICES.find((entry) => entry.id === view);
  if (service) return <div className={`window-surface ${closing ? "is-closing" : ""}`} ref={surfaceRef}>
    <ServiceScreen
      appName={service.label}
      activeId={service.id}
      loadedServices={loadedServices}
      onSwitch={openService}
      status={serviceStatus[service.id]}
      preview={!window.hushnote}
      Preview={service.id === "mail" ? MailPreview : service.id === "notion" ? NotionPreview : TwitterPreview}
      errorHint="Check your connection. The service may also block sign-in inside embedded windows."
      onBack={() => closeService(service.id)}
      onReload={() => reloadService(service.id)}
      onExternal={() => api[service.id].openExternal()}
      onHide={() => api.window.hide()}
    />
  </div>;
  return <div className={`window-surface ${closing ? "is-closing" : ""}`} ref={surfaceRef}><main className="notebook">
    <aside className="sidebar" aria-label="Notebook navigation">
      <div className="sidebar-top">
        <div className="wordmark"><img src={notebookIconUrl} alt="" /><strong>Notebook</strong></div>
        <div className="sidebar-top-actions">
          {LIBRARY_VIEWS.has(view) && <IconButton label={NEW_LABEL[view]} onClick={createForView}><Plus size={18} strokeWidth={2} /></IconButton>}
          <IconButton label="Settings and backups" onClick={openSettings}><Settings size={17} strokeWidth={1.8} /></IconButton>
        </div>
      </div>

      <label className="search"><Search size={15} strokeWidth={1.8} aria-hidden="true" /><input ref={searchRef} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search everything" aria-label="Search everything" /><kbd>Ctrl K</kbd></label>

      <nav className="nav" aria-label="Pages">
        {VIEWS.map(({ id, label, Icon, group }, index) => <React.Fragment key={id}>
          {group && VIEWS[index - 1]?.group !== group && <span className="nav-heading">{group}</span>}
          <button type="button" className={view === id && !searchQuery ? "is-active" : ""} aria-current={view === id ? "page" : undefined} onClick={() => id === "bots" ? openBot(null) : id === "mcp-servers" ? openMcp(null) : selectView(id)}>
            <Icon size={16} strokeWidth={1.8} aria-hidden="true" /><strong>{label}</strong><small>{counts[id] ?? ""}</small>
          </button>
        </React.Fragment>)}
        <span className="nav-heading">Apps</span>
        {SERVICES.map(({ id, label, brand, tone, hotkey }) => <button type="button" key={id} className={view === id ? "is-active" : ""} title={`${label} · ${hotkey}`} onClick={() => openService(id)}>
          <BrandIcon icon={brand} className={`brand-${tone}`} size={16} />
          <strong>{label}</strong>
          {loadedServices.has(id) ? <small className="nav-loaded" title={`${label} is loaded and signed in`}>●</small> : <ExternalLink className="nav-external" size={13} strokeWidth={1.8} aria-hidden="true" />}
        </button>)}
      </nav>

      <div className="sidebar-body">
        {searchQuery.trim() ? <SearchResults query={searchQuery} notes={notes} skills={skills} slashCommands={slashCommands} daily={daily} onOpenNote={openSearchNote} onOpenSkill={openSearchSkill} onOpenCommand={openSearchCommand} onOpenTask={() => selectView("daily")} />
          : view === "notes" ? <>
            <div className="picker">
              <select value={activeNotebookId} onChange={(event) => openNotebook(event.target.value)} aria-label="Current notebook">
                <option value="all">All notes</option>
                {notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.name} ({notes.filter((note) => !note.deleted_at && note.folder_id === notebook.id).length})</option>)}
              </select>
              <IconButton label="New notebook" onClick={() => setNotebookEditor({ mode: "create", value: "" })}><Plus size={15} strokeWidth={2} /></IconButton>
              {activeNotebook && !activeNotebook.is_inbox && <IconButton label={`Delete notebook ${activeNotebook.name}`} onClick={deleteNotebook}><Trash2 size={14} strokeWidth={1.8} /></IconButton>}
            </div>
            {notebookEditor && <form className="picker-form" onSubmit={submitNotebook}>
              <input autoFocus value={notebookEditor.value} onChange={(event) => setNotebookEditor({ ...notebookEditor, value: event.target.value })} placeholder="Notebook name" aria-label="Notebook name" />
              <button type="submit" className="button subtle">Create</button>
              <IconButton label="Cancel new notebook" onClick={() => setNotebookEditor(null)}><X size={15} strokeWidth={1.8} /></IconButton>
            </form>}
            <NotesList notes={visibleNotes} currentId={current?.id} onSelect={(note) => { setCurrent(note); setEditorMode("write"); }} onRemove={remove} onCreate={() => createNote()} />
          </>
            : view === "skills" ? null
              : view === "commands" ? <SlashCommandList items={slashCommands} currentId={currentSlashCommand?.id} onSelect={setCurrentSlashCommand} onRemove={removeSlashCommand} onCreate={createSlashCommand} />
                : view === "bots" ? <BotSidebar bots={bots} currentId={currentBotId} onSelect={openBot} />
                  : view === "mcp-servers" ? <McpSidebar servers={mcpServers} currentId={currentMcpId} onSelect={openMcp} />
                    : view === "projects" ? null
                      : <DailySidebar page={daily} month={dailyMonth.month} days={dailyMonth.days} status={dailyStatus} onSelectDate={selectDailyDate} onMonth={selectDailyMonth} />}
      </div>
    </aside>

    {view === "notes" ? <NotePage
      note={current}
      notebooks={notebooks}
      notebookName={notebooks.find((notebook) => notebook.id === current?.folder_id)?.name || activeNotebook?.name}
      status={saveState}
      mode={editorMode}
      onMode={setEditorMode}
      onEdit={edit}
      onSave={saveNow}
      onCopy={copyCurrent}
      onCopyPath={copyDragTarget}
      onCompress={() => setCompressOpen(true)}
      onFormat={formatSelection}
      onGoogleDoc={openInGoogleDocs}
      onDrag={dragCurrent}
      onDragEnd={() => showSaveNotice("Drag finished", 900)}
      onTogglePin={togglePin}
      onMove={moveCurrentTo}
      onRemove={remove}
      onAddTodo={addTodo}
      onToggleTodo={toggleTodo}
      onCreate={() => createNote()}
      onHide={() => api.window.hide()}
      editorRef={editorRef}
    /> : view === "projects" ? <ProjectsPage api={api.projects} skills={skills} commands={slashCommands} onHide={() => api.window.hide()} />
      : view === "bots" ? <BotsWorkspace api={api} bots={bots} mcpServers={mcpServers} skills={skills} notes={notes} currentId={currentBotId} onCurrent={openBot} onBotsChange={reloadBots} onNotesChange={reloadNotes} onOpenNote={openSearchNote} onOpenSkill={openSearchSkill} onOpenMcp={openMcp} onHide={() => api.window.hide()} />
      : view === "mcp-servers" ? <McpServersWorkspace api={api} servers={mcpServers} bots={bots} currentId={currentMcpId} onCurrent={openMcp} onServersChange={reloadMcpServers} onOpenBot={openBot} onHide={() => api.window.hide()} />
      : view === "skills" ? <SkillsWorkspace skills={skills} current={currentSkill} status={saveState} editorCategories={skillEditorCategories} onSelect={setCurrentSkill} onEdit={editSkill} onSave={saveSkillNow} onCopy={copySkill} onRemove={removeSkill} onCreate={createSkill} onTogglePin={toggleSkillStar} onHide={() => api.window.hide()} />
      : view === "commands" ? <CommandPage item={currentSlashCommand} status={saveState} onEdit={editSlashCommand} onSave={saveSlashCommandNow} onCopy={copySlashCommand} onRemove={removeSlashCommand} onCreate={createSlashCommand} onHide={() => api.window.hide()} />
        : <TodayPage page={daily} status={dailyStatus} onSelectDate={selectDailyDate} onAdd={addDailyTask} onToggle={toggleDailyTask} onLocalEdit={editDailyTaskLocal} onSave={saveDailyTask} onMove={moveDailyTask} onRemove={removeDailyTask} onHide={() => api.window.hide()} onRetry={() => loadDaily()} />}

    {view === "notes" && compressOpen && <Compressor note={current} onClose={() => setCompressOpen(false)} />}
    {settingsOpen && <SettingsPanel
      backups={backups}
      message={settingsMessage}
      dataLocation={dataLocation}
      appVersion={appVersion}
      settings={appSettings}
      github={githubCloud}
      githubBusy={githubCloudBusy}
      onTheme={(theme) => updateSettings({ theme })}
      onStartAtLogin={(startAtLogin) => updateSettings({ startAtLogin })}
      onGithubConnect={connectGithubCloud}
      onGithubConfigure={configureGithubCloud}
      onGithubPush={pushGithubCloud}
      onGithubPull={pullGithubCloud}
      onGithubOpen={() => api.githubSync.open()}
      onClose={() => setSettingsOpen(false)}
      onBackup={makeBackup}
      onRestore={restoreBackup}
      onExport={exportNotes}
    />}
  </main></div>;
}

createRoot(document.getElementById("root")).render(<ErrorBoundary><App /></ErrorBoundary>);
