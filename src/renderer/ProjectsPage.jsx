import React, { useEffect, useMemo, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements, monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { AlertTriangle, ArrowLeft, ArrowUpRight, Check, CheckCircle2, Circle, Clock3, Code2, ExternalLink, FileText, Folder, GitBranch, GripVertical, ListTodo, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Settings, Sparkles, Terminal, Trash2, Wrench, X } from "lucide-react";
import { GithubAvatar } from "./GithubAvatar.jsx";
import { SimpleLogo } from "./SimpleLogo.jsx";
import "./projects.css";

const STATUSES = ["active", "paused", "blocked", "completed", "archived"];
const PRIORITIES = ["critical", "high", "medium", "low", "none"];
const AGENTS_STARTER = "# Project Instructions\n\n## Purpose\n\n## Architecture\n\n## Development Commands\n\n## Important Files\n\n## Implementation Rules\n\n## Testing and Verification\n\n## Current Priorities\n";
const PROJECT_LANES = [
  { tier: 1, ordinal: "01", label: "1st place", hint: "Your top project." },
  { tier: 2, ordinal: "02", label: "2nd place", hint: "The project behind it." },
  { tier: 3, ordinal: "03", label: "3rd place", hint: "Third in line." },
  { tier: 4, ordinal: "—", label: "Queue", hint: "Everything else, ready when needed." },
];
const TASK_LANES = [
  { id: "todo", label: "To do", hint: "Ready to start", icon: Circle },
  { id: "in_progress", label: "Doing", hint: "Work in motion", icon: Clock3 },
  { id: "done", label: "Done", hint: "Completed work", icon: CheckCircle2 },
];
const PROJECT_TABS = [
  { value: "tasks", label: "Tasks", Icon: ListTodo },
  { value: "agents", label: "AGENTS.md", Icon: FileText },
  { value: "assignments", label: "Skills & Commands", Icon: Wrench },
  { value: "activity", label: "Activity", Icon: Clock3 },
  { value: "settings", label: "Settings", Icon: Settings },
];
const AGENT_VIEW_OPTIONS = [{ value: "edit", label: "Edit" }, { value: "split", label: "Split" }, { value: "preview", label: "Preview" }];
const TOOL_FILTER_OPTIONS = [{ value: "all", label: "All" }, { value: "skill", label: "Skills" }, { value: "command", label: "Commands" }];
const PRIORITY_TO_TIER = { critical: 1, high: 2, medium: 3 };

function words(value) { return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function relativeTime(value) {
  if (!value) return "Never";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(value).toLocaleDateString();
}
function taskProgress(project) { const tasks = project.tasks?.filter((task) => task.status !== "archived") || []; const done = tasks.filter((task) => task.status === "done").length; return { done, total: tasks.length, percent: tasks.length ? Math.round(done / tasks.length * 100) : 0 }; }
function projectTier(project) { return Math.max(1, Math.min(4, Number(project.tier) || PRIORITY_TO_TIER[project.priority] || 4)); }
function projectSummary(project) { const value = String(project.description || "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*|__|`/g, "").trim(); return value && !/^<[^>]+>/.test(value) ? value : project.workshop?.summary || "Add a short explanation of what this project does."; }
function formatDateHeading(value) { const date = new Date(value); const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate() - 1); if (date.toDateString() === today.toDateString()) return "Today"; if (date.toDateString() === yesterday.toDateString()) return "Yesterday"; return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" }); }
function repositorySlug(value) { return String(value || "project").trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "project"; }

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
function StatusPill({ value }) { return <span className={`project-pill status-${value}`}>{words(value)}</span>; }
function RankPill({ project }) { const lane = PROJECT_LANES[projectTier(project) - 1]; return <span className={`project-pill rank-pill-${lane.tier}`}>{lane.label}</span>; }

const logoCache = new Map();
function ProjectLogo({ project, load }) {
  const cacheKey = `${project.id}:${project.logo_path || "fallback"}`;
  const [source, setSource] = useState(() => logoCache.get(cacheKey) || null);
  useEffect(() => {
    if (!project.logo_path || !load) { setSource(null); return undefined; }
    if (logoCache.has(cacheKey)) { setSource(logoCache.get(cacheKey)); return undefined; }
    let active = true; load(project.id).then((value) => { logoCache.set(cacheKey, value || null); if (active) setSource(value || null); }).catch(() => logoCache.set(cacheKey, null));
    return () => { active = false; };
  }, [cacheKey, project.id, project.logo_path, load]);
  return source ? <img className="project-repo-logo" src={source} alt="" draggable={false} onError={() => setSource(null)} /> : <SimpleLogo className="project-repo-icon" name={project.name} seed={project.id} />;
}
function Empty({ title, body, action }) { return <div className="projects-empty"><Folder aria-hidden="true" /><strong>{title}</strong><p>{body}</p>{action}</div>; }

function SegmentedTabs({ label, value, options, onChange }) {
  const refs = useRef([]);
  function handleKeyDown(event, index) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % options.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + options.length) % options.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    else return;
    event.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  }
  return <div className="segmented" role="tablist" aria-label={label}>{options.map((option, index) => <button type="button" key={option.value} ref={(element) => { refs.current[index] = element; }} role="tab" aria-selected={value === option.value} tabIndex={value === option.value ? 0 : -1} className={value === option.value ? "active" : ""} onClick={() => onChange(option.value)} onKeyDown={(event) => handleKeyDown(event, index)}>{option.label}</button>)}</div>;
}

function Card({ className = "", children, ...props }) { return <article data-slot="card" className={`ui-card ${className}`.trim()} {...props}>{children}</article>; }
function CardHeader({ className = "", children }) { return <header data-slot="card-header" className={`ui-card-header ${className}`.trim()}>{children}</header>; }
function CardTitle({ children }) { return <strong data-slot="card-title" className="ui-card-title">{children}</strong>; }
function CardDescription({ children }) { return <span data-slot="card-description" className="ui-card-description">{children}</span>; }
function CardAction({ children }) { return <span data-slot="card-action" className="ui-card-action">{children}</span>; }
function CardFooter({ children }) { return <footer data-slot="card-footer" className="ui-card-footer">{children}</footer>; }
function Badge({ children, variant = "secondary", className = "" }) { return <span data-slot="badge" className={`ui-badge variant-${variant} ${className}`.trim()}>{children}</span>; }
function InputGroup({ children, className = "" }) { return <label data-slot="input-group" className={`ui-input-group ${className}`.trim()}>{children}</label>; }
function InputGroupAddon({ children }) { return <span data-slot="input-group-addon" className="ui-input-group-addon">{children}</span>; }

function ProjectCard({ project, onOpen, onDragStart, onDragEnd, onDropBefore, onLogo }) {
  const updated = relativeTime(project.last_worked_at || project.updated_at);
  return <Card className="project-simple-card" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); onDropBefore(project.id); }}>
    <button className="project-card-open" type="button" draggable onDragStart={(event) => onDragStart(event, project.id)} onDragEnd={onDragEnd} onClick={() => onOpen(project.id)} aria-label={`Open ${project.name}`}>
      <CardHeader><ProjectLogo project={project} load={onLogo} /><span className="project-simple-copy"><CardTitle>{project.name}</CardTitle><CardDescription>{projectSummary(project)}</CardDescription></span><CardAction><GripVertical className="project-card-grip" aria-hidden="true" /><ArrowUpRight className="project-card-arrow" aria-hidden="true" /></CardAction></CardHeader>
      <CardFooter><Badge variant="outline" className="project-updated"><Clock3 aria-hidden="true" /><time dateTime={project.last_worked_at || project.updated_at}>{updated}</time></Badge></CardFooter>
    </button>
  </Card>;
}

