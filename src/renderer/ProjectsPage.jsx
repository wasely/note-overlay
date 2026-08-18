import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowUpRight, CheckCircle2, Code2, FolderOpen, GitBranch,
  GitCommit, GitFork as Github, GripVertical, MoreHorizontal, Plus, RefreshCw, Search,
  SquareTerminal, Upload, X,
} from "lucide-react";
import "./projects.css";

const STATUSES = ["active", "paused", "blocked", "completed", "archived"];
const TIERS = [
  { id: 1, name: "Now", hint: "What you are actively moving." },
  { id: 2, name: "Next", hint: "Ready when Now has room." },
  { id: 3, name: "Later", hint: "Worth doing, not urgent." },
  { id: 4, name: "Parked", hint: "Kept without taking focus." },
];
const SECRET_FILE = /(^|[\\/])(\.env(?:\..+)?|.*(?:credential|secret|token|service[-_]?account)|id_(rsa|dsa|ecdsa|ed25519)|.*\.(pem|p12|pfx|key))$/i;
const logoCache = new Map();

function words(value) {
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function projectCategory(project) {
  return String(project.category || "Uncategorized").trim() || "Uncategorized";
}

function projectTier(project) {
  if (Number(project.tier) >= 1 && Number(project.tier) <= 4) return Number(project.tier);
  return ({ critical: 1, high: 2, medium: 3 }[project.priority] || 4);
}

function githubUrl(project, repo) {
  return project.github_url || repo?.githubUrl || null;
}

function ProjectLogo({ project, load }) {
  const [source, setSource] = useState(() => logoCache.get(project.id) || null);
  useEffect(() => {
    if (!project.logo_path || !load) { setSource(null); return undefined; }
    if (logoCache.has(project.id)) { setSource(logoCache.get(project.id)); return undefined; }
    let active = true;
    load(project.id).then((value) => {
      logoCache.set(project.id, value || null);
      if (active) setSource(value || null);
    }).catch(() => logoCache.set(project.id, null));
    return () => { active = false; };
  }, [project.id, project.logo_path, load]);
  return source
    ? <img className="project-logo" src={source} alt="" draggable={false} />
    : <span className="project-logo project-logo-fallback"><GitBranch size={15} /></span>;
}

function Notice({ value }) {
  return value ? <div className={`project-notice ${value.error ? "is-error" : ""}`} role="status">{value.text}</div> : null;
}

function Empty({ title, body, action }) {
  return <div className="project-empty"><span><GitBranch size={21} /></span><strong>{title}</strong><p>{body}</p>{action}</div>;
}

function repoSummary(project, repo) {
  if (!project.local_path) return { tone: "warn", text: "Folder unavailable" };
  if (!project.git_root) return { tone: "muted", text: "Git not set up" };
  if (!repo || repo.loading) return { tone: "muted", text: "Checking Git…" };
  if (repo.error) return { tone: "warn", text: "Repository unavailable" };
  if (repo.counts?.conflicts) return { tone: "danger", text: `${repo.counts.conflicts} conflict${repo.counts.conflicts === 1 ? "" : "s"}` };
  if (repo.clean === false) return { tone: "warn", text: `${repo.files?.length || 0} change${repo.files?.length === 1 ? "" : "s"}` };
  if (repo.ahead) return { tone: "warn", text: `${repo.ahead} ready to push` };
  if (!githubUrl(project, repo)) return { tone: "muted", text: "GitHub not connected" };
  return { tone: "good", text: "GitHub current" };
}

function ProjectMenu({ project, repo, onEdit, onMove, onAction }) {
  return <details className="project-menu">
    <summary aria-label={`Actions for ${project.name}`}><MoreHorizontal size={17} /></summary>
    <div>
      <button onClick={() => onEdit(project)}>Edit project</button>
      <span>Move to</span>
      <div className="project-menu-tiers">{TIERS.map((tier) => <button key={tier.id} className={projectTier(project) === tier.id ? "is-current" : ""} onClick={() => onMove(project.id, tier.id, null)}>{tier.name}</button>)}</div>
      {project.local_path && <>
        <button onClick={() => onAction("folder", project)}><FolderOpen size={14} /> Open folder</button>
        <button onClick={() => onAction("editor", project)}><Code2 size={14} /> Open editor</button>
        <button onClick={() => onAction("terminal", project)}><SquareTerminal size={14} /> Open terminal</button>
      </>}
      {githubUrl(project, repo) && <button onClick={() => onAction("github", project, repo)}><Github size={14} /> Open GitHub</button>}
      <button onClick={() => onAction("archive", project)}>Archive</button>
      <button className="is-danger" onClick={() => onAction("remove", project)}>Remove from Notebook</button>
    </div>
  </details>;
}

function ProjectCard({ project, repo, api, onEdit, onMove, onAction, onPointerDrag, archived }) {
  const git = repoSummary(project, repo);
  return <article
    className={`priority-card ${archived ? "is-archived" : ""}`}
    data-project-id={project.id}
  >
    <header>
      {!archived && <button type="button" className="priority-drag" aria-label={`Drag ${project.name} to another rank`} onPointerDown={(event) => onPointerDrag(event, project.id)}><GripVertical size={15} /></button>}
      <button className="priority-title" onClick={() => onEdit(project)}><ProjectLogo project={project} load={api.logo} /><strong>{project.name}</strong></button>
      <ProjectMenu project={project} repo={repo} onEdit={onEdit} onMove={onMove} onAction={onAction} />
    </header>
    <div className="priority-meta"><span>{projectCategory(project)}</span>{project.primary_language && <span>{project.primary_language}</span>}</div>
    <p className={project.description ? "" : "is-empty"}>{project.description || "Add a one-line purpose"}</p>
    <button className="priority-next" onClick={() => onEdit(project)}><small>Next</small><span>{project.next_action || "Set the next action"}</span></button>
    <footer><span className={`repo-summary is-${git.tone}`}>{git.tone === "good" ? <CheckCircle2 size={12} /> : git.tone === "muted" ? <GitBranch size={12} /> : <AlertTriangle size={12} />}{git.text}</span></footer>
  </article>;
}

function PriorityBoard({ projects, repos, api, category, query, onEdit, onMove, onAction, dragRef, draggedId, setDraggedId }) {
  const archived = category === "Archived";
  const visible = projects.filter((project) => {
    const isArchived = ["completed", "archived"].includes(project.status);
    if (archived !== isArchived) return false;
    if (!archived && category !== "All" && projectCategory(project) !== category) return false;
    const haystack = `${project.name} ${project.description} ${project.next_action} ${projectCategory(project)} ${project.local_path || ""}`.toLowerCase();
    return !query || haystack.includes(query.toLowerCase());
  });

  if (archived) return visible.length
    ? <div className="archived-projects">{visible.map((project) => <ProjectCard key={project.id} project={project} repo={repos[project.id]} api={api} onEdit={onEdit} onMove={onMove} onAction={onAction} archived />)}</div>
    : <Empty title="No archived projects" body="Completed and archived projects will stay available here." />;

  function startPointerDrag(event, id) {
    event.preventDefault();
    const handle = event.currentTarget;
    const card = handle.closest(".priority-card");
    dragRef.current = id; setDraggedId(id); card?.classList.add("is-dragging");
    handle.setPointerCapture?.(event.pointerId);
    const finish = (pointerEvent) => {
      const target = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY);
      const lane = target?.closest(".priority-lane");
      const targetCard = target?.closest(".priority-card");
      const beforeId = targetCard?.dataset.projectId || null;
      if (lane && beforeId !== id) onMove(id, Number(lane.dataset.tier), beforeId);
      card?.classList.remove("is-dragging"); dragRef.current = null; setDraggedId(null);
      handle.removeEventListener("pointerup", finish); handle.removeEventListener("pointercancel", cancel);
    };
    const cancel = () => {
      card?.classList.remove("is-dragging"); dragRef.current = null; setDraggedId(null);
      handle.removeEventListener("pointerup", finish); handle.removeEventListener("pointercancel", cancel);
    };
    handle.addEventListener("pointerup", finish); handle.addEventListener("pointercancel", cancel);
  }

  return <div className={`priority-board ${draggedId ? "is-dragging" : ""}`}>{TIERS.map((tier) => {
    const items = visible.filter((project) => projectTier(project) === tier.id).sort((a, b) => (a.tier_order ?? a.manual_rank ?? 0) - (b.tier_order ?? b.manual_rank ?? 0));
    return <section
      className={`priority-lane tier-${tier.id}`}
      key={tier.id}
      data-tier={tier.id}
    >
      <header><span className="tier-number">{tier.id}</span><div><h2>{tier.name}</h2><p>{tier.hint}</p></div><strong>{items.length}</strong></header>
      <div className="priority-lane-cards">{items.map((project) => <ProjectCard
        key={project.id}
        project={project}
        repo={repos[project.id]}
        api={api}
        onEdit={onEdit}
        onMove={onMove}
        onAction={onAction}
        onPointerDrag={startPointerDrag}
      />)}{!items.length && <div className="priority-drop">Drop a project here</div>}</div>
    </section>;
  })}</div>;
}

