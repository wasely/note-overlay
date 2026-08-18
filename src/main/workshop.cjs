const fs = require("fs");
const path = require("path");
const { findProjectLogo } = require("./project-logos.cjs");

const AUDIT_DATE = "2026-08-17";
const ROOTS = { live: "C:\\live", else: "C:\\else", code: "C:\\code" };
// Folders under these are support material, never ranked work.
const SUPPORT_PATH = /\\(_archive|_transfer|\.downloads|\.tools|\.plans|\.memory|_scratchpad-reference)\\/i;

// Tier A — money and efficiency. Ranked by Kaihan on 17 Aug 2026.
const TIER_A = [
  ["clipforge-ai", "ClipForge AI", "live", "video", "Turn a YouTube URL into captioned vertical shorts ready to post.", "Run one clean end-to-end export, then connect a Git remote."],
  ["marketplace-deal-radar", "FlipScope", "live", "marketplace", "Watch Marketplace listings and surface items with verified resale potential.", "Commit the tree and run it for real for one week."],
  ["x-master-app", "X Master", "live", "social", "Writing workspace and extension grounded in the posts you saved.", "Pick one surface: web, mobile, or extension."],
  ["buzzroll-studio", "Buzzroll Studio", "code", "premiere", "Premiere panel that cuts A-roll from the transcript: silences, bad takes, checkerboard audio.", "Collapse the three copies into this one, then test it inside Premiere."],
];

// Tier B — autonomous, close to done.
const TIER_B = [
  ["x-virality-tracker", "X Virality Tracker", "live", "social", "Score X posts across time windows and alert Discord when momentum is real.", "Price the paid X API tier before writing another line.", "blocked"],
  ["chronicle-bot", "Calendar Bot", "live", "bot", "Text Discord and it logs your day to a calendar and Notion timeline.", "Deploy the Fly.io build that already exists."],
  ["discord-youtube-tracker", "Discord YouTube Tracker", "code", "bot", "Watch creators, cache transcripts, summarize uploads, publish them to Discord.", "Verify a cold restart, then absorb the two duplicate bots."],
  ["AI-Broadcaster", "AI Broadcaster", "code", "workspace", "Broadcast one prompt into several AI chats in one workspace.", "Test the auth-gateway refactor live."],
];

// Tier C — real, not urgent.
const TIER_C = [
  ["tab-brain", "TabBrain", "live", "browser", "Privacy-first tab cleanup with deterministic safety rules and undo.", "Submit the store assets that are already prepared."],
  ["china-ai-radar", "China AI Radar", "live", "bot", "Track Chinese AI creators, translate locally, post Discord digests.", "Fold the creator list into Discord YouTube Tracker."],
  ["desktop-composer", "Desktop Composer", "live", "desktop", "Open your apps and restore every window to its saved monitor.", "Put the Rust crates and Tauri app under version control."],
];

// Undecided — kept, with the call attached.
const TIER_UNDECIDED = [
  ["cep", "CEP Panel Suite", "live", "premiere", "Eleven Premiere panels: editing, assets, search, motion, audio, live web.", "Keep. This is the delivery surface for Buzzroll and everything else."],
  ["brgod", "brgod", "live", "video", "Record polished B-roll from web links with parallel Chromium and NVENC.", "Keep as an engine. Script Gen calls it; do not open it on its own."],
  ["x-media-archive", "X Media Archive", "live", "social", "Download and search every image and video from an X profile.", "Keep, bottom of the list. Cheap, works, feeds B-roll."],
  ["premiere-x", "Buzzroll MCP", "live", "premiere", "Agent-controlled Premiere editing through eighteen MCP tools.", "Keep the MCP layer; the panels belong to cep."],
];

// Unranked — left out of the 17 Aug list; each needs an explicit call.
const TIER_UNRANKED = [
  ["watch-better", "Watch Better", "live", "browser", "Search a YouTube transcript and ask grounded questions without leaving the video.", "Rank it or cut it. It is the closest thing here to a shipped product."],
  ["note-overlay", "Notebook", "code", "notebook", "Local-first Windows overlay notebook for notes, tasks, skills, commands, projects, and quick AI access.", "v0.13.0 turns Projects into four simple drag-and-drop ranking rows while keeping full project management and @blixvip sync."],
  ["null", "Null Motion", "code", "motion", "Design transparent motion graphics and drop them onto the Premiere timeline.", "Rank it or cut it. The backend reliability work is done."],
  ["script-gen", "Script Gen", "live", "creator", "Creator workspace: research, scripts, source shots, B-roll, titles, thumbnails.", "Rank it or cut it. Highest daily use, lowest autonomy."],
  ["extension-manager", "Extension Manager", "live", "browser", "Chrome side panel for finding, toggling, and reloading extensions.", "Rank it or cut it."],
  ["discord-reddit-meme-bot", "Meme Momentum Bot", "code", "bot", "Reddit momentum scoring with SQLite dedup and independent loops.", "Rank it or fold it into Discord YouTube Tracker."],
];

