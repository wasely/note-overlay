const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { discoverProjects } = require("../src/main/workshop.cjs");
const { findProjectLogo } = require("../src/main/project-logos.cjs");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "notebook-discover-"));
function folder(name, files) {
  const dir = path.join(root, name); fs.mkdirSync(dir, { recursive: true });
  for (const [file, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), body);
  return dir;
}

function memoryStore(initial = []) {
  const projects = [...initial];
  return {
    listProjects: () => projects,
    createProject: (input) => { const project = { id: `p${projects.length}`, name: input.name, local_path: input.localPath, git_root: input.gitRoot, github_url: input.githubUrl, tier: input.tier, tags: input.tags }; projects.push(project); return project; },
  };
}
const inspect = async (dir) => ({ localPath: dir, gitRoot: null, githubUrl: dir.endsWith("fork") ? "https://github.com/me/shared" : null, name: path.basename(dir), description: "", primaryLanguage: "" });

(async () => {
  try {
    folder("mailbrain", { "package.json": "{}" });
    folder("drip-to-impress", { "README.md": "# Drip" });
    folder("worktree-copy", { ".git": "gitdir: C:/elsewhere/.git/worktrees/x", "package.json": "{}" });
    folder("x-ingestion-tests", { "package.json": "{}" });
    folder("_ARCHIVE", { "package.json": "{}" });
    folder("empty-folder", {});
    folder("already-tracked", { "package.json": "{}" });
    folder("clipforge-ai", { "package.json": "{}" });
    folder("repo-fork", { "package.json": "{}" });
    const store = memoryStore([
      { id: "t1", name: "Tracked", local_path: path.join(root, "already-tracked") },
      { id: "t2", name: "Shared", local_path: "C:\\somewhere\\shared", github_url: "https://github.com/me/shared" },
    ]);
    const added = await discoverProjects(store, inspect, [root]);
    assert.deepEqual(added.map((project) => project.name).sort(), ["drip-to-impress", "mailbrain"]);
    assert.ok(added.every((project) => project.tier === 4 && project.tags.includes("discovered")));
    assert.equal((await discoverProjects(store, inspect, [root])).length, 0, "second scan adds nothing");
    assert.equal((await discoverProjects(store, inspect, [path.join(root, "missing")])).length, 0, "missing root is ignored");
    const shop = folder("obsession-store", {});
    folder("obsession-store/theme/assets", { "icon-account.svg": "<svg/>", "icon-cart.svg": "<svg/>" });
    folder("obsession-store/assets/logo", { "obsession-mark-1024.png": "png" });
    folder("obsession-store/artifacts", { "logo.png": "png" });
    assert.equal(path.basename(findProjectLogo(shop)), "obsession-mark-1024.png", "own mark beats UI glyphs and artifacts");
    const video = folder("html-video", {});
    folder("html-video/templates", { "figma-logo.svg": "<svg/>", "icon.png": "png" });
    assert.equal(path.basename(findProjectLogo(video)), "icon.png", "another brand's logo loses to a plain icon");
    console.log("Workshop discovery and logo tests passed.");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exit(1); });
