import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Copy, Eye, LayoutGrid, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Search, Star, Trash2, X } from "lucide-react";
import { Markdown } from "./markdown.jsx";
import { markdownBlocks } from "./markdown-blocks.js";
import { cleanSkillCategory, displaySkillName, groupSkills, isArchivedSkill, shelfLabel } from "./skill-stack.js";

const SCOPES = [["active", "Active"], ["starred", "Starred"], ["all", "All"]];

// Headings, in render order, so the outline can scroll the matching element into view.
function headings(body) {
  return markdownBlocks(body || "").filter((block) => block.type === "heading").map((block, index) => ({ ...block, index }));
}
function summarise(skill, limit = 120) {
  const line = (skill.body || "").split("\n").map((text) => text.trim()).find((text) => text && !text.startsWith("#")) || "";
  const clean = line.replace(/^[-*>]\s+/, "").replace(/[*_`]/g, "");
  return clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
}

function IconButton({ label, onClick, children, className = "", ...rest }) {
  return <button type="button" className={`icon-button ${className}`} onClick={onClick} aria-label={label} title={label} {...rest}>{children}</button>;
}

function StarButton({ skill, onToggle }) {
  return <IconButton
    className={`skills-star ${skill.pinned ? "is-starred" : ""}`}
    label={skill.pinned ? `Unstar ${displaySkillName(skill)}` : `Star ${displaySkillName(skill)}`}
    aria-pressed={Boolean(skill.pinned)}
    onClick={(event) => { event.stopPropagation(); onToggle(skill); }}
  ><Star size={14} strokeWidth={1.8} fill={skill.pinned ? "currentColor" : "none"} /></IconButton>;
}

function SkillBrowser({ groups, place, current, expanded, onExpand, scope, onScope, query, onQuery, onHome, onOpenCategory, onOpenSkill, onCreate, outline, onOutline }) {
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  return <nav className="skills-browser" aria-label="Skill library">
    <div className="skills-browser-top">
      <strong>Skills</strong>
      <IconButton label="New skill" onClick={onCreate}><Plus size={16} strokeWidth={2} /></IconButton>
    </div>
    <label className="skills-filter"><Search size={14} strokeWidth={1.8} aria-hidden="true" /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Filter skills" aria-label="Filter skills" /></label>
    <div className="segmented skills-scope" role="group" aria-label="Which skills to show">
      {SCOPES.map(([id, label]) => <button type="button" key={id} className={scope === id ? "is-active" : ""} aria-pressed={scope === id} onClick={() => onScope(id)}>{label}</button>)}
    </div>
    <div className="skills-tree">
      <button type="button" className={`skills-home-link ${place.type === "home" ? "is-current" : ""}`} onClick={onHome}>
        <LayoutGrid size={13} strokeWidth={1.8} aria-hidden="true" /><strong>All categories</strong><small>{total}</small>
      </button>
      {!total && <p className="skills-browser-empty">{query.trim() ? "Nothing matches that filter." : scope === "starred" ? "Star a skill to keep it here." : "No skills yet."}</p>}
      {groups.map((group, index) => {
        const open = expanded.has(group.label);
        const startsArchive = group.archived && !groups[index - 1]?.archived;
        return <React.Fragment key={group.label}>
          {startsArchive && <span className="skills-divider">Archive</span>}
          <section className={`skills-shelf ${group.archived ? "is-archived" : ""}`}>
            <div className={`skills-shelf-head ${place.label === group.label ? "is-current" : ""}`}>
              <IconButton className="skills-shelf-toggle" label={`${open ? "Collapse" : "Expand"} ${shelfLabel(group.label)}`} aria-expanded={open} onClick={() => onExpand(group.label)}>
                {open ? <ChevronDown size={13} strokeWidth={2} /> : <ChevronRight size={13} strokeWidth={2} />}
              </IconButton>
              <button type="button" className="skills-shelf-open" onClick={() => onOpenCategory(group.label)}>
                <strong>{shelfLabel(group.label)}</strong><small>{group.items.length}</small>
              </button>
            </div>
            {open && group.items.map((skill) => <button
              type="button"
              key={skill.id}
              className={`skills-item ${place.type === "skill" && current?.id === skill.id ? "is-current" : ""}`}
              aria-current={place.type === "skill" && current?.id === skill.id ? "true" : undefined}
              onClick={() => onOpenSkill(skill)}
            >
              <span className="skills-item-name">{displaySkillName(skill)}</span>
              {skill.pinned ? <Star className="skills-item-star" size={12} strokeWidth={2} aria-label="Starred" /> : null}
            </button>)}
          </section>
        </React.Fragment>;
      })}
    </div>
    {outline.length > 1 && <div className="skills-outline">
      <span className="skills-outline-head">In this skill</span>
      <div className="skills-outline-list">
        {outline.map((heading) => <button type="button" key={heading.index} className={`level-${heading.level}`} onClick={() => onOutline(heading.index)}>{heading.text}</button>)}
      </div>
    </div>}
  </nav>;
}

// The library home: every category as a card, so the whole shelf list is one glance.
function LibraryHome({ groups, onOpenCategory, onOpenSkill, onCreate }) {
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  if (!total) return <div className="empty-state">
    <strong>No skills here</strong>
    <p>Change the filter, or save a prompt, workflow, or instruction set to reuse it.</p>
    <button type="button" className="button primary" onClick={onCreate}><Plus size={15} strokeWidth={2} />New skill</button>
  </div>;
  return <div className="skills-home">
    <header className="skills-page-head">
      <h1>All categories</h1>
      <p>{groups.length} {groups.length === 1 ? "category" : "categories"} · {total} {total === 1 ? "skill" : "skills"}</p>
    </header>
    <div className="skills-cards">
      {groups.map((group) => <section className={`skills-card ${group.archived ? "is-archived" : ""}`} key={group.label}>
        <button type="button" className="skills-card-head" onClick={() => onOpenCategory(group.label)}>
          <strong>{shelfLabel(group.label)}</strong>
          <small>{group.items.length}</small>
        </button>
        <ul>
          {group.items.slice(0, 4).map((skill) => <li key={skill.id}>
            <button type="button" onClick={() => onOpenSkill(skill)}>
              {skill.pinned ? <Star size={11} strokeWidth={2} fill="currentColor" className="skills-item-star" aria-label="Starred" /> : null}
              <span>{displaySkillName(skill)}</span>
            </button>
          </li>)}
        </ul>
        {group.items.length > 4 && <button type="button" className="skills-card-more" onClick={() => onOpenCategory(group.label)}>{group.items.length - 4} more</button>}
      </section>)}
    </div>
  </div>;
}

// One category, read as its own page: best skills first, each with what it is for.
function CategoryPage({ group, onOpenSkill, onTogglePin }) {
  return <div className="skills-category">
    <header className="skills-page-head">
      <h1>{shelfLabel(group.label)}</h1>
      <p>{group.items.length} {group.items.length === 1 ? "skill" : "skills"}{group.archived ? " · archived" : ""}</p>
    </header>
    <div className="skills-rows">
      {group.items.map((skill) => <div className="skills-row" key={skill.id}>
        <button type="button" className="skills-row-open" onClick={() => onOpenSkill(skill)}>
          <strong>{displaySkillName(skill)}</strong>
          <span>{summarise(skill) || "No instructions yet."}</span>
        </button>
        <StarButton skill={skill} onToggle={onTogglePin} />
      </div>)}
    </div>
  </div>;
}

function SkillDocument({ skill, mode, categories, onEdit, onSave, onMode }) {
  if (mode === "edit") return <article className="skills-doc-body">
    <input className="note-title" value={skill.name || ""} onChange={(event) => onEdit({ name: event.target.value })} onBlur={() => onSave(skill)} placeholder="Skill name" aria-label="Skill name" autoFocus />
    <label className="field inline"><span>Category</span>
      <input value={skill.category || ""} onChange={(event) => onEdit({ category: event.target.value })} onBlur={() => onSave(skill)} list="skill-categories" placeholder="Unsorted" aria-label="Skill category" />
      <datalist id="skill-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist>
    </label>
    <textarea className="note-writing skills-writing" value={skill.body || ""} onChange={(event) => onEdit({ body: event.target.value })} onBlur={() => onSave(skill)} placeholder="Paste the prompt, workflow, or instructions here." aria-label="Skill instructions" />
  </article>;
  return <article className="skills-doc-body">
    <h1 className="skills-doc-title">{displaySkillName(skill)}</h1>
    <p className="skills-doc-meta">
      <span>{cleanSkillCategory(skill.category)}</span>
      {skill.pinned ? <span className="skills-doc-badge"><Star size={11} strokeWidth={2} aria-hidden="true" />Starred</span> : null}
      {isArchivedSkill(skill) ? <span className="skills-doc-badge is-muted">Archived</span> : null}
    </p>
    {(skill.body || "").trim()
      ? <div className="note-reading"><Markdown source={skill.body} /></div>
      : <button type="button" className="skills-doc-blank" onClick={() => onMode("edit")}>This skill is empty. Click to write it.</button>}
  </article>;
}

export function SkillsWorkspace({ skills, current, status, editorCategories, onSelect, onEdit, onSave, onCopy, onRemove, onCreate, onTogglePin, onHide }) {
  const [scope, setScope] = useState("active");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("read");
  const [place, setPlace] = useState({ type: "home", label: null });
  const [expanded, setExpanded] = useState(() => new Set());
  const [browserOpen, setBrowserOpen] = useState(() => !window.matchMedia("(max-width: 56rem)").matches);
  const docRef = useRef(null);
  // The skill the app had selected on arrival must not pull us off the library home.
  const openedRef = useRef(current?.id ?? null);

  const groups = useMemo(() => groupSkills(skills, scope, query), [skills, scope, query]);
  const group = groups.find((item) => item.label === place.label) || null;
  // Paging walks every visible skill, whether or not its shelf is open in the sidebar.
  const flat = useMemo(() => groups.flatMap((item) => item.items), [groups]);
  const onSkill = place.type === "skill" && current;
  const outline = useMemo(() => (onSkill && mode === "read" ? headings(current.body) : []), [onSkill, mode, current]);
  const position = onSkill ? flat.findIndex((skill) => skill.id === current.id) : -1;
  const previous = position > 0 ? flat[position - 1] : null;
  const next = position >= 0 && position < flat.length - 1 ? flat[position + 1] : null;

  const narrow = () => window.matchMedia("(max-width: 56rem)").matches;
  function openHome() { setPlace({ type: "home", label: null }); if (narrow()) setBrowserOpen(false); }
  function openCategory(label) {
    setPlace({ type: "category", label });
    setExpanded((open) => new Set([...open, label]));
    if (narrow()) setBrowserOpen(false);
  }
  function openSkill(skill) {
    openedRef.current = skill.id;
    onSelect(skill);
    setPlace({ type: "skill", label: cleanSkillCategory(skill.category) });
    setMode(skill.name?.trim() || skill.body?.trim() ? "read" : "edit");
    if (narrow()) setBrowserOpen(false);
  }
  function toggleShelf(label) {
    setExpanded((open) => { const nextOpen = new Set(open); if (!nextOpen.delete(label)) nextOpen.add(label); return nextOpen; });
  }
  function scrollToHeading(index) {
    docRef.current?.querySelectorAll(".note-reading h1, .note-reading h2, .note-reading h3, .note-reading h4")[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => { docRef.current?.scrollTo({ top: 0 }); }, [place, mode, current?.id]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 56rem)");
    const sync = (event) => setBrowserOpen(!event.matches);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const handleKeys = (event) => {
      if (event.altKey && (event.key === "ArrowRight" || event.key === "ArrowDown") && next) { event.preventDefault(); openSkill(next); }
      if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowUp") && previous) { event.preventDefault(); openSkill(previous); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "e" && onSkill) { event.preventDefault(); setMode((value) => value === "read" ? "edit" : "read"); }
    };
    document.addEventListener("keydown", handleKeys);
    return () => document.removeEventListener("keydown", handleKeys);
  }, [previous, next, onSkill]);

  // A skill opened from elsewhere (search, Ctrl+N) takes over the page.
  useEffect(() => {
    if (!current || openedRef.current === current.id) return;
    openedRef.current = current.id;
    setPlace({ type: "skill", label: cleanSkillCategory(current.category) });
    setMode(current.name?.trim() || current.body?.trim() ? "read" : "edit");
  }, [current?.id]);

  return <div className={`skills-workspace ${browserOpen ? "is-browsing" : ""}`}>
    {browserOpen && <SkillBrowser
      groups={groups}
      place={place}
      current={current}
      expanded={expanded}
      onExpand={toggleShelf}
      scope={scope}
      onScope={setScope}
      query={query}
      onQuery={setQuery}
      onHome={openHome}
      onOpenCategory={openCategory}
      onOpenSkill={openSkill}
      onCreate={onCreate}
      outline={outline}
      onOutline={scrollToHeading}
    />}

    <section className="pane skills-doc">
      <header className="editor-bar">
        <div className="editor-status">
          <IconButton label={browserOpen ? "Hide skill list" : "Show skill list"} onClick={() => setBrowserOpen((open) => !open)}>
            {browserOpen ? <PanelLeftClose size={17} strokeWidth={1.8} /> : <PanelLeftOpen size={17} strokeWidth={1.8} />}
          </IconButton>
          {place.type !== "home" && <IconButton label="Back to all categories" onClick={openHome}><ArrowLeft size={16} strokeWidth={1.8} /></IconButton>}
          <nav className="skills-crumbs" aria-label="Where you are">
            <button type="button" onClick={openHome}>Skills</button>
            {place.label && <><span aria-hidden="true">/</span><button type="button" onClick={() => openCategory(place.label)}>{shelfLabel(place.label)}</button></>}
            {onSkill && <><span aria-hidden="true">/</span><strong>{displaySkillName(current)}</strong></>}
          </nav>
          <span className={`save-state ${status === "Save failed" ? "is-failed" : ""}`}>{status}</span>
        </div>
        <div className="editor-actions">
          {onSkill ? <>
            <StarButton skill={current} onToggle={onTogglePin} />
            <IconButton label="Copy skill" onClick={onCopy}><Copy size={16} strokeWidth={1.8} /></IconButton>
            <button type="button" className="button subtle skills-mode" onClick={() => setMode((value) => value === "read" ? "edit" : "read")}>
              {mode === "read" ? <><Pencil size={14} strokeWidth={1.8} />Edit</> : <><Eye size={14} strokeWidth={1.8} />Read</>}
            </button>
            <IconButton className="is-danger" label={`Delete ${displaySkillName(current)}`} onClick={() => onRemove(current)}><Trash2 size={16} strokeWidth={1.8} /></IconButton>
          </> : <button type="button" className="button subtle skills-mode" onClick={onCreate}><Plus size={14} strokeWidth={2} />New skill</button>}
          <IconButton className="close" label="Hide Notebook" onClick={onHide}><X size={18} strokeWidth={1.8} /></IconButton>
        </div>
      </header>

      <div className="skills-doc-scroll" ref={docRef}>
        {onSkill ? <SkillDocument skill={current} mode={mode} categories={editorCategories} onEdit={onEdit} onSave={onSave} onMode={setMode} />
          : place.type === "category" && group ? <CategoryPage group={group} onOpenSkill={openSkill} onTogglePin={onTogglePin} />
            : <LibraryHome groups={groups} onOpenCategory={openCategory} onOpenSkill={openSkill} onCreate={onCreate} />}
      </div>

      {onSkill && flat.length > 1 && <footer className="skills-doc-nav">
        <button type="button" className="skills-step" disabled={!previous} onClick={() => previous && openSkill(previous)}>
          <ChevronLeft size={14} strokeWidth={2} aria-hidden="true" /><span>{previous ? displaySkillName(previous) : "Start of list"}</span>
        </button>
        <small>{position >= 0 ? `${position + 1} of ${flat.length}` : `${flat.length} skills`}</small>
        <button type="button" className="skills-step is-next" disabled={!next} onClick={() => next && openSkill(next)}>
          <span>{next ? displaySkillName(next) : "End of list"}</span><ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      </footer>}
    </section>
  </div>;
}