function ProjectEditor({ project, categories, api, onClose, onSaved, setNotice }) {
  const [draft, setDraft] = useState({ name: project.name, category: projectCategory(project), tier: projectTier(project), description: project.description || "", nextAction: project.next_action || "", status: project.status });
  const [busy, setBusy] = useState(false);
  async function save(event) {
    event.preventDefault(); setBusy(true);
    try {
      let updated = await api.update(project.id, { name: draft.name, category: draft.category, description: draft.description, nextAction: draft.nextAction, status: draft.status });
      let all = null;
      if (draft.tier !== projectTier(project)) all = await api.move({ id: project.id, tier: draft.tier, beforeId: null });
      onSaved(updated, all); onClose(); setNotice({ text: `${draft.name} saved.` });
    } catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setBusy(false); }
  }
  return <div className="project-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="project-modal project-editor" role="dialog" aria-modal="true" aria-label="Edit project" onSubmit={save}>
      <header><div><strong>Edit project</strong><small>{project.local_path || "No local folder"}</small></div><button type="button" onClick={onClose} aria-label="Close"><X size={17} /></button></header>
      <label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
      <div className="project-form-row"><label>Category<input list="project-categories" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} required /><datalist id="project-categories">{categories.map((item) => <option key={item} value={item} />)}</datalist></label><label>Rank<select value={draft.tier} onChange={(event) => setDraft({ ...draft, tier: Number(event.target.value) })}>{TIERS.map((tier) => <option key={tier.id} value={tier.id}>{tier.id} · {tier.name}</option>)}</select></label></div>
      <label>Purpose<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="What is this project for?" /></label>
      <label>Next action<input value={draft.nextAction} onChange={(event) => setDraft({ ...draft, nextAction: event.target.value })} placeholder="The first thing to do when you return" /></label>
      <label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>{STATUSES.map((status) => <option key={status} value={status}>{words(status)}</option>)}</select></label>
      <footer><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy ? "Saving…" : "Save project"}</button></footer>
    </form>
  </div>;
}

