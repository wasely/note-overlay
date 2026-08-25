import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Copy, ExternalLink, Eye, LayoutGrid, LibraryBig, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Search, Star, Trash2, X } from "lucide-react";
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

function PageHeading({ eyebrow, title, meta }) {
  return <header className="skills-page-head">
    <span className="skills-page-kicker">{eyebrow}</span>
    <h1>{title}</h1>
    <p>{meta}</p>
  </header>;
}

function SkillBrowser({ groups, place, current, expanded, onExpand, scope, onScope, query, onQuery, onHome, onOpenCategory, onOpenSkill, onCreate, onClose, outline, onOutline }) {
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  return <nav className="library-browser skills-browser" aria-label="Skill library">
    <div className="library-browser-top skills-browser-top">
      <span className="library-browser-title"><strong>Skills</strong><small>{total}</small></span>
      <span className="library-browser-actions">
        <IconButton label="New skill" onClick={onCreate}><Plus size={16} strokeWidth={2} /></IconButton>
        <IconButton className="library-browser-dismiss" label="Hide skill list" onClick={onClose}><X size={16} strokeWidth={1.8} /></IconButton>
      </span>
    </div>
    <label className="library-filter skills-filter"><Search size={14} strokeWidth={1.8} aria-hidden="true" /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Filter skills" aria-label="Filter skills" /></label>
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
        const startsOwner = group.ownership !== groups[index - 1]?.ownership;
        return <React.Fragment key={group.key || group.label}>
          {startsOwner && <span className="skills-divider skills-owner-divider">{group.ownership === "mine" ? "My skills" : "Other skills"}</span>}
          {startsArchive && <span className="skills-divider">Archive</span>}
          <section className={`skills-shelf ${group.archived ? "is-archived" : ""}`}>
            <div className={`skills-shelf-head ${place.label === group.label ? "is-current" : ""}`}>
              <IconButton className="skills-shelf-toggle" label={`${open ? "Collapse" : "Expand"} ${shelfLabel(group.label)}`} aria-expanded={open} onClick={() => onExpand(group.label)}>
                {open ? <ChevronDown size={13} strokeWidth={2} /> : <ChevronRight size={13} strokeWidth={2} />}
              </IconButton>
              <button type="button" className="skills-shelf-open" title={shelfLabel(group.label)} onClick={() => onOpenCategory(group.label)}>
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

function CategoryCard({ group, onOpenCategory, onOpenSkill }) {
  const label = shelfLabel(group.label);
  return <section className={`skills-card ${group.archived ? "is-archived" : ""}`}>
    <button type="button" className="skills-card-head" onClick={() => onOpenCategory(group.label)}>
      <span className="skills-card-title">
        <strong>{label}</strong>
        <small>{group.items.length} {group.items.length === 1 ? "skill" : "skills"}</small>
      </span>
      <ChevronRight className="skills-card-arrow" size={15} strokeWidth={1.8} aria-hidden="true" />
    </button>
    <ul>
      {group.items.slice(0, 4).map((skill) => <li key={skill.id}>
        <button type="button" onClick={() => onOpenSkill(skill)}>
          {skill.pinned ? <Star size={11} strokeWidth={2} fill="currentColor" className="skills-item-star" aria-label="Starred" /> : <span className="skills-card-dot" aria-hidden="true" />}
          <span>{displaySkillName(skill)}</span>
        </button>
      </li>)}
    </ul>
    {group.items.length > 4 && <button type="button" className="skills-card-more" onClick={() => onOpenCategory(group.label)}>View all {group.items.length} skills <ChevronRight size={13} strokeWidth={2} aria-hidden="true" /></button>}
  </section>;
}

// The library home: every category as a compact index card.
function LibraryHome({ groups, scope, query, onOpenCategory, onOpenSkill, onCreate }) {
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  if (!total) return <div className="empty-state">
    <LibraryBig size={22} strokeWidth={1.6} aria-hidden="true" />
    <strong>No skills here</strong>
    <p>{query.trim() ? `No skills match “${query.trim()}”.` : scope === "starred" ? "Star a skill to keep it close." : "Save a prompt, workflow, or instruction set to reuse it."}</p>
    <button type="button" className="button primary" onClick={onCreate}><Plus size={15} strokeWidth={2} />New skill</button>
  </div>;
  const title = query.trim() ? `Results for “${query.trim()}”` : scope === "starred" ? "Starred skills" : scope === "all" ? "All skills" : "Skill library";
  return <div className="skills-home">
    <PageHeading eyebrow="Library" title={title} meta={`${total} ${total === 1 ? "skill" : "skills"} · ${groups.length} ${groups.length === 1 ? "category" : "categories"}`} />
    <div className="skills-cards">
      {groups.map((group, index) => <React.Fragment key={group.key || group.label}>
        {group.ownership !== groups[index - 1]?.ownership && <h2 className="skills-owner-title">{group.ownership === "mine" ? "My skills" : "Other skills"}</h2>}
        <CategoryCard group={group} onOpenCategory={onOpenCategory} onOpenSkill={onOpenSkill} />
      </React.Fragment>)}
    </div>
  </div>;
}

function SkillRow({ skill, onOpenSkill, onTogglePin }) {
  return <div className="skills-row">
    <button type="button" className="skills-row-open" onClick={() => onOpenSkill(skill)}>
      <span className="skills-row-copy">
        <strong>{displaySkillName(skill)}</strong>
        <span>{summarise(skill) || "No instructions yet."}</span>
      </span>
      <ChevronRight className="skills-row-arrow" size={16} strokeWidth={1.8} aria-hidden="true" />
    </button>
    <StarButton skill={skill} onToggle={onTogglePin} />
  </div>;
}

// One category, read as its own page: best skills first, each with what it is for.
function CategoryPage({ group, onOpenSkill, onTogglePin }) {
  return <div className="skills-category">
    <PageHeading eyebrow={group.archived ? "Archive" : "Category"} title={shelfLabel(group.label)} meta={`${group.items.length} ${group.items.length === 1 ? "skill" : "skills"}${group.archived ? " · archived" : ""}`} />
    <div className="skills-rows">
      {group.items.map((skill) => <SkillRow key={skill.id} skill={skill} onOpenSkill={onOpenSkill} onTogglePin={onTogglePin} />)}
    </div>
  </div>;
}

function SkillDocument({ skill, mode, categories, onEdit, onSave, onMode, onOpenSource }) {
  if (mode === "edit") return <article className="skills-doc-body">
    <input className="note-title" value={skill.name || ""} onChange={(event) => onEdit({ name: event.target.value })} onBlur={() => onSave(skill)} placeholder="Skill name" aria-label="Skill name" autoFocus />
    <label className="field inline"><span>Category</span>
      <input value={skill.category || ""} onChange={(event) => onEdit({ category: event.target.value })} onBlur={() => onSave(skill)} list="skill-categories" placeholder="Unsorted" aria-label="Skill category" />
      <datalist id="skill-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist>
    </label>
    <label className="field inline"><span>Library</span>
      <select value={skill.ownership === "other" ? "other" : "mine"} onChange={(event) => onEdit({ ownership: event.target.value })} onBlur={() => onSave(skill)} aria-label="Skill library"><option value="mine">My skills</option><option value="other">Other skills</option></select>
    </label>
    <label className="field inline"><span>Source</span>
      <input type="url" value={skill.source_url || ""} onChange={(event) => onEdit({ source_url: event.target.value })} onBlur={() => onSave(skill)} placeholder="https://github.com/owner/repo/blob/main/SKILL.md" aria-label="Skill source link" />
    </label>
    <textarea className="note-writing skills-writing" value={skill.body || ""} onChange={(event) => onEdit({ body: event.target.value })} onBlur={() => onSave(skill)} placeholder="Paste the prompt, workflow, or instructions here." aria-label="Skill instructions" />
  </article>;
  return <article className="skills-doc-body">
    <header className="skills-doc-intro">
      <p className="skills-doc-meta">
        <span className="skills-doc-category">{cleanSkillCategory(skill.category)}</span>
        <span className="skills-doc-badge is-owner">{skill.ownership === "other" ? "Other skill" : "My skill"}</span>
        {skill.pinned ? <span className="skills-doc-badge"><Star size={11} strokeWidth={2} aria-hidden="true" />Starred</span> : null}
        {isArchivedSkill(skill) ? <span className="skills-doc-badge is-muted">Archived</span> : null}
      </p>
      <h1 className="skills-doc-title">{displaySkillName(skill)}</h1>
      {skill.source_url ? <button type="button" className="skills-source-link" onClick={() => onOpenSource(skill.source_url)}><ExternalLink size={13} strokeWidth={1.8} aria-hidden="true" />View source on GitHub</button> : <span className="skills-source-missing">No source link</span>}
    </header>
    {(skill.body || "").trim()
      ? <div className="note-reading"><Markdown source={skill.body} /></div>
      : <button type="button" className="skills-doc-blank" onClick={() => onMode("edit")}>This skill is empty. Click to write it.</button>}
  </article>;
}

export function SkillsWorkspace({ skills, current, status, editorCategories, onSelect, onEdit, onSave, onCopy, onRemove, onCreate, onTogglePin, onOpenSource, onDiscardEmpty, onHide }) {
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
  function openHome() { onDiscardEmpty?.(); setPlace({ type: "home", label: null }); if (narrow()) setBrowserOpen(false); }
  function openCategory(label) {
    onDiscardEmpty?.();
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

  return <div className={`library-workspace skills-workspace ${browserOpen ? "is-browsing" : ""}`}>
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
      onClose={() => setBrowserOpen(false)}
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
        {onSkill ? <SkillDocument skill={current} mode={mode} categories={editorCategories} onEdit={onEdit} onSave={onSave} onMode={setMode} onOpenSource={onOpenSource} />
          : place.type === "category" && group ? <CategoryPage group={group} onOpenSkill={openSkill} onTogglePin={onTogglePin} />
            : <LibraryHome groups={groups} scope={scope} query={query} onOpenCategory={openCategory} onOpenSkill={openSkill} onCreate={onCreate} />}
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
