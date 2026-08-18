const fs = require("fs");
const path = require("path");

const AUDIT_DATE = "2026-08-14";
const ROOTS = { live: "C:\\live", else: "C:\\else", code: "C:\\code" };

const TIER_ONE = [
  ["watch-better", "Watch Better", "ship now", 14, "browser", "Search YouTube transcripts and ask grounded questions without leaving the video.", "Submit the Chrome Web Store listing: privacy policy, five screenshots, 1280×800 tile, then cut v0.1.1."],
  ["note-overlay", "Notebook", "ship now", 14, "notebook", "Local-first Windows overlay notebook for notes, tasks, skills, commands, and projects.", "Publish one download page and a GitHub release so someone else can install it."],
  ["clipforge-ai", "ClipForge AI", "finish", 14, "video", "Turn a YouTube URL into captioned vertical shorts ready to post.", "Run one clean end-to-end export and connect a Git remote."],
  ["null", "Null Motion", "finish", 14, "motion", "Design transparent motion graphics and place them onto the Premiere timeline.", "Remove the stale duplicate after checking unpushed work, then close the deferred UI and vision work."],
  ["script-gen", "Script Gen", "finish", 14, "creator", "Creator workspace for research, scripts, source shots, B-roll, titles, logos, and thumbnails.", "Put the most repeated manual step behind a trigger."],
  ["discord-youtube-tracker", "Discord YouTube Tracker", "ship now", 14, "bot", "Watch creators, cache transcripts, summarize uploads, and publish them to Discord.", "Commit the working tree, verify a cold restart, then retire the duplicate bots."],
  ["AI-Usage", "AI Usage", "done", 13, "utility", "Tray popup showing live usage windows for your AI coding accounts.", "Finished. Do not reopen it."],
  ["marketplace-deal-radar", "FlipScope", "finish", 13, "marketplace", "Watch Marketplace listings and surface items with verified resale potential.", "Commit the current work and prove one real deal from alert to resale decision."],
  ["x-virality-tracker", "X Virality Tracker", "blocked", 13, "social", "Score X posts across time windows and alert Discord when momentum is real.", "Price the required X API tier before writing more code."],
  ["cep", "CEP Panel Suite", "finish", 12, "premiere", "Eleven Premiere panels: editing, assets, search, motion, audio, and live web.", "Commit the open files first, then verify the panels inside Premiere."],
];

const TIER_TWO = [
  ["x-master-app", "X Master", 12, "social", "Writing workspace and extension grounded in posts you saved.", "Pick one surface: Next.js, mobile, or extension."],
  ["extension-manager", "Extension Manager", 12, "browser", "Chrome side panel for finding, toggling, and reloading extensions.", "Prepare and submit the store listing."],
  ["AI-Broadcaster", "AI Broadcaster", 12, "workspace", "Broadcast one prompt into several AI chats in one workspace.", "Verify the auth-gateway refactor live."],
  ["tab-brain", "TabBrain", 12, "browser", "Privacy-first tab organizer with deterministic safety rules.", "Submit the already-prepared store assets."],
  ["china-ai-radar", "China AI Radar", 12, "bot", "Track Chinese AI creators, translate locally, and post Discord digests.", "Port the creator list into Discord YouTube Tracker."],
  ["chronicle-bot", "Chronicle Bot", 12, "bot", "Turn Discord messages into a reliable calendar and Notion timeline.", "Deploy the existing Fly.io build."],
  ["premiere-x", "Buzzroll Studio", 12, "premiere", "Agent-controlled Premiere editing through eighteen MCP tools.", "Keep the MCP brain; decide which superseded UXP surface can retire."],
  ["brgod", "brgod", 12, "video", "Record polished B-roll from web links with parallel Chromium and NVENC.", "Make this Script Gen's single B-roll engine."],
  ["ai-channel-watcher", "AI Channel Watcher", 12, "bot", "YouTube-to-Discord watcher with transcripts and persistence.", "Move useful parts into Discord YouTube Tracker, then archive it."],
  ["x-media-archive", "X Media Archive", 11, "social", "Download and search every image and video from an X profile.", "Commit the working tree."],
  ["desktop-composer", "Desktop Composer", 11, "desktop", "Open apps and restore every window to its saved monitor position.", "Put the three Rust crates and Tauri app under version control."],
];