function AddProjectDialog({ api, categories, projects, onClose, onAdded, setNotice }) {
  const [mode, setMode] = useState("choose");
  const [draft, setDraft] = useState(null);
  const [found, setFound] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  async function choose(single) {
    setBusy(true);
    try {
      if (single) {
        const result = await api.chooseFolder();
        if (!result.canceled) { setDraft({ ...result.project, category: "Uncategorized", tier: 4, nextAction: "" }); setMode("edit"); }
      } else {
        const result = await api.chooseParent();
        if (!result.canceled) {
          const existing = new Set(projects.flatMap((item) => [item.local_path, item.git_root, item.github_url]).filter(Boolean).map((item) => item.toLowerCase()));
          const available = result.projects.filter((item) => ![item.localPath, item.gitRoot, item.githubUrl].filter(Boolean).some((value) => existing.has(value.toLowerCase())));
          setFound(available); setSelected(new Set(available.map((item) => item.gitRoot))); setMode("discover");
        }
      }
    } catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setBusy(false); }
  }
  async function save(event) {
    event.preventDefault(); setBusy(true);
    try { const item = await api.create({ ...draft, status: "active" }); onAdded([item]); onClose(); }
    catch (error) { setNotice({ error: true, text: /UNIQUE/.test(error.message) ? "That repository is already a project." : error.message }); }
    finally { setBusy(false); }
  }
  async function importFound() {
    setBusy(true);
    try {
      const added = [];
      for (const item of found.filter((entry) => selected.has(entry.gitRoot))) added.push(await api.create({ ...item, status: "active", category: "Uncategorized", tier: 4, nextAction: "" }));
      onAdded(added); onClose();
    } catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setBusy(false); }
  }
  return <div className="project-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="project-modal" role="dialog" aria-modal="true" aria-label="Add project">
    <header><div><strong>Add project</strong><small>Connect a folder without changing it.</small></div><button onClick={onClose} aria-label="Close"><X size={17} /></button></header>
    {mode === "choose" && <div className="add-project-choices"><button onClick={() => choose(true)} disabled={busy}><FolderOpen size={22} /><strong>Choose one folder</strong><small>Git repository or regular project folder</small></button><button onClick={() => choose(false)} disabled={busy}><Search size={22} /><strong>Find repositories</strong><small>Scan one parent folder</small></button></div>}
    {mode === "edit" && draft && <form className="add-project-form" onSubmit={save}>
      <label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
      <div className="project-form-row"><label>Category<input list="new-project-categories" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} required /><datalist id="new-project-categories">{categories.map((item) => <option key={item} value={item} />)}</datalist></label><label>Starting rank<select value={draft.tier} onChange={(event) => setDraft({ ...draft, tier: Number(event.target.value) })}>{TIERS.map((tier) => <option key={tier.id} value={tier.id}>{tier.id} · {tier.name}</option>)}</select></label></div>
      <label>Purpose<textarea value={draft.description || ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      <label>Next action<input value={draft.nextAction || ""} onChange={(event) => setDraft({ ...draft, nextAction: event.target.value })} /></label>
      <code>{draft.localPath}</code>
      <footer><button type="button" onClick={() => setMode("choose")}>Back</button><button className="primary" disabled={busy}>{busy ? "Adding…" : "Add project"}</button></footer>
    </form>}
    {mode === "discover" && <div className="discover-projects"><p>{found.length ? `${found.length} repositories found.` : "No new repositories found."}</p>{found.map((item) => <label key={item.gitRoot}><input type="checkbox" checked={selected.has(item.gitRoot)} onChange={(event) => setSelected((current) => { const next = new Set(current); event.target.checked ? next.add(item.gitRoot) : next.delete(item.gitRoot); return next; })} /><span><strong>{item.name}</strong><small>{item.gitRoot}</small></span></label>)}<footer><button onClick={() => setMode("choose")}>Back</button><button className="primary" onClick={importFound} disabled={busy || !selected.size}>Add {selected.size || ""}</button></footer></div>}
  </section></div>;
}

