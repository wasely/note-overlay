const fs = require("fs");
const path = require("path");
const { readProjectLogo } = require("./project-logos.cjs");

const CATALOG = [
  {
    id: "null-motion",
    name: "Null Motion",
    group: "main",
    rank: 1,
    summary: "Biggest product, strongest long-term potential.",
    projectNames: ["Null Motion"],
    sourceCandidates: ["C:\\code\\null", "C:\\live\\cep\\null"],
    installedNames: ["null"],
    logoCandidates: [
      "C:\\code\\null\\templates\\assets\\null-logo.png",
      "C:\\live\\cep\\null\\templates\\assets\\null-logo.png",
    ],
  },
  {
    id: "buzzroll-studio",
    name: "Buzzroll Studio",
    group: "main",
    rank: 2,
    summary: "Most complete and usable today.",
    projectNames: ["Buzzroll Studio"],
    sourceCandidates: ["C:\\code\\buzzroll-studio", "C:\\live\\cep\\buzzroll-studio"],
    installedNames: ["buzzroll-studio"],
  },
  {
    id: "clipforge-ai",
    name: "ClipForge AI",
    group: "main",
    rank: 3,
    summary: "Strong automated clipping product; install needs fixing.",
    projectNames: ["ClipForge AI"],
    sourceCandidates: ["C:\\code\\clipforge-ai", "C:\\live\\clipforge-ai"],
    installedNames: ["clipforge-ai"],
    logoCandidates: ["C:\\code\\clipforge-ai\\frontend\\src\\app\\favicon.ico"],
    attention: "Install fix",
  },
  {
    id: "asset-board",
    name: "Asset Board / Kinetic Core",
    group: "main",
    rank: 4,
    summary: "Useful everyday Premiere toolkit.",
    projectNames: ["Asset Board", "Kinetic Core"],
    sourceCandidates: ["C:\\live\\cep\\asset-board"],
    installedNames: ["asset-board"],
    logoCandidates: ["C:\\live\\cep\\asset-board\\chrome-extension\\icons\\kinetic-128.png"],
  },
  {
    id: "openscreen-bridge",
    name: "OpenScreen Bridge",
    group: "secondary",
    rank: 1,
    summary: "Premiere bridge for OpenScreen control and playback workflows.",
    projectNames: ["OpenScreen Bridge", "OpenScreen Controller"],
    sourceCandidates: ["C:\\live\\cep\\openscreen-controller"],
    installedNames: ["openscreen-controller"],
  },
  {
    id: "youtube-uploader",
    name: "YouTube Uploader",
    group: "secondary",
    rank: 2,
    summary: "Publish finished edits to YouTube from the editing workflow.",
    projectNames: ["YouTube Uploader", "Premiere YouTube Publisher"],
    sourceCandidates: ["C:\\code\\_ARCHIVE\\premiere-youtube-publisher"],
    installedNames: ["youtube-uploader"],
  },
  {
    id: "motion-highlighter",
    name: "Motion Highlighter",
    group: "secondary",
    rank: 3,
    summary: "Fast motion emphasis and highlight effects for Premiere timelines.",
    projectNames: ["Motion Highlighter", "HyperFrames"],
    sourceCandidates: ["C:\\live\\cep\\motion-highlighter"],
    installedNames: ["hyperframes", "motion-highlighter"],
  },
];

function existingDirectory(candidates) {
  return candidates.find((candidate) => {
    try { return fs.statSync(candidate).isDirectory(); } catch { return false; }
  }) || null;
}

function existingFile(candidates = []) {
  return candidates.find((candidate) => {
    try { return fs.statSync(candidate).isFile(); } catch { return false; }
  }) || null;
}

function sameName(left, right) {
  return String(left || "").trim().toLocaleLowerCase() === String(right || "").trim().toLocaleLowerCase();
}

function listCepExtensions(projects = [], options = {}) {
  const appData = options.appData || process.env.APPDATA || "";
  const installedRoot = path.join(appData, "Adobe", "CEP", "extensions");
  return CATALOG.map((entry) => {
    const sourcePath = existingDirectory(entry.sourceCandidates);
    const installedPath = existingDirectory(entry.installedNames.map((name) => path.join(installedRoot, name)));
    const project = projects.find((candidate) => entry.projectNames.some((name) => sameName(candidate.name, name)));
    const logoPath = existingFile(entry.logoCandidates);
    return {
      id: entry.id,
      name: entry.name,
      group: entry.group,
      rank: entry.rank,
      summary: entry.summary,
      attention: entry.attention || null,
      installed: Boolean(installedPath),
      installedPath,
      sourceAvailable: Boolean(sourcePath),
      sourcePath: sourcePath || installedPath,
      projectId: project?.id || null,
      logo: readProjectLogo(logoPath),
    };
  });
}

module.exports = { CATALOG, listCepExtensions };