const TIER_THREE = [
  ["ram checker", "RAM Limit Viewer", "utility", "RAM monitor with an instant process kill button."],
  ["valorant-focus-guard", "Valorant Focus Guard", "utility", "Stops other apps stealing focus while Valorant runs."],
  ["pc-speed-guard", "Codex Safe Boost", "utility", "Windows maintenance that avoids active Codex sessions."],
  ["codex-performance", "Codex Performance", "utility", "Prevents duplicate background agent services eating RAM."],
  ["llmlingua-local", "LLMLingua Local", "utility", "Local prompt-compression service kept warm on CPU."],
  ["transcript-saver", "Transcript Saver", "browser", "Exports YouTube captions; folded into Watch Better."],
  ["skills", "Skills", "tooling", "Your public reusable agent skills."],
  ["wasely", "Profile README", "workspace", "Your public GitHub profile and project index."],
  ["ibm-technology-channel-deck", "IBM Channel Deck", "creator", "One-off reproducible YouTube corpus and presentation pipeline."],
  ["vps-deploy", "VPS Deploy", "infrastructure", "Server bootstrap script and systemd units."],
  ["landgraf", "Landgraf", "experiment", "Draft, verify, and retry agent loop."],
  ["discord-reddit-meme-bot", "Meme Momentum Bot", "bot", "Reddit momentum scorer; should merge into the tracker."],
];

const TIER_FOUR = [
  ["hyperframes-2", "Null duplicate", "duplicate"], ["uxp", "Superseded Premiere experiments", "premiere"],
  ["classroom-archive", "Untouched web starter", "scaffold"], ["ai-systems-studio", "Blank React starter", "scaffold"],
  ["creator-hub", "Empty Cloudflare scaffold", "scaffold"], ["langflow-studio", "Logs only", "scaffold"],
  ["app-icon-float", "Two icon files", "asset"], ["w", "Empty repository", "scaffold"],
  ["youtube", "Three superseded mini-projects", "duplicate"], ["null-motion-test-lab", "Superseded scratch server", "experiment"],
  ["null-test-editorial-lab", "Superseded scratch server", "experiment"], ["null-prompt-lab-codex", "Superseded prompt lab", "experiment"],
  ["script-gen-photo-lab", "Finished capture experiment", "experiment"], ["broll-recorder-lab", "Superseded B-roll lab", "experiment"],
];

const TIER_FIVE = [
  ["AFFiNE", "AFFiNE", "workspace"], ["affine-simple", "AFFiNE local edits", "workspace"],
  ["lumina-note", "Lumina Note", "notebook"], ["odysseus", "Odysseus", "workspace"], ["dim0", "dim0", "workspace"],
  ["browser-use", "Browser Use", "tooling"], ["CrewAI-Studio", "CrewAI Studio", "tooling"], ["sandcastle", "Sandcastle", "tooling"],
  ["all-agentic-architectures", "Agent Architecture Library", "reference"], ["plandeck", "Plandeck", "workspace"],
  ["last30days-skill", "Last 30 Days Skill", "tooling"], ["skills-manager", "Skills Manager", "tooling"],
  ["design-os", "Design OS", "tooling"], ["motion-anything", "Motion Anything", "motion"], ["html-video", "HTML Video", "video"],
  ["video-shotcraft", "Video Shotcraft", "video"], ["GithubStarsManager", "GitHub Stars Manager", "tooling"],
  ["PortPilot", "PortPilot", "utility"], ["roadmap-ai", "Roadmap AI", "workspace"], ["ytfetcher", "YT Fetcher", "tooling"],
  ["youtube-rag-scraper", "YouTube RAG Scraper", "tooling"],
];

const catalog = new Map();
TIER_ONE.forEach(([folder, name, verdict, score, category, summary, gap], index) => catalog.set(folder.toLowerCase(), { folder, name, tier: 1, rank: index + 1, verdict, score, category, summary, gap, workspace: "live", ownership: "mine" }));
TIER_TWO.forEach(([folder, name, score, category, summary, gap], index) => catalog.set(folder.toLowerCase(), { folder, name, tier: 2, rank: 11 + index, verdict: "later", score, category, summary, gap, workspace: "live", ownership: "mine" }));
TIER_THREE.forEach(([folder, name, category]) => catalog.set(folder.toLowerCase(), { folder, name, tier: 3, rank: null, verdict: "done", score: null, category, summary: TIER_THREE.find((entry) => entry[0] === folder)?.[3] || "Finished utility. Leave it closed.", gap: "Finished. Do not reopen it.", workspace: "code", ownership: "mine" }));
TIER_FOUR.forEach(([folder, summary, category]) => catalog.set(folder.toLowerCase(), { folder, name: folder, tier: 4, rank: null, verdict: "cut", score: null, category, summary, gap: "Verify unpushed work, then retire this folder.", workspace: "code", ownership: "mine" }));
TIER_FIVE.forEach(([folder, name, category]) => catalog.set(folder.toLowerCase(), { folder, name, tier: 5, rank: null, verdict: "reference", score: null, category, summary: "External reference or tool. Do not build product features here.", gap: "Use for reference only; wrap it from C:\\live if needed.", workspace: "else", ownership: "vendor" }));