function githubBucket(project, repo) {
  if (!project.local_path) return { id: "setup", reason: "Local folder unavailable" };
  if (!project.git_root || repo?.isGit === false) return { id: "setup", reason: "Git is not initialized" };
  if (!repo || repo.loading) return { id: "setup", reason: "Checking repository…", loading: true };
  if (repo.error) return { id: "setup", reason: repo.error, blocked: true };
  if (repo.counts?.conflicts) return { id: "setup", reason: "Resolve merge conflicts first", blocked: true };
  if (repo.behind) return { id: "setup", reason: `GitHub is ${repo.behind} commit${repo.behind === 1 ? "" : "s"} ahead`, blocked: true };
  if (repo.clean === false) return { id: "changes", reason: `${repo.files?.length || 0} changed file${repo.files?.length === 1 ? "" : "s"}` };
  if (repo.ahead) return { id: "push", reason: `${repo.ahead} commit${repo.ahead === 1 ? "" : "s"} ready` };
  if (!githubUrl(project, repo)) return { id: "setup", reason: "Connect a GitHub repository" };
  return { id: "clean", reason: "Up to date" };
}

function CommitDialog({ project, repo, api, auth, onClose, onDone, setNotice }) {
  const [files, setFiles] = useState(() => new Set(repo.files.map((item) => item.path)));
  const [activeFile, setActiveFile] = useState(repo.files[0] || null);
  const [diff, setDiff] = useState(null);
  const [message, setMessage] = useState(`Update ${project.name}`);
  const canPush = Boolean(auth?.authenticated && repo?.remote && githubUrl(project, repo));
  const [push, setPush] = useState(canPush);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const suspicious = [...files].filter((file) => SECRET_FILE.test(file));
  useEffect(() => {
    let live = true; setDiff(null);
    if (activeFile) api.diff({ root: project.git_root, path: activeFile.path, staged: activeFile.staged && !activeFile.unstaged }).then((value) => { if (live) setDiff(value); }).catch((error) => { if (live) setDiff({ text: error.message, error: true }); });
    return () => { live = false; };
  }, [activeFile?.path]);
  async function submit(event) {
    event.preventDefault(); setBusy(true);
    try {
      const result = await api.commit({ root: project.git_root, files: [...files], message, push, acknowledgeSensitive: ack });
      onDone(result.status); onClose(); setNotice({ text: push ? `Committed ${result.shortHash} and pushed to GitHub.` : `Committed ${result.shortHash} locally.` });
    } catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setBusy(false); }
  }
  return <div className="project-modal-backdrop"><form className="github-commit-modal" role="dialog" aria-modal="true" aria-label={`Commit ${project.name}`} onSubmit={submit}>
    <header><div><strong>Review and commit</strong><small>{project.name} · {repo.branch || "No branch"}</small></div><button type="button" onClick={onClose} aria-label="Close"><X size={17} /></button></header>
    <div className="commit-workspace"><section className="commit-file-list">{repo.files.map((item) => <div key={item.path} className={activeFile?.path === item.path ? "is-active" : ""}><input aria-label={`Include ${item.path}`} type="checkbox" checked={files.has(item.path)} onChange={(event) => setFiles((current) => { const next = new Set(current); event.target.checked ? next.add(item.path) : next.delete(item.path); return next; })} /><button type="button" onClick={() => setActiveFile(item)}><span>{item.path}</span><small>{words(item.kind)}</small></button></div>)}</section><section className="commit-diff"><header>{activeFile?.path || "Diff"}</header><pre>{diff ? diff.text || "No textual diff available." : "Loading diff…"}</pre></section></div>
    {suspicious.length > 0 && <label className="sensitive-warning"><input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} /><span><strong>Potential secret file</strong>Review {suspicious.join(", ")} before including it.</span></label>}
    <div className="commit-controls"><label>Commit message<input value={message} onChange={(event) => setMessage(event.target.value)} /></label>{canPush && <label className="commit-push"><input type="checkbox" checked={push} onChange={(event) => setPush(event.target.checked)} /> Push to GitHub after committing</label>}</div>
    <footer><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !message.trim() || !files.size || (suspicious.length > 0 && !ack)}>{busy ? "Working…" : push ? "Commit & push" : "Commit locally"}</button></footer>
  </form></div>;
}