function AddProjectDialog({ api, projects, onClose, onAdded, setNotice }) {
  const [mode, setMode] = useState("choose"); const [draft, setDraft] = useState(null); const [found, setFound] = useState([]); const [selected, setSelected] = useState(new Set()); const [busy, setBusy] = useState(false);
  async function choose(single) { setBusy(true); try { if (single) { const result = await api.chooseFolder(); if (!result.canceled) { setDraft({ ...result.project, status: "active", priority: "none", tags: [] }); setMode("edit"); } } else { const result = await api.chooseParent(); if (!result.canceled) { const duplicates = new Set(projects.flatMap((item) => [item.local_path, item.git_root, item.github_url]).filter(Boolean).map((item) => item.toLowerCase())); const available = result.projects.filter((item) => ![item.localPath, item.gitRoot, item.githubUrl].filter(Boolean).some((value) => duplicates.has(value.toLowerCase()))); setFound(available); setSelected(new Set(available.map((item) => item.localPath))); setMode("discover"); } } } catch (error) { setNotice({ error: true, text: error.message }); } finally { setBusy(false); } }
  async function save(event) { event.preventDefault(); setBusy(true); try { const item = await api.create(draft); onAdded([item]); onClose(); } catch (error) { setNotice({ error: true, text: /UNIQUE/.test(error.message) ? "That repository is already a project." : error.message }); } finally { setBusy(false); } }
  async function importFound() { setBusy(true); try { const added = []; for (const item of found.filter((entry) => selected.has(entry.localPath))) added.push(await api.create({ ...item, status: "active", priority: "none", tags: [] })); onAdded(added); onClose(); } catch (error) { setNotice({ error: true, text: error.message }); } finally { setBusy(false); } }
  return <div className="project-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="project-modal" role="dialog" aria-modal="true" aria-label="Add project">
    <header><div><strong>Add project</strong><small>Connect a folder without changing it.</small></div><button onClick={onClose} aria-label="Close add project"><X /></button></header>
    {mode === "choose" && <div className="add-project-choices"><button onClick={() => choose(true)} disabled={busy}><Folder /><strong>Existing folder</strong><small>Choose one project.</small></button><button onClick={() => choose(false)} disabled={busy}><Search /><strong>Find local projects</strong><small>Scan C:\\code or another folder.</small></button></div>}
    {mode === "edit" && draft && <form className="project-form" onSubmit={save}><label>Name<input aria-label="Project name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label><label>Description<textarea aria-label="Project description" value={draft.description || ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><label>Tags<input value={(draft.tags || []).join(", ")} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} placeholder="desktop, editing, release" /></label><div className="detected-project"><span>{draft.isGit ? `Git repository${draft.branch ? ` · ${draft.branch}` : ""}` : "Local folder"}</span><code>{draft.localPath}</code></div><footer><button type="button" onClick={() => setMode("choose")}>Back</button><button className="primary" type="submit" disabled={busy}>{busy ? "Adding…" : "Add project"}</button></footer></form>}
    {mode === "discover" && <div className="discover-projects"><p>{found.length ? `${found.length} projects ready.` : "No new projects found."}</p>{found.map((item) => <label key={item.localPath}><input type="checkbox" checked={selected.has(item.localPath)} onChange={(event) => setSelected((current) => { const next = new Set(current); event.target.checked ? next.add(item.localPath) : next.delete(item.localPath); return next; })} /><span><strong>{item.name}</strong><small>{item.localPath}</small></span></label>)}<footer><button onClick={() => setMode("choose")}>Back</button><button className="primary" onClick={importFound} disabled={busy || !selected.size}>Import {selected.size || ""}</button></footer></div>}
  </section></div>;
}

function ProjectEditPanel({ project, onClose, onSave }) {
  const [draft, setDraft] = useState({ ...project });
  return <aside className="project-edit-panel" aria-label="Edit project"><header><div><strong>Edit project</strong><small>Keep this clear and useful.</small></div><button onClick={onClose} aria-label="Close project editor"><X /></button></header><form className="project-details-form" onSubmit={(event) => { event.preventDefault(); onSave({ name: draft.name, description: draft.description, status: draft.status, priority: draft.priority, tags: draft.tags, notes: draft.notes }); onClose(); }}><label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>Description<textarea value={draft.description || ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><div className="project-form-row"><label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Priority<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}>{PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select></label></div><label>Tags<input value={(draft.tags || []).join(", ")} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label><label>Private notes<textarea value={draft.notes || ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Decisions, context, reminders…" /></label><footer><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit">Save changes</button></footer></form></aside>;
}

function CommitDialog({ project, repo, github, api, onClose, onCommitted, setNotice }) {
  const canPush = Boolean(repo.githubUrl || project.github_url);
  const [files, setFiles] = useState(new Set(repo.files?.map((item) => item.path) || [])); const [message, setMessage] = useState(`Update ${project.name}`); const [push, setPush] = useState(canPush); const [ack, setAck] = useState(false); const [busy, setBusy] = useState(false);
  const suspicious = [...files].filter((file) => /(^|[\\/])(\.env(?:\..+)?|.*(?:credential|secret|token|service[-_]?account)|id_(rsa|dsa|ecdsa|ed25519)|.*\.(pem|p12|pfx|key))$/i.test(file));
  async function submit(event) { event.preventDefault(); setBusy(true); try { onCommitted(await api.commit({ root: project.git_root, files: [...files], message, push, acknowledgeSensitive: ack })); } catch (error) { setNotice({ error: true, text: error.message }); } finally { setBusy(false); } }
  return <div className="project-modal-backdrop"><form className="project-modal commit-dialog" role="dialog" aria-modal="true" aria-label={`Commit ${project.name}`} onSubmit={submit}><header><div><strong>Review changes</strong><small>{repo.branch || "Detached HEAD"}{repo.upstream ? ` → ${repo.upstream}` : " · no upstream"}</small></div><button type="button" onClick={onClose} aria-label="Close commit dialog"><X /></button></header><div className="commit-files">{repo.files?.map((item) => <label key={item.path}><input type="checkbox" checked={files.has(item.path)} onChange={(event) => setFiles((current) => { const next = new Set(current); event.target.checked ? next.add(item.path) : next.delete(item.path); return next; })} /><code>{item.path}</code><small>{words(item.kind)}</small></label>)}</div>{suspicious.length > 0 && <label className="sensitive-warning"><input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} /><span><strong>Potential secret file</strong>Review {suspicious.join(", ")} before including it.</span></label>}<label>Commit message<textarea aria-label="Commit message" value={message} onChange={(event) => setMessage(event.target.value)} /></label><label className="check-row"><input type="checkbox" checked={push} disabled={!canPush} onChange={(event) => setPush(event.target.checked)} /> {canPush ? `Push to GitHub as @${github?.expectedLogin || "blixvip"} after commit` : "Connect GitHub before pushing"}</label><footer><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !message.trim() || !files.size || (suspicious.length > 0 && !ack)}>{busy ? "Working…" : push ? "Commit & push" : "Commit locally"}</button></footer></form></div>;
}

function GithubSetupDialog({ project, api, onClose, onConnected, setNotice }) {
  const [mode, setMode] = useState("create");
  const [repository, setRepository] = useState(repositorySlug(project.name));
  const [visibility, setVisibility] = useState("private");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true);
    try {
      const result = await api.githubSetup({ projectId: project.id, root: project.git_root || project.local_path, repository: `blixvip/${repositorySlug(repository)}`, mode, visibility, initialize: !project.git_root, description: projectSummary(project) });
      onConnected(result);
    } catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setBusy(false); }
  }
  return <div className="project-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="project-modal github-setup-dialog" role="dialog" aria-modal="true" aria-label={`Connect ${project.name} to GitHub`} onSubmit={submit}>
    <header><div><strong>Connect GitHub</strong><small>Notebook uses your signed-in @blixvip account.</small></div><button type="button" onClick={onClose} aria-label="Close GitHub setup"><X /></button></header>
    <div className="github-setup-body">
      <div className="segmented" role="group" aria-label="Repository setup mode"><button type="button" className={mode === "create" ? "active" : ""} onClick={() => setMode("create")}>Create new</button><button type="button" className={mode === "connect" ? "active" : ""} onClick={() => setMode("connect")}>Connect existing</button></div>
      <label>Repository<span className="github-repository-field"><b>blixvip /</b><input aria-label="GitHub repository name" value={repository} onChange={(event) => setRepository(event.target.value)} required /></span></label>
      {mode === "create" && <label>Visibility<select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="private">Private</option><option value="public">Public</option></select></label>}
      <p>{project.git_root ? "Your local Git history stays intact." : "Notebook will initialize Git in this project folder."}</p>
    </div>
    <footer><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !repositorySlug(repository)}>{busy ? "Connecting…" : mode === "create" ? "Create & connect" : "Connect repository"}</button></footer>
  </form></div>;
}

