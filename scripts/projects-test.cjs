const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const projects = require("../src/main/projects.cjs");
const { buildProjectTool, installProjectTool, toolStatus, uninstallProjectTool } = require("../src/main/project-tools.cjs");

const parent = fs.mkdtempSync(path.join(os.tmpdir(), "notebook-projects-"));
const root = path.join(parent, "repo with spaces");
fs.mkdirSync(path.join(root, "src"), { recursive: true });
const run = (...args) => execFileSync("git.exe", args, { cwd: root, encoding: "utf8", windowsHide: true });

(async () => {
  try {
    run("init"); run("config", "user.name", "Notebook Test"); run("config", "user.email", "notebook@example.test");
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "project-test", description: "Repository inspection works." }));
    fs.writeFileSync(path.join(root, "src", "a.js"), "export const a = 1;\n");
    fs.writeFileSync(path.join(root, "src", "b.js"), "export const b = 1;\n");
    run("add", "."); run("commit", "-m", "Initial commit");
    fs.writeFileSync(path.join(root, "src", "a.js"), "export const a = 2;\n");
    fs.writeFileSync(path.join(root, "src", "b.js"), "export const b = 2;\n");
    const inspected = await projects.inspectFolder(path.join(root, "src"));
    assert.equal(inspected.gitRoot.toLowerCase(), fs.realpathSync.native(root).toLowerCase());
    assert.equal(inspected.name, "repo with spaces"); assert.equal(inspected.primaryLanguage, "JavaScript");
    let status = await projects.repositoryStatus(root); assert.equal(status.clean, false); assert.equal(status.counts.modified, 2);
    const preview = await projects.diff(root, "src/a.js"); assert.match(preview.text, /export const a = 2/);
    await projects.mutateFiles(root, "stage", ["src/b.js"]);
    const committed = await projects.commit(root, { files: ["src/a.js"], message: "Update only a", push: false, acknowledgeSensitive: false });
    assert.equal(committed.message, "Update only a");
    assert.match(run("show", "--name-only", "--format=", "HEAD"), /src\/a\.js/); assert.doesNotMatch(run("show", "--name-only", "--format=", "HEAD"), /src\/b\.js/);
    status = await projects.repositoryStatus(root); assert.equal(status.files.find((item) => item.path === "src/b.js").staged, true);
    const missing = projects.readAgents(root); assert.equal(missing.exists, false);
    const saved = projects.writeAgents(root, { content: "# Project Instructions\n", version: null }); assert.equal(saved.exists, true);
    assert.throws(() => projects.writeAgents(root, { content: "stale", version: "wrong" }), /changed outside Notebook/);
    const skill = buildProjectTool("skill", { id: "review", name: "Code Review", body: "Check the changed files." });
    assert.equal(skill.relativePath, ".agents/skills/code-review/SKILL.md");
    assert.equal(toolStatus(root, skill).status, "missing");
    installProjectTool(root, skill); assert.equal(toolStatus(root, skill).status, "current");
    fs.writeFileSync(path.join(root, skill.relativePath), "user edit\n");
    assert.equal(toolStatus(root, skill, { content_hash: skill.contentHash }).status, "modified");
    assert.equal(uninstallProjectTool(root, skill, { content_hash: skill.contentHash }).conflict, true);
    assert.equal(uninstallProjectTool(root, skill, { content_hash: skill.contentHash }, true).status, "missing");
    const branch = run("branch", "--show-current").trim();
    run("remote", "add", "origin", "https://github.com/wasely/project-test.git");
    run("remote", "add", "blixvip", "https://github.com/blixvip/project-test.git");
    run("config", `branch.${branch}.remote`, "blixvip");
    run("config", `branch.${branch}.merge`, `refs/heads/${branch}`);
    status = await projects.repositoryStatus(root);
    assert.equal(status.remoteName, "blixvip");
    assert.equal(status.githubUrl, "https://github.com/blixvip/project-test");
    fs.writeFileSync(path.join(root, ".env.local"), "NOT_A_REAL_SECRET=test\n");
    await assert.rejects(projects.commit(root, { files: [".env.local"], message: "Unsafe", push: false, acknowledgeSensitive: false }), /require acknowledgement/);
    console.log("Projects repository inspection, scoped commit, Git status, and AGENTS.md regression tests passed.");
  } finally { fs.rmSync(parent, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