function GithubSetupDialog({ project, api, onClose, onDone, setNotice }) {
  const suggested = project.name.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-|-$/g, "") || "project";
  const [draft, setDraft] = useState({ mode: "create", repository: suggested, visibility: "private" });
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true);
    try {
      const result = await api.githubSetup({ projectId: project.id, root: project.git_root || project.local_path, repository: draft.repository, mode: draft.mode, visibility: draft.visibility, initialize: !project.git_root, description: project.description || "" });
      onDone(result); onClose(); setNotice({ text: result.created ? `Created ${result.repository} on GitHub.` : `Connected ${result.repository}.` });
    } catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setBusy(false); }
  }
  return <div className="project-modal-backdrop"><form className="project-modal github-setup-modal" role="dialog" aria-modal="true" aria-label={`Set up GitHub for ${project.name}`} onSubmit={submit}>
    <header><div><strong>Set up GitHub</strong><small>{project.name}</small></div><button type="button" onClick={onClose} aria-label="Close"><X size={17} /></button></header>
    {!project.git_root && <p className="setup-note"><GitBranch size={15} /> This folder will be initialized as a Git repository.</p>}
    <div className="setup-mode"><button type="button" className={draft.mode === "create" ? "is-active" : ""} onClick={() => setDraft({ ...draft, mode: "create" })}>Create new</button><button type="button" className={draft.mode === "connect" ? "is-active" : ""} onClick={() => setDraft({ ...draft, mode: "connect" })}>Connect existing</button></div>
    <label>Repository<input value={draft.repository} onChange={(event) => setDraft({ ...draft, repository: event.target.value })} placeholder="owner/project or project" required /></label>
    {draft.mode === "create" && <label>Visibility<select value={draft.visibility} onChange={(event) => setDraft({ ...draft, visibility: event.target.value })}><option value="private">Private</option><option value="public">Public</option></select></label>}
    <p className="setup-copy">No files are committed or pushed during setup. You review them next.</p>
    <footer><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy ? "Setting up…" : draft.mode === "create" ? "Create repository" : "Connect repository"}</button></footer>
  </form></div>;
}