function TaskCard({ task, onOpen, onMove, onRemove }) {
  const ref = useRef(null); const [menu, setMenu] = useState(false);
  useEffect(() => { const element = ref.current; if (!element) return undefined; return combine(draggable({ element, getInitialData: () => ({ type: "project-task", taskId: task.id }) }), dropTargetForElements({ element, getData: () => ({ type: "project-task-target", beforeId: task.id, status: task.status === "blocked" ? "in_progress" : task.status }) })); }, [task.id, task.status]);
  return <article ref={ref} className={`kanban-card ${task.status === "blocked" ? "is-blocked" : ""}`} aria-label={`Task ${task.title}`}><button className="task-card-main" onClick={() => onOpen(task)}><GripVertical aria-hidden="true" /><span><strong>{task.title}</strong>{task.description && <p>{task.description}</p>}<small>{task.status === "blocked" && <em>Blocked</em>}{task.due_date ? `Due ${task.due_date}` : relativeTime(task.updated_at)}</small></span></button><button className="task-menu-button" aria-label={`Actions for ${task.title}`} aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal /></button>{menu && <div className="task-card-menu">{TASK_LANES.filter((lane) => lane.id !== (task.status === "blocked" ? "in_progress" : task.status)).map((lane) => <button key={lane.id} onClick={() => { onMove(task.id, lane.id); setMenu(false); }}>Move to {lane.label}</button>)}{task.status !== "blocked" && <button onClick={() => { onMove(task.id, "blocked"); setMenu(false); }}>Mark blocked</button>}<button className="danger" onClick={() => onRemove(task.id)}>Delete</button></div>}</article>;
}
function TaskColumn({ lane, tasks, children }) {
  const ref = useRef(null); const Icon = lane.icon;
  useEffect(() => { const element = ref.current; if (!element) return undefined; return dropTargetForElements({ element, getData: () => ({ type: "project-task-column", status: lane.id }) }); }, [lane.id]);
  return <section ref={ref} className={`kanban-column lane-${lane.id}`}><header><div><Icon /><span><strong>{lane.label}</strong><small>{lane.hint}</small></span></div><b>{tasks.length}</b></header><div className="kanban-list">{children}{!tasks.length && <p className="kanban-empty">Drop tasks here</p>}</div></section>;
}
function TaskEditor({ task, onClose, onUpdate }) {
  const [draft, setDraft] = useState({ ...task });
  return <aside className="project-edit-panel task-edit-panel" aria-label="Edit task"><header><div><strong>Edit task</strong><small>Keep the next step concrete.</small></div><button onClick={onClose} aria-label="Close task editor"><X /></button></header><form onSubmit={(event) => { event.preventDefault(); onUpdate(task.id, { title: draft.title, description: draft.description, priority: draft.priority, dueDate: draft.due_date || null, tags: draft.tags || [] }); onClose(); }}><label>Task<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label>Description<textarea value={draft.description || ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><label>Priority<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}>{PRIORITIES.map((value) => <option key={value}>{value}</option>)}</select></label><label>Due date<input type="date" value={draft.due_date || ""} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })} /></label><label>Tags<input value={(draft.tags || []).join(", ")} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /></label><footer><button type="button" onClick={onClose}>Cancel</button><button className="primary">Save task</button></footer></form></aside>;
}
function TasksTab({ project, onCreate, onUpdate, onMove, onRemove }) {
  const [title, setTitle] = useState(""); const [query, setQuery] = useState(""); const [editing, setEditing] = useState(null);
  useEffect(() => monitorForElements({ onDrop({ source, location }) { if (source.data.type !== "project-task") return; const target = location.current.dropTargets[0]?.data; if (!target || !["project-task-target", "project-task-column"].includes(target.type)) return; onMove(source.data.taskId, target.status, target.beforeId || null); } }), [onMove]);
  async function add(event) { event.preventDefault(); if (!title.trim()) return; await onCreate({ title, status: "todo", priority: "medium" }); setTitle(""); }
  const visible = (project.tasks || []).filter((task) => task.status !== "archived" && (!query || `${task.title} ${task.description} ${(task.tags || []).join(" ")}`.toLowerCase().includes(query.toLowerCase())));
  const progress = taskProgress(project);
  return <div className="tasks-workspace"><header className="workspace-heading tasks-heading"><div><h2>Tasks</h2><p>{progress.total ? `${progress.done} of ${progress.total} complete` : "Capture the next concrete step for this project."}</p></div><label className="workspace-search"><Search /><input aria-label="Search project tasks" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" /></label></header><div className="task-progress" aria-label={`${progress.percent}% of tasks complete`}><i style={{ width: `${progress.percent}%` }} /></div><form className="quick-task" onSubmit={add}><Plus /><input aria-label="New project task" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Add the next task…" /><button className="primary" type="submit" disabled={!title.trim()}>Add task</button></form>{query && !visible.length ? <div className="projects-inline-empty"><strong>No matching tasks</strong><span>Try another phrase or clear the search.</span><button type="button" onClick={() => setQuery("")}>Clear search</button></div> : <div className="kanban-board">{TASK_LANES.map((lane) => { const tasks = visible.filter((task) => lane.id === "in_progress" ? ["in_progress", "blocked"].includes(task.status) : task.status === lane.id); return <TaskColumn key={lane.id} lane={lane} tasks={tasks}>{tasks.map((task) => <TaskCard key={task.id} task={task} onOpen={setEditing} onMove={onMove} onRemove={onRemove} />)}</TaskColumn>; })}</div>}{editing && <TaskEditor task={editing} onClose={() => setEditing(null)} onUpdate={onUpdate} />}</div>;
}

