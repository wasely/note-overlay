const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { createHash } = require("crypto");

const MAX_OUTPUT = 8 * 1024 * 1024;
const DIFF_LIMIT = 600_000;
const queues = new Map();
const SECRET_FILE = /(^|[\\/])(\.env(?:\..+)?|.*(?:credentials?|secrets?|tokens?|service[-_]?account).*(?:\.json|\.ya?ml)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|.*\.(?:pem|p12|pfx|key))$/i;
const SECRET_CONTENT = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
  /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["'][^"'\r\n]{10,}["']/i,
];
const PUBLISH_FILE_LIMIT = 10 * 1024 * 1024;
const LANGUAGE_MARKERS = [
  ["TypeScript", [".ts", ".tsx"]], ["JavaScript", [".js", ".jsx", ".mjs", ".cjs"]], ["Python", [".py"]],
  ["Rust", [".rs"]], ["Go", [".go"]], ["C#", [".cs"]], ["Java", [".java"]], ["C++", [".cpp", ".cc", ".hpp"]],
  ["Ruby", [".rb"]], ["PHP", [".php"]], ["Swift", [".swift"]], ["Kotlin", [".kt"]], ["Shell", [".sh", ".ps1"]],
];

function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const environment = { ...process.env, GIT_TERMINAL_PROMPT: "0", ...(options.env || {}) };
    if (options.stripGithubTokens) { delete environment.GH_TOKEN; delete environment.GITHUB_TOKEN; }
    const child = spawn(executable, args, { cwd: options.cwd, windowsHide: true, shell: false, env: environment });
    const stdout = []; const stderr = []; let size = 0; let settled = false;
    const timer = setTimeout(() => { child.kill(); finish(new Error(`${path.basename(executable)} timed out.`)); }, options.timeout || 15_000);
    function collect(target, chunk) { size += chunk.length; if (size <= (options.maxOutput || MAX_OUTPUT)) target.push(chunk); else child.kill(); }
    function finish(error, code = null) {
      if (settled) return; settled = true; clearTimeout(timer);
      const result = { code, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") };
      if (error) reject(error); else if (code && !options.allowFailure) reject(new Error(result.stderr.trim() || result.stdout.trim() || `${path.basename(executable)} failed (${code}).`)); else resolve(result);
    }
    child.stdout.on("data", (chunk) => collect(stdout, chunk)); child.stderr.on("data", (chunk) => collect(stderr, chunk));
    child.on("error", finish); child.on("close", (code) => finish(size > (options.maxOutput || MAX_OUTPUT) ? new Error("Command output was too large.") : null, code));
  });
}