function GithubRow({ project, repo, auth, api, bucket, busy, onCommit, onSetup, onPush, onAction }) {
  const url = githubUrl(project, repo);
  let action = null;
  if (bucket.id === "changes") action = <button className="primary" onClick={() => onCommit(project)}>Review & commit</button>;
  else if (bucket.id === "push") action = auth?.authenticated ? <button className="primary" disabled={busy} onClick={() => onPush(project)}><Upload size={14} /> {busy ? "Pushing…" : "Push"}</button> : null;
  else if (bucket.id === "setup" && !bucket.loading && !bucket.blocked && project.local_path) action = auth?.authenticated ? <button className="primary" onClick={() => onSetup(project)}>Set up</button> : null;
  else if (bucket.id === "clean" && url) action = <button onClick={() => onAction("github", project, repo)}>Open <ArrowUpRight size={13} /></button>;
  if (bucket.blocked && project.local_path) action = <button onClick={() => onAction("terminal", project)}>Open terminal</button>;
  return <article className="github-project-row"><ProjectLogo project={project} load={api.logo} /><div className="github-project-name"><strong>{project.name}</strong><small>{repo?.branch || (project.git_root ? "No branch" : "No Git repository")}</small></div><div className={`github-project-state state-${bucket.id}`}><span>{bucket.id === "clean" ? <CheckCircle2 size={13} /> : bucket.id === "changes" ? <GitCommit size={13} /> : bucket.id === "push" ? <Upload size={13} /> : <AlertTriangle size={13} />}{bucket.reason}</span></div><div className="github-project-action">{action}</div></article>;
}

function GithubPage({ projects, repos, auth, api, busyId, onCommit, onSetup, onPush, onAction, onSignIn, onRefresh }) {
  const active = projects.filter((project) => !["completed", "archived"].includes(project.status));
  const groups = [
    { id: "changes", title: "Changes to commit", hint: "Review files before they leave this computer." },
    { id: "push", title: "Ready to push", hint: "Local commits not yet on GitHub." },
    { id: "setup", title: "Needs setup", hint: "Connection or repository state needs attention." },
    { id: "clean", title: "Up to date", hint: "Nothing waiting." },
  ].map((group) => ({ ...group, items: active.map((project) => ({ project, repo: repos[project.id], bucket: githubBucket(project, repos[project.id]) })).filter((item) => item.bucket.id === group.id) }));
  return <div className="github-page">
    <section className={`github-account ${auth?.authenticated ? "is-connected" : ""}`}><Github size={20} /><div><strong>{auth?.authenticated ? `Connected as @${auth.login}` : auth?.available === false ? "GitHub CLI required" : "Connect GitHub"}</strong><p>{auth?.authenticated ? "Projects can commit and push through your existing GitHub CLI login." : auth?.available === false ? "Install GitHub CLI, then reopen Notebook." : "Sign in once to create repositories and push commits."}</p></div><div>{!auth?.authenticated && auth?.available !== false && <button className="primary" onClick={onSignIn}>Sign in</button>}<button onClick={onRefresh}><RefreshCw size={14} /> Refresh</button></div></section>
    <div className="github-groups">{groups.map((group) => <section className={`github-group group-${group.id}`} key={group.id}><header><div><h2>{group.title}</h2><p>{group.hint}</p></div><span>{group.items.length}</span></header>{group.items.length ? <div>{group.items.map(({ project, repo, bucket }) => <GithubRow key={project.id} project={project} repo={repo} bucket={bucket} auth={auth} api={api} busy={busyId === project.id} onCommit={onCommit} onSetup={onSetup} onPush={onPush} onAction={onAction} />)}</div> : <p className="github-none">None</p>}</section>)}</div>
  </div>;
}

