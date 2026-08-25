/*
 * Derived from FastNote's note-area / sidebar interaction model.
 * FastNote © 2024, MIT License. See THIRD_PARTY_NOTICES.md.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, ArrowRight, Bot, CalendarCheck2, Check, ChevronLeft, ChevronRight, Cloud, Copy, Ellipsis, ExternalLink, Eye, FileText, FolderGit2, GripVertical, Keyboard, Layers3, List, ListTodo, Monitor, Moon, Pencil, Pin, Plus, RefreshCw, RotateCcw, Search, Settings, Shrink, SquareTerminal, Sun, Trash2, X } from "lucide-react";
import { siDeepseek, siExcalidraw, siGmail, siGooglegemini, siNotion, siX } from "simple-icons";
import notebookIconUrl from "../../build/notebook.png";
import chatgptDarkIconUrl from "./chatgpt-dark.png";
import chatgptLightIconUrl from "./chatgpt-light.png";
import { addBrowserFileDragData } from "./drag-file.mjs";
import { cleanSkillCategory, displaySkillName } from "./skill-stack.js";
import { Markdown } from "./markdown.jsx";
import { markdownToHtml, markdownToText } from "./markdown-html.js";
import { GithubAvatar } from "./GithubAvatar.jsx";
import RichNoteEditor from "./RichNoteEditor.jsx";
import { BotsWorkspace, BotSidebar } from "./bots.jsx";
import { ProjectsPage } from "./ProjectsPage.jsx";
import { CepExtensionsPage } from "./CepExtensionsPage.jsx";
import { SkillsWorkspace } from "./skills.jsx";
import { DailyTimeline } from "./DailyTimeline.jsx";
import { clockFromMinute } from "./daily-timeline.js";
import "./styles.css";
import "./workspaces.css";
import "./skills.css";

const mockNotes = [{
  id: "preview-note",
  title: "Daily capture",
  body: "",
  folder_id: "inbox",
  pinned: false,
  archived: false,
  deleted_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}];
// The browser preview mirrors the curated library so crowded Skills states stay visible during UI work.
const mockSkillShelves = [
  ["00 · My skills", [
    ["ui-max", "Design and implement polished production interfaces."],
    ["affine-native", "Automate the native AFFiNE desktop app."],
  ]],
  ["01 · Planning", [
    ["Grill-with-docs", "Pressure-test an idea against repository documentation before planning."],
    ["To-spec", "Turn established conversation and code context into a concrete build specification."],
    ["Grilling", "Interrogate requirements, assumptions, constraints, and tradeoffs before committing."],
    ["Prototype", "Build the smallest throwaway implementation that answers one design question."],
  ]],
  ["02 · Code Format", [
    ["Improve Codebase Architecture", "Find high-leverage structural improvements without unnecessary churn."],
    ["Code Simplification", "Remove avoidable complexity while preserving behavior."],
    ["Code Review & Quality", "Review implementation quality, correctness, and maintainability."],
  ]],
  ["03 · UI", [
    ["frontend-design", "Create distinctive, production-quality interfaces instead of generic AI UI."],
    ["frontend-ui-engineering", "Apply practical frontend engineering patterns to interface work."],
    ["web-design-guidelines", "Review interfaces against modern web design and accessibility guidance."],
  ]],
  ["04 · Safety", [
    ["SecOpsAgentKit", "Security operations workflows for agent-driven projects."],
    ["AI Security Arsenal", "A focused collection of AI security tools and practices."],
    ["Superagent Security Skills", "Reusable security skills from Superagent."],
    ["Security & Hardening", "Addy Osmani's security and hardening guidance."],
    ["SkillTotal", "Track and inspect agent skill security changes."],
  ]],
  ["05 · Anti-Slop — Frontend / UI", [
    ["Impeccable", "Refine hierarchy, type, spacing, responsiveness, UX, accessibility, motion, and UI copy."],
    ["Frontend Design Principles", "Use clear principles to prevent generic frontend output."],
    ["Frontend Design 2.0", "PracticalSwan's updated frontend design workflow."],
  ]],
  ["06 · Anti-Slop — Backend / Code", [
    ["Test-Driven Development", "Build behavior through a red, green, refactor loop."],
    ["Debugging & Error Recovery", "Diagnose failures systematically and recover safely."],
  ]],
  ["07 · Anti-Slop — Text / Writing", [
    ["Anti-Slop Writing", "Remove generic AI phrasing and empty prose."],
    ["Writing Clearly & Concisely", "Write direct, precise prose without filler."],
    ["Red Pen", "Edit aggressively for clarity, precision, and economy."],
    ["Vercel Writing Guidelines", "Apply Vercel's product-writing guidance."],
  ]],
  ["08 · Caveats Testing", [
    ["Agentic QE Fleet", "Generate tests and find gaps across coverage, mutation, chaos, security, and performance."],
    ["Schemathesis", "Break APIs with schema-driven boundary, invalid, random, and stateful requests."],
    ["Continuous Claude", "Run a persistent testing and CI repair loop across large projects."],
  ]],
  ["09 · Skill Creation", [
    ["skill-creator", "Anthropic's official skill-creation meta-skill."],
    ["agent-skill-creator", "Turn workflows into packaged, cross-platform Agent Skills."],
    ["write-a-skill", "Create clean, focused skills with progressive disclosure."],
  ]],
];
const mockSkills = mockSkillShelves.flatMap(([category, items]) => items.map(([name, summary], index) => ({
  id: `skill-${name}`,
  name,
  category,
  body: `# ${name}\n\n${summary}\n\nBrowser preview; Electron loads the complete source-backed skill.`,
  source_url: category.startsWith("00") ? `https://github.com/blixvip/skills/blob/main/${name}/SKILL.md` : "https://github.com",
  ownership: category.startsWith("00") ? "mine" : "other",
  pinned: index === 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
})));
const mockBots = [];
const mockBotLinks = new Map();
const mockProjectNow = new Date().toISOString();
const mockProjectTime = (minutesAgo) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
const mockNotebookTasks = [
  { id: "project-task-settings", project_id: "project-notebook", title: "Review repository actions in Settings", description: "Keep commit, GitHub, folder, terminal, and editor actions together.", status: "todo", priority: "high", due_date: null, manual_order: 0, tags: ["ui"], created_at: mockProjectTime(90), updated_at: mockProjectTime(12) },
  { id: "project-task-narrow", project_id: "project-notebook", title: "Pressure-test the narrow project layout", description: "Check tabs, task columns, editor controls, long labels, and scrolling at 460px.", status: "in_progress", priority: "medium", due_date: null, manual_order: 1, tags: ["responsive"], created_at: mockProjectTime(75), updated_at: mockProjectTime(8) },
  { id: "project-task-blocked", project_id: "project-notebook", title: "Confirm the real Electron window", description: "Browser preview is ready; the packaged app still needs a host check.", status: "blocked", priority: "medium", due_date: null, manual_order: 2, tags: ["verification"], created_at: mockProjectTime(60), updated_at: mockProjectTime(5) },
  { id: "project-task-overview", project_id: "project-notebook", title: "Make Tasks the project landing page", description: "Remove the duplicate Overview tab without losing project actions.", status: "done", priority: "high", due_date: null, manual_order: 3, tags: ["navigation"], created_at: mockProjectTime(120), updated_at: mockProjectTime(18) },
];
const mockNotebookActivity = [
  { id: "project-activity-task", project_id: "project-notebook", kind: "task", summary: "Completed task-first project navigation", detail: "Overview was removed and Tasks became the opening section.", created_at: mockProjectTime(18) },
  { id: "project-activity-tool", project_id: "project-notebook", kind: "assignment", summary: "Attached UI Integrity", detail: "Project UI checks now include narrow, wide, and dark states.", created_at: mockProjectTime(42) },
  { id: "project-activity-commit", project_id: "project-notebook", kind: "commit", summary: "Updated project workspace", detail: "Refined the project list and detail navigation.", created_at: mockProjectTime(1500) },
];
const mockProjects = new URLSearchParams(location.search).get("projects") === "demo" ? [
  { id: "project-notebook", name: "Notebook", description: "Local-first notes, planning, and project control.", status: "active", priority: "critical", manual_rank: 0, category: "Apps", tier: 1, tier_order: 0, local_path: "C:\\code\\note-overlay", git_root: "C:\\code\\note-overlay", github_url: "https://github.com/blixvip/note-overlay", primary_language: "JavaScript", tags: ["electron"], next_action: "Finish the simplified Projects page", notes: "", push_after_commit: false, created_at: mockProjectNow, updated_at: mockProjectNow, last_worked_at: mockProjectNow, skill_ids: [], slash_command_ids: [], tasks: mockNotebookTasks, activity: mockNotebookActivity },
  { id: "project-clipforge", name: "ClipForge AI", description: "Turn long videos into captioned vertical shorts.", status: "active", priority: "high", manual_rank: 1, category: "Content", tier: 1, tier_order: 1, local_path: "C:\\code\\clipforge-ai", git_root: "C:\\code\\clipforge-ai", github_url: "https://github.com/blixvip/clipforge-ai", primary_language: "Python", tags: ["video"], next_action: "Run one clean end-to-end export", notes: "", push_after_commit: false, created_at: mockProjectNow, updated_at: mockProjectNow, last_worked_at: mockProjectNow, skill_ids: [], slash_command_ids: [], tasks: [], activity: [] },
  { id: "project-proxy", name: "Claude proxy", description: "Small local proxy for model experiments.", status: "active", priority: "none", manual_rank: 2, category: "Tools", tier: 2, tier_order: 0, local_path: "C:\\code\\claude-code-proxy", git_root: "C:\\code\\claude-code-proxy", github_url: null, primary_language: "Rust", tags: [], next_action: "Add request logging", notes: "", push_after_commit: false, created_at: mockProjectNow, updated_at: mockProjectNow, last_worked_at: mockProjectNow, skill_ids: [], slash_command_ids: [], tasks: [], activity: [] },
  { id: "project-meme", name: "Meme finder", description: "Find promising Reddit posts for review.", status: "paused", priority: "medium", manual_rank: 3, category: "Bots", tier: 3, tier_order: 0, local_path: "C:\\code\\reddit-meme-finder", git_root: "C:\\code\\reddit-meme-finder", github_url: "https://github.com/blixvip/discord-reddit-meme-bot", primary_language: "TypeScript", tags: [], next_action: "Improve duplicate detection", notes: "", push_after_commit: false, created_at: mockProjectNow, updated_at: mockProjectNow, last_worked_at: mockProjectNow, skill_ids: [], slash_command_ids: [], tasks: [], activity: [] },
] : [];
const mockCepExtensions = [
  { id: "null-motion", name: "Null Motion", group: "main", rank: 1, summary: "Biggest product, strongest long-term potential.", installed: false, sourceAvailable: true, sourcePath: "C:\\code\\null", projectId: null, logo: null, attention: null },
  { id: "buzzroll-studio", name: "Buzzroll Studio", group: "main", rank: 2, summary: "Most complete and usable today.", installed: true, sourceAvailable: true, sourcePath: "C:\\code\\buzzroll-studio", projectId: null, logo: null, attention: null },
  { id: "clipforge-ai", name: "ClipForge AI", group: "main", rank: 3, summary: "Strong automated clipping product; install needs fixing.", installed: true, sourceAvailable: true, sourcePath: "C:\\code\\clipforge-ai", projectId: "project-clipforge", logo: null, attention: "Install fix" },
  { id: "asset-board", name: "Asset Board / Kinetic Core", group: "main", rank: 4, summary: "Useful everyday Premiere toolkit.", installed: true, sourceAvailable: true, sourcePath: "C:\\live\\cep\\asset-board", projectId: null, logo: null, attention: null },
  { id: "openscreen-bridge", name: "OpenScreen Bridge", group: "secondary", rank: 1, summary: "Premiere bridge for OpenScreen control and playback workflows.", installed: true, sourceAvailable: true, sourcePath: "C:\\live\\cep\\openscreen-controller", projectId: null, logo: null, attention: null },
  { id: "youtube-uploader", name: "YouTube Uploader", group: "secondary", rank: 2, summary: "Publish finished edits to YouTube from the editing workflow.", installed: true, sourceAvailable: true, sourcePath: "C:\\code\\_ARCHIVE\\premiere-youtube-publisher", projectId: null, logo: null, attention: null },
  { id: "motion-highlighter", name: "Motion Highlighter", group: "secondary", rank: 3, summary: "Fast motion emphasis and highlight effects for Premiere timelines.", installed: true, sourceAvailable: true, sourcePath: "C:\\live\\cep\\motion-highlighter", projectId: null, logo: null, attention: null },
];
const mockSlashCommands = [
  { id: "starter-gitpush", name: "Git push", command: "/prompts:gitpush", body: "Run `/prompts:gitpush` inside the Git repository you want to publish.\n\n## What it does\nStages every change, commits with `Update project files`, then pushes the current tracking branch. It does not run checks.\n\n## Related skill\n`$gitpush`", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: "starter-command-guide", name: "Markdown, skills, and slash commands", command: "", body: "## Markdown (`.md`)\nA text-file format. It can hold instructions but is not automatically a command.\n\n## Custom prompt\nA Markdown file in `.codex/prompts`. `gitpush.md` becomes `/prompts:gitpush`.\n\n## Skill\nA folder containing `SKILL.md` and optional scripts. Invoke it with `$name`.\n\n## Slash command\nA `/` command parsed by Codex. Built-ins use top-level names; custom prompts use `/prompts:<name>`.", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];
const mockFolders = [{ id: "inbox", name: "Inbox", is_inbox: true, note_count: 0 }];
let mockSettings = { hotkey: "Control+Alt+Shift+N", startAtLogin: true, theme: "system" };
const mockNeedsBotSetup = new URLSearchParams(location.search).get("botsetup") === "missing";
let mockProvisioning = mockNeedsBotSetup ? {
  discord: { ready: false, applicationId: "", displayName: "Notebook Discord Bot", reason: "Setup needed." },
  telegram: { ready: false, managerUsername: "", displayName: "", reason: "Setup needed." },
} : {
  discord: { ready: true, applicationId: "123456789012345678", displayName: "Notebook Discord Bot", reason: "Ready." },
  telegram: { ready: true, managerUsername: "NotebookManagerBot", displayName: "Notebook Manager", reason: "Ready." },
};
let mockConnector = {
  configured: true,
  baseUrl: "https://notebook-bot-connector.example",
  reason: "",
  discord: { ready: true, connected: !mockNeedsBotSetup, applicationId: "123456789012345678", guildInstallUrl: "https://discord.com/oauth2/authorize?client_id=123456789012345678&scope=applications.commands+bot&integration_type=0&permissions=0" },
  telegram: { ready: true, connected: !mockNeedsBotSetup, managerUsername: "NotebookManagerBot" },
};
let mockTelegramAuth = mockNeedsBotSetup
  ? { status: "disconnected", configured: true, authorized: false }
  : { status: "ready", configured: true, authorized: true, user: { id: "77", username: "kai", displayName: "Kai" } };
let mockTelegramAuthPolls = 0;
const mockRunningBots = new Set();

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
let mockActivitySeed = 0;
function mockActivity(dayOffset, text, startMinute, durationMinutes) {
  mockActivitySeed += 1;
  return { id: `activity-${mockActivitySeed}`, activity_date: moveDate(mockDailyDate, dayOffset), text, start_minute: startMinute, duration_minutes: durationMinutes, created_at: mockNow, updated_at: mockNow };
}
const mockDailyActivities = new URLSearchParams(location.search).get("daily") === "demo" ? [
  mockActivity(-1, "Reviewed the rough cut", 9 * 60 + 5, 5),
  mockActivity(-1, "Wrote edit notes", 9 * 60 + 14, 1),
  mockActivity(0, "Planned the day", 8 * 60 + 30, 5),
  mockActivity(0, "Reviewed yesterday's footage", 9 * 60 + 10, 5),
  mockActivity(0, "Fixed the opening transition", 10 * 60 + 42, 1),
] : [];
function mockDailyPage(viewDate = mockDailyDate) {
  const hydrate = (task) => ({ ...task, carried: Boolean(task.carried_from_id), moved: task.status === "carried" });
  const items = mockDailyTasks.filter((task) => task.task_date === viewDate).map(hydrate);
  const tomorrowDate = moveDate(viewDate, 1);
  const activities = mockDailyActivities.filter((activity) => activity.activity_date === viewDate).sort((left, right) => left.start_minute - right.start_minute);
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
    activities,
    loggedMinutes: activities.reduce((total, activity) => total + activity.duration_minutes, 0),
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
  for (const activity of mockDailyActivities) {
    if (!activity.activity_date.startsWith(`${month}-`)) continue;
    const entry = days.get(activity.activity_date) || { date: activity.activity_date, total: 0, done: 0, activityCount: 0, loggedMinutes: 0 };
    entry.activityCount = (entry.activityCount || 0) + 1;
    entry.loggedMinutes = (entry.loggedMinutes || 0) + activity.duration_minutes;
    days.set(activity.activity_date, entry);
  }
  for (const entry of days.values()) {
    entry.activityCount ||= 0;
    entry.loggedMinutes ||= 0;
  }
  return { month, days: [...days.values()].sort((left, right) => left.date.localeCompare(right.date)) };
}

function mockAiService(id) {
  return {
    show: async () => {
      const state = new URLSearchParams(location.search).get("ai");
      if (state === `${id}-error`) return { status: "error", message: "This AI is unavailable in the preview." };
      if (state === `${id}-loading`) return { status: "loading", message: "" };
      return { status: "ready", message: "" };
    },
    hide: async () => ({ status: "ready" }),
    reload: async () => ({ status: "loading" }),
    openExternal: async () => true,
  };
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
      const skill = { id: crypto.randomUUID(), name: input.name || "", category: input.category || "Unsorted", body: input.body || "", source_url: input.sourceUrl || "", ownership: input.ownership === "other" ? "other" : "mine", pinned: Boolean(input.pinned), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
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
    openSource: async () => true,
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
    activityCreate: async (input, date = mockDailyDate) => {
      const timestamp = new Date().toISOString();
      mockDailyActivities.push({ id: crypto.randomUUID(), activity_date: date, text: input.text.trim(), start_minute: input.startMinute, duration_minutes: input.durationMinutes, created_at: timestamp, updated_at: timestamp });
      return mockDailyPage(date);
    },
    activityUpdate: async (id, input) => {
      const activity = mockDailyActivities.find((item) => item.id === id);
      if (input.text !== undefined) activity.text = input.text.trim();
      if (input.startMinute !== undefined) activity.start_minute = input.startMinute;
      if (input.durationMinutes !== undefined) activity.duration_minutes = input.durationMinutes;
      activity.updated_at = new Date().toISOString();
      return mockDailyPage(activity.activity_date);
    },
    activityRemove: async (id) => {
      const index = mockDailyActivities.findIndex((item) => item.id === id);
      const date = index >= 0 ? mockDailyActivities[index].activity_date : mockDailyDate;
      if (index >= 0) mockDailyActivities.splice(index, 1);
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
    status: async () => ({ available: true, authenticated: true, login: "blixvip", name: "blix", avatarUrl: "https://avatars.githubusercontent.com/u/247529250?v=4", url: "https://github.com/blixvip/notebook-cloud", expectedLogin: "blixvip", accountMatches: true, repository: "blixvip/notebook-cloud", visibility: "private", autoSync: true, remoteExists: true, lastSyncedAt: new Date().toISOString() }),
    signIn: async () => ({ available: true, authenticated: true, login: "blixvip", name: "blix", avatarUrl: "https://avatars.githubusercontent.com/u/247529250?v=4", accountMatches: true, repository: "blixvip/notebook-cloud", remoteExists: true }),
    configure: async () => ({ available: true, authenticated: true, login: "blixvip", name: "blix", avatarUrl: "https://avatars.githubusercontent.com/u/247529250?v=4", accountMatches: true, repository: "blixvip/notebook-cloud", remoteExists: true }),
    sync: async () => ({ available: true, authenticated: true, login: "blixvip", name: "blix", avatarUrl: "https://avatars.githubusercontent.com/u/247529250?v=4", accountMatches: true, repository: "blixvip/notebook-cloud", remoteExists: true, changed: true, lastSyncedAt: new Date().toISOString() }),
    push: async () => ({ available: true, authenticated: true, login: "blixvip", name: "blix", avatarUrl: "https://avatars.githubusercontent.com/u/247529250?v=4", accountMatches: true, repository: "blixvip/notebook-cloud", remoteExists: true, changed: true, lastSyncedAt: new Date().toISOString() }),
    pull: async () => ({ available: true, authenticated: true, login: "blixvip", name: "blix", avatarUrl: "https://avatars.githubusercontent.com/u/247529250?v=4", accountMatches: true, repository: "blixvip/notebook-cloud", remoteExists: true, remoteChanged: true, lastSyncedAt: new Date().toISOString() }),
    open: async () => true,
    onUpdated: () => () => {},
  },
  settings: {
    get: async () => ({ ...mockSettings }),
    set: async (patch) => { mockSettings = { ...mockSettings, ...patch }; return { ...mockSettings }; },
    version: async () => "0.11.0",
    export: async () => ({ filePath: "C:\\Temp\\notebook-backup.json" }),
    dataLocation: async () => "C:\\Notebook data",
  },
  bots: {
    list: async () => structuredClone(mockBots),
    get: async (id) => structuredClone(mockBots.find((bot) => bot.id === id) || null),
    create: async (input) => { const bot = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), archivedAt: null, jobs: [], connections: [], commands: [], runtime: null, derivedState: { state: "manual", reason: "No automatic monitoring is configured.", source: "Manual", observedAt: null, isStale: false }, ...structuredClone(input) }; mockBots.unshift(bot); return structuredClone(bot); },
    update: async (id, input) => { const index = mockBots.findIndex((bot) => bot.id === id); const timestamp = new Date().toISOString(); const patch = structuredClone(input); if (patch.jobs) patch.jobs = patch.jobs.map((job) => ({ createdAt: timestamp, updatedAt: timestamp, ...job })); mockBots[index] = { ...mockBots[index], ...patch, updatedAt: timestamp }; return structuredClone(mockBots[index]); },
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
    link: async (botId) => {
      if (!mockBotLinks.has(botId)) mockBotLinks.set(botId, `notebook://bot/${botId}?key=${crypto.randomUUID().replaceAll("-", "")}`);
      return { botId, url: mockBotLinks.get(botId) };
    },
    resetLink: async (botId) => { const url = `notebook://bot/${botId}?key=${crypto.randomUUID().replaceAll("-", "")}`; mockBotLinks.set(botId, url); return { botId, url }; },
    createInstant: async (input) => {
      const timestamp = new Date().toISOString(); const id = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || crypto.randomUUID();
      const bot = { id, name: input.name, description: input.description, icon: input.icon, platforms: ["notebook"], permissions: input.permissions, executionMode: "manual", environment: "local", enabled: true, tags: ["notebook-managed"], repositoryUrl: "", localProjectPath: "", deploymentUrl: "", hostingProvider: "", runtimeLanguage: "", version: "", logsLocation: "", schedulerSource: "Manual", schedulerUrl: "", monitoring: { adapter: "manual", monitoringEnabled: false }, connections: [], jobs: [], commands: [], skillIds: [], documentationNoteId: "mock-bot-note", runtime: null, derivedState: { state: "manual", reason: "Managed in Notebook.", source: "Manual", observedAt: null, isStale: false }, createdAt: timestamp, updatedAt: timestamp, archivedAt: null };
      mockBots.unshift(bot); const link = `notebook://bot/${id}?key=${crypto.randomUUID().replaceAll("-", "")}`; mockBotLinks.set(id, link); return { bot: structuredClone(bot), link };
    },
    connectorStatus: async () => ({ connector: structuredClone(mockConnector), telegramAuth: structuredClone(mockTelegramAuth) }),
    setConnectorUrl: async (url) => { mockConnector.baseUrl = url; mockConnector.configured = true; mockConnector.reason = ""; return structuredClone(mockConnector); },
    openConnectorPlatform: async () => true,
    startDiscordConnect: async () => ({ id: crypto.randomUUID(), claimSecret: crypto.randomUUID().replaceAll("-", ""), expiresAt: new Date(Date.now() + 600000).toISOString() }),
    pollDiscordConnect: async () => { mockConnector.discord.connected = true; return { status: "ready", userId: "42", installUrl: mockConnector.discord.guildInstallUrl }; },
    startTelegramAuth: async () => {
      mockTelegramAuthPolls = 0;
      mockTelegramAuth = { status: "waiting_qr", configured: true, authorized: false, qrUrl: "tg://login?token=bW9jay10b2tlbg", qrImage: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNTYiIGhlaWdodD0iMjU2Ij48cmVjdCB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI1NiIgZmlsbD0id2hpdGUiLz48cGF0aCBkPSJNMzIgMzJoNjR2NjRIMzJ6TTE2MCAzMmg2NHY2NGgtNjR6TTMyIDE2MGg2NHY2NEgzMnpNMTI4IDEyOGg5NnY5NmgtOTZ6IiBmaWxsPSIjMTExIi8+PC9zdmc+", expiresAt: new Date(Date.now() + 30000).toISOString() };
      return structuredClone(mockTelegramAuth);
    },
    telegramAuthState: async () => {
      mockTelegramAuthPolls += 1;
      if (mockTelegramAuth.status === "waiting_qr" && mockTelegramAuthPolls > 1) {
        mockTelegramAuth = { status: "ready", configured: true, authorized: true, user: { id: "77", username: "kai", displayName: "Kai" } };
        mockConnector.telegram.connected = true;
      }
      return structuredClone(mockTelegramAuth);
    },
    submitTelegramPassword: async () => ({ status: "checking_password", configured: true, authorized: false }),
    cancelTelegramAuth: async () => { mockTelegramAuth = { status: "disconnected", configured: true, authorized: false }; return structuredClone(mockTelegramAuth); },
    logoutTelegram: async () => { mockTelegramAuth = { status: "disconnected", configured: true, authorized: false }; mockConnector.telegram.connected = false; return structuredClone(mockTelegramAuth); },
    createManaged: async (input) => {
      const timestamp = new Date().toISOString();
      const base = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || crypto.randomUUID();
      const id = mockBots.some((item) => item.id === base) ? `${base}-${mockBots.length + 1}` : base;
      const telegramUsername = `${input.name.replace(/[^A-Za-z0-9]+/g, "").slice(0, 24) || "Notebook"}Bot`;
      const platformUrl = input.platform === "discord" ? mockConnector.discord.guildInstallUrl : `https://t.me/${telegramUsername}`;
      const connection = { id: `${id}-${input.platform}`, platform: input.platform, externalBotId: input.platform === "discord" ? mockConnector.discord.applicationId : "987654321", username: input.platform === "discord" ? "Notebook agent" : telegramUsername, displayName: input.platform === "discord" ? `${input.name} · Notebook` : input.name, credentialSecretRef: input.platform === "telegram" ? `NOTEBOOK_TELEGRAM_${telegramUsername.toUpperCase()}_TOKEN` : "", credentialState: "verified", credentialVerifiedAt: timestamp, credentialErrorSummary: "", connectorAgentId: crypto.randomUUID(), installUrl: platformUrl, installPermissions: "0" };
      const bot = { id, name: input.name, description: input.description, icon: input.icon, platforms: [input.platform], permissions: input.permissions, executionMode: "webhook", environment: "Notebook Connector", enabled: true, tags: ["notebook-managed", "notebook-connector", input.platform === "discord" ? "shared-discord-identity" : "managed-telegram-bot"], repositoryUrl: "", localProjectPath: "", deploymentUrl: platformUrl, hostingProvider: "Cloudflare Workers", runtimeLanguage: "", version: "", logsLocation: "", schedulerSource: "External automation", schedulerUrl: "", monitoring: { adapter: "http-status", url: `https://notebook-bot-connector.example/v1/agents/mock/health`, monitoringEnabled: true }, connections: [connection], jobs: [], commands: input.platform === "discord" ? [{ id: `${id}-agent`, platform: "discord", command: "/agent", description: "Use this named Notebook agent.", enabled: true }] : [{ id: `${id}-start`, platform: "telegram", command: "/start", description: "Start this managed bot.", enabled: true }], skillIds: [], documentationNoteId: "mock-bot-note", runtime: null, derivedState: { state: "healthy", reason: "Registered with Notebook Connector.", source: "HTTP health response", observedAt: timestamp, isStale: false }, createdAt: timestamp, updatedAt: timestamp, archivedAt: null };
      mockBots.unshift(bot); const link = `notebook://bot/${id}?key=${crypto.randomUUID().replaceAll("-", "")}`; mockBotLinks.set(id, link); return { bot: structuredClone(bot), link, platformUrl, platform: input.platform };
    },
    factoryDefaults: async () => ({ parentPath: "C:\\code" }),
    chooseFactoryParent: async () => ({ canceled: false, path: "C:\\code" }),
    openFactoryPlatform: async () => true,
    openFactoryInstall: async () => true,
    provisioningStatus: async () => structuredClone(mockProvisioning),
    configureProvisioning: async (input) => {
      if (input.platform === "discord") mockProvisioning.discord = { ready: true, applicationId: input.applicationId, displayName: "Notebook Discord Bot", reason: "Ready." };
      else mockProvisioning.telegram = { ready: true, managerUsername: "NotebookManagerBot", displayName: "Notebook Manager", reason: "Ready." };
      return structuredClone(mockProvisioning);
    },
    beginProvisioning: async (input) => input.platform === "discord"
      ? { platform: "discord", state: "awaiting_confirmation", applicationId: mockProvisioning.discord.applicationId, secretRef: "NOTEBOOK_DISCORD_CONTROLLER_TOKEN", url: `https://discord.com/oauth2/authorize?client_id=${mockProvisioning.discord.applicationId}&scope=bot+applications.commands&permissions=${input.permissions}` }
      : { platform: "telegram", state: "awaiting_confirmation", username: input.username, managerUsername: mockProvisioning.telegram.managerUsername, url: `https://t.me/newbot/${mockProvisioning.telegram.managerUsername}/${input.username}?name=${encodeURIComponent(input.name)}` },
    completeTelegramProvisioning: async ({ username }) => ({ platform: "telegram", state: "ready", externalBotId: "987654321", username, displayName: username.replace(/bot$/i, ""), secretRef: `NOTEBOOK_TELEGRAM_${username.toUpperCase()}_TOKEN` }),
    createProject: async (input) => {
      const timestamp = new Date().toISOString(); const platform = input.platforms[0];
      const connection = { id: crypto.randomUUID(), platform, externalBotId: platform === "discord" ? input.discordApplicationId : input.telegramExternalBotId || "987654321", username: platform === "telegram" ? input.telegramUsername : "", displayName: platform === "telegram" ? input.telegramDisplayName || input.name : input.name, avatarUrl: "", credentialSecretRef: platform === "discord" ? input.discordSecretRef : input.telegramSecretRef, credentialState: "verified", credentialVerifiedAt: timestamp, credentialErrorSummary: "", installPermissions: input.discordPermissions || "0" };
      const bot = { id: crypto.randomUUID(), name: input.name, description: input.description || "", icon: input.icon, platforms: input.platforms, executionMode: input.executionMode, environment: input.environment, enabled: true, tags: input.tags || [], repositoryUrl: "", localProjectPath: `${input.parentPath}\\${input.folderName}`, deploymentUrl: "", hostingProvider: "", runtimeLanguage: input.runtime === "node" ? "Node.js" : "Python", version: "1.0.0", logsLocation: `${input.parentPath}\\${input.folderName}\\runtime`, schedulerSource: "Unknown", schedulerUrl: "", monitoring: { adapter: "local-status", filePath: `${input.parentPath}\\${input.folderName}\\runtime\\status.json`, monitoringEnabled: true }, connections: [connection], jobs: [], commands: [{ id: crypto.randomUUID(), platform, command: "/ping", description: "Confirm the generated bot responds.", usage: "/ping", category: "System", enabled: true }], skillIds: [], documentationNoteId: "", runtime: null, derivedState: { state: "manual", reason: "Start the generated bot to collect status.", source: "Manual", observedAt: null, isStale: false }, createdAt: timestamp, updatedAt: timestamp, archivedAt: null };
      mockBots.unshift(bot); return { bot: structuredClone(bot), projectPath: bot.localProjectPath, repositoryUrl: "" };
    },
    processStatus: async (botId) => { const bot = mockBots.find((item) => item.id === botId); const available = Boolean(bot?.localProjectPath); return { available, running: available && mockRunningBots.has(botId), installing: false, pid: available && mockRunningBots.has(botId) ? 1234 : null }; },
    startProcess: async (botId) => { mockRunningBots.add(botId); return { available: true, running: true, installing: false, pid: 1234 }; },
    stopProcess: async (botId) => { mockRunningBots.delete(botId); return { available: true, running: false, installing: false, pid: null }; },
    onStatus: () => () => {},
    onOpenLink: () => () => {},
  },
  projects: {
    logo: async () => null,
    list: async () => { const state = new URLSearchParams(location.search).get("projects"); if (state === "error") throw new Error("Project storage is unavailable in this preview."); if (state === "loading") return new Promise(() => {}); return structuredClone(mockProjects); },
    create: async (input) => { const timestamp = new Date().toISOString(); const item = { id: crypto.randomUUID(), name: input.name, description: input.description || "", status: input.status || "active", priority: input.priority || "none", manual_rank: mockProjects.length, category: input.category || "Uncategorized", tier: input.tier || 4, tier_order: mockProjects.filter((project) => project.tier === (input.tier || 4)).length, local_path: input.localPath || null, git_root: input.gitRoot || null, github_url: input.githubUrl || null, primary_language: input.primaryLanguage || "", tags: input.tags || [], next_action: input.nextAction || "", notes: input.notes || "", push_after_commit: false, created_at: timestamp, updated_at: timestamp, last_worked_at: timestamp, skill_ids: [], slash_command_ids: [], skill_installs: [], command_installs: [], tasks: [], activity: [] }; mockProjects.push(item); return structuredClone(item); },
    update: async (id, input) => { const item = mockProjects.find((project) => project.id === id); const patch = { ...input }; if (Object.hasOwn(patch, "nextAction")) { patch.next_action = patch.nextAction; delete patch.nextAction; } if (Object.hasOwn(patch, "gitRoot")) { patch.git_root = patch.gitRoot; delete patch.gitRoot; } if (Object.hasOwn(patch, "githubUrl")) { patch.github_url = patch.githubUrl; delete patch.githubUrl; } Object.assign(item, patch, { updated_at: new Date().toISOString() }); return structuredClone(item); },
    reorder: async () => structuredClone(mockProjects),
    move: async ({ id, tier, beforeId }) => { const item = mockProjects.find((project) => project.id === id); const from = mockProjects.indexOf(item); mockProjects.splice(from, 1); item.tier = tier; const before = beforeId ? mockProjects.findIndex((project) => project.id === beforeId) : -1; mockProjects.splice(before >= 0 ? before : mockProjects.length, 0, item); mockProjects.filter((project) => project.tier === tier).forEach((project, index) => { project.tier_order = index; }); return structuredClone(mockProjects); },
    remove: async (id) => { const index = mockProjects.findIndex((project) => project.id === id); if (index >= 0) mockProjects.splice(index, 1); },
    chooseFolder: async () => ({ canceled: true }),
    chooseParent: async () => ({ canceled: true, projects: [] }),
    inspect: async () => null,
    status: async (root) => root.includes("clipforge")
      ? { available: true, isGit: true, clean: false, branch: "main", upstream: "origin/main", remote: "https://github.com/blixvip/clipforge-ai.git", githubUrl: "https://github.com/blixvip/clipforge-ai", ahead: 0, behind: 0, counts: { modified: 2, added: 1, deleted: 0, untracked: 1, staged: 0, conflicts: 0 }, files: [{ path: "src/export.py", kind: "modified", staged: false, unstaged: true }, { path: "README.md", kind: "modified", staged: false, unstaged: true }, { path: "tests/export_test.py", kind: "untracked", staged: false, unstaged: true }], lastCommit: { shortHash: "b2345678", message: "Improve captions", committedAt: new Date().toISOString() } }
      : root.includes("reddit")
        ? { available: true, isGit: true, clean: true, branch: "main", upstream: "origin/main", remote: "https://github.com/blixvip/discord-reddit-meme-bot.git", githubUrl: "https://github.com/blixvip/discord-reddit-meme-bot", ahead: 2, behind: 0, counts: { modified: 0, added: 0, deleted: 0, untracked: 0, staged: 0, conflicts: 0 }, files: [], lastCommit: { shortHash: "c3456789", message: "Filter duplicates", committedAt: new Date().toISOString() } }
        : root.includes("proxy")
          ? { available: true, isGit: true, clean: true, branch: "main", upstream: null, remote: null, githubUrl: null, ahead: 0, behind: 0, counts: { modified: 0, added: 0, deleted: 0, untracked: 0, staged: 0, conflicts: 0 }, files: [], lastCommit: { shortHash: "d4567890", message: "Create proxy", committedAt: new Date().toISOString() } }
          : { available: true, isGit: true, clean: true, branch: "main", upstream: "origin/main", remote: "https://github.com/blixvip/note-overlay.git", githubUrl: "https://github.com/blixvip/note-overlay", ahead: 0, behind: 0, counts: { modified: 0, added: 0, deleted: 0, untracked: 0, staged: 0, conflicts: 0 }, files: [], lastCommit: { shortHash: "a1234567", message: "Update project", committedAt: new Date().toISOString() } },
    diff: async (input) => ({ path: input.path, binary: false, truncated: false, text: `diff --git a/${input.path} b/${input.path}\n--- a/${input.path}\n+++ b/${input.path}\n@@ -1 +1 @@\n-old value\n+new value` }),
    stage: async () => ({ files: [] }),
    unstage: async () => ({ files: [] }),
    commit: async (input) => ({ shortHash: "f00ba412", message: input.message, pushed: Boolean(input.push), status: { available: true, isGit: true, clean: true, branch: "main", upstream: "origin/main", remote: "https://github.com/blixvip/demo.git", githubUrl: "https://github.com/blixvip/demo", ahead: 0, behind: 0, counts: {}, files: [] } }),
    push: async () => ({ available: true, isGit: true, clean: true, branch: "main", upstream: "origin/main", remote: "https://github.com/blixvip/demo.git", githubUrl: "https://github.com/blixvip/demo", ahead: 0, behind: 0, counts: {}, files: [] }),
    fetch: async () => ({ ahead: 0, behind: 0 }),
    githubAuthStatus: async () => ({ available: true, authenticated: true, login: "blixvip", name: "blix", avatarUrl: "https://avatars.githubusercontent.com/u/247529250?v=4", expectedLogin: "blixvip", accountMatches: true }),
    githubSignIn: async () => ({ available: true, authenticated: true, login: "blixvip", name: "blix", avatarUrl: "https://avatars.githubusercontent.com/u/247529250?v=4", expectedLogin: "blixvip", accountMatches: true }),
    githubSetup: async (input) => { const project = mockProjects.find((item) => item.id === input.projectId); project.git_root = project.git_root || project.local_path; project.github_url = `https://github.com/${input.repository.includes("/") ? input.repository : `blixvip/${input.repository}`}`; return { root: project.git_root, url: project.github_url, repository: project.github_url.replace("https://github.com/", ""), created: input.mode === "create", initialized: !project.git_root, project: structuredClone(project), status: { available: true, isGit: true, clean: true, branch: "main", upstream: null, remote: `${project.github_url}.git`, githubUrl: project.github_url, ahead: 0, behind: 0, counts: {}, files: [] } }; },
    agentsRead: async () => ({ exists: false, path: "AGENTS.md", content: "", version: null, modifiedAt: null, newline: "\r\n" }),
    agentsWrite: async (input) => ({ exists: true, path: "AGENTS.md", content: input.content, version: crypto.randomUUID(), modifiedAt: new Date().toISOString(), newline: "\r\n" }),
    readme: async () => ({ path: "README.md", content: "" }),
    open: async () => true,
    tasks: {
      create: async (projectId, input) => { const project = mockProjects.find((item) => item.id === projectId); project.tasks.push({ id: crypto.randomUUID(), project_id: projectId, description: "", status: "todo", priority: "medium", manual_order: project.tasks.length, tags: [], related: "", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...input }); return structuredClone(project); },
      update: async (id, input) => { const project = mockProjects.find((item) => item.tasks.some((task) => task.id === id)); Object.assign(project.tasks.find((task) => task.id === id), input); return structuredClone(project); },
      move: async ({ id, status, beforeId }) => { const project = mockProjects.find((item) => item.tasks.some((task) => task.id === id)); const task = project.tasks.find((item) => item.id === id); project.tasks = project.tasks.filter((item) => item.id !== id); task.status = status; task.updated_at = new Date().toISOString(); const before = beforeId ? project.tasks.findIndex((item) => item.id === beforeId) : -1; project.tasks.splice(before >= 0 ? before : project.tasks.length, 0, task); return structuredClone(project); },
      remove: async (id) => { const project = mockProjects.find((item) => item.tasks.some((task) => task.id === id)); project.tasks = project.tasks.filter((task) => task.id !== id); return structuredClone(project); },
    },
    assign: async (id, input) => { const project = mockProjects.find((item) => item.id === id); if (input.skillIds) project.skill_ids = input.skillIds; if (input.slashCommandIds) project.slash_command_ids = input.slashCommandIds; return structuredClone(project); },
    toolsStatus: async () => ({ skills: [], commands: [] }),
    toolInstall: async ({ projectId, kind, itemId }) => { const project = mockProjects.find((item) => item.id === projectId); const key = kind === "skill" ? "skill_installs" : "command_installs"; project[key] ||= []; if (!project[key].some((item) => item.item_id === itemId)) project[key].push({ item_id: itemId, relative_path: kind === "skill" ? ".agents/skills/demo/SKILL.md" : ".codex/prompts/demo.md", content_hash: "mock", installed_at: new Date().toISOString() }); return { result: { status: "current", conflict: false }, project: structuredClone(project) }; },
    toolUninstall: async ({ projectId, kind, itemId }) => { const project = mockProjects.find((item) => item.id === projectId); const key = kind === "skill" ? "skill_installs" : "command_installs"; project[key] = (project[key] || []).filter((item) => item.item_id !== itemId); return { result: { status: "missing", conflict: false }, project: structuredClone(project) }; },
  },
  cepExtensions: { list: async () => { const state = new URLSearchParams(location.search).get("cep"); if (state === "error") throw new Error("CEP extension folders are unavailable in this preview."); if (state === "loading") return new Promise(() => {}); return structuredClone(mockCepExtensions); } },
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
  excalidraw: {
    show: async () => { const state = new URLSearchParams(location.search).get("excalidraw"); if (state === "error") return { status: "error", message: "This service is unavailable in the preview." }; if (state === "loading") return { status: "loading", message: "" }; return { status: "ready", message: "" }; },
    hide: async () => ({ status: "ready" }), reload: async () => ({ status: "loading" }), openExternal: async () => true,
  },
  ai: { chatgpt: mockAiService("chatgpt"), gemini: mockAiService("gemini"), deepseek: mockAiService("deepseek") },
  clipboard: { writeText: async (text) => navigator.clipboard.writeText(text), writeRich: async ({ text }) => navigator.clipboard.writeText(text) },
  googleDocs: { create: async () => true },
  window: { hide: async () => {} },
  voiceLog: { complete: async () => { document.documentElement.dataset.voiceLogCompleted = "true"; } },
  onNewInboxNote: () => {},
  onFocusEditor: () => {},
  onFlushEditor: () => {},
  onOverlayHiding: () => {},
  onOverlayShown: () => {},
  onQuickVoiceLog: (handler) => { const listener = (event) => handler(event.detail); addEventListener("notebook:mock-quick-voice", listener); return () => removeEventListener("notebook:mock-quick-voice", listener); },
  onOpenMail: () => () => {},
  onMailStatus: () => () => {},
  onOpenNotion: () => () => {},
  onNotionStatus: () => () => {},
  onOpenTwitter: () => () => {},
  onTwitterStatus: () => () => {},
  onExcalidrawStatus: () => () => {},
  onAiStatus: () => () => {},
};
const api = window.hushnote || mockApi;

function CepNavIcon({ size = 16, className = "", strokeWidth: _strokeWidth, ...props }) {
  return <span className={`cep-nav-mark ${className}`.trim()} style={{ "--cep-nav-size": `${size}px` }} {...props}>C</span>;
}

const VIEWS = [
  { id: "daily", label: "Today", route: "today", Icon: CalendarCheck2 },
  { id: "notes", label: "Notes", route: "notes", Icon: FileText },
  { id: "skills", label: "Skills", route: "skills", Icon: Layers3 },
  { id: "commands", label: "Commands", route: "commands", Icon: SquareTerminal },
  { id: "cepExtensions", label: "CEP Extensions", route: "cep-extensions", Icon: CepNavIcon, group: "Workspace" },
  { id: "projects", label: "Projects", route: "projects", Icon: FolderGit2, group: "Workspace" },
  { id: "bots", label: "Bots", route: "bots", Icon: Bot, group: "Workspace" },
];
// Full-window embedded services. These are windows, not pages, so they sit under their own heading.
// Brand marks ship with the app (simple-icons), so they render offline and never depend on a
// service being reachable. Each keeps its own signed-in session and stays loaded once opened.
const SERVICES = [
  { id: "mail", label: "Gmail", brand: siGmail, tone: "gmail", hotkey: "Ctrl+Alt+Shift+M" },
  { id: "notion", label: "Notion", brand: siNotion, tone: "notion", hotkey: "Ctrl+Alt+Shift+O" },
  { id: "twitter", label: "Twitter", brand: siX, tone: "twitter", hotkey: "Ctrl+Alt+Shift+X" },
  { id: "excalidraw", label: "Excalidraw", brand: siExcalidraw, tone: "excalidraw" },
];
const AI_SERVICES = [
  { id: "chatgpt", label: "ChatGPT", image: chatgptLightIconUrl, darkImage: chatgptDarkIconUrl, tone: "chatgpt" },
  { id: "gemini", label: "Gemini", brand: siGooglegemini, tone: "gemini" },
  { id: "deepseek", label: "DeepSeek", brand: siDeepseek, tone: "deepseek" },
];
const AI_SERVICE_IDS = new Set(AI_SERVICES.map((service) => service.id));
const SERVICE_IDS = new Set([...SERVICES, ...AI_SERVICES].map((service) => service.id));
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
function isBlankNote(note) { return Boolean(note) && !note.title?.trim() && !note.body?.trim(); }
function isBlankSkill(skill) { return Boolean(skill) && !skill.name?.trim() && !skill.body?.trim() && !skill.source_url?.trim(); }
function isBlankCommand(item) { return Boolean(item) && !item.name?.trim() && !item.command?.trim() && !item.body?.trim(); }
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
  const activityResults = daily ? (daily.activities || []).filter((activity) => matches(activity.text)) : [];
  const groups = [
    { label: "Day log", items: activityResults, render: (activity) => <button type="button" key={activity.id} onClick={onOpenTask}><span className="result-mark task"><CalendarCheck2 size={13} strokeWidth={1.8} /></span><span><strong>{activity.text}</strong><small>{clockFromMinute(activity.start_minute)} · {activity.duration_minutes} min</small></span></button> },
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
    {!groups.length && <EmptyState title="No match" body="Search covers day logs, tasks, notes, skills, and commands." />}
  </div>;
}

function NotesList({ notes, currentId, onSelect, onRemove, onCreate, query }) {
  if (!notes.length) return <EmptyState title={query.trim() ? "No matching notes" : "No notes here"} body={query.trim() ? "Try a title or phrase from the note." : "Start one and it saves as you type."} action={!query.trim() ? <button type="button" className="button" onClick={onCreate}><Plus size={15} strokeWidth={2} />New note</button> : null} />;
  const groups = [
    { label: "Pinned", items: notes.filter((note) => note.pinned) },
    { label: "Notes", items: notes.filter((note) => !note.pinned) },
  ].filter((group) => group.items.length);
  return <div className="list" aria-live="polite">
    {groups.map((group) => <section className="list-group" key={group.label}>
      <h2>{group.label}<span>{group.items.length}</span></h2>
      {group.items.map((note) => <ListRow
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
    </section>)}
  </div>;
}

function SlashCommandList({ items, currentId, onSelect, onRemove, onCreate, query }) {
  if (!items.length) return <EmptyState title={query.trim() ? "No matching commands" : "No commands saved"} body={query.trim() ? "Try the name, invocation, or a word from its notes." : "Keep the invocation and what it does in one place."} action={!query.trim() ? <button type="button" className="button" onClick={onCreate}><Plus size={15} strokeWidth={2} />New command</button> : null} />;
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

function LibraryBrowser({ title, count, label, createLabel, onCreate, onClose, query, onQuery, filterLabel, children }) {
  return <nav className="library-browser" aria-label={label}>
    <div className="library-browser-top">
      <span className="library-browser-title"><strong>{title}</strong>{Number.isInteger(count) ? <small>{count}</small> : null}</span>
      <span className="library-browser-actions">
        <IconButton label={createLabel} onClick={onCreate}><Plus size={16} strokeWidth={2} /></IconButton>
        {onClose && <IconButton className="library-browser-dismiss" label={`Hide ${title.toLowerCase()} list`} onClick={onClose}><X size={16} strokeWidth={1.8} /></IconButton>}
      </span>
    </div>
    {onQuery && <label className="library-filter"><Search size={14} strokeWidth={1.8} aria-hidden="true" /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder={`Filter ${title.toLowerCase()}`} aria-label={filterLabel} /></label>}
    {children}
  </nav>;
}

function LibraryToggle({ open, label, onToggle }) {
  return <IconButton label={`${open ? "Hide" : "Show"} ${label}`} aria-pressed={open} onClick={onToggle}>
    <List size={17} strokeWidth={1.8} />
  </IconButton>;
}

function EditorBar({ status, context, leading, children, onHide }) {
  return <header className="editor-bar">
    <div className="editor-status">{leading}<span className={`save-state ${status === "Save failed" ? "is-failed" : ""}`}>{status}</span>{context && <span className="editor-context">{context}</span>}</div>
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
  if (!entry || (!entry.total && !entry.activityCount)) return "empty";
  if (!entry.total && entry.activityCount) return "logged";
  if (entry.done >= entry.total) return "clear";
  if (entry.done > 0) return "partial";
  return "open";
}

function DailySidebar({ page, month, days, status, onSelectDate, onMonth }) {
  if (!page) return <div className="side-panel"><p className="side-note">{status}</p></div>;
  const byDate = new Map(days.map((entry) => [entry.date, entry]));
  const monthDone = days.reduce((total, entry) => total + entry.done, 0);
  const monthOpen = days.reduce((total, entry) => total + Math.max(0, entry.total - entry.done), 0);
  const monthLogged = days.reduce((total, entry) => total + (entry.loggedMinutes || 0), 0);
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
          aria-label={`${dailyDate(date)}${byDate.get(date) ? ` · ${byDate.get(date).done} of ${byDate.get(date).total} checked · ${byDate.get(date).loggedMinutes || 0} minutes logged` : " · nothing written"}`}
          title={byDate.get(date) ? `${byDate.get(date).done}/${byDate.get(date).total} checked · ${byDate.get(date).loggedMinutes || 0} min logged` : "Nothing written"}
          onClick={() => onSelectDate(date)}
        >{Number(date.slice(8))}</button> : <span className="calendar-blank" key={`blank-${index}`} aria-hidden="true" />)}
      </div>
    </section>
    <p className="calendar-summary"><strong>{monthLogged}</strong> minutes logged · <strong>{monthDone}</strong> checked off · <strong>{monthOpen}</strong> open</p>
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

function TodayPage({ page, status, onSelectDate, onAdd, onToggle, onLocalEdit, onSave, onMove, onRemove, onActivityAdd, onActivityUpdate, onActivityRemove, voiceSession, onVoiceComplete, onHide, onRetry }) {
  const [section, setSection] = useState("log");
  useEffect(() => { if (voiceSession) setSection("log"); }, [voiceSession?.id, voiceSession?.phase]);
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
        <div className="today-sections" role="tablist" aria-label="Today sections">
          <button type="button" role="tab" aria-selected={section === "log"} className={section === "log" ? "is-active" : ""} onClick={() => setSection("log")}>Day log<small>{page.activities?.length || 0}</small></button>
          <button type="button" role="tab" aria-selected={section === "tasks"} className={section === "tasks" ? "is-active" : ""} onClick={() => setSection("tasks")}>Tasks<small>{listed.length + page.tomorrow.length}</small></button>
        </div>
        {!page.isToday && <button type="button" className="button subtle paper-back" onClick={() => onSelectDate(page.today)}><CalendarCheck2 size={15} strokeWidth={1.8} />Back to today</button>}
        {section === "log" ? <DailyTimeline page={page} onAdd={onActivityAdd} onUpdate={onActivityUpdate} onRemove={onActivityRemove} voiceSession={voiceSession} onVoiceComplete={onVoiceComplete} /> : <>
          <div className="paper-progress" role="img" aria-label={`${percent}% of this day checked off`}><i style={{ width: `${percent}%` }} /></div>
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
        </>}
      </article>
    </div>
  </section>;
}

function NotePage({ note, notebooks, status, mode, browserOpen, onBrowserToggle, onMode, onEdit, onSave, onCopy, onCopyPath, onCompress, onGoogleDoc, onDrag, onDragEnd, onTogglePin, onMove, onRemove, onAddTodo, onToggleTodo, onCreate, onHide, editorRef, notebookName }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (event) => { if (!menuRef.current?.contains(event.target)) setMenuOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpen]);
  if (!note) return <section className="pane">
    <EditorBar status={status} leading={<LibraryToggle open={browserOpen} label="note list" onToggle={onBrowserToggle} />} onHide={onHide} />
    <div className="pane-scroll"><EmptyState title={`${notebookName || "This notebook"} is empty`} body="Create a Markdown note. It saves itself as you type." action={<button type="button" className="button primary" onClick={onCreate}><Plus size={15} strokeWidth={2} />New note</button>} /></div>
  </section>;
  const hasContent = Boolean(note.body?.trim() || note.title?.trim());
  const tasks = todoItems(note.body);
  const words = countWords(note.body);
  return <section className="pane">
    <EditorBar status={status} context={notebookName} leading={<LibraryToggle open={browserOpen} label="note list" onToggle={onBrowserToggle} />} onHide={onHide}>
      <IconButton label={note.pinned ? "Unpin note" : "Pin note"} className={note.pinned ? "is-active" : ""} aria-pressed={Boolean(note.pinned)} onClick={onTogglePin}><Pin size={16} strokeWidth={1.8} /></IconButton>
      <button type="button" className="button subtle" onClick={() => onMode(mode === "write" ? "read" : "write")} aria-pressed={mode === "read"} title="Toggle preview (Ctrl+E)">
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
      <div className="note-meta">
        <span>{words} {words === 1 ? "word" : "words"}</span>
        {tasks.length > 0 && <span><Check size={13} strokeWidth={2} />{tasks.filter((task) => task.checked).length}/{tasks.length} done</span>}
        <span>Edited {fullTime(note.updated_at)}</span>
        <button type="button" className="link-button" onClick={onAddTodo}><ListTodo size={14} strokeWidth={1.8} />Add to-do</button>
      </div>
      {mode === "write"
        ? <RichNoteEditor ref={editorRef} value={note.body || ""} onChange={(markdown) => onEdit({ body: markdown })} onBlur={() => onSave(note)} placeholder="Write here. It saves automatically." ariaLabel="Note content" />
        : <div className="note-reading" aria-label="Rendered note">
          {note.body?.trim()
            ? <Markdown source={note.body} onToggleTask={onToggleTodo} />
            : <EmptyState title="Nothing to preview" body="Switch back to editing and write something first." action={<button type="button" className="button" onClick={() => onMode("write")}><Pencil size={15} strokeWidth={1.8} />Edit note</button>} />}
        </div>}
    </div>
  </section>;
}

function CommandPage({ item, status, browserOpen, onBrowserToggle, onEdit, onSave, onCopy, onRemove, onCreate, onHide }) {
  if (!item) return <section className="pane">
    <EditorBar status={status} leading={<LibraryToggle open={browserOpen} label="command list" onToggle={onBrowserToggle} />} onHide={onHide} />
    <div className="pane-scroll"><EmptyState title="No command selected" body="Save an invocation with a short note on what it does." action={<button type="button" className="button primary" onClick={onCreate}><Plus size={15} strokeWidth={2} />New command</button>} /></div>
  </section>;
  return <section className="pane">
    <EditorBar status={status} context={item.command?.trim() || "Reference"} leading={<LibraryToggle open={browserOpen} label="command list" onToggle={onBrowserToggle} />} onHide={onHide}>
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
  ["Ctrl + Alt + Shift + L", "Start or finish a Handy voice log; it saves and closes automatically"],
  ["Ctrl + K", "Search everything"],
  ["Ctrl + N", "New note, skill, or command"],
  ["Ctrl + E", "Switch between writing and Markdown preview"],
  ["Alt + ← / →", "Previous or next skill"],
  ["Ctrl + 1 – 4", "Jump to Today, Notes, Skills, Commands"],
  ["Esc", "Clear search, close a panel, or hide the window"],
];

function SettingsPanel({ backups, message, dataLocation, appVersion, settings, github, githubBusy, onTheme, onStartAtLogin, onGithubConnect, onGithubSync, onGithubOpen, onClose, onBackup, onRestore, onExport }) {
  const connected = Boolean(github?.accountMatches);
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
        <p className="settings-copy">Notebook keeps one local backup per day and holds the newest 21. These safety copies never leave this computer.</p>
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
        <h3><Cloud size={15} strokeWidth={1.8} />Blixvip cloud sync</h3>
        <p className="settings-copy">Sign in once per device. Saved changes sync immediately through your private GitHub repository; the 30-second check catches edits from other computers.</p>
        <div className={`cloud-identity ${connected ? "is-connected" : ""}`}>
          <GithubAvatar account={github} size={42} />
          <span>
            <strong>{connected ? github?.name || "blix" : "GitHub account"}</strong>
            <small>{connected ? "@blixvip · notebook-cloud" : github?.available === false ? "GitHub CLI required on this device" : github?.authenticated ? `@${github.login} is active; @blixvip required` : "Not connected"}</small>
          </span>
          <em>{connected ? "Live sync" : "Offline"}</em>
        </div>
        <div className="button-row">
          {!connected && <button type="button" className="button" onClick={onGithubConnect} disabled={githubBusy === "connect" || github?.available === false}>{githubBusy === "connect" ? "Signing in…" : "Sign in as @blixvip"}</button>}
          <button type="button" className="button" onClick={onGithubSync} disabled={!connected || Boolean(githubBusy)}>{githubBusy === "sync" ? "Syncing…" : "Sync now"}</button>
          {github?.url && <button type="button" className="link-button" onClick={onGithubOpen}>Open repository</button>}
        </div>
        <p className="settings-copy">{github?.lastSyncedAt ? `Last synced ${fullTime(github.lastSyncedAt)}` : connected ? "Ready for first sync" : "Sign in on each device to load the same Notebook."}</p>
        <p className="settings-copy">Sync includes notes, notebooks, Today, skills, commands, projects, and bot definitions. Device paths and encrypted account credentials stay local.</p>
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

function ServiceMark({ service, size = 16 }) {
  if (service.image) return <span className={`brand-image brand-${service.tone}`} style={{ width: size, height: size }} aria-hidden="true">
    <img className="brand-image-light" src={service.image} width={size} height={size} alt="" draggable="false" />
    {service.darkImage && <img className="brand-image-dark" src={service.darkImage} width={size} height={size} alt="" draggable="false" />}
  </span>;
  if (service.brand) return <BrandIcon icon={service.brand} className={`brand-${service.tone}`} size={size} />;
  const Icon = service.Icon;
  return <Icon className={`service-glyph brand-${service.tone}`} size={size} strokeWidth={1.9} aria-hidden="true" />;
}

function ServiceScreen({ appName, activeId, switchServices, switchLabel, loadedServices, status, preview, Preview, errorHint, onBack, onSwitch, onReload, onExternal, onHide }) {
  const loading = status.status === "loading" || status.status === "idle";
  const failed = status.status === "error";
  return <main className="service-screen">
    <header className="service-bar">
      <button type="button" className="button subtle" onClick={onBack}><ArrowLeft size={15} strokeWidth={1.8} />Notebook</button>
      <div className="service-switch" role="group" aria-label={switchLabel}>
        {switchServices.map((service) => <button
          type="button"
          key={service.id}
          className={`${service.id === activeId ? "is-active" : ""} brand-${service.tone}`}
          aria-pressed={service.id === activeId}
          title={loadedServices.has(service.id) && service.id !== activeId ? `${service.label} · already loaded` : service.label}
          onClick={() => service.id !== activeId && onSwitch(service.id)}
        ><ServiceMark service={service} size={15} /><span>{service.label}</span></button>)}
      </div>
      <span className={`save-state ${failed ? "is-failed" : "is-ready"}`} role="status" aria-live="polite">{loading ? `Loading ${appName}…` : failed ? `${appName} unavailable` : `${appName} ready`}</span>
      <div className="editor-actions">
        <button type="button" className="button subtle" onClick={onReload}><RefreshCw size={15} strokeWidth={1.8} /><span>Reload</span></button>
        <button type="button" className="button subtle" onClick={onExternal}><ExternalLink size={15} strokeWidth={1.8} /><span>Open in browser</span></button>
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
const ExcalidrawPreview = () => <ServicePreview name="Excalidraw" />;

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
  const [noteFilter, setNoteFilter] = useState("");
  const [skills, setSkills] = useState([]);
  const [currentSkill, setCurrentSkill] = useState(null);
  const [slashCommands, setSlashCommands] = useState([]);
  const [currentSlashCommand, setCurrentSlashCommand] = useState(null);
  const [commandFilter, setCommandFilter] = useState("");
  const [bots, setBots] = useState([]);
  const [currentBotId, setCurrentBotId] = useState(null);
  const [mailStatus, setMailStatus] = useState({ status: "idle", message: "" });
  const [notionStatus, setNotionStatus] = useState({ status: "idle", message: "" });
  const [twitterStatus, setTwitterStatus] = useState({ status: "idle", message: "" });
  const [excalidrawStatus, setExcalidrawStatus] = useState({ status: "idle", message: "" });
  const [aiStatuses, setAiStatuses] = useState(() => Object.fromEntries(AI_SERVICES.map(({ id }) => [id, { status: "idle", message: "" }])));
  const [compressOpen, setCompressOpen] = useState(false);
  // Native app views load once and only detach, preserving their persistent sign-in sessions.
  const [loadedServices, setLoadedServices] = useState(() => new Set());
  const [daily, setDaily] = useState(null);
  const [dailyMonth, setDailyMonth] = useState({ month: dateKey().slice(0, 7), days: [] });
  const [dailyStatus, setDailyStatus] = useState("Loading…");
  const [quickVoiceSession, setQuickVoiceSession] = useState(null);
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
  const [libraryBrowserOpen, setLibraryBrowserOpen] = useState(() => !window.matchMedia("(max-width: 56rem)").matches);
  const [notebookEditor, setNotebookEditor] = useState(null);
  const [appVersion, setAppVersion] = useState("");
  const saveTimer = useRef();
  const skillSaveTimer = useRef();
  const slashCommandSaveTimer = useRef();
  const noticeTimer = useRef();
  const serviceOpenRequest = useRef(0);
  const editorRef = useRef();
  const searchRef = useRef();
  const surfaceRef = useRef(null);
  const currentRef = useRef(null);
  const currentSkillRef = useRef(null);
  const currentSlashCommandRef = useRef(null);
  const viewRef = useRef("daily");
  const previousViewRef = useRef("daily");

  const load = async () => {
    const cloud = api.githubSync.status().catch(() => null);
    const [list, savedSkills, savedSlashCommands, savedNotebooks, savedBots, version, saved] = await Promise.all([api.notes.list(), api.skills.list(), api.slashCommands.list(), api.folders.list(), api.bots.list({ includeArchived: true }), api.settings.version(), api.settings.get()]);
    setBots(savedBots);
    const inboxId = savedNotebooks.find((notebook) => notebook.is_inbox)?.id || "inbox";
    setNotes(list);
    setSkills(savedSkills);
    setSlashCommands(savedSlashCommands);
    setNotebooks(savedNotebooks);
    setAppVersion(version);
    cloud.then(setGithubCloud);
    if (saved) setAppSettings((value) => ({ ...value, ...saved }));
    setActiveNotebookId(inboxId);
    const inboxNote = list.find((note) => !note.deleted_at && note.folder_id === inboxId);
    if (inboxNote) setCurrent(inboxNote);
    else if (list.some((note) => !note.deleted_at)) { setActiveNotebookId("all"); setCurrent(list.find((note) => !note.deleted_at)); }
    else setCurrent(null);
    setCurrentSkill(savedSkills[0] || null);
    setCurrentSlashCommand(savedSlashCommands[0] || null);
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
      discardBlankDraft(viewRef.current).catch(() => {});
      if (SERVICE_IDS.has(viewRef.current)) { serviceApi(viewRef.current).hide().catch(() => {}); setView(previousViewRef.current); }
    });
    api.onOverlayShown(() => { setClosing(false); setShowTick((tick) => tick + 1); loadDaily(); });
    const stopQuickVoice = api.onQuickVoiceLog?.((update) => {
      if (!update || !["recording", "transcribing", "error"].includes(update.phase)) return;
      if (SERVICE_IDS.has(viewRef.current)) serviceApi(viewRef.current).hide().catch(() => {});
      setView("daily");
      location.hash = "/today";
      setSearchQuery("");
      const today = dateKey();
      dailyDateRef.current = today;
      loadDaily(today);
      setQuickVoiceSession({ id: update.id || `${Date.now()}`, ...update });
    });
    const onHashChange = () => { const route = hashRoute(); setView(route.view); if (route.view === "bots") setCurrentBotId(route.id); };
    addEventListener("hashchange", onHashChange);
    const stopBotStatus = api.bots.onStatus?.((update) => { if (update?.bot?.id) setBots((items) => items.map((item) => item.id === update.bot.id ? update.bot : item)); });
    const stopServiceEvents = [
      api.githubSync.onUpdated?.((update) => {
        setGithubCloud(update);
        if (update?.remoteChanged) load().then(() => setSaveState("Synced")).catch(() => setSaveState("Cloud refresh failed"));
        else setSaveState("Synced");
      }),
      api.onOpenMail?.(() => openService("mail")),
      api.onMailStatus?.((next) => receiveServiceStatus("mail", "Gmail", next)),
      api.onOpenNotion?.(() => openService("notion")),
      api.onNotionStatus?.((next) => receiveServiceStatus("notion", "Notion", next)),
      api.onOpenTwitter?.(() => openService("twitter")),
      api.onTwitterStatus?.((next) => receiveServiceStatus("twitter", "Twitter", next)),
      api.onExcalidrawStatus?.((next) => receiveServiceStatus("excalidraw", "Excalidraw", next)),
      api.bots.onOpenLink?.((botId) => { reloadBots().then(() => openBot(botId)).catch(() => openBot(botId)); }),
      ...AI_SERVICES.map(({ id, label }) => api.onAiStatus?.(id, (next) => setAiStatuses((current) => ({ ...current, [id]: next && typeof next.status === "string" ? next : { status: "error", message: `${label} returned an invalid status.` } })))),
    ];
    return () => { stopBotStatus?.(); stopQuickVoice?.(); stopServiceEvents.forEach((stop) => stop?.()); removeEventListener("hashchange", onHashChange); clearTimeout(saveTimer.current); clearTimeout(skillSaveTimer.current); clearTimeout(slashCommandSaveTimer.current); clearTimeout(noticeTimer.current); };
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
    const media = window.matchMedia("(max-width: 56rem)");
    const sync = (event) => setLibraryBrowserOpen(!event.matches);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

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
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName) || Boolean(event.target.closest?.(".ProseMirror"));
      const inEditor = Boolean(event.target.closest?.(".ProseMirror"));
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        if (inEditor) return; // the editor's Link shortcut handles Ctrl+K inside the note.
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
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

  const serviceStatus = { mail: mailStatus, notion: notionStatus, twitter: twitterStatus, excalidraw: excalidrawStatus, ...aiStatuses };
  const setAppServiceStatus = { mail: setMailStatus, notion: setNotionStatus, twitter: setTwitterStatus, excalidraw: setExcalidrawStatus };
  function updateServiceStatus(id, next) {
    if (AI_SERVICE_IDS.has(id)) setAiStatuses((current) => ({ ...current, [id]: next }));
    else setAppServiceStatus[id](next);
  }
  function serviceApi(id) { return AI_SERVICE_IDS.has(id) ? api.ai[id] : api[id]; }
  function receiveServiceStatus(id, label, next) {
    const status = next && typeof next.status === "string" ? next : { status: "error", message: `${label} returned an invalid status.` };
    updateServiceStatus(id, status);
    if (status.status === "loading" || status.status === "ready") setLoadedServices((current) => current.has(id) ? current : new Set(current).add(id));
  }
  async function openService(id) {
    const request = ++serviceOpenRequest.current;
    flushOpenEditors();
    if (!SERVICE_IDS.has(viewRef.current)) previousViewRef.current = viewRef.current;
    setCompressOpen(false); setSettingsOpen(false); setSearchQuery("");
    updateServiceStatus(id, { status: loadedServices.has(id) ? "ready" : "loading", message: "" });
    setView(id);
    try {
      const next = await serviceApi(id).show();
      if (request !== serviceOpenRequest.current) return;
      if (next?.status) updateServiceStatus(id, next);
      setLoadedServices((current) => current.has(id) ? current : new Set(current).add(id));
      // Native views attach during the IPC call. Reassert the matching toolbar after
      // any route or status event delivered while that view was attaching.
      setView(id);
    }
    catch {
      if (request !== serviceOpenRequest.current) return;
      updateServiceStatus(id, { status: "error", message: "This service could not open." });
      setView(id);
    }
  }
  async function closeService(id) { serviceOpenRequest.current += 1; await serviceApi(id).hide().catch(() => {}); setView(previousViewRef.current); }
  async function reloadService(id) {
    updateServiceStatus(id, { status: "loading", message: "" });
    try { await serviceApi(id).reload(); }
    catch { updateServiceStatus(id, { status: "error", message: "This service could not reload." }); }
  }
  async function reloadBots() { const saved = await api.bots.list({ includeArchived: true }); setBots(saved); return saved; }
  async function reloadNotes() { const saved = await api.notes.list(); setNotes(saved); return saved; }
  function openBot(id) { setCurrentBotId(id || null); setView("bots"); setSearchQuery(""); setCompressOpen(false); location.hash = id ? `/bots/${id}` : "/bots"; }

  function flushOpenEditors() {
    if (currentRef.current && !isBlankNote(currentRef.current)) saveNow(currentRef.current);
    if (currentSkillRef.current && !isBlankSkill(currentSkillRef.current)) saveSkillNow(currentSkillRef.current);
    if (currentSlashCommandRef.current && !isBlankCommand(currentSlashCommandRef.current)) saveSlashCommandNow(currentSlashCommandRef.current);
  }

  async function discardBlankDraft(kind) {
    if (kind === "notes" && isBlankNote(currentRef.current)) {
      const blank = currentRef.current;
      clearTimeout(saveTimer.current);
      await api.notes.remove(blank.id);
      setNotes((items) => items.filter((item) => item.id !== blank.id));
      setCurrent((item) => item?.id === blank.id ? null : item);
    }
    if (kind === "skills" && isBlankSkill(currentSkillRef.current)) {
      const blank = currentSkillRef.current;
      clearTimeout(skillSaveTimer.current);
      await api.skills.remove(blank.id);
      setSkills((items) => items.filter((item) => item.id !== blank.id));
      setCurrentSkill((item) => item?.id === blank.id ? null : item);
    }
    if (kind === "commands" && isBlankCommand(currentSlashCommandRef.current)) {
      const blank = currentSlashCommandRef.current;
      clearTimeout(slashCommandSaveTimer.current);
      await api.slashCommands.remove(blank.id);
      setSlashCommands((items) => items.filter((item) => item.id !== blank.id));
      setCurrentSlashCommand((item) => item?.id === blank.id ? null : item);
    }
  }

  async function createNote(folderId) {
    const inboxId = notebooks.find((notebook) => notebook.is_inbox)?.id || "inbox";
    const destination = folderId || (activeNotebookId === "all" ? inboxId : activeNotebookId);
    try {
      await discardBlankDraft("notes");
      const note = await api.notes.create({ title: "", body: "", folderId: destination });
      setNotes((items) => [note, ...items]);
      setNoteFilter("");
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
      await discardBlankDraft("skills");
      const skill = await api.skills.create({ name: "", category: "Unsorted", body: "" });
      setSkills((items) => [skill, ...items]);
      setCurrentSkill(skill);
      selectView("skills");
      setSaveState("Saved");
    } catch { setSaveState("Could not create skill"); }
  }

  async function createSlashCommand() {
    try {
      await discardBlankDraft("commands");
      const item = await api.slashCommands.create({ name: "", command: "", body: "" });
      setSlashCommands((items) => [item, ...items]);
      setCommandFilter("");
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
  const addDailyActivity = (input) => runDailyAction(() => api.daily.activityCreate(input, dailyDateRef.current));
  const updateDailyActivity = (id, input) => runDailyAction(() => api.daily.activityUpdate(id, input));
  const removeDailyActivity = (id) => runDailyAction(() => api.daily.activityRemove(id));
  async function completeQuickVoiceLog() {
    setQuickVoiceSession(null);
    await api.voiceLog.complete().catch(() => {});
    await api.window.hide();
  }
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
      const saved = await api.skills.update(skill.id, { name: skill.name, category: skill.category?.trim() || "Unsorted", body: skill.body, sourceUrl: skill.source_url?.trim() || "", ownership: skill.ownership === "other" ? "other" : "mine" });
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
    setGithubCloudBusy("connect"); setSettingsMessage("Opening secure @blixvip sign-in…");
    try { const cloud = await api.githubSync.signIn(); setGithubCloud(cloud); setSettingsMessage("Connected to @blixvip and synced."); }
    catch (error) { setSettingsMessage(error.message || "GitHub sign-in failed."); }
    finally { setGithubCloudBusy(""); }
  }
  async function syncGithubCloud() {
    setGithubCloudBusy("sync"); setSettingsMessage("Syncing with @blixvip…");
    try {
      const cloud = await (api.githubSync.sync ? api.githubSync.sync() : api.githubSync.push());
      setGithubCloud(cloud);
      setSettingsMessage(cloud.remoteChanged ? "Synced changes from another device." : cloud.changed ? "Saved to @blixvip." : "Everything is already synced.");
    }
    catch (error) { setSettingsMessage(error.message || "GitHub sync failed."); }
    finally { setGithubCloudBusy(""); }
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
    setEditorMode("write");
    requestAnimationFrame(() => editorRef.current?.insertTodo());
  }
  function toggleTodo(lineIndex, checked) {
    if (!current) return;
    const lines = (current.body || "").split("\n");
    lines[lineIndex] = lines[lineIndex].replace(/^(\s*[-*]\s+\[)[ xX](])/, `$1${checked ? "x" : " "}$2`);
    edit({ body: lines.join("\n") });
  }

  function toggleLibraryBrowser() {
    if (searchQuery.trim()) {
      setSearchQuery("");
      setLibraryBrowserOpen(true);
      return;
    }
    setLibraryBrowserOpen((open) => !open);
  }
  function selectNoteFromBrowser(note) {
    if (currentRef.current?.id !== note.id) discardBlankDraft("notes").catch(() => {});
    setCurrent(note);
    setEditorMode("write");
    if (window.matchMedia("(max-width: 56rem)").matches) setLibraryBrowserOpen(false);
  }
  function selectCommandFromBrowser(item) {
    if (currentSlashCommandRef.current?.id !== item.id) discardBlankDraft("commands").catch(() => {});
    setCurrentSlashCommand(item);
    if (window.matchMedia("(max-width: 56rem)").matches) setLibraryBrowserOpen(false);
  }

  function selectView(nextView) {
    if (nextView !== viewRef.current) discardBlankDraft(viewRef.current).catch(() => {});
    setView(nextView);
    const route = VIEWS.find((entry) => entry.id === nextView)?.route;
    if (route) location.hash = `/${route}`;
    setSearchQuery("");
    setCompressOpen(false);
    if (nextView === "daily") loadDaily();
  }
  function openSearchNote(note) { discardBlankDraft("notes").catch(() => {}); setNoteFilter(""); setCurrent(note); setActiveNotebookId(note.folder_id); selectView("notes"); }
  function openSearchSkill(skill) { discardBlankDraft("skills").catch(() => {}); setCurrentSkill(skill); selectView("skills"); }
  function openSearchCommand(item) { discardBlankDraft("commands").catch(() => {}); setCommandFilter(""); setCurrentSlashCommand(item); selectView("commands"); }

  const visibleNotes = useMemo(() => {
    const needle = noteFilter.trim().toLocaleLowerCase();
    return notes
      .filter((note) => !note.deleted_at && (activeNotebookId === "all" || note.folder_id === activeNotebookId) && (!needle || `${noteName(note)} ${note.body || ""}`.toLocaleLowerCase().includes(needle)))
      .sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) || new Date(right.updated_at) - new Date(left.updated_at));
  }, [notes, activeNotebookId, noteFilter]);
  const visibleSlashCommands = useMemo(() => {
    const needle = commandFilter.trim().toLocaleLowerCase();
    return slashCommands.filter((item) => !needle || `${slashCommandName(item)} ${item.command || ""} ${item.body || ""}`.toLocaleLowerCase().includes(needle));
  }, [slashCommands, commandFilter]);
  const activeNotebook = notebooks.find((notebook) => notebook.id === activeNotebookId);
  const skillEditorCategories = [...new Set(skills.map((skill) => skill.category?.trim() || "Unsorted"))].sort((left, right) => left.localeCompare(right));
  const todayCounts = dailyMonth.days.find((day) => day.date === dateKey());
  const counts = {
    daily: todayCounts ? Math.max(0, todayCounts.total - todayCounts.done) : 0,
    notes: notes.filter((note) => !note.deleted_at).length,
    skills: skills.length,
    commands: slashCommands.length,
    cepExtensions: null,
    projects: null,
    bots: bots.filter((bot) => !bot.archivedAt).length,
  };

  const service = [...SERVICES, ...AI_SERVICES].find((entry) => entry.id === view);
  if (service) return <div className={`window-surface ${closing ? "is-closing" : ""}`} ref={surfaceRef}>
    <ServiceScreen
      appName={service.label}
      activeId={service.id}
      switchServices={AI_SERVICE_IDS.has(service.id) ? AI_SERVICES : SERVICES}
      switchLabel={AI_SERVICE_IDS.has(service.id) ? "Switch AI" : "Switch app"}
      loadedServices={loadedServices}
      onSwitch={openService}
      status={serviceStatus[service.id]}
      preview={!window.hushnote}
      Preview={service.id === "mail" ? MailPreview : service.id === "notion" ? NotionPreview : service.id === "twitter" ? TwitterPreview : service.id === "excalidraw" ? ExcalidrawPreview : () => <ServicePreview name={service.label} />}
      errorHint="Check your connection. The service may also block sign-in inside embedded windows."
      onBack={() => closeService(service.id)}
      onReload={() => reloadService(service.id)}
      onExternal={() => serviceApi(service.id).openExternal()}
      onHide={() => api.window.hide()}
    />
  </div>;
  return <div className={`window-surface ${closing ? "is-closing" : ""}`} ref={surfaceRef}><main className="notebook">
    <aside className={`sidebar ${LIBRARY_VIEWS.has(view) && !searchQuery.trim() ? "is-library" : ""}`} aria-label="Notebook navigation">
      <div className="sidebar-top">
        <div className="wordmark"><img src={notebookIconUrl} alt="" /><strong>Notebook</strong></div>
        <div className="sidebar-top-actions">
          {LIBRARY_VIEWS.has(view) && <IconButton label={NEW_LABEL[view]} onClick={createForView}><Plus size={18} strokeWidth={2} /></IconButton>}
          <button type="button" className={`github-account-button ${githubCloud?.accountMatches ? "is-connected" : ""}`} aria-label={githubCloud?.accountMatches ? "GitHub @blixvip connected" : "Connect GitHub @blixvip"} title={githubCloud?.accountMatches ? "@blixvip · live sync" : "Connect @blixvip"} onClick={openSettings}>
            <GithubAvatar account={githubCloud} size={22} />
            <i aria-hidden="true" />
          </button>
          <IconButton label="Settings and backups" onClick={openSettings}><Settings size={17} strokeWidth={1.8} /></IconButton>
        </div>
      </div>

      <label className="search"><Search size={15} strokeWidth={1.8} aria-hidden="true" /><input ref={searchRef} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search everything" aria-label="Search everything" /><kbd>Ctrl K</kbd></label>

      <nav className="nav" aria-label="Pages">
        {VIEWS.map(({ id, label, Icon, group }, index) => <React.Fragment key={id}>
          {group && VIEWS[index - 1]?.group !== group && <span className="nav-heading">{group}</span>}
          <button type="button" className={view === id && !searchQuery ? "is-active" : ""} aria-current={view === id ? "page" : undefined} onClick={() => id === "bots" ? openBot(null) : selectView(id)}>
            <Icon size={16} strokeWidth={1.8} aria-hidden="true" /><strong>{label}</strong><small>{counts[id] ?? ""}</small>
          </button>
        </React.Fragment>)}
        <span className="nav-heading">Apps</span>
        {SERVICES.map(({ id, label, brand, tone, hotkey }) => <button type="button" key={id} className={view === id ? "is-active" : ""} title={hotkey ? `${label} · ${hotkey}` : label} onClick={() => openService(id)}>
          <BrandIcon icon={brand} className={`brand-${tone}`} size={16} />
          <strong>{label}</strong>
          {loadedServices.has(id) ? <small className="nav-loaded" title={`${label} is preloaded; its session stays persistent`}>●</small> : <ExternalLink className="nav-external" size={13} strokeWidth={1.8} aria-hidden="true" />}
        </button>)}
      </nav>

      <div className="sidebar-body">
        {searchQuery.trim() ? <SearchResults query={searchQuery} notes={notes} skills={skills} slashCommands={slashCommands} daily={daily} onOpenNote={openSearchNote} onOpenSkill={openSearchSkill} onOpenCommand={openSearchCommand} onOpenTask={() => selectView("daily")} />
          : view === "bots" ? <BotSidebar bots={bots} currentId={currentBotId} onSelect={openBot} />
            : ["notes", "skills", "commands", "cepExtensions", "projects"].includes(view) ? null
              : <DailySidebar page={daily} month={dailyMonth.month} days={dailyMonth.days} status={dailyStatus} onSelectDate={selectDailyDate} onMonth={selectDailyMonth} />}
      </div>

      <section className="ai-panel" aria-label="Quick AI">
        <span className="nav-heading">AI</span>
        <div className="ai-panel-buttons">
          {AI_SERVICES.map((service) => <button type="button" key={service.id} className={`ai-provider brand-${service.tone}${view === service.id ? " is-active" : ""}`} aria-label={`Open ${service.label}`} title={`Open ${service.label}`} onClick={() => openService(service.id)}>
            <ServiceMark service={service} size={19} />
            <span>{service.label}</span>
            {loadedServices.has(service.id) && <i aria-hidden="true" />}
          </button>)}
        </div>
      </section>
    </aside>

    {view === "notes" ? <div className={`library-workspace ${libraryBrowserOpen ? "is-browsing" : ""}`}>
      {libraryBrowserOpen && !searchQuery.trim() && <LibraryBrowser title="Notes" count={visibleNotes.length} label="Note library" createLabel="New note" onCreate={() => createNote()} onClose={() => setLibraryBrowserOpen(false)} query={noteFilter} onQuery={setNoteFilter} filterLabel="Filter notes">
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
        <NotesList notes={visibleNotes} currentId={current?.id} onSelect={selectNoteFromBrowser} onRemove={remove} onCreate={() => createNote()} query={noteFilter} />
      </LibraryBrowser>}
      <NotePage
        note={current}
        notebooks={notebooks}
        notebookName={notebooks.find((notebook) => notebook.id === current?.folder_id)?.name || activeNotebook?.name}
        status={saveState}
        mode={editorMode}
        browserOpen={libraryBrowserOpen && !searchQuery.trim()}
        onBrowserToggle={toggleLibraryBrowser}
        onMode={setEditorMode}
        onEdit={edit}
        onSave={saveNow}
        onCopy={copyCurrent}
        onCopyPath={copyDragTarget}
        onCompress={() => setCompressOpen(true)}
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
      />
    </div> : view === "cepExtensions" ? <CepExtensionsPage api={api.cepExtensions} projectsApi={api.projects} onOpenProject={(id) => { setView("projects"); location.hash = `/projects/${id}`; }} onHide={() => api.window.hide()} />
      : view === "projects" ? <ProjectsPage api={api.projects} github={githubCloud} onGithubSettings={openSettings} skills={skills} commands={slashCommands} onOpenSkill={openSearchSkill} onOpenCommand={openSearchCommand} onHide={() => api.window.hide()} />
      : view === "bots" ? <BotsWorkspace api={api} bots={bots} skills={skills} notes={notes} currentId={currentBotId} onCurrent={openBot} onBotsChange={reloadBots} onNotesChange={reloadNotes} onOpenNote={openSearchNote} onOpenSkill={openSearchSkill} onHide={() => api.window.hide()} />
      : view === "skills" ? <SkillsWorkspace skills={skills} current={currentSkill} status={saveState} editorCategories={skillEditorCategories} onSelect={(skill) => { if (currentSkillRef.current?.id !== skill.id) discardBlankDraft("skills").catch(() => {}); setCurrentSkill(skill); }} onEdit={editSkill} onSave={saveSkillNow} onCopy={copySkill} onRemove={removeSkill} onCreate={createSkill} onTogglePin={toggleSkillStar} onOpenSource={(url) => api.skills.openSource(url)} onDiscardEmpty={() => discardBlankDraft("skills").catch(() => {})} onHide={() => api.window.hide()} />
      : view === "commands" ? <div className={`library-workspace ${libraryBrowserOpen ? "is-browsing" : ""}`}>
        {libraryBrowserOpen && !searchQuery.trim() && <LibraryBrowser title="Commands" count={visibleSlashCommands.length} label="Command library" createLabel="New command" onCreate={createSlashCommand} onClose={() => setLibraryBrowserOpen(false)} query={commandFilter} onQuery={setCommandFilter} filterLabel="Filter commands">
          <SlashCommandList items={visibleSlashCommands} currentId={currentSlashCommand?.id} onSelect={selectCommandFromBrowser} onRemove={removeSlashCommand} onCreate={createSlashCommand} query={commandFilter} />
        </LibraryBrowser>}
        <CommandPage item={currentSlashCommand} status={saveState} browserOpen={libraryBrowserOpen && !searchQuery.trim()} onBrowserToggle={toggleLibraryBrowser} onEdit={editSlashCommand} onSave={saveSlashCommandNow} onCopy={copySlashCommand} onRemove={removeSlashCommand} onCreate={createSlashCommand} onHide={() => api.window.hide()} />
      </div>
        : <TodayPage page={daily} status={dailyStatus} onSelectDate={selectDailyDate} onAdd={addDailyTask} onToggle={toggleDailyTask} onLocalEdit={editDailyTaskLocal} onSave={saveDailyTask} onMove={moveDailyTask} onRemove={removeDailyTask} onActivityAdd={addDailyActivity} onActivityUpdate={updateDailyActivity} onActivityRemove={removeDailyActivity} voiceSession={quickVoiceSession} onVoiceComplete={completeQuickVoiceLog} onHide={() => api.window.hide()} onRetry={() => loadDaily()} />}

    {view === "notes" && compressOpen && <Compressor note={current} onClose={() => setCompressOpen(false)} />}
    {settingsOpen && <button type="button" className="settings-scrim" aria-label="Dismiss settings panel" onClick={() => setSettingsOpen(false)} />}
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
      onGithubSync={syncGithubCloud}
      onGithubOpen={() => api.githubSync.open()}
      onClose={() => setSettingsOpen(false)}
      onBackup={makeBackup}
      onRestore={restoreBackup}
      onExport={exportNotes}
    />}
  </main></div>;
}

createRoot(document.getElementById("root")).render(<ErrorBoundary><App /></ErrorBoundary>);