function AgentsTab({ project, api, setNotice, onDirty }) {
  const [file, setFile] = useState(null); const [content, setContent] = useState(""); const [mode, setMode] = useState("preview"); const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(true);
  async function load() { setBusy(true); try { const result = await api.agentsRead(project.local_path); setFile(result); setContent(result.exists ? result.content : AGENTS_STARTER); setDirty(false); onDirty(false); } catch (error) { setNotice({ error: true, text: error.message }); } finally { setBusy(false); } }
  useEffect(() => { load(); }, [project.id]);
  useEffect(() => { const warn = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } }; addEventListener("beforeunload", warn); return () => removeEventListener("beforeunload", warn); }, [dirty]);
  async function save() { try { const saved = await api.agentsWrite({ root: project.local_path, content, version: file?.version }); setFile(saved); setDirty(false); onDirty(false); setNotice({ text: "AGENTS.md saved." }); } catch (error) { setNotice({ error: true, text: error.message }); } }
  if (!project.local_path) return <Empty title="No local folder" body="Connect a folder before managing AGENTS.md." />;
  if (busy) return <Empty title="Loading AGENTS.md" body="Checking the repository root…" />;
  return <section className="agents-workspace"><header className="workspace-heading agents-heading"><div><h2>AGENTS.md</h2><p>Instructions agents read before working in this repository.</p></div><div className="agents-actions"><SegmentedTabs label="AGENTS.md view" value={mode} options={AGENT_VIEW_OPTIONS} onChange={setMode} /><button type="button" onClick={() => { if (!dirty || confirm("Discard unsaved AGENTS.md changes?")) load(); }}><RefreshCw /> Reload</button><button type="button" className="primary" onClick={save} disabled={!dirty}>Save</button></div></header><div className="document-status"><span><FileText /><span><strong>{file?.path || "AGENTS.md"}</strong><small>{file?.modifiedAt ? `Updated ${relativeTime(file.modifiedAt)}` : "New project file"}</small></span></span><b className={dirty ? "is-dirty" : ""}>{dirty ? "Unsaved" : file?.exists ? "Saved" : "Draft"}</b></div><div className={`agents-editor mode-${mode}`}>{mode !== "preview" && <textarea aria-label="AGENTS.md editor" value={content} onChange={(event) => { setContent(event.target.value); setDirty(true); onDirty(true); }} spellCheck="true" />}{mode !== "edit" && <MarkdownPreview content={content} label="AGENTS.md preview" />}</div>{dirty && <footer className="unsaved-bar" role="status"><Circle /> Unsaved changes</footer>}</section>;
}