// Done. Reopening one of these is the failure mode.
const TIER_DONE = [
  ["AI-Usage", "AI Usage", "code", "utility", "Tray popup showing live usage windows for your AI coding accounts."],
  ["ram checker", "RAM Limit Viewer", "code", "utility", "RAM monitor with an instant process kill button."],
  ["valorant-focus-guard", "Valorant Focus Guard", "code", "utility", "Stops other apps stealing focus while Valorant runs."],
  ["pc-speed-guard", "Codex Safe Boost", "code", "utility", "Windows maintenance that avoids active Codex sessions."],
  ["codex-performance", "Codex Performance", "code", "utility", "Prevents duplicate background agent services eating RAM."],
  ["llmlingua-local", "LLMLingua Local", "code", "utility", "Local prompt-compression service kept warm on CPU."],
  ["transcript-saver", "Transcript Saver", "code", "browser", "Exports YouTube captions; folded into Watch Better."],
  ["skills", "Skills", "code", "tooling", "Your public reusable agent skills."],
  ["wasely", "Profile README", "code", "workspace", "Your public GitHub profile and project index."],
  ["ibm-technology-channel-deck", "IBM Channel Deck", "code", "creator", "One-off reproducible YouTube corpus and presentation pipeline."],
  ["vps-deploy", "VPS Deploy", "code", "infrastructure", "Server bootstrap script and systemd units."],
  ["landgraf", "Landgraf", "code", "experiment", "Draft, verify, and retry agent loop."],
];

// Cut. The rest of the 14 Aug cut list was deleted from disk on 17 Aug 2026.
const TIER_CUT = [
  ["ai-channel-watcher", "AI Channel Watcher", "live", "bot", "Third copy of the YouTube-to-Discord bot.", "Port anything unique into Discord YouTube Tracker, then delete the folder."],
];

const TIER_VENDOR = [
  ["AFFiNE", "AFFiNE", "workspace"], ["affine-simple", "AFFiNE local edits", "workspace"],
  ["lumina-note", "Lumina Note", "notebook"], ["odysseus", "Odysseus", "workspace"], ["dim0", "dim0", "workspace"],
  ["browser-use", "Browser Use", "tooling"], ["CrewAI-Studio", "CrewAI Studio", "tooling"], ["sandcastle", "Sandcastle", "tooling"],
  ["all-agentic-architectures", "Agent Architecture Library", "reference"], ["plandeck", "Plandeck", "workspace"],
  ["last30days-skill", "Last 30 Days Skill", "tooling"], ["skills-manager", "Skills Manager", "tooling"],
  ["design-os", "Design OS", "tooling"], ["motion-anything", "Motion Anything", "motion"], ["html-video", "HTML Video", "video"],
  ["video-shotcraft", "Video Shotcraft", "video"], ["GithubStarsManager", "GitHub Stars Manager", "tooling"],
  ["PortPilot", "PortPilot", "utility"], ["roadmap-ai", "Roadmap AI", "workspace"], ["ytfetcher", "YT Fetcher", "tooling"],
  ["youtube-rag-scraper", "YouTube RAG Scraper", "tooling"], ["prime-agent", "Prime Agent", "tooling"],
];

const catalog = new Map();
function register(entry) { catalog.set(entry.folder.toLowerCase(), entry); }

let order = 0;
const RANKED_TIERS = [
  [TIER_A, 1, "critical", "money"],
  [TIER_B, 2, "high", "autonomous"],
  [TIER_C, 3, "medium", "later"],
  [TIER_UNDECIDED, 4, "none", "undecided"],
  [TIER_UNRANKED, 5, "none", "unranked"],
];
for (const [tier, tierNumber, priority, verdict] of RANKED_TIERS) {
  for (const [folder, name, workspace, category, summary, gap, status] of tier) {
    order += 1;
    register({ folder, name, workspace, category, summary, gap, tier: tierNumber, rank: order, priority, verdict, status: status || "active", ownership: "mine" });
  }
}
TIER_DONE.forEach(([folder, name, workspace, category, summary]) => register({
  folder, name, workspace, category, summary, gap: "Finished. Do not reopen it.",
  tier: 6, rank: null, priority: "none", verdict: "done", status: "completed", ownership: "mine",
}));
TIER_CUT.forEach(([folder, name, workspace, category, summary, gap]) => register({
  folder, name, workspace, category, summary, gap, tier: 7, rank: null, priority: "none", verdict: "cut", status: "archived", ownership: "mine",
}));
TIER_VENDOR.forEach(([folder, name, category]) => register({
  folder, name, workspace: "else", category,
  summary: "External reference or tool. Do not build product features here.",
  gap: "Reference only. Wrap it from C:\\live if you need it.",
  tier: 8, rank: null, priority: "none", verdict: "reference", status: "paused", ownership: "vendor",
}));

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

function isSupportPath(value) {
  return SUPPORT_PATH.test(`${String(value || "").replaceAll("/", "\\")}\\`);
}

