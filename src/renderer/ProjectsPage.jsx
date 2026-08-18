import React, { useEffect, useMemo, useRef, useState } from "react";
import "./projects.css";

const STATUSES = ["active", "paused", "blocked", "completed", "archived"];
const PRIORITIES = ["critical", "high", "medium", "low", "none"];
const TASK_STATES = [["todo", "To Do"], ["in_progress", "In Progress"], ["blocked", "Blocked"], ["done", "Done"]];
const AGENTS_STARTER = "# Project Instructions\n\n## Purpose\n\n## Architecture\n\n## Development Commands\n\n## Important Files\n\n## Implementation Rules\n\n## Testing and Verification\n\n## Current Priorities\n";

function words(value) { return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function relativeTime(value) {
  if (!value) return "Never"; const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Just now"; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`; return new Date(value).toLocaleDateString();
}
function taskProgress(project) { const tasks = project.tasks?.filter((task) => task.status !== "archived") || []; const done = tasks.filter((task) => task.status === "done").length; return { done, total: tasks.length, percent: tasks.length ? Math.round(done / tasks.length * 100) : 0 }; }
function attention(project, status) {
  const items = []; if (!project.local_path) items.push("Missing local path"); else if (status?.available === false) items.push("Repository unavailable");
  if (project.status === "blocked") items.push("Project blocked"); if (status?.counts?.conflicts) items.push(`${status.counts.conflicts} conflict${status.counts.conflicts === 1 ? "" : "s"}`);
  if (status?.clean === false) { const count = status.files?.length || 0; items.push(`${count} uncommitted file${count === 1 ? "" : "s"}`); } if (status?.ahead) items.push(`${status.ahead} commit${status.ahead === 1 ? "" : "s"} ahead`);
  const overdue = (project.tasks || []).filter((task) => task.status !== "done" && task.due_date && task.due_date < new Date().toISOString().slice(0, 10)).length; if (overdue) items.push(`${overdue} overdue task${overdue === 1 ? "" : "s"}`);
  if (project.git_root && !project.github_url && !status?.remote) items.push("Missing GitHub remote");
  if (project.status === "active" && project.last_worked_at && Date.now() - new Date(project.last_worked_at).getTime() > 30 * 86400000) items.push("Project is stale");
  return items;
}
function MarkdownPreview({ content, label }) {
  let code = false;
  return <div className="markdown-preview" aria-label={label}>{String(content || "").split(/\r?\n/).map((line, index) => {
    if (line.startsWith("```")) { code = !code; return <span className="markdown-fence" key={index}>{line}</span>; }
    if (code) return <code key={index}>{line || " "}</code>;
    const heading = line.match(/^(#{1,3})\s+(.+)/); if (heading) { const Tag = `h${heading[1].length}`; return <Tag key={index}>{heading[2]}</Tag>; }
    const list = line.match(/^\s*[-*]\s+(.+)/); if (list) return <p className="markdown-list" key={index}>• {list[1]}</p>;
    return line ? <p key={index}>{line}</p> : <br key={index} />;
  })}</div>;
}
function Notice({ notice }) { return notice ? <div className={`project-notice ${notice.error ? "error" : ""}`} role="status">{notice.text}</div> : null; }
// Importance is expressed as Rank 1-3 in the UI and stored in the existing priority
// column, so nothing about the database or older projects has to change.
const RANKS = [
  { rank: 1, priority: "critical", label: "Now", heading: "Now", blurb: "Projects receiving active attention." },
  { rank: 2, priority: "high", label: "Queued", heading: "Queued", blurb: "Ready when current work has room." },
  { rank: 3, priority: "medium", label: "Later", heading: "Later", blurb: "Worth keeping, intentionally deferred." },
];
const PRIORITY_TO_RANK = { critical: 1, high: 2, medium: 3 };
const RANK_TO_PRIORITY = { 1: "critical", 2: "high", 3: "medium", 0: "none" };
function rankOf(project) { return PRIORITY_TO_RANK[project.priority] || 0; }

const GENERIC_PROJECT_TAGS = new Set(["mine", "live", "code", "else", "finish", "later", "unranked", "vendor", "reference"]);
function projectSummary(project) {
  const description = String(project.description || "").trim();
  if (description && !/^<[^>]+>/.test(description)) return description;
  return project.workshop?.summary || "Add a plain-language explanation.";
}
function projectLabels(project) {
  const workshop = project.workshop || {};
  const category = workshop.category || (project.category && project.category !== "Uncategorized" ? project.category : "");
  const ownership = workshop.ownership === "vendor" ? "Reference" : workshop.workspace;
  const existing = (project.tags || []).filter((tag) => !GENERIC_PROJECT_TAGS.has(String(tag).toLowerCase()));
  const labels = [category, ...existing, project.primary_language, ownership]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map(words);
  return [...new Set(labels)].slice(0, 3);
}
function repositorySummary(project, repo) {
  if (!project.local_path) return { tone: "warn", text: "Folder unavailable" };
  if (!project.git_root) return { tone: "muted", text: "Local folder" };
  if (!repo || repo.loading) return { tone: "muted", text: "Checking repository" };
  if (repo.error || repo.available === false) return { tone: "warn", text: "Repository unavailable" };
  if (repo.counts?.conflicts) return { tone: "danger", text: `${repo.counts.conflicts} conflict${repo.counts.conflicts === 1 ? "" : "s"}` };
  if (repo.clean === false) return { tone: "warn", text: `${repo.files?.length || 0} change${repo.files?.length === 1 ? "" : "s"}` };
  if (repo.ahead) return { tone: "warn", text: `${repo.ahead} ready to push` };
  if (project.github_url || repo.githubUrl || repo.remote) return { tone: "good", text: "GitHub current" };
  return { tone: "muted", text: "Local repository" };
}
function RankPill({ project }) {
  const rank = rankOf(project);
  const label = rank ? `Rank ${rank}` : "Unranked";
  return <span className={`project-pill rank-pill rank-pill-${rank}`} title={rank ? `Rank ${rank}` : "Unranked"}>{label}</span>;
}

function RankPicker({ project, onRank }) {
  const current = rankOf(project);
  return <div className="rank-picker" role="group" aria-label={`Importance for ${project.name}`}>
    {RANKS.map(({ rank, label }) => <button
      type="button"
      key={rank}
      className={`rank-chip rank-${rank} ${current === rank ? "is-active" : ""}`}
      aria-pressed={current === rank}
      title={label}
      onClick={(event) => { event.stopPropagation(); onRank(project, current === rank ? 0 : rank); }}
    >{rank}</button>)}
  </div>;
}

// Inline explanation. Saves on blur so a project can be described without opening it.
function ProjectExplanation({ project, onExplain }) {
  const summary = projectSummary(project);
  const [value, setValue] = useState(summary);
  const [editing, setEditing] = useState(false);
  useEffect(() => { setValue(summary); }, [project.id, summary]);
  if (!editing) return <button type="button" className="project-explain" onClick={(event) => { event.stopPropagation(); setEditing(true); }} title="Edit project explanation">
    {summary}
  </button>;
  return <textarea
    className="project-explain-input"
    autoFocus
    value={value}
    aria-label={`What ${project.name} is`}
    placeholder="Explain what this project does in one sentence."
    onClick={(event) => event.stopPropagation()}
    onChange={(event) => setValue(event.target.value)}
    onBlur={() => { setEditing(false); if (value.trim() && value.trim() !== String(project.description || "").trim()) onExplain(project, value.trim()); }}
    onKeyDown={(event) => { if (event.key === "Escape") { setValue(summary); setEditing(false); } }}
  />;
}

function StatusPill({ value, kind = "status" }) { return <span className={`project-pill ${kind}-${value}`}>{words(value)}</span>; }
const logoCache = new Map();
function ProjectLogo({ project, load }) {
  const [source, setSource] = useState(() => logoCache.get(project.id) || null);
  useEffect(() => {
    if (!project.logo_path || !load) { setSource(null); return undefined; }
    if (logoCache.has(project.id)) { setSource(logoCache.get(project.id)); return undefined; }
    let active = true;
    load(project.id).then((value) => { logoCache.set(project.id, value || null); if (active) setSource(value || null); }).catch(() => { logoCache.set(project.id, null); });
    return () => { active = false; };
  }, [project.id, project.logo_path, load]);
  if (!source) return <span className="project-repo-icon">◇</span>;
  return <img className="project-repo-logo" src={source} alt="" draggable={false} />;
}

function Empty({ title, body, action }) { return <div className="projects-empty"><span>⌂</span><strong>{title}</strong><p>{body}</p>{action}</div>; }

function ProjectCard({ project, repo, onOpen, onRefresh, onQuickAction, onRank, onExplain, onDragStart, onDrop, onLogo }) {
  const progress = taskProgress(project);
  const alerts = attention(project, repo);
  const repository = repositorySummary(project, repo);
  const labels = projectLabels(project);
  return <article className="project-card" draggable onDragStart={(event) => onDragStart(event, project.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, project.id)}>
    <header>
      <button className="project-card-title" onClick={() => onOpen(project.id)}><ProjectLogo project={project} load={onLogo} /><span><strong>{project.name}</strong></span></button>
      <RankPicker project={project} onRank={onRank} />
      <details><summary aria-label={`Actions for ${project.name}`}>•••</summary><div className="project-menu"><button onClick={() => onOpen(project.id)}>Open project</button>{project.git_root && <><button onClick={() => onOpen(project.id, "changes")}>View changes</button><button onClick={() => onOpen(project.id, "commit")}>Commit changes</button></>}<button onClick={() => onRefresh(project)}>Refresh status</button>{project.local_path && <><button onClick={() => onQuickAction("folder", project)}>Open local folder</button><button onClick={() => onQuickAction("terminal", project)}>Open in terminal</button><button onClick={() => onQuickAction("editor", project)}>Open in editor</button><button onClick={() => onQuickAction("copy", project)}>Copy local path</button></>}{project.github_url && <button onClick={() => onQuickAction("github", project)}>Open GitHub</button>}<button onClick={() => onQuickAction(project.status === "paused" ? "resume" : "pause", project)}>{project.status === "paused" ? "Resume" : "Pause"}</button><button onClick={() => onQuickAction("complete", project)}>Mark complete</button><button onClick={() => onQuickAction("archive", project)}>Archive</button><button className="project-menu-danger" onClick={() => onQuickAction("remove", project)}>Remove from Notebook</button></div></details>
    </header>
    <ProjectExplanation project={project} onExplain={onExplain} />
    <div className="project-card-meta">
      {labels.map((label) => <span key={label}>{label}</span>)}
      {project.status !== "active" ? <StatusPill value={project.status} /> : null}
    </div>
    {progress.total > 0 ? <div className="project-progress"><span><i style={{ width: `${progress.percent}%` }} /></span><small>{progress.done}/{progress.total} tasks</small></div> : null}
    {alerts.length > 0 ? <div className="project-alerts">{alerts.slice(0, 2).map((item) => <span key={item}>! {item}</span>)}</div> : null}
    <footer>
      <span className={`project-repo-state is-${repository.tone}`}>{repository.text}</span>
      <span>{project.tasks?.filter((task) => task.status !== "done" && task.status !== "archived").length || 0} open tasks</span>
      <span>{relativeTime(project.last_worked_at || project.updated_at)}</span>
    </footer>
  </article>;
}

function AddProjectDialog({ api, projects, onClose, onAdded, setNotice }) {
  const [mode, setMode] = useState("choose"); const [draft, setDraft] = useState(null); const [found, setFound] = useState([]); const [selected, setSelected] = useState(new Set()); const [busy, setBusy] = useState(false);
  async function choose(single) {
    setBusy(true); try {
      if (single) { const result = await api.chooseFolder(); if (!result.canceled) { setDraft({ ...result.project, status: "active", priority: "none", tags: [], nextAction: "" }); setMode("edit"); } }
      else { const result = await api.chooseParent(); if (!result.canceled) { const duplicates = new Set(projects.flatMap((item) => [item.local_path, item.git_root, item.github_url]).filter(Boolean).map((item) => item.toLowerCase())); const available = result.projects.filter((item) => ![item.localPath, item.gitRoot, item.githubUrl].filter(Boolean).some((value) => duplicates.has(value.toLowerCase()))); setFound(available); setSelected(new Set(available.map((item) => item.gitRoot))); setMode("discover"); } }
    } catch (error) { setNotice({ error: true, text: error.message }); } finally { setBusy(false); }
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); try { const item = await api.create(draft); onAdded([item]); onClose(); } catch (error) { setNotice({ error: true, text: /UNIQUE/.test(error.message) ? "That repository is already a project." : error.message }); } finally { setBusy(false); }
  }
  async function importFound() { setBusy(true); try { const added = []; for (const item of found.filter((entry) => selected.has(entry.gitRoot))) added.push(await api.create({ ...item, status: "active", priority: "none", tags: [], nextAction: "" })); onAdded(added); onClose(); } catch (error) { setNotice({ error: true, text: error.message }); } finally { setBusy(false); } }
  return <div className="project-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="project-modal" role="dialog" aria-modal="true" aria-label="Add project">
    <header><div><strong>Add Project</strong><small>Connect a local folder without changing it.</small></div><button onClick={onClose} aria-label="Close add project">×</button></header>
    {mode === "choose" && <div className="add-project-choices"><button onClick={() => choose(true)} disabled={busy}><span>◇</span><strong>Existing folder</strong><small>Choose a repository or any child folder.</small></button><button onClick={() => choose(false)} disabled={busy}><span>⌕</span><strong>Discover repositories</strong><small>Scan one parent folder, at most two levels deep.</small></button></div>}
    {mode === "edit" && draft && <form className="project-form" onSubmit={save}><label>Name<input aria-label="Project name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label><label>Description<textarea aria-label="Project description" value={draft.description || ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><div className="project-form-row"><label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>{STATUSES.slice(0, 4).map((item) => <option key={item} value={item}>{words(item)}</option>)}</select></label><label>Priority<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}>{PRIORITIES.map((item) => <option key={item} value={item}>{words(item)}</option>)}</select></label></div><label>Tags<input value={(draft.tags || []).join(", ")} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} placeholder="personal, app, release" /></label><div className="detected-project"><span>{draft.isGit ? `Git repository${draft.branch ? ` · ${draft.branch}` : ""}` : "Non-Git folder · limited features"}</span><code>{draft.localPath}</code>{draft.githubUrl && <code>{draft.githubUrl}</code>}</div><footer><button type="button" onClick={() => setMode("choose")}>Back</button><button className="primary" type="submit" disabled={busy}>{busy ? "Adding…" : "Add project"}</button></footer></form>}
    {mode === "discover" && <div className="discover-projects"><p>{found.length ? `${found.length} repositories ready to import.` : "No new repositories found within two levels."}</p>{found.map((item) => <label key={item.gitRoot}><input type="checkbox" checked={selected.has(item.gitRoot)} onChange={(event) => setSelected((current) => { const next = new Set(current); event.target.checked ? next.add(item.gitRoot) : next.delete(item.gitRoot); return next; })} /><span><strong>{item.name}</strong><small>{item.gitRoot}</small></span></label>)}<footer><button onClick={() => setMode("choose")}>Back</button><button className="primary" onClick={importFound} disabled={busy || !selected.size}>Import {selected.size || ""}</button></footer></div>}
  </section></div>;
}

function OverviewTab({ project, repo, readme, onSave, onAction }) {
  const [draft, setDraft] = useState(project); useEffect(() => setDraft(project), [project.id, project.updated_at]); const progress = taskProgress(project);
  return <div className="project-detail-grid"><form className="project-panel project-overview-form" onSubmit={(event) => { event.preventDefault(); onSave({ name: draft.name, description: draft.description, status: draft.status, priority: draft.priority, tags: draft.tags, notes: draft.notes }); }}><header><strong>Project overview</strong><button className="primary" type="submit">Save changes</button></header><label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>Description<textarea value={draft.description || ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><div className="project-form-row"><label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>{STATUSES.map((item) => <option key={item} value={item}>{words(item)}</option>)}</select></label><label>Priority<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}>{PRIORITIES.map((item) => <option key={item} value={item}>{words(item)}</option>)}</select></label></div><label>Tags<input value={(draft.tags || []).join(", ")} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label><label>Project notes<textarea value={draft.notes || ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label></form><aside className="project-detail-rail"><section className="project-panel"><header><strong>Repository</strong><div><button onClick={() => onAction("refresh")}>Refresh</button>{project.git_root && <button onClick={() => onAction("fetch")}>Fetch</button>}</div></header><dl><div><dt>Local path</dt><dd>{project.local_path || "Not connected"}</dd></div><div><dt>GitHub</dt><dd>{project.github_url || "Not connected"}</dd></div><div><dt>Branch</dt><dd>{repo?.branch || "—"}</dd></div><div><dt>Last commit</dt><dd>{repo?.lastCommit ? `${repo.lastCommit.message} · ${relativeTime(repo.lastCommit.committedAt)}` : "—"}</dd></div><div><dt>Last worked</dt><dd>{relativeTime(project.last_worked_at)}</dd></div></dl><div className="project-quick-actions">{project.local_path && <><button onClick={() => onAction("folder")}>Folder</button><button onClick={() => onAction("terminal")}>Terminal</button><button onClick={() => onAction("editor")}>Editor</button></>}{project.github_url && <button onClick={() => onAction("github")}>GitHub</button>}</div></section><section className="project-panel"><header><strong>Progress</strong><span>{progress.percent}%</span></header><div className="large-progress"><i style={{ width: `${progress.percent}%` }} /></div><p>{progress.done} completed · {progress.total - progress.done} remaining</p></section></aside>{readme && <section className="project-panel project-readme"><header><strong>README</strong><small>{readme.path}</small></header><MarkdownPreview content={readme.content} label="README preview" /></section>}</div>;
}

function TasksTab({ project, onCreate, onUpdate, onRemove }) {
  const [title, setTitle] = useState(""); const [filter, setFilter] = useState(""); const [query, setQuery] = useState("");
  async function add(event) { event.preventDefault(); if (!title.trim()) return; await onCreate({ title, status: "todo", priority: "medium" }); setTitle(""); }
  const visible = (task) => (!filter || task.status === filter) && (!query || `${task.title} ${task.description} ${(task.tags || []).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="tasks-workspace"><form className="quick-task" onSubmit={add}><input aria-label="New project task" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Add a task and press Enter…" /><button className="primary" type="submit" disabled={!title.trim()}>Add task</button></form><div className="task-toolbar"><input aria-label="Search project tasks" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" /><select aria-label="Filter project tasks" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">All states</option>{TASK_STATES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span>{project.tasks.filter((task) => task.status !== "done" && task.status !== "archived").length} active · {project.tasks.filter((task) => task.status === "done").length} done</span></div><div className="task-board">{TASK_STATES.map(([state, label]) => { const tasks = project.tasks.filter((task) => task.status === state && visible(task)); return <section key={state} className={`task-column state-${state}`}><header><strong>{label}</strong><span>{tasks.length}</span></header>{tasks.map((task, index) => <article key={task.id} draggable onDragStart={(event) => event.dataTransfer.setData("text/task-id", task.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const id = event.dataTransfer.getData("text/task-id"); if (id) onUpdate(id, { status: state, manualOrder: index }); }}><textarea aria-label={`Task ${task.title}`} value={task.title} onChange={(event) => onUpdate(task.id, { title: event.target.value })} /><div><StatusPill value={task.priority} kind="priority" /><select aria-label={`Move ${task.title}`} value={task.status} onChange={(event) => onUpdate(task.id, { status: event.target.value })}>{TASK_STATES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select><button aria-label={`Delete ${task.title}`} onClick={() => onRemove(task.id)}>×</button></div>{task.due_date && <small className={task.due_date < new Date().toISOString().slice(0, 10) && task.status !== "done" ? "overdue" : ""}>Due {task.due_date}</small>}</article>)}{!tasks.length && <p>Drop tasks here</p>}</section>; })}</div></div>;
}

function ChangesTab({ project, repo, api, onStatus, setNotice, autoCommit = false }) {
  const [selected, setSelected] = useState(new Set()); const [file, setFile] = useState(null); const [diff, setDiff] = useState(null); const [busy, setBusy] = useState(false); const [commitOpen, setCommitOpen] = useState(autoCommit);
  async function view(item) { setFile(item); setDiff(null); try { setDiff(await api.diff({ root: project.git_root, path: item.path, staged: item.staged && !item.unstaged })); } catch (error) { setNotice({ error: true, text: error.message }); } }
  async function mutate(kind) { if (!selected.size) return; setBusy(true); try { const status = await api[kind]({ root: project.git_root, files: [...selected] }); onStatus(status); setSelected(new Set()); setNotice({ text: `${kind === "stage" ? "Staged" : "Unstaged"} selected files.` }); } catch (error) { setNotice({ error: true, text: error.message }); } finally { setBusy(false); } }
  if (!project.git_root) return <Empty title="Git unavailable" body="Connect this project to a Git repository to review and commit changes." />;
  if (!repo) return <Empty title="Loading repository" body="Reading the local working tree…" />;
  if (repo.error) return <Empty title="Repository unavailable" body={repo.error} />;
  return <div className="changes-layout"><section className="project-panel changed-files"><header><div><strong>Changed files</strong><small>{repo.clean ? "Working tree clean" : `${repo.files.length} changed`}</small></div><div><button onClick={() => mutate("stage")} disabled={busy || !selected.size}>Stage</button><button onClick={() => mutate("unstage")} disabled={busy || !selected.size}>Unstage</button><button className="primary" onClick={() => setCommitOpen(true)} disabled={repo.clean}>Commit changes</button></div></header>{repo.files.map((item) => <label key={`${item.path}-${item.index}-${item.working}`} className={file?.path === item.path ? "selected" : ""}><input type="checkbox" checked={selected.has(item.path)} onChange={(event) => setSelected((current) => { const next = new Set(current); event.target.checked ? next.add(item.path) : next.delete(item.path); return next; })} /><button onClick={() => view(item)}><span className={`file-status ${item.kind}`}>{item.kind.slice(0, 1).toUpperCase()}</span><span><strong>{item.path}</strong><small>{item.staged ? "Staged" : ""}{item.staged && item.unstaged ? " + " : ""}{item.unstaged ? "Unstaged" : ""}</small></span></button></label>)}{repo.clean && <p className="clean-repo">✓ Nothing to commit</p>}</section><section className="project-panel diff-view"><header><strong>{file?.path || "Diff preview"}</strong>{diff?.truncated && <span>Truncated</span>}</header>{diff ? <pre>{diff.text || "No textual diff available."}</pre> : <p>Select a changed file to inspect it.</p>}</section>{commitOpen && <CommitDialog project={project} repo={repo} api={api} defaultFiles={[...selected]} onClose={() => setCommitOpen(false)} onCommitted={(result) => { setCommitOpen(false); onStatus(result.status); setNotice({ text: `Committed ${result.shortHash}: ${result.message}` }); }} setNotice={setNotice} />}</div>;
}

function CommitDialog({ project, repo, api, defaultFiles, onClose, onCommitted, setNotice }) {
  const [files, setFiles] = useState(new Set(defaultFiles.length ? defaultFiles : repo.files.map((item) => item.path))); const [message, setMessage] = useState(`Update ${project.name}`); const [push, setPush] = useState(project.push_after_commit); const [ack, setAck] = useState(false); const [busy, setBusy] = useState(false);
  const suspicious = [...files].filter((file) => /(^|[\\/])(\.env(?:\..+)?|.*(?:credential|secret|token|service[-_]?account)|id_(rsa|dsa|ecdsa|ed25519)|.*\.(pem|p12|pfx|key))$/i.test(file));
  async function submit(event) { event.preventDefault(); setBusy(true); try { onCommitted(await api.commit({ root: project.git_root, files: [...files], message, push, acknowledgeSensitive: ack })); } catch (error) { setNotice({ error: true, text: error.message }); } finally { setBusy(false); } }
  return <div className="project-modal-backdrop"><form className="project-modal commit-dialog" role="dialog" aria-modal="true" aria-label="Commit changes" onSubmit={submit}><header><div><strong>Commit changes</strong><small>{repo.branch || "Detached HEAD"}{repo.upstream ? ` → ${repo.upstream}` : " · no upstream"}</small></div><button type="button" onClick={onClose}>×</button></header><div className="commit-files">{repo.files.map((item) => <label key={item.path}><input type="checkbox" checked={files.has(item.path)} onChange={(event) => setFiles((current) => { const next = new Set(current); event.target.checked ? next.add(item.path) : next.delete(item.path); return next; })} /><span>{item.path}</span><small>{words(item.kind)}</small></label>)}</div>{suspicious.length > 0 && <label className="sensitive-warning"><input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} /><span><strong>Potential secret file</strong>Review {suspicious.join(", ")} and explicitly include it.</span></label>}<label className="commit-message">Commit message<textarea aria-label="Commit message" value={message} onChange={(event) => setMessage(event.target.value)} /></label><label className="push-choice"><input type="checkbox" checked={push} onChange={(event) => setPush(event.target.checked)} /><span>Commit and push after local commit</span></label><footer><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !message.trim() || !files.size || (suspicious.length > 0 && !ack)}>{busy ? "Committing…" : push ? "Commit and push" : "Commit locally"}</button></footer></form></div>;
}

function AgentsTab({ project, api, setNotice, onDirty }) {
  const [file, setFile] = useState(null); const [content, setContent] = useState(""); const [mode, setMode] = useState("split"); const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(true);
  async function load() { setBusy(true); try { const result = await api.agentsRead(project.local_path); setFile(result); setContent(result.exists ? result.content : AGENTS_STARTER); setDirty(false); onDirty(false); } catch (error) { setNotice({ error: true, text: error.message }); } finally { setBusy(false); } }
  useEffect(() => { load(); }, [project.id]);
  useEffect(() => { const warn = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } }; addEventListener("beforeunload", warn); return () => removeEventListener("beforeunload", warn); }, [dirty]);
  async function save() { try { const saved = await api.agentsWrite({ root: project.local_path, content, version: file?.version }); setFile(saved); setDirty(false); onDirty(false); setNotice({ text: "AGENTS.md saved." }); } catch (error) { setNotice({ error: true, text: error.message }); } }
  if (!project.local_path) return <Empty title="No local folder" body="Connect a local folder before managing AGENTS.md." />;
  if (busy) return <Empty title="Loading AGENTS.md" body="Checking the repository root…" />;
  return <section className="agents-workspace"><header><div><strong>AGENTS.md</strong><small>{file?.path} {file?.modifiedAt ? `· modified ${relativeTime(file.modifiedAt)}` : "· not created yet"}</small></div><div className="segmented"><button className={mode === "edit" ? "active" : ""} onClick={() => setMode("edit")}>Edit</button><button className={mode === "split" ? "active" : ""} onClick={() => setMode("split")}>Split</button><button className={mode === "preview" ? "active" : ""} onClick={() => setMode("preview")}>Preview</button></div><button onClick={() => { if (!dirty || confirm("Discard unsaved AGENTS.md changes and reload?")) load(); }}>Reload</button><button className="primary" onClick={save} disabled={!dirty}>Save</button></header><div className={`agents-editor mode-${mode}`}>{mode !== "preview" && <textarea aria-label="AGENTS.md editor" value={content} onChange={(event) => { setContent(event.target.value); setDirty(true); onDirty(true); }} />}{mode !== "edit" && <MarkdownPreview content={content} label="AGENTS.md preview" />}</div>{dirty && <footer>Unsaved changes</footer>}</section>;
}

function AssignmentsTab({ project, skills, commands, onSave }) {
  const [skillIds, setSkillIds] = useState(new Set(project.skill_ids)); const [commandIds, setCommandIds] = useState(new Set(project.slash_command_ids)); useEffect(() => { setSkillIds(new Set(project.skill_ids)); setCommandIds(new Set(project.slash_command_ids)); }, [project.id, project.updated_at]);
  function toggle(setter, current, id) { setter(() => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  return <div className="assignments-grid"><section className="project-panel"><header><div><strong>Assigned skills</strong><small>{skillIds.size} selected</small></div></header>{skills.map((item) => <label key={item.id}><input type="checkbox" checked={skillIds.has(item.id)} onChange={() => toggle(setSkillIds, skillIds, item.id)} /><span><strong>{item.name || "Untitled skill"}</strong><small>{item.category || "Unsorted"}</small></span></label>)}{!skills.length && <p>No skills available.</p>}</section><section className="project-panel"><header><div><strong>Assigned slash commands</strong><small>{commandIds.size} selected</small></div></header>{commands.map((item) => <label key={item.id}><input type="checkbox" checked={commandIds.has(item.id)} onChange={() => toggle(setCommandIds, commandIds, item.id)} /><span><strong>{item.name || "Untitled command"}</strong><small>{item.command || "Reference"}</small></span></label>)}{!commands.length && <p>No commands available.</p>}</section><footer><button className="primary" onClick={() => onSave({ skillIds: [...skillIds], slashCommandIds: [...commandIds] })}>Save assignments</button></footer></div>;
}

function ProjectDetail({ project, repo, api, skills, commands, onBack, onChanged, onRepoChanged, onAction, setNotice, initialTab = "overview" }) {
  const [tab, setTab] = useState(initialTab === "commit" ? "changes" : initialTab); const [readme, setReadme] = useState(null); const [agentsDirty, setAgentsDirty] = useState(false); useEffect(() => { if (project.local_path) api.readme(project.local_path).then(setReadme).catch(() => setReadme(null)); }, [project.id]);
  const tabs = [["overview", "Overview"], ["tasks", "Tasks"], ["changes", "Changes"], ["agents", "AGENTS.md"], ["assignments", "Skills & Commands"], ["activity", "Activity"], ["settings", "Settings"]];
  async function projectAction(kind) { if (kind === "refresh") return onAction("refresh", project); return onAction(kind, project); }
  function changeTab(value) { if (tab === "agents" && agentsDirty && !confirm("Discard unsaved AGENTS.md changes?")) return; setTab(value); }
  function leave() { if (tab === "agents" && agentsDirty && !confirm("Discard unsaved AGENTS.md changes?")) return; onBack(); }
  return <section className="project-detail"><header className="project-detail-header"><button onClick={leave}>← Projects</button><div><span className="project-repo-icon">◇</span><span><h1>{project.name}</h1><p>{projectSummary(project)}</p></span></div><div><StatusPill value={project.status} /><RankPill project={project} /><button className="primary" onClick={() => changeTab("changes")}>View changes</button></div></header><nav className="project-tabs" aria-label="Project sections">{tabs.map(([value, label]) => <button key={value} className={tab === value ? "active" : ""} onClick={() => changeTab(value)}>{label}{value === "tasks" ? ` ${project.tasks.filter((task) => task.status !== "done" && task.status !== "archived").length}` : value === "changes" && repo?.files?.length ? ` ${repo.files.length}` : ""}</button>)}</nav><div className="project-detail-body">
    {tab === "overview" && <OverviewTab project={project} repo={repo} readme={readme} onSave={(patch) => onChanged(api.update(project.id, patch))} onAction={projectAction} />}
    {tab === "tasks" && <TasksTab project={project} onCreate={(input) => onChanged(api.tasks.create(project.id, input))} onUpdate={(id, patch) => onChanged(api.tasks.update(id, patch))} onRemove={(id) => { if (confirm("Delete this task?")) onChanged(api.tasks.remove(id)); }} />}
    {tab === "changes" && <ChangesTab project={project} repo={repo} api={api} onStatus={onRepoChanged} setNotice={setNotice} autoCommit={initialTab === "commit"} />}
    {tab === "agents" && <AgentsTab project={project} api={api} setNotice={setNotice} onDirty={setAgentsDirty} />}
    {tab === "assignments" && <AssignmentsTab project={project} skills={skills} commands={commands} onSave={(input) => onChanged(api.assign(project.id, input))} />}
    {tab === "activity" && <section className="project-panel activity-list"><header><strong>Activity</strong><small>{project.activity.length} events</small></header>{project.activity.map((item) => <article key={item.id}><span>{item.kind === "commit" ? "●" : item.kind === "task" ? "✓" : "◇"}</span><div><strong>{item.summary}</strong>{item.detail && <p>{item.detail}</p>}<small>{relativeTime(item.created_at)}</small></div></article>)}{!project.activity.length && <p>No activity yet.</p>}</section>}
    {tab === "settings" && <section className="project-panel project-settings"><header><strong>Project settings</strong></header><label><span>Push after commit</span><input type="checkbox" checked={project.push_after_commit} onChange={(event) => onChanged(api.update(project.id, { pushAfterCommit: event.target.checked }))} /></label><div><strong>Local repository</strong><code>{project.local_path || "Not connected"}</code></div><div className="danger-zone"><strong>Remove project</strong><p>Removes the Notebook record and tasks. Repository files stay untouched.</p><button onClick={() => onAction("remove", project)}>Remove from Notebook</button></div></section>}
  </div></section>;
}

export function ProjectsPage({ api, skills, commands, onHide }) {
  const [projects, setProjects] = useState([]); const [repoStates, setRepoStates] = useState({}); const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState(""); const [selectedId, setSelectedId] = useState(() => location.hash.match(/^#\/projects\/([^/]+)/)?.[1] || null); const [detailTab, setDetailTab] = useState("overview"); const [addOpen, setAddOpen] = useState(false); const [notice, setNotice] = useState(null); const [query, setQuery] = useState(""); const [status, setStatus] = useState(""); const [priority, setPriority] = useState(""); const [attentionFilter, setAttentionFilter] = useState(""); const dragId = useRef(null);
  async function load() { setLoading(true); setLoadError(""); try { const result = await api.list(); setProjects(result); setLoading(false); refreshAll(result); } catch (error) { setLoadError(error.message); setLoading(false); } }
  useEffect(() => { load(); }, []); useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(null), 5000); return () => clearTimeout(timer); } }, [notice]);
  async function refresh(project) { if (!project.git_root) return; setRepoStates((state) => ({ ...state, [project.id]: { loading: true } })); try { const next = await api.status(project.git_root); setRepoStates((state) => ({ ...state, [project.id]: next })); } catch (error) { setRepoStates((state) => ({ ...state, [project.id]: { error: error.message, available: false, files: [], counts: {} } })); } }
  function refreshAll(list = projects) { list.filter((item) => item.git_root).forEach((item) => refresh(item)); }
  function updateOne(result) { return Promise.resolve(result).then((updated) => { setProjects((items) => items.map((item) => item.id === updated.id ? updated : item)); setNotice({ text: "Project saved." }); return updated; }).catch((error) => setNotice({ error: true, text: error.message })); }
  function openProject(id, tab = "overview") { setSelectedId(id); setDetailTab(tab); location.hash = `/projects/${id}`; }
  function back() { setSelectedId(null); location.hash = "/projects"; }
  async function quickAction(kind, project) {
    try {
      if (kind === "copy") { await navigator.clipboard.writeText(project.local_path); setNotice({ text: "Local path copied." }); }
      else if (["pause", "resume", "complete", "archive"].includes(kind)) updateOne(api.update(project.id, { status: kind === "pause" ? "paused" : kind === "resume" ? "active" : kind === "complete" ? "completed" : "archived" }));
      else if (kind === "refresh") { await refresh(project); setNotice({ text: "Repository status refreshed." }); }
      else if (kind === "fetch") { const next = await api.fetch(project.git_root); setRepoStates((states) => ({ ...states, [project.id]: next })); setNotice({ text: "Remote references fetched." }); }
      else if (kind === "remove") { if (!confirm(`Remove ${project.name} from Notebook? The repository files stay untouched.`)) return; await api.remove(project.id); setProjects((items) => items.filter((item) => item.id !== project.id)); if (selectedId === project.id) back(); setNotice({ text: `${project.name} removed; repository files untouched.` }); }
      else await api.open(kind === "github" ? { kind, url: project.github_url } : { kind, path: project.local_path });
    } catch (error) { setNotice({ error: true, text: error.message }); }
  }
  async function reorder(sourceId, targetId) { if (!sourceId || sourceId === targetId) return; const next = [...projects]; const from = next.findIndex((item) => item.id === sourceId); const to = next.findIndex((item) => item.id === targetId); next.splice(to, 0, next.splice(from, 1)[0]); setProjects(next); try { setProjects(await api.reorder(next.map((item) => item.id))); } catch (error) { setNotice({ error: true, text: error.message }); load(); } }
  const shown = useMemo(() => projects.filter((project) => {
    const repo = repoStates[project.id]; const haystack = `${project.name} ${projectSummary(project)} ${projectLabels(project).join(" ")} ${project.local_path} ${project.github_url} ${(project.skill_ids || []).map((id) => skills.find((item) => item.id === id)?.name).join(" ")} ${(project.slash_command_ids || []).map((id) => commands.find((item) => item.id === id)?.name).join(" ")}`.toLowerCase();
    if (query && !haystack.includes(query.toLowerCase())) return false; if (!status && ["completed", "archived"].includes(project.status)) return false; if (status === "archived" ? !["completed", "archived"].includes(project.status) : status && project.status !== status) return false; if (priority && project.priority !== priority) return false;
    if (attentionFilter === "attention" && !attention(project, repo).length) return false; if (attentionFilter === "changes" && (repo?.clean !== false)) return false; if (attentionFilter === "conflicts" && !repo?.counts?.conflicts) return false; if (attentionFilter === "ahead" && !repo?.ahead) return false; if (attentionFilter === "missing" && project.local_path) return false; if (attentionFilter === "blocked" && project.status !== "blocked" && !project.tasks.some((task) => task.status === "blocked")) return false; if (attentionFilter === "overdue" && !project.tasks.some((task) => task.status !== "done" && task.due_date && task.due_date < new Date().toISOString().slice(0, 10))) return false; if (attentionFilter === "stale" && !attention(project, repo).includes("Project is stale")) return false; return true;
  }).sort((a, b) => a.manual_rank - b.manual_rank), [projects, repoStates, query, status, priority, attentionFilter, skills, commands]);
  async function setRank(project, rank) {
    const priority = RANK_TO_PRIORITY[rank];
    setProjects((items) => items.map((item) => item.id === project.id ? { ...item, priority } : item));
    try { await api.update(project.id, { priority }); }
    catch (error) { setNotice({ error: true, text: error.message || "Could not save that rank." }); load(); }
  }
  async function setExplanation(project, description) {
    setProjects((items) => items.map((item) => item.id === project.id ? { ...item, description } : item));
    try { await api.update(project.id, { description }); }
    catch (error) { setNotice({ error: true, text: error.message || "Could not save that description." }); load(); }
  }
  const selected = projects.find((item) => item.id === selectedId);
  if (selected) return <><Notice notice={notice} /><ProjectDetail project={selected} repo={repoStates[selected.id]} api={api} skills={skills} commands={commands} onBack={back} onChanged={updateOne} onRepoChanged={(repo) => setRepoStates((states) => ({ ...states, [selected.id]: repo }))} onAction={quickAction} setNotice={setNotice} initialTab={detailTab} /></>;
  return <section className="projects-page"><header className="projects-header"><div><h1>Projects</h1><p>Know what each project does, where it stands, and open it to manage the details.</p></div><div><button onClick={onHide} aria-label="Hide notebook">×</button><button onClick={() => refreshAll()} disabled={!projects.some((item) => item.git_root)}>↻ Refresh</button><button className="primary" onClick={() => setAddOpen(true)}>+ Add Project</button></div></header><Notice notice={notice} />
    <div className="projects-toolbar project-priority-toolbar">
      <div className="priority-filters" role="group" aria-label="Project priority">
        <button className={!status && !priority && !attentionFilter ? "active" : ""} onClick={() => { setStatus(""); setPriority(""); setAttentionFilter(""); }}>All</button>
        {RANKS.map((item) => <button key={item.rank} className={!status && priority === item.priority ? "active" : ""} onClick={() => { setStatus(""); setPriority(item.priority); setAttentionFilter(""); }}>{item.label}</button>)}
        <button className={!status && priority === "none" ? "active" : ""} onClick={() => { setStatus(""); setPriority("none"); setAttentionFilter(""); }}>Unsorted</button>
        <button className={attentionFilter === "attention" ? "active" : ""} onClick={() => { setStatus(""); setPriority(""); setAttentionFilter("attention"); }}>Needs attention</button>
        <button className={status === "archived" ? "active" : ""} onClick={() => { setStatus("archived"); setPriority(""); setAttentionFilter(""); }}>Archived</button>
      </div>
      <label className="project-search"><span>⌕</span><input aria-label="Search projects" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names, explanations, tags…" /></label>
    </div>
    {loading ? <Empty title="Loading projects" body="Opening your local workspace…" /> : loadError ? <Empty title="Projects unavailable" body={loadError} action={<button onClick={load}>Try again</button>} /> : !projects.length ? <Empty title="Build your project command center" body="Add a local repository to track tasks, changes, instructions, skills, and commands." action={<button className="primary" onClick={() => setAddOpen(true)}>Add your first project</button>} /> : !shown.length ? <Empty title="No matching projects" body="Clear or adjust the current filters." action={<button onClick={() => { setQuery(""); setStatus(""); setPriority(""); setAttentionFilter(""); }}>Clear filters</button>} /> : <div className="projects-ranked">{[...RANKS.map((entry) => ({ ...entry, items: shown.filter((project) => rankOf(project) === entry.rank) })), { rank: 0, heading: "Unsorted", blurb: "Projects waiting for a clear priority.", items: shown.filter((project) => !rankOf(project)) }].filter((group) => group.items.length).map((group) => <section className={`rank-group rank-group-${group.rank}`} key={group.rank}>
      <header><div><h2>{group.heading}</h2><p>{group.blurb}</p></div><span>{group.items.length}</span></header>
      <div className="projects-collection grid">{group.items.map((project) => <ProjectCard key={project.id} project={project} repo={repoStates[project.id]} onLogo={api.logo} onOpen={openProject} onRefresh={refresh} onQuickAction={quickAction} onRank={setRank} onExplain={setExplanation} onDragStart={(_event, id) => { dragId.current = id; }} onDrop={(_event, id) => reorder(dragId.current, id)} />)}</div>
    </section>)}</div>}
    {addOpen && <AddProjectDialog api={api} projects={projects} onClose={() => setAddOpen(false)} onAdded={(items) => { setProjects((current) => [...current, ...items]); items.forEach(refresh); setNotice({ text: `${items.length} project${items.length === 1 ? "" : "s"} added.` }); }} setNotice={setNotice} />}
  </section>;
}