function physicalWorkspace(value) {
  const resolved = String(value || "").replaceAll("/", "\\").toLowerCase();
  if (resolved === "c:\\live" || resolved.startsWith("c:\\live\\")) return "live";
  if (resolved === "c:\\else" || resolved.startsWith("c:\\else\\")) return "else";
  if (resolved === "c:\\code" || resolved.startsWith("c:\\code\\")) return "code";
  return "other";
}

function folderKey(project) {
  const local = project.local_path || project.localPath || "";
  return String(path.basename(local) || project.name || "").toLowerCase();
}

function enrichProject(project) {
  const item = catalog.get(folderKey(project));
  const location = physicalWorkspace(project.local_path || project.localPath);
  const workspace = item?.workspace || (location === "other" ? "code" : location);
  const archived = String(project.local_path || "").toLowerCase().includes("\\_archive\\");
  return {
    ...project,
    workshop: {
      auditDate: AUDIT_DATE,
      workspace,
      location,
      pendingMove: Boolean(item && location !== "other" && location !== workspace),
      ownership: item?.ownership || "mine",
      tier: item?.tier || (archived ? 4 : null),
      rank: item?.rank || null,
      verdict: item?.verdict || (archived ? "retired" : "unscored"),
      score: item?.score ?? null,
      category: item?.category || (archived ? "archive" : "project"),
      summary: item?.summary || project.description || "No plain-language summary yet.",
      gap: item?.gap || project.next_action || "Set one concrete next action.",
      displayName: item?.name || project.name,
    },
  };
}

function preferredPath(item) {
  const candidates = item.workspace === "live" ? [path.join(ROOTS.live, item.folder), path.join(ROOTS.code, item.folder)]
    : item.workspace === "else" ? [path.join(ROOTS.else, item.folder), path.join(ROOTS.code, item.folder)]
      : [path.join(ROOTS.code, item.folder)];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function defaults(item) {
  const status = item.verdict === "blocked" ? "blocked" : item.verdict === "done" ? "completed" : item.verdict === "cut" ? "archived" : item.verdict === "reference" ? "paused" : "active";
  const priority = item.tier === 1 ? (item.rank <= 2 ? "critical" : item.rank <= 6 ? "high" : "medium") : item.tier === 2 ? "low" : "none";
  return { status, priority };
}

async function syncWorkshop(store, inspectFolder) {
  const existing = new Map(store.listProjects().map((project) => [folderKey(project), project]));
  const result = { added: 0, relocated: 0, unchanged: 0, unavailable: 0 };
  for (const item of catalog.values()) {
    const localPath = preferredPath(item);
    if (!localPath) { result.unavailable += 1; continue; }
    let current = existing.get(item.folder.toLowerCase());
    if (current && String(current.local_path || "").toLowerCase() === localPath.toLowerCase()) { result.unchanged += 1; continue; }
    const inspected = await inspectFolder(localPath);
    let duplicateRemote = false;
    if (!current) {
      const githubKey = String(inspected.githubUrl || "").toLowerCase();
      const gitKey = String(inspected.gitRoot || "").toLowerCase();
      const collision = store.listProjects().find((project) => (githubKey && String(project.github_url || "").toLowerCase() === githubKey) || (gitKey && String(project.git_root || "").toLowerCase() === gitKey));
      if (collision?.name.startsWith("_stale-")) current = collision;
      else duplicateRemote = Boolean(collision);
    }
    if (current) {
      store.updateProject(current.id, { name: current.name.startsWith("_stale-") ? item.name : current.name, localPath: inspected.localPath, gitRoot: inspected.gitRoot, githubUrl: inspected.githubUrl, primaryLanguage: inspected.primaryLanguage || current.primary_language });
      existing.set(item.folder.toLowerCase(), current);
      result.relocated += 1;
    } else {
      const initial = defaults(item);
      const created = store.createProject({ name: item.name, description: item.summary, ...initial, localPath: inspected.localPath, gitRoot: inspected.gitRoot, githubUrl: duplicateRemote ? null : inspected.githubUrl, primaryLanguage: inspected.primaryLanguage, tags: [item.workspace, item.ownership, item.verdict], nextAction: item.gap, manualRank: item.rank || 10_000 });
      existing.set(item.folder.toLowerCase(), created);
      result.added += 1;
    }
  }
  return result;
}

module.exports = { AUDIT_DATE, ROOTS, catalog, enrichProject, syncWorkshop };