function enrichProject(project) {
  const item = catalog.get(folderKey(project));
  const location = physicalWorkspace(project.local_path || project.localPath);
  const workspace = item?.workspace || (location === "other" ? "code" : location);
  const support = isSupportPath(project.local_path || project.localPath);
  return {
    ...project,
    logo_path: project.logo_path || "",
    workshop: {
      auditDate: AUDIT_DATE,
      workspace,
      location,
      pendingMove: Boolean(item && location !== "other" && location !== workspace),
      ownership: item?.ownership || "mine",
      tier: item?.tier || (support ? 9 : null),
      rank: item?.rank || null,
      verdict: item?.verdict || (support ? "retired" : "unscored"),
      category: item?.category || (support ? "archive" : "project"),
      summary: item?.summary || project.description || "No plain-language summary yet.",
      gap: item?.gap || project.next_action || "Set one concrete next action.",
      displayName: item?.name || project.name,
    },
  };
}

function preferredPath(item) {
  const candidates = item.workspace === "live" ? [path.join(ROOTS.live, item.folder), path.join(ROOTS.code, item.folder)]
    : item.workspace === "else" ? [path.join(ROOTS.else, item.folder), path.join(ROOTS.code, item.folder)]
      : [path.join(ROOTS.code, item.folder), path.join(ROOTS.live, item.folder)];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

// A stored logo that sits inside a nested checkout of another tracked project is wrong,
// however it got there, so it is rescanned instead of trusted.
function borrowedLogo(logoPath, local) {
  if (!logoPath || !local) return false;
  const relative = path.relative(local, logoPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return true;
  const foreign = foreignFolders(local);
  const file = path.basename(logoPath).toLowerCase();
  if ([...foreign].some((name) => name.length >= 4 && file.includes(name))) return true;
  return relative.split(/[\\/]/).slice(0, -1).some((segment) => foreign.has(segment.toLowerCase()));
}

// Every other tracked project's folder name, so a nested checkout never lends its logo.
function foreignFolders(local) {
  const own = path.basename(String(local || "")).toLowerCase();
  const names = new Set(catalog.keys());
  names.delete(own);
  return names;
}

function trackedRoot(value) {
  return physicalWorkspace(value) !== "other";
}

async function syncWorkshop(store, inspectFolder) {
  const existing = new Map(store.listProjects().map((project) => [folderKey(project), project]));
  const result = { added: 0, relocated: 0, unchanged: 0, unavailable: 0, removed: 0, demoted: 0, ranked: 0, logos: 0 };
  for (const item of catalog.values()) {
    const localPath = preferredPath(item);
    if (!localPath) { result.unavailable += 1; continue; }
    let current = existing.get(item.folder.toLowerCase());
    const samePath = current && String(current.local_path || "").toLowerCase() === localPath.toLowerCase();
    if (!current) {
      const inspected = await inspectFolder(localPath);
      const githubKey = String(inspected.githubUrl || "").toLowerCase();
      const gitKey = String(inspected.gitRoot || "").toLowerCase();
      const collision = store.listProjects().find((project) => (githubKey && String(project.github_url || "").toLowerCase() === githubKey) || (gitKey && String(project.git_root || "").toLowerCase() === gitKey));
      if (collision) current = collision;
      else {
        current = store.createProject({
          name: item.name, description: item.summary, status: item.status, priority: item.priority,
          localPath: inspected.localPath, gitRoot: inspected.gitRoot, githubUrl: inspected.githubUrl,
          primaryLanguage: inspected.primaryLanguage, tags: [item.workspace, item.ownership, item.verdict],
          nextAction: item.gap, manualRank: item.rank || 10_000,
        });
        result.added += 1;
      }
      existing.set(item.folder.toLowerCase(), current);
    } else if (!samePath) {
      const inspected = await inspectFolder(localPath);
      store.updateProject(current.id, { localPath: inspected.localPath, gitRoot: inspected.gitRoot, githubUrl: inspected.githubUrl, primaryLanguage: inspected.primaryLanguage || current.primary_language });
      result.relocated += 1;
    } else result.unchanged += 1;
    // The ledger owns the name, rank, status, and next action — that is the whole point of the sync.
    const rank = item.rank || 10_000;
    if (current.name !== item.name || current.priority !== item.priority || current.status !== item.status || current.manual_rank !== rank) {
      store.updateProject(current.id, { name: item.name, description: current.description || item.summary, priority: item.priority, status: item.status, manualRank: rank, nextAction: item.gap });
      result.ranked += 1;
    }
  }
  for (const project of store.listProjects()) {
    const local = project.local_path || "";
    if (local && trackedRoot(local) && !fs.existsSync(local)) { store.removeProject(project.id); result.removed += 1; continue; }
    if (isSupportPath(local) && (project.status !== "archived" || project.manual_rank < 10_000)) {
      store.updateProject(project.id, { status: "archived", priority: "none", manualRank: 10_000 });
      result.demoted += 1;
      continue;
    }
    if (!project.logo_path || !fs.existsSync(project.logo_path) || borrowedLogo(project.logo_path, local)) {
      const logo = findProjectLogo(local, { skipDirectories: foreignFolders(local) }) || "";
      if (logo !== (project.logo_path || "")) { store.setProjectLogo(project.id, logo); if (logo) result.logos += 1; }
    }
  }
  return result;
}

module.exports = { AUDIT_DATE, ROOTS, catalog, enrichProject, syncWorkshop, isSupportPath };