async function git(root, args, options = {}) { return run("git.exe", args, { ...options, cwd: root, stripGithubTokens: true }); }
async function githubAuthStatus() {
  try {
    const version = await run("gh.exe", ["--version"], { allowFailure: true, timeout: 10_000, stripGithubTokens: true });
    if (version.code) return { available: false, authenticated: false, login: null, name: null, avatarUrl: null, url: null };
    const account = await run("gh.exe", ["api", "user", "--jq", "{login:.login,name:(.name // \"\"),avatarUrl:.avatar_url,url:.html_url}"], { allowFailure: true, timeout: 20_000, stripGithubTokens: true });
    if (account.code) return { available: true, authenticated: false, login: null, name: null, avatarUrl: null, url: null };
    const profile = JSON.parse(account.stdout.trim());
    const login = String(profile.login || "").trim();
    return { available: true, authenticated: Boolean(login), login: login || null, name: profile.name || null, avatarUrl: profile.avatarUrl || null, url: profile.url || null };
  } catch {
    return { available: false, authenticated: false, login: null, name: null, avatarUrl: null, url: null };
  }
}
async function githubSelectAccount(expectedLogin) {
  const expected = String(expectedLogin || "").trim();
  let current = await githubAuthStatus();
  if (!expected || !current.available || String(current.login || "").toLowerCase() === expected.toLowerCase()) return current;
  await run("gh.exe", ["auth", "switch", "--hostname", "github.com", "--user", expected], { allowFailure: true, timeout: 30_000, stripGithubTokens: true });
  current = await githubAuthStatus();
  if (String(current.login || "").toLowerCase() === expected.toLowerCase()) {
    await run("gh.exe", ["auth", "setup-git", "--hostname", "github.com"], { allowFailure: true, timeout: 30_000, stripGithubTokens: true });
  }
  return current;
}
async function githubSignIn(expectedLogin = null) {
  const current = await githubSelectAccount(expectedLogin);
  if (!current.available) throw new Error("GitHub CLI is not installed. Install it to sign in from Notebook.");
  const expected = String(expectedLogin || "").trim();
  let selected = current;
  if (!selected.authenticated || (expected && selected.login.toLowerCase() !== expected.toLowerCase())) {
    await run("gh.exe", ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web", "--clipboard"], { timeout: 10 * 60_000, stripGithubTokens: true });
    if (expected) await run("gh.exe", ["auth", "switch", "--hostname", "github.com", "--user", expected], { allowFailure: true, timeout: 30_000, stripGithubTokens: true });
    selected = await githubAuthStatus();
  }
  await run("gh.exe", ["auth", "setup-git", "--hostname", "github.com"], { timeout: 30_000, stripGithubTokens: true });
  const result = await githubAuthStatus();
  if (!result.authenticated) throw new Error("GitHub sign-in was not completed.");
  if (expected && result.login.toLowerCase() !== expected.toLowerCase()) throw new Error(`Sign in as @${expected} to use this Notebook cloud.`);
  return result;
}
function githubRepositoryName(value, login) {
  const raw = String(value || "").trim().replace(/\.git$/i, "");
  const repository = raw.includes("/") ? raw : `${login}/${raw}`;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error("Use a GitHub repository name like owner/project.");
  return repository;
}
function canonical(value) {
  const resolved = path.resolve(String(value || ""));
  if (!fs.existsSync(resolved)) throw new Error("Repository folder is unavailable.");
  return fs.realpathSync.native(resolved);
}
async function gitRoot(value) {
  const selected = canonical(value);
  const result = await git(selected, ["rev-parse", "--show-toplevel"], { allowFailure: true });
  if (result.code) return null;
  return canonical(result.stdout.trim());
}
function inside(root, relative) {
  const base = canonical(root); const target = path.resolve(base, String(relative || ""));
  const relation = path.relative(base, target);
  if (!relation || relation.startsWith("..") || path.isAbsolute(relation)) throw new Error("File must be inside the repository.");
  return { base, target, relative: relation.replaceAll("\\", "/") };
}
function githubUrl(remote) {
  const raw = String(remote || "").trim(); if (!raw) return null;
  const match = raw.match(/^(?:https?:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([^/]+)\/([^/]+?)(?:\.git)?$/i);
  return match ? `https://github.com/${match[1]}/${match[2]}` : null;
}
function detectLanguage(root) {
  const counts = new Map(); const ignored = new Set([".git", "node_modules", "dist", "build", "vendor", ".next", "target"]); let visited = 0;
  function visit(directory, depth) {
    if (depth > 3 || visited > 5000) return;
    let entries = []; try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (ignored.has(entry.name)) continue; const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full, depth + 1);
      else { visited += 1; const ext = path.extname(entry.name).toLowerCase(); for (const [language, extensions] of LANGUAGE_MARKERS) if (extensions.includes(ext)) counts.set(language, (counts.get(language) || 0) + 1); }
    }
  }
  visit(root, 0); return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}