function ToolCard({ item, kind, assigned, status, onAttach, onDetach, onInstall, onUninstall, onOpen }) {
  const ref = useRef(null); useEffect(() => { const element = ref.current; if (!element || assigned) return undefined; return draggable({ element, getInitialData: () => ({ type: "project-tool", kind, itemId: item.id }) }); }, [assigned, item.id, kind]);
  const state = status?.status || "missing"; const actionLabel = state === "outdated" ? "Update" : state === "modified" ? "Review" : "Install";
  return <article ref={ref} className={`tool-card ${assigned ? "is-assigned" : ""}`}><div className="tool-card-icon">{kind === "skill" ? <Sparkles /> : <Code2 />}</div><div className="tool-card-copy"><button onClick={onOpen}><strong>{item.name || (kind === "skill" ? "Untitled skill" : "Untitled command")}</strong></button><p>{kind === "skill" ? item.category || "Unsorted" : item.command || "Saved prompt"}</p>{assigned && <span className={`tool-status status-${state}`}>{state === "current" ? "Installed" : state === "outdated" ? "Update available" : state === "modified" ? "Local changes" : "Attached"}</span>}</div><div className="tool-card-actions">{assigned ? <><button onClick={onInstall} disabled={state === "current"}>{state === "current" ? <Check /> : actionLabel}</button>{state === "current" || state === "modified" || state === "outdated" ? <button onClick={onUninstall} aria-label={`Uninstall ${item.name}`}><Trash2 /></button> : null}<button onClick={onDetach}>Detach</button></> : <><GripVertical aria-hidden="true" /><button onClick={onAttach}>Attach</button></>}</div></article>;
}
function AssignmentsTab({ project, skills, commands, api, onChanged, onOpenSkill, onOpenCommand, setNotice }) {
  const [query, setQuery] = useState(""); const [kind, setKind] = useState("all"); const [statuses, setStatuses] = useState({ skills: [], commands: [] }); const dropRef = useRef(null);
  async function refreshStatus() { try { setStatuses(await api.toolsStatus(project.id)); } catch (error) { setNotice({ error: true, text: error.message }); } }
  useEffect(() => { refreshStatus(); }, [project.id, project.updated_at]);
  async function assign(toolKind, itemId, add) { const key = toolKind === "skill" ? "skillIds" : "slashCommandIds"; const current = toolKind === "skill" ? project.skill_ids : project.slash_command_ids; const ids = add ? [...new Set([...current, itemId])] : current.filter((id) => id !== itemId); await onChanged(api.assign(project.id, { [key]: ids })); }
  useEffect(() => { const element = dropRef.current; if (!element) return undefined; const cleanupDrop = dropTargetForElements({ element, getData: () => ({ type: "project-tool-zone" }) }); const cleanupMonitor = monitorForElements({ onDrop({ source, location }) { if (source.data.type === "project-tool" && location.current.dropTargets.some((target) => target.data.type === "project-tool-zone")) assign(source.data.kind, source.data.itemId, true); } }); return combine(cleanupDrop, cleanupMonitor); }, [project.id, project.skill_ids.join(","), project.slash_command_ids.join(",")]);
  async function install(toolKind, itemId, overwrite = false) { try { const payload = await api.toolInstall({ projectId: project.id, kind: toolKind, itemId, overwrite }); if (payload.result.conflict) { if (confirm("This project file has local changes. Replace it with the Notebook version?")) return install(toolKind, itemId, true); return; } await onChanged(payload.project); await refreshStatus(); setNotice({ text: `${toolKind === "skill" ? "Skill" : "Command"} installed in this project.` }); } catch (error) { setNotice({ error: true, text: error.message }); } }
  async function uninstall(toolKind, itemId, force = false) { try { const payload = await api.toolUninstall({ projectId: project.id, kind: toolKind, itemId, force }); if (payload.result.conflict) { if (confirm("This installed file has local changes. Remove it anyway?")) return uninstall(toolKind, itemId, true); return; } await onChanged(payload.project); await refreshStatus(); setNotice({ text: "Installed file removed; library item kept." }); } catch (error) { setNotice({ error: true, text: error.message }); } }
  const all = [...skills.map((item) => ({ item, kind: "skill" })), ...commands.map((item) => ({ item, kind: "command" }))]; const filtered = all.filter(({ item, kind: itemKind }) => (kind === "all" || kind === itemKind) && (!query || `${item.name} ${item.category || ""} ${item.command || ""} ${item.body || ""}`.toLowerCase().includes(query.toLowerCase()))); const isAssigned = ({ item, kind: itemKind }) => itemKind === "skill" ? project.skill_ids.includes(item.id) : project.slash_command_ids.includes(item.id); const assigned = filtered.filter(isAssigned); const available = filtered.filter((entry) => !isAssigned(entry)); const statusFor = (toolKind, id) => statuses[toolKind === "skill" ? "skills" : "commands"].find((item) => item.itemId === id);
  const render = ({ item, kind: toolKind }) => <ToolCard key={`${toolKind}-${item.id}`} item={item} kind={toolKind} assigned={isAssigned({ item, kind: toolKind })} status={statusFor(toolKind, item.id)} onAttach={() => assign(toolKind, item.id, true)} onDetach={() => assign(toolKind, item.id, false)} onInstall={() => install(toolKind, item.id)} onUninstall={() => uninstall(toolKind, item.id)} onOpen={() => toolKind === "skill" ? onOpenSkill(item) : onOpenCommand(item)} />;
  return <div className="tools-workspace"><header className="workspace-heading"><div><h2>Skills & Commands</h2><p>{assigned.length ? `${assigned.length} attached to this project.` : "Attach reusable instructions and saved prompts to this project."}</p></div><div className="tool-heading-actions"><label className="workspace-search"><Search /><input aria-label="Search project tools" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search skills and commands" /></label><SegmentedTabs label="Tool type" value={kind} options={TOOL_FILTER_OPTIONS} onChange={setKind} /></div></header><aside className="tool-install-note"><AlertTriangle /><span><strong>Attach is reversible.</strong> Install writes a project copy to <code>.agents/skills</code> or <code>.codex/prompts</code>. Local edits require confirmation before replacement.</span></aside><div className="tools-columns"><section ref={dropRef} className="tool-zone assigned-zone"><header><div><strong>Attached</strong><small>Available to this project</small></div><b>{assigned.length}</b></header><div>{assigned.map(render)}{!assigned.length && <p className="tool-empty">Drop a library item here, or use Attach.</p>}</div></section><section className="tool-zone library-zone"><header><div><strong>Library</strong><small>Shared Notebook skills and commands</small></div><b>{available.length}</b></header><div>{available.map(render)}{!available.length && <p className="tool-empty">No matching library items.</p>}</div></section></div></div>;
}