export function ProjectsPage({ api, onHide }) {
  const [projects, setProjects] = useState([]);
  const [repos, setRepos] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [section, setSection] = useState(() => localStorage.getItem("projects:section") || "priorities");
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const dragRef = useRef(null);
  const [editing, setEditing] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [committing, setCommitting] = useState(null);
  const [settingUp, setSettingUp] = useState(null);
  const [auth, setAuth] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => { load(); loadAuth(); }, []);
  useEffect(() => { localStorage.setItem("projects:section", section); }, [section]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(null), 5500); return () => clearTimeout(timer); } return undefined; }, [notice]);

  async function loadAuth() {
    try { setAuth(await api.githubAuthStatus()); }
    catch { setAuth({ available: false, authenticated: false, login: null }); }
  }
  async function refreshProject(project) {
    if (!project.git_root) { setRepos((state) => ({ ...state, [project.id]: { available: true, isGit: false, clean: true, files: [], counts: {} } })); return; }
    setRepos((state) => ({ ...state, [project.id]: { ...(state[project.id] || {}), loading: true } }));
    try { const value = await api.status(project.git_root); setRepos((state) => ({ ...state, [project.id]: value })); }
    catch (error) { setRepos((state) => ({ ...state, [project.id]: { error: error.message, available: false, files: [], counts: {} } })); }
  }
  async function load() {
    setLoading(true); setLoadError("");
    try { const items = await api.list(); setProjects(items); setLoading(false); items.forEach(refreshProject); }
    catch (error) { setLoadError(error.message); setLoading(false); }
  }
  function refreshAll() { projects.forEach(refreshProject); loadAuth(); }
  async function moveProject(id, tier, beforeId) {
    if (!id) return;
    const previous = projects;
    const moved = previous.find((item) => item.id === id); if (!moved) return;
    const next = previous.filter((item) => item.id !== id);
    const updated = { ...moved, tier };
    const index = beforeId ? next.findIndex((item) => item.id === beforeId) : -1;
    if (index >= 0) next.splice(index, 0, updated); else next.push(updated);
    setProjects(next);
    try { setProjects(await api.move({ id, tier, beforeId: beforeId || null })); setNotice({ text: `${moved.name} moved to ${TIERS.find((item) => item.id === tier)?.name}.` }); }
    catch (error) { setProjects(previous); setNotice({ error: true, text: error.message }); }
  }
  async function action(kind, project, repo = repos[project.id]) {
    try {
      if (kind === "remove") {
        if (!confirm(`Remove ${project.name} from Notebook? Repository files stay untouched.`)) return;
        await api.remove(project.id); setProjects((items) => items.filter((item) => item.id !== project.id)); setNotice({ text: `${project.name} removed. Repository files untouched.` }); return;
      }
      if (kind === "archive") {
        const updated = await api.update(project.id, { status: "archived" }); setProjects((items) => items.map((item) => item.id === updated.id ? updated : item)); setNotice({ text: `${project.name} archived.` }); return;
      }
      await api.open(kind === "github" ? { kind, url: githubUrl(project, repo) } : { kind, path: project.local_path });
    } catch (error) { setNotice({ error: true, text: error.message }); }
  }
  async function signIn() {
    try { setAuth(await api.githubSignIn()); setNotice({ text: "GitHub connected." }); }
    catch (error) { setNotice({ error: true, text: error.message }); }
  }
  async function push(project) {
    setBusyId(project.id);
    try { const repo = await api.push(project.git_root); setRepos((state) => ({ ...state, [project.id]: repo })); setNotice({ text: `${project.name} pushed to GitHub.` }); }
    catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setBusyId(null); }
  }
  const categories = useMemo(() => [...new Set(projects.filter((project) => !["completed", "archived"].includes(project.status)).map(projectCategory))].sort((a, b) => a.localeCompare(b)), [projects]);
  const activeCount = projects.filter((project) => !["completed", "archived"].includes(project.status)).length;

  return <section className="projects-page-simple">
    <header className="projects-simple-header"><div><h1>Projects</h1><p>{section === "priorities" ? "Choose what deserves your attention." : "Review, commit, and publish safely."}</p></div><div><button onClick={onHide} aria-label="Hide notebook"><X size={17} /></button><button className="primary" onClick={() => setAddOpen(true)}><Plus size={15} /> Add project</button></div></header>
    <Notice value={notice} />
    <nav className="project-section-tabs" aria-label="Project pages"><button className={section === "priorities" ? "is-active" : ""} onClick={() => setSection("priorities")}>Priorities</button><button className={section === "github" ? "is-active" : ""} onClick={() => setSection("github")}><Github size={14} /> GitHub</button></nav>
    {loading ? <Empty title="Loading projects" body="Opening your local workspace…" /> : loadError ? <Empty title="Projects unavailable" body={loadError} action={<button onClick={load}>Try again</button>} /> : !projects.length ? <Empty title="Add your first project" body="Connect a local folder, choose its category, then place it in a rank." action={<button className="primary" onClick={() => setAddOpen(true)}>Add project</button>} /> : section === "priorities" ? <>
      <div className="project-board-toolbar"><div className="project-categories"><button className={category === "All" ? "is-active" : ""} onClick={() => setCategory("All")}>All <span>{activeCount}</span></button>{categories.map((item) => <button key={item} className={category === item ? "is-active" : ""} onClick={() => setCategory(item)}>{item}</button>)}<button className={category === "Archived" ? "is-active" : ""} onClick={() => setCategory("Archived")}>Archived</button></div><label><Search size={14} /><input aria-label="Search projects" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" /></label></div>
      <PriorityBoard projects={projects} repos={repos} api={api} category={category} query={query} onEdit={setEditing} onMove={moveProject} onAction={action} dragRef={dragRef} draggedId={draggedId} setDraggedId={setDraggedId} />
    </> : <GithubPage projects={projects} repos={repos} auth={auth} api={api} busyId={busyId} onCommit={(project) => setCommitting(project)} onSetup={(project) => setSettingUp(project)} onPush={push} onAction={action} onSignIn={signIn} onRefresh={refreshAll} />}
    {editing && <ProjectEditor project={editing} categories={categories} api={api} onClose={() => setEditing(null)} onSaved={(updated, all) => setProjects(all || projects.map((item) => item.id === updated.id ? updated : item))} setNotice={setNotice} />}
    {addOpen && <AddProjectDialog api={api} categories={categories} projects={projects} onClose={() => setAddOpen(false)} onAdded={(items) => { setProjects((current) => [...current, ...items]); items.forEach(refreshProject); setNotice({ text: `${items.length} project${items.length === 1 ? "" : "s"} added.` }); }} setNotice={setNotice} />}
    {committing && <CommitDialog project={committing} repo={repos[committing.id]} api={api} auth={auth} onClose={() => setCommitting(null)} onDone={(repo) => setRepos((state) => ({ ...state, [committing.id]: repo }))} setNotice={setNotice} />}
    {settingUp && <GithubSetupDialog project={settingUp} api={api} onClose={() => setSettingUp(null)} onDone={(result) => { setProjects((items) => items.map((item) => item.id === result.project.id ? result.project : item)); setRepos((state) => ({ ...state, [result.project.id]: result.status })); }} setNotice={setNotice} />}
  </section>;
}