function readDescription(root) {
  const packagePath = path.join(root, "package.json");
  try { const data = JSON.parse(fs.readFileSync(packagePath, "utf8")); if (typeof data.description === "string") return data.description.slice(0, 500); } catch { /* optional */ }
  for (const name of ["README.md", "README.MD", "readme.md"]) try {
    const text = fs.readFileSync(path.join(root, name), "utf8");
    const line = text.split(/\r?\n/).map((item) => item.replace(/^#+\s*/, "").trim()).find((item) => item && !item.startsWith("!") && !item.startsWith("[") && item.length > 20);
    if (line) return line.slice(0, 500);
  } catch { /* optional */ }
  return "";
}
async function inspectFolder(value) {
  const selectedPath = canonical(value); const root = await gitRoot(selectedPath);
  const effective = root || selectedPath; let remote = null; let branch = null;
  if (root) {
    const status = await repositoryStatus(root);
    remote = status.remote;
    branch = status.branch;
  }
  return { selectedPath, localPath: effective, gitRoot: root, isGit: Boolean(root), name: path.basename(effective), description: readDescription(effective), branch, remote, githubUrl: githubUrl(remote), primaryLanguage: detectLanguage(effective), hasAgents: fs.existsSync(path.join(effective, "AGENTS.md")), hasReadme: ["README.md", "README.MD", "readme.md"].some((name) => fs.existsSync(path.join(effective, name))) };
}
async function discoverRepositories(value) {
  const parent = canonical(value); const candidates = [];
  function visit(directory, depth) {
    if (depth > 2 || candidates.length >= 100) return;
    let entries = []; try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    if (entries.some((entry) => entry.isDirectory() && entry.name === ".git")) { candidates.push(directory); return; }
    for (const entry of entries) if (entry.isDirectory() && !["node_modules", ".git", "vendor", "dist", "build"].includes(entry.name)) visit(path.join(directory, entry.name), depth + 1);
  }
  visit(parent, 0); return Promise.all(candidates.map(inspectFolder));
}
function parseStatus(raw) {
  const result = { branch: null, detached: false, upstream: null, ahead: 0, behind: 0, files: [], counts: { modified: 0, added: 0, deleted: 0, untracked: 0, staged: 0, conflicts: 0, renamed: 0 } };
  for (const record of raw.split("\0").filter(Boolean)) {
    if (record.startsWith("# branch.head ")) { result.branch = record.slice(14); result.detached = result.branch === "(detached)"; }
    else if (record.startsWith("# branch.upstream ")) result.upstream = record.slice(18);
    else if (record.startsWith("# branch.ab ")) { const match = record.match(/\+(\d+)\s+-(\d+)/); if (match) { result.ahead = Number(match[1]); result.behind = Number(match[2]); } }
    else if (record.startsWith("? ")) { const file = record.slice(2); result.files.push({ path: file, index: "?", working: "?", staged: false, unstaged: true, kind: "untracked" }); result.counts.untracked += 1; }
    else if (record.startsWith("1 ") || record.startsWith("2 ")) {
      const parts = record.split(" "); const xy = parts[1]; const file = record.startsWith("1 ") ? parts.slice(8).join(" ") : parts.slice(9).join(" "); const index = xy[0]; const working = xy[1];
      const kind = xy.includes("U") ? "conflict" : xy.includes("R") ? "renamed" : xy.includes("A") ? "added" : xy.includes("D") ? "deleted" : "modified";
      result.files.push({ path: file, index, working, staged: index !== ".", unstaged: working !== ".", kind });
      if (index !== ".") result.counts.staged += 1; result.counts[kind === "conflict" ? "conflicts" : kind] += 1;
    } else if (record.startsWith("u ")) { const file = record.split(" ").slice(10).join(" "); result.files.push({ path: file, index: "U", working: "U", staged: true, unstaged: true, kind: "conflict" }); result.counts.conflicts += 1; }
  }
  result.clean = result.files.length === 0; return result;
}
async function repositoryStatus(rootValue) {
  const root = await gitRoot(rootValue); if (!root) return { available: true, isGit: false, clean: true, files: [], counts: {} };
  const [status, commit, origin] = await Promise.all([
    git(root, ["status", "--porcelain=v2", "--branch", "-z"]),
    git(root, ["log", "-1", "--format=%H%x00%s%x00%cI"], { allowFailure: true }),
    git(root, ["remote", "get-url", "origin"], { allowFailure: true }),
  ]);
  const parsed = parseStatus(status.stdout); const [hash, message, committedAt] = commit.stdout.trim().split("\0");
  const trackingRemote = parsed.upstream?.split("/")[0] || "origin";
  const push = trackingRemote === "origin" ? origin : await git(root, ["remote", "get-url", "--push", trackingRemote], { allowFailure: true });
  const pushUrl = push.code ? "" : push.stdout.trim();
  return { available: true, isGit: true, root, remoteName: trackingRemote, remote: pushUrl || origin.stdout.trim() || null, origin: origin.stdout.trim() || null, githubUrl: githubUrl(pushUrl || origin.stdout), ...parsed, lastCommit: hash ? { hash, shortHash: hash.slice(0, 8), message, committedAt } : null };
}
function queue(root, operation) {
  const previous = queues.get(root) || Promise.resolve(); const next = previous.catch(() => {}).then(operation); const tracked = next.finally(() => { if (queues.get(root) === tracked) queues.delete(root); }); queues.set(root, tracked); return tracked;
}
async function diff(rootValue, relative, staged = false) {
  const root = await gitRoot(rootValue); if (!root) throw new Error("This project is not a Git repository."); const file = inside(root, relative);
  const tracked = await git(root, ["ls-files", "--error-unmatch", "--", file.relative], { allowFailure: true });
  if (tracked.code && fs.existsSync(file.target)) {
    const stat = fs.statSync(file.target); if (!stat.isFile()) throw new Error("Diff preview is only available for files."); if (stat.size > DIFF_LIMIT) return { path: file.relative, binary: false, text: "Untracked file is too large to preview.", truncated: true };
    const content = fs.readFileSync(file.target); if (content.includes(0)) return { path: file.relative, binary: true, text: "Binary file — preview unavailable." };
    return { path: file.relative, binary: false, text: content.toString("utf8").split(/\r?\n/).map((line) => `+${line}`).join("\n"), truncated: false };
  }
  const result = await git(root, ["diff", "--no-ext-diff", "--no-color", staged ? "--cached" : "", "--", file.relative].filter(Boolean), { allowFailure: true, maxOutput: DIFF_LIMIT + 1 });
  if (result.stdout.includes("Binary files")) return { path: file.relative, binary: true, text: "Binary file — preview unavailable." };
  return { path: file.relative, binary: false, text: result.stdout.slice(0, DIFF_LIMIT), truncated: result.stdout.length > DIFF_LIMIT };
}
async function mutateFiles(rootValue, action, files) {
  const root = await gitRoot(rootValue); if (!root) throw new Error("This project is not a Git repository."); const safe = files.map((file) => inside(root, file).relative); if (!safe.length) throw new Error("Select at least one file.");
  return queue(root, async () => { if (action === "stage") await git(root, ["add", "--", ...safe]); else if (action === "unstage") await git(root, ["restore", "--staged", "--", ...safe]); else throw new Error("Unsupported Git action."); return repositoryStatus(root); });
}
async function commit(rootValue, input) {
  const root = await gitRoot(rootValue); if (!root) throw new Error("This project is not a Git repository."); const files = input.files.map((file) => inside(root, file).relative); if (!files.length) throw new Error("Select at least one file.");
  const suspicious = files.filter((file) => SECRET_FILE.test(file)); if (suspicious.length && !input.acknowledgeSensitive) throw new Error(`Sensitive-looking files require acknowledgement: ${suspicious.join(", ")}`);
  return queue(root, async () => {
    const before = await repositoryStatus(root); if (before.counts.conflicts) throw new Error("Resolve merge conflicts before committing.");
    if (input.push) {
      if (!before.githubUrl) throw new Error("Connect this project to GitHub before using Commit & push.");
      await git(root, ["fetch", before.remoteName || "origin"], { timeout: 120_000 });
      const fresh = await repositoryStatus(root);
      if (fresh.behind) throw new Error(`GitHub has ${fresh.behind} newer commit${fresh.behind === 1 ? "" : "s"}. Pull them before committing and pushing.`);
    }
    await git(root, ["add", "--", ...files]); await git(root, ["commit", "--only", "-m", input.message.trim(), "--", ...files], { timeout: 120_000 });
    const created = await git(root, ["log", "-1", "--format=%H%x00%s"]); const [hash, message] = created.stdout.trim().split("\0");
    if (input.push) await pushRoot(root, await repositoryStatus(root));
    return { hash, shortHash: hash.slice(0, 8), message, pushed: Boolean(input.push), status: await repositoryStatus(root) };
  });
}
async function pushRoot(root, status) {
  if (status.counts?.conflicts) throw new Error("Resolve merge conflicts before pushing.");
  if (status.detached || !status.branch) throw new Error("Choose a branch before pushing a detached HEAD.");
  if (status.behind) throw new Error(`GitHub has ${status.behind} newer commit${status.behind === 1 ? "" : "s"}. Pull them before pushing.`);
  if (status.upstream) await git(root, ["push"], { timeout: 120_000 });
  else {
    const origin = await git(root, ["remote", "get-url", "--push", "origin"], { allowFailure: true });
    if (origin.code || !origin.stdout.trim()) throw new Error("Add an origin remote before pushing to GitHub.");
    await git(root, ["push", "--set-upstream", "origin", status.branch], { timeout: 120_000 });
  }
}
async function pushRepository(rootValue) {
  const root = await gitRoot(rootValue); if (!root) throw new Error("This project is not a Git repository.");
  return queue(root, async () => {
    let before = await repositoryStatus(root);
    if (!before.githubUrl) throw new Error("Connect this project to GitHub before pushing.");
    await git(root, ["fetch", before.remoteName || "origin"], { timeout: 120_000 });
    before = await repositoryStatus(root);
    await pushRoot(root, before);
    return repositoryStatus(root);
  });
}
async function setupGithubRepository(rootValue, input = {}) {
  const selected = canonical(rootValue);
  const auth = await githubAuthStatus();
  if (!auth.authenticated) throw new Error("Sign in to GitHub before setting up this project.");
  let root = await gitRoot(selected);
  let initialized = false;
  if (!root) {
    if (!input.initialize) throw new Error("Initialize Git before connecting this folder to GitHub.");
    await git(selected, ["init", "-b", "main"], { timeout: 30_000 });
    root = await gitRoot(selected);
    initialized = true;
  }
  const existing = await git(root, ["remote", "get-url", "origin"], { allowFailure: true });
  if (!existing.code && existing.stdout.trim()) {
    const url = githubUrl(existing.stdout);
    if (!url) throw new Error("This repository already has a non-GitHub origin. Change it in a terminal first.");
    return { root, url, repository: url.replace("https://github.com/", ""), created: false, initialized, status: await repositoryStatus(root) };
  }
  const repository = githubRepositoryName(input.repository || path.basename(root), auth.login);
  const url = `https://github.com/${repository}`;
  if (input.mode === "connect") {
    await run("gh.exe", ["repo", "view", repository, "--json", "url", "--jq", ".url"], { timeout: 30_000, stripGithubTokens: true });
    await git(root, ["remote", "add", "origin", `${url}.git`]);
  } else {
    await run("gh.exe", ["repo", "create", repository, input.visibility === "public" ? "--public" : "--private", "--source", root, "--remote", "origin", "--description", String(input.description || "").slice(0, 350)], { timeout: 120_000, stripGithubTokens: true });
  }
  return { root, url, repository, created: input.mode !== "connect", initialized, status: await repositoryStatus(root) };
}
function publishBlockers(root, files) {
  const blockers = [];
  for (const relative of files) {
    const file = inside(root, relative);
    if (SECRET_FILE.test(file.relative)) { blockers.push({ file: file.relative, reason: "sensitive filename" }); continue; }
    if (!fs.existsSync(file.target)) continue;
    const stat = fs.lstatSync(file.target); if (stat.isSymbolicLink() || stat.isDirectory()) continue;
    if (stat.size > PUBLISH_FILE_LIMIT) { blockers.push({ file: file.relative, reason: "file exceeds 10 MB" }); continue; }
    const content = fs.readFileSync(file.target); if (content.includes(0)) continue;
    if (SECRET_CONTENT.some((pattern) => pattern.test(content.toString("utf8")))) blockers.push({ file: file.relative, reason: "possible credential" });
  }
  return blockers;
}
async function publishRepository(rootValue, input = {}) {
  const root = await gitRoot(rootValue); if (!root) throw new Error("This project is not a Git repository.");
  const auth = await githubAuthStatus(); if (!auth.authenticated) throw new Error("Sign in to GitHub before publishing this project.");
  return queue(root, async () => {
    const remote = await git(root, ["remote", "get-url", "--push", "origin"], { allowFailure: true });
    if (remote.code || !githubUrl(remote.stdout)) throw new Error("Connect an origin GitHub repository before publishing.");
    await git(root, ["fetch", "origin"], { timeout: 120_000 });
    let status = await repositoryStatus(root);
    if (status.counts?.conflicts) throw new Error("Resolve merge conflicts before publishing.");
    if (status.detached || !status.branch) throw new Error("Choose a branch before publishing a detached HEAD.");
    if (status.behind) throw new Error(`GitHub has ${status.behind} newer commit${status.behind === 1 ? "" : "s"}. Review and pull them before publishing.`);
    const files = [...new Set(status.files.map((item) => item.path))];
    const blockers = publishBlockers(root, files);
    if (blockers.length) throw new Error(`Safety check blocked publishing: ${blockers.map((item) => `${item.file} (${item.reason})`).join(", ")}`);
    let commitResult = null;
    if (files.length) {
      await git(root, ["add", "--", ...files]);
      const message = `Update ${String(input.projectName || path.basename(root)).replace(/[\r\n]+/g, " ").trim()}`.slice(0, 120);
      await git(root, ["commit", "--only", "-m", message, "--", ...files], { timeout: 120_000 });
      const created = await git(root, ["log", "-1", "--format=%H%x00%s"]); const [hash, committedMessage] = created.stdout.trim().split("\0");
      commitResult = { hash, shortHash: hash.slice(0, 8), message: committedMessage };
      status = await repositoryStatus(root);
    }
    const shouldPush = Boolean(status.ahead || commitResult);
    if (shouldPush) { await pushRoot(root, status); status = await repositoryStatus(root); }
    return { pushed: shouldPush, alreadyUpToDate: !shouldPush, commit: commitResult, files, checks: ["GitHub authentication", "GitHub origin", "branch state", "remote freshness", "merge conflicts", "sensitive filenames", "credential patterns", "large files"], status };
  });
}
async function fetchRepository(rootValue) { const root = await gitRoot(rootValue); if (!root) throw new Error("This project is not a Git repository."); return queue(root, async () => { await git(root, ["fetch"], { timeout: 120_000 }); return repositoryStatus(root); }); }
function fileVersion(value) { return createHash("sha256").update(value).digest("hex"); }
function readAgents(rootValue) {
  const root = canonical(rootValue); const file = path.join(root, "AGENTS.md"); if (!fs.existsSync(file)) return { exists: false, path: file, content: "", version: null, modifiedAt: null, newline: "\r\n" };
  const content = fs.readFileSync(file, "utf8"); const stat = fs.statSync(file); return { exists: true, path: file, content, version: fileVersion(content), modifiedAt: stat.mtime.toISOString(), newline: content.includes("\r\n") ? "\r\n" : "\n" };
}
function writeAgents(rootValue, input) {
  const root = canonical(rootValue); const current = readAgents(root); if (current.version && input.version !== current.version) throw new Error("AGENTS.md changed outside Notebook. Reload it before saving.");
  const newline = current.newline || "\r\n"; const content = String(input.content).replace(/\r?\n/g, newline); const file = path.join(root, "AGENTS.md"); const temporary = path.join(root, `.AGENTS.md.${process.pid}.tmp`);
  fs.writeFileSync(temporary, content, "utf8"); fs.renameSync(temporary, file); return readAgents(root);
}
function readReadme(rootValue) { const root = canonical(rootValue); for (const name of ["README.md", "README.MD", "readme.md"]) { const file = path.join(root, name); if (fs.existsSync(file)) return { path: file, content: fs.readFileSync(file, "utf8").slice(0, 250_000) }; } return null; }

module.exports = { SECRET_FILE, run, gitRoot, githubUrl, githubAuthStatus, githubSelectAccount, githubSignIn, inspectFolder, discoverRepositories, repositoryStatus, diff, mutateFiles, commit, pushRepository, setupGithubRepository, publishBlockers, publishRepository, fetchRepository, readAgents, writeAgents, readReadme };