function ActivityTab({ project }) {
  const groups = useMemo(() => [...(project.activity || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).reduce((result, item) => { const key = formatDateHeading(item.created_at); (result[key] ||= []).push(item); return result; }, {}), [project.activity]);
  const icon = (kind) => kind === "task" ? <CheckCircle2 /> : kind === "commit" || kind === "push" || kind === "github" ? <GitBranch /> : kind === "tool" || kind === "assignment" ? <Wrench /> : <Circle />;
  return <section className="activity-workspace"><header className="workspace-heading"><div><h2>Activity</h2><p>{project.activity?.length ? `${project.activity.length} recorded project change${project.activity.length === 1 ? "" : "s"}.` : "A record of tasks, commits, and project changes."}</p></div></header>{Object.entries(groups).map(([date, items]) => <section className="activity-day" key={date}><h3>{date}</h3><div>{items.map((item) => <article key={item.id}><span className="activity-icon">{icon(item.kind)}</span><div><strong>{item.summary}</strong>{item.detail && <p>{item.detail}</p>}<time dateTime={item.created_at}>{new Date(item.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div></article>)}</div></section>)}{!project.activity?.length && <Empty title="No activity yet" body="Task changes, commits, and tool updates will appear here." />}</section>;
}
function SettingsTab({ project, repo, github, api, onChanged, onRepoChanged, onAction, onGithubSettings, setNotice }) {
  const [editing, setEditing] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const changed = repo?.files?.length || 0;
  const githubUrl = repo?.githubUrl || project.github_url;
  const connected = Boolean(github?.accountMatches);

  async function push() {
    setPushBusy(true);
    try { onRepoChanged(await api.push(project.git_root)); setNotice({ text: "GitHub is up to date through @blixvip." }); }
    catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setPushBusy(false); }
  }
  function connectedRepository(result) {
    setSetupOpen(false);
    onRepoChanged(result.status);
    onChanged(result.project);
    setNotice({ text: `${result.repository} connected. Push is ready.` });
  }

  return <div className="settings-workspace">
    <header className="workspace-heading"><div><h2>Settings</h2><p>Project details, repository actions, and housekeeping.</p></div></header>
    <section className="settings-section project-profile-settings"><header><div><strong>Project details</strong><p>{projectSummary(project)}</p></div><button type="button" onClick={() => setEditing(true)}><Pencil /> Edit</button></header><div className="settings-project-meta"><StatusPill value={project.status} /><RankPill project={project} />{(project.tags || []).map((tag) => <span key={tag}>{tag}</span>)}</div>{project.notes && <p className="settings-project-notes">{project.notes}</p>}</section>
    <section className="settings-section project-github-section">
      <header><div><strong>GitHub account</strong><p>Every project action is locked to your @blixvip login.</p></div><button type="button" onClick={onGithubSettings}>{connected ? "Manage" : "Sign in"}</button></header>
      <div className={`project-github-account ${connected ? "is-connected" : ""}`}><GithubAvatar account={github} size={38} /><span><strong>{connected ? github?.name || "blix" : "Not connected"}</strong><small>{connected ? "@blixvip · push credentials ready" : "Sign in as @blixvip to push"}</small></span><em>{connected ? "Ready" : "Offline"}</em></div>
    </section>
    <section className="settings-section repository-settings">
      <header><div><strong>Repository</strong><p>{repo?.branch ? `Branch ${repo.branch}` : "Local repository status and GitHub actions."}</p></div>{project.git_root && <button type="button" onClick={() => onAction("refresh")} aria-label="Refresh repository"><RefreshCw /></button>}</header>
      {!project.git_root ? <><p className="settings-state-copy">This folder is not a Git repository yet.</p>{project.local_path && <div className="settings-actions"><button className="primary" onClick={() => setSetupOpen(true)}>Connect @blixvip</button></div>}</>
        : repo?.loading ? <p className="settings-state-copy">Checking repository…</p>
          : repo?.error ? <p className="error-copy">{repo.error}</p>
            : <><div className={`git-state ${repo?.clean ? "is-clean" : "is-changed"}`}>{repo?.clean ? <Check /> : <Circle />}<span><strong>{repo?.clean ? "Everything committed" : `${changed} changed file${changed === 1 ? "" : "s"}`}</strong><small>{repo?.behind ? `${repo.behind} newer commit${repo.behind === 1 ? "" : "s"} on GitHub` : repo?.ahead ? `${repo.ahead} commit${repo.ahead === 1 ? "" : "s"} ready to push` : repo?.upstream || (githubUrl ? "GitHub connected" : "No GitHub remote")}</small></span></div>{repo?.lastCommit && <div className="last-commit"><span>Last commit</span><strong>{repo.lastCommit.message}</strong><small>{repo.lastCommit.shortHash} · {relativeTime(repo.lastCommit.committedAt)}</small></div>}<div className="settings-actions">{changed > 0 && <button className="primary" onClick={() => setCommitOpen(true)}>Review & commit</button>}{!githubUrl && <button className="primary" onClick={() => setSetupOpen(true)}>Connect @blixvip</button>}{githubUrl && !changed && (repo?.ahead > 0 || !repo?.upstream) && <button className="primary" onClick={push} disabled={pushBusy}>{pushBusy ? "Pushing…" : "Push to GitHub"}</button>}{githubUrl && <button onClick={() => onAction("github", githubUrl)}><ExternalLink /> Open GitHub</button>}</div></>}
    </section>
    <section className="settings-section"><header><div><strong>Open project</strong><p>The source folder Notebook reads. Files stay on your computer.</p></div></header><code>{project.local_path || "Not connected"}</code><div className="settings-actions">{project.local_path && <><button onClick={() => onAction("folder")}><Folder /> Folder</button><button onClick={() => onAction("terminal")}><Terminal /> Terminal</button><button onClick={() => onAction("editor")}><Code2 /> Editor</button></>}</div></section>
    <section className="settings-section"><header><div><strong>Git behavior</strong><p>Choose what happens after a successful local commit.</p></div></header><label className="settings-toggle"><span><strong>Push after commit</strong><small>Send new commits through the @blixvip GitHub session.</small></span><input type="checkbox" checked={project.push_after_commit} onChange={(event) => onChanged(api.update(project.id, { pushAfterCommit: event.target.checked }))} /></label></section>
    <section className="settings-section danger-zone"><header><div><strong>Remove project</strong><p>Removes this record, tasks, and activity. Repository files stay untouched.</p></div></header><button onClick={() => onAction("remove")}><Trash2 /> Remove from Notebook</button></section>
    {editing && <ProjectEditPanel project={project} onClose={() => setEditing(false)} onSave={(patch) => onChanged(api.update(project.id, patch))} />}
    {commitOpen && <CommitDialog project={project} repo={repo} github={github} api={api} onClose={() => setCommitOpen(false)} onCommitted={(result) => { setCommitOpen(false); onRepoChanged(result.status); setNotice({ text: `Committed ${result.shortHash}${result.pushed ? " and pushed through @blixvip" : ""}.` }); }} setNotice={setNotice} />}
    {setupOpen && <GithubSetupDialog project={project} api={api} onClose={() => setSetupOpen(false)} onConnected={connectedRepository} setNotice={setNotice} />}
  </div>;
}

function ProjectDetail({ project, repo, github, api, skills, commands, onBack, onChanged, onRepoChanged, onAction, onGithubSettings, setNotice, onOpenSkill, onOpenCommand, initialTab = "tasks" }) {
  const [tab, setTab] = useState(PROJECT_TABS.some((item) => item.value === initialTab) ? initialTab : "tasks"); const [agentsDirty, setAgentsDirty] = useState(false); const tabRefs = useRef([]);
  function changeTab(value) { if (tab === "agents" && agentsDirty && !confirm("Discard unsaved AGENTS.md changes?")) return; setTab(value); }
  function handleTabKeyDown(event, index) { let next = index; if (event.key === "ArrowRight") next = (index + 1) % PROJECT_TABS.length; else if (event.key === "ArrowLeft") next = (index - 1 + PROJECT_TABS.length) % PROJECT_TABS.length; else if (event.key === "Home") next = 0; else if (event.key === "End") next = PROJECT_TABS.length - 1; else return; event.preventDefault(); changeTab(PROJECT_TABS[next].value); tabRefs.current[next]?.focus(); }
  function leave() { if (tab === "agents" && agentsDirty && !confirm("Discard unsaved AGENTS.md changes?")) return; onBack(); }
  const projectAction = (kind, url) => onAction(kind, project, url);
  return <section className="project-detail"><header className="project-detail-header"><button className="back-button" onClick={leave}><ArrowLeft /> Projects</button><div className="project-title"><ProjectLogo project={project} load={api.logo} /><span><h1>{project.name}</h1><p>{projectSummary(project)}</p></span></div><div className="project-header-meta"><StatusPill value={project.status} /><RankPill project={project} /></div></header><nav className="project-tabs" role="tablist" aria-label="Project sections">{PROJECT_TABS.map(({ value, label, Icon }, index) => <button type="button" key={value} ref={(element) => { tabRefs.current[index] = element; }} id={`project-tab-${value}`} role="tab" aria-selected={tab === value} aria-controls={`project-panel-${value}`} tabIndex={tab === value ? 0 : -1} className={tab === value ? "active" : ""} onClick={() => changeTab(value)} onKeyDown={(event) => handleTabKeyDown(event, index)}><Icon />{label}{value === "tasks" ? <span>{project.tasks.filter((task) => !["done", "archived"].includes(task.status)).length}</span> : null}</button>)}</nav><div className="project-detail-body" id={`project-panel-${tab}`} role="tabpanel" aria-labelledby={`project-tab-${tab}`}>
    {tab === "tasks" && <TasksTab project={project} onCreate={(input) => onChanged(api.tasks.create(project.id, input))} onUpdate={(id, patch) => onChanged(api.tasks.update(id, patch))} onMove={(id, status, beforeId) => onChanged(api.tasks.move({ id, status, beforeId }))} onRemove={(id) => { if (confirm("Delete this task?")) onChanged(api.tasks.remove(id)); }} />}
    {tab === "agents" && <AgentsTab project={project} api={api} setNotice={setNotice} onDirty={setAgentsDirty} />}
    {tab === "assignments" && <AssignmentsTab project={project} skills={skills} commands={commands} api={api} onChanged={onChanged} onOpenSkill={onOpenSkill} onOpenCommand={onOpenCommand} setNotice={setNotice} />}
    {tab === "activity" && <ActivityTab project={project} />}
    {tab === "settings" && <SettingsTab project={project} repo={repo} github={github} api={api} onChanged={onChanged} onRepoChanged={onRepoChanged} onAction={projectAction} onGithubSettings={onGithubSettings} setNotice={setNotice} />}
  </div></section>;
}

// Same order the sync assigns in src/main/workshop.cjs; unknown categories fall into Other.
const PROJECT_GROUPS = ["Video & Premiere", "Motion graphics", "X & social", "Browser extensions", "Bots & automation", "AI tools", "Dev tools", "Sites & stores", "Personal", "Other"];
const TUCKED_GROUPS = ["Finished", "Not mine"];
function projectGroup(project) {
  if (project.category === "Not mine") return "Not mine";
  if (["completed", "archived"].includes(project.status)) return "Finished";
  return PROJECT_GROUPS.includes(project.category) ? project.category : "Other";
}

function ProjectTile({ project, onOpen, loadLogo }) {
  const progress = taskProgress(project);
  return <button type="button" className="project-tile" onClick={() => onOpen(project.id)} aria-label={`Open ${project.name}`}>
    <ProjectLogo project={project} load={loadLogo} />
    <span className="project-tile-copy"><strong>{project.name}</strong><small>{projectSummary(project)}</small></span>
    <span className="project-tile-meta">{projectTier(project) < 4 ? <b className={`project-tile-rank rank-${projectTier(project)}`}>#{projectTier(project)}</b> : null}{progress.total ? <span>{progress.done}/{progress.total}</span> : null}</span>
  </button>;
}

function ProjectDirectory({ projects, searching, onOpen, loadLogo }) {
  const [filter, setFilter] = useState("All");
  const grouped = useMemo(() => {
    const map = new Map([...PROJECT_GROUPS, ...TUCKED_GROUPS].map((group) => [group, []]));
    for (const project of projects) map.get(projectGroup(project)).push(project);
    for (const items of map.values()) items.sort((a, b) => projectTier(a) - projectTier(b) || a.name.localeCompare(b.name));
    return map;
  }, [projects]);
  const visible = [...grouped].filter(([group, items]) => items.length && (filter === "All" || filter === group));
  return <div className="project-groups">
    <nav className="project-group-filter" aria-label="Project groups">{["All", ...PROJECT_GROUPS, ...TUCKED_GROUPS].filter((group) => group === "All" || grouped.get(group).length).map((group) => <button type="button" key={group} className={filter === group ? "active" : ""} aria-pressed={filter === group} onClick={() => setFilter(group)}>{group}<span>{group === "All" ? projects.length : grouped.get(group).length}</span></button>)}</nav>
    {visible.map(([group, items]) => {
      const body = <div className="project-tile-grid">{items.map((project) => <ProjectTile key={project.id} project={project} onOpen={onOpen} loadLogo={loadLogo} />)}</div>;
      return TUCKED_GROUPS.includes(group) && filter !== group && !searching
        ? <details className="project-group tucked" key={group}><summary><h2>{group}</h2><span>{items.length}</span></summary>{body}</details>
        : <section className="project-group" key={group} aria-label={group}><header><h2>{group}</h2><span>{items.length}</span></header>{body}</section>;
    })}
  </div>;
}

export function ProjectsPage({ api, github, onGithubSettings, skills, commands, onHide, onOpenSkill, onOpenCommand }) {
  const [projects, setProjects] = useState([]); const [repoStates, setRepoStates] = useState({}); const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState(""); const [selectedId, setSelectedId] = useState(() => location.hash.match(/^#\/projects\/([^/]+)/)?.[1] || null); const [detailTab, setDetailTab] = useState("tasks"); const [addOpen, setAddOpen] = useState(false); const [notice, setNotice] = useState(null); const [query, setQuery] = useState(""); const [layout, setLayout] = useState("queue"); const [dragOverTier, setDragOverTier] = useState(null); const dragId = useRef(null); const pageRef = useRef(null);
  async function load() { setLoading(true); setLoadError(""); try { const result = await api.list(); setProjects(result); if (result.length > 30) setLayout("all"); setLoading(false); const selected = result.find((item) => item.id === selectedId); if (selected) refresh(selected); } catch (error) { setLoadError(error.message); setLoading(false); } }
  useEffect(() => { load(); }, []);
  // The folder scan runs behind the page; its result arrives here when it lands.
  useEffect(() => api.onUpdated?.((items) => { if (Array.isArray(items)) setProjects(items); }), []); useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(null), 5000); return () => clearTimeout(timer); } return undefined; }, [notice]);
  useEffect(() => { if (pageRef.current) pageRef.current.scrollTop = 0; }, [layout, selectedId]);
  async function refresh(project) { if (!project.git_root) return; setRepoStates((state) => ({ ...state, [project.id]: { loading: true, files: [] } })); try { const next = await api.status(project.git_root); setRepoStates((state) => ({ ...state, [project.id]: next })); } catch (error) { setRepoStates((state) => ({ ...state, [project.id]: { error: error.message, available: false, files: [], counts: {} } })); } }
  function updateOne(result) { return Promise.resolve(result).then((updated) => { if (!updated) return updated; setProjects((items) => items.map((item) => item.id === updated.id ? updated : item)); return updated; }).catch((error) => { setNotice({ error: true, text: error.message }); return null; }); }
  function openProject(id, tab = "tasks") { const project = projects.find((item) => item.id === id); if (project) refresh(project); setSelectedId(id); setDetailTab(tab); location.hash = `/projects/${id}`; }
  function back() { setSelectedId(null); location.hash = "/projects"; }
  async function quickAction(kind, project, githubUrl) { try { if (kind === "refresh") { await refresh(project); setNotice({ text: "Repository refreshed." }); } else if (kind === "fetch") { const next = await api.fetch(project.git_root); setRepoStates((states) => ({ ...states, [project.id]: next })); setNotice({ text: "Remote references fetched." }); } else if (kind === "remove") { if (!confirm(`Remove ${project.name} from Notebook? Repository files stay untouched.`)) return; await api.remove(project.id); setProjects((items) => items.filter((item) => item.id !== project.id)); if (selectedId === project.id) back(); setNotice({ text: `${project.name} removed. Files were untouched.` }); } else await api.open(kind === "github" ? { kind, url: githubUrl || project.github_url } : { kind, path: project.local_path }); } catch (error) { setNotice({ error: true, text: error.message }); } }
  async function moveProject(tier, beforeId = null) { const id = dragId.current; if (!id || id === beforeId) return; const moving = projects.find((item) => item.id === id); if (!moving) return; const remaining = projects.filter((item) => item.id !== id); const next = { ...moving, tier }; const beforeIndex = beforeId ? remaining.findIndex((item) => item.id === beforeId) : -1; if (beforeIndex >= 0) remaining.splice(beforeIndex, 0, next); else remaining.push(next); setProjects(remaining); setDragOverTier(null); try { setProjects(await api.move({ id, tier, beforeId })); } catch (error) { setNotice({ error: true, text: error.message || "Could not move that project." }); load(); } }
  function startDrag(event, id) { dragId.current = id; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/project-id", id); }
  function endDrag() { dragId.current = null; setDragOverTier(null); }
  const shown = useMemo(() => {
    const search = query.trim().toLowerCase();
    const relevance = (project) => { const name = project.name.toLowerCase(); return name === search ? 0 : name.startsWith(search) ? 1 : name.includes(search) ? 2 : 3; };
    return projects.filter((project) => (layout === "all" || (!["completed", "archived"].includes(project.status) && project.category !== "Not mine")) && (!search || `${project.name} ${projectSummary(project)} ${project.local_path || ""}`.toLowerCase().includes(search)))
      .sort((a, b) => layout === "all" ? (search ? relevance(a) - relevance(b) : 0) || a.name.localeCompare(b.name) : (a.tier_order ?? a.manual_rank) - (b.tier_order ?? b.manual_rank));
  }, [projects, query, layout]);
  const selected = projects.find((item) => item.id === selectedId);
  if (selected) return <><Notice notice={notice} /><ProjectDetail project={selected} repo={repoStates[selected.id]} github={github} api={api} skills={skills} commands={commands} onBack={back} onChanged={updateOne} onRepoChanged={(repo) => setRepoStates((states) => ({ ...states, [selected.id]: repo }))} onAction={quickAction} onGithubSettings={onGithubSettings} setNotice={setNotice} onOpenSkill={onOpenSkill} onOpenCommand={onOpenCommand} initialTab={detailTab} /></>;
  return <section ref={pageRef} className="projects-page projects-simple"><header className="projects-header"><div><Badge variant="outline" className="projects-kicker">Workspace</Badge><h1>Projects</h1><p>{projects.length} local projects. Keep your priorities in the queue; find everything in All projects.</p></div><div><button onClick={onHide} aria-label="Hide notebook"><X /></button><button className="primary" onClick={() => setAddOpen(true)}><Plus /> Add project</button></div></header><Notice notice={notice} /><div className="projects-browse-bar"><SegmentedTabs label="Project view" value={layout} options={[{ value: "queue", label: "Priority queue" }, { value: "all", label: `All projects (${projects.length})` }]} onChange={setLayout} /><span>{shown.length} shown</span></div><InputGroup className="project-search project-simple-search"><Search aria-hidden="true" /><input aria-label="Search projects" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a project or folder…" /></InputGroup>
    {loading ? <Empty title="Loading projects" body="Opening your local workspace…" /> : loadError ? <Empty title="Projects unavailable" body={loadError} action={<button onClick={load}>Try again</button>} /> : !projects.length ? <Empty title="Build your project list" body="Add a project, then drag it into place." action={<button className="primary" onClick={() => setAddOpen(true)}>Add your first project</button>} /> : !shown.length ? <Empty title="No matching projects" body="Try another project name or folder." action={<button onClick={() => setQuery("")}>Clear search</button>} /> : layout === "all" ? <ProjectDirectory projects={shown} searching={Boolean(query.trim())} onOpen={openProject} loadLogo={api.logo} /> : <div className="project-rank-board project-shelves">{PROJECT_LANES.map((lane) => { const items = shown.filter((project) => projectTier(project) === lane.tier); return <section className={`project-rank-row project-rank-section rank-row-${lane.tier} ${dragOverTier === lane.tier ? "is-drag-over" : ""}`} key={lane.tier} aria-label={lane.label} onDragEnter={(event) => { event.preventDefault(); setDragOverTier(lane.tier); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); moveProject(lane.tier); }}><header className="project-rank-heading"><Badge variant="rank" className="rank-number">{lane.ordinal}</Badge><div><h2>{lane.label}</h2><p>{lane.hint}</p></div><Badge variant="outline" className="rank-count">{items.length} {items.length === 1 ? "project" : "projects"}</Badge></header><div className="project-simple-list project-card-grid">{items.map((project) => <ProjectCard key={project.id} project={project} onLogo={api.logo} onOpen={openProject} onDragStart={startDrag} onDragEnd={endDrag} onDropBefore={() => moveProject(lane.tier, project.id)} />)}{!items.length && <p className="project-rank-empty">Drop a project here</p>}</div></section>; })}</div>}
    {addOpen && <AddProjectDialog api={api} projects={projects} onClose={() => setAddOpen(false)} onAdded={(items) => { setProjects((current) => [...current, ...items]); items.forEach(refresh); setNotice({ text: `${items.length} project${items.length === 1 ? "" : "s"} added.` }); }} setNotice={setNotice} />}
  </section>;
}
