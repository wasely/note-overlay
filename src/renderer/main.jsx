/*
 * Derived from FastNote's note-area / sidebar interaction model.
 * FastNote © 2024, MIT License. See THIRD_PARTY_NOTICES.md.
 */
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { addBrowserFileDragData } from "./drag-file.mjs";
import "./styles.css";

const mockNotes = [];
const mockSkills = [];
const mockSlashCommands = [
  { id: "starter-gitpush", name: "Git push", command: "/prompts:gitpush", body: "Run `/prompts:gitpush` inside the Git repository you want to publish.\n\n## What it does\nStages every change, commits with `Update project files`, then pushes the current tracking branch. It does not run checks.\n\n## Related skill\n`$gitpush`", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: "starter-command-guide", name: "Markdown, skills, and slash commands", command: "", body: "## Markdown (`.md`)\nA text-file format. It can hold instructions but is not automatically a command.\n\n## Custom prompt\nA Markdown file in `.codex/prompts`. `gitpush.md` becomes `/prompts:gitpush`.\n\n## Skill\nA folder containing `SKILL.md` and optional scripts. Invoke it with `$name`.\n\n## Slash command\nA `/` command parsed by Codex. Built-ins use top-level names; custom prompts use `/prompts:<name>`.\n\n## Script\nThe executable that performs deterministic work after a prompt or skill invokes it.", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];
const mockFolders = [{ id: "inbox", name: "Inbox", is_inbox: true, note_count: 0 }];
const mockApi = {
  notes: {
    list: async () => mockNotes.filter((note) => !note.deleted_at).map((note) => ({ ...note })),
    create: async (input = {}) => {
      const note = {
        id: crypto.randomUUID(),
        title: input.title || "",
        body: input.body || "",
        folder_id: input.folderId || "inbox",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockNotes.unshift(note);
      return { ...note };
    },
    update: async (id, input) => {
      const note = mockNotes.find((item) => item.id === id);
      Object.assign(note, { ...input, folder_id: input.folderId ?? note.folder_id, updated_at: new Date().toISOString() });
      return { ...note };
    },
    dragFile: async () => "C:\\Temp\\notebook-note.md",
    trash: async (id) => {
      const note = mockNotes.find((item) => item.id === id);
      note.deleted_at = new Date().toISOString();
    },
  },
  skills: {
    list: async () => mockSkills.map((skill) => ({ ...skill })),
    create: async (input = {}) => {
      const skill = {
        id: crypto.randomUUID(),
        name: input.name || "",
        category: input.category || "Unsorted",
        body: input.body || "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockSkills.unshift(skill);
      return { ...skill };
    },
    update: async (id, input) => {
      const skill = mockSkills.find((item) => item.id === id);
      Object.assign(skill, input, { updated_at: new Date().toISOString() });
      return { ...skill };
    },
    remove: async (id) => {
      const index = mockSkills.findIndex((item) => item.id === id);
      if (index >= 0) mockSkills.splice(index, 1);
    },
  },
  slashCommands: {
    list: async () => mockSlashCommands.map((item) => ({ ...item })),
    create: async (input = {}) => {
      const item = {
        id: crypto.randomUUID(),
        name: input.name || "",
        command: input.command || "",
        body: input.body || "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockSlashCommands.unshift(item);
      return { ...item };
    },
    update: async (id, input) => {
      const item = mockSlashCommands.find((entry) => entry.id === id);
      Object.assign(item, input, { updated_at: new Date().toISOString() });
      return { ...item };
    },
    remove: async (id) => {
      const index = mockSlashCommands.findIndex((item) => item.id === id);
      if (index >= 0) mockSlashCommands.splice(index, 1);
    },
  },
  folders: {
    list: async () => mockFolders.map((folder) => ({
      ...folder,
      note_count: mockNotes.filter((note) => !note.deleted_at && note.folder_id === folder.id).length,
    })),
    create: async (name) => {
      const folder = { id: crypto.randomUUID(), name: name.trim(), is_inbox: false, note_count: 0 };
      mockFolders.push(folder);
      return { ...folder };
    },
    rename: async (id, name) => {
      const folder = mockFolders.find((item) => item.id === id);
      folder.name = name.trim();
    },
    remove: async (id) => {
      const index = mockFolders.findIndex((item) => item.id === id);
      if (index >= 0) mockFolders.splice(index, 1);
      mockNotes.forEach((note) => { if (note.folder_id === id) note.folder_id = "inbox"; });
    },
  },
  compressor: {
    status: async () => new URLSearchParams(location.search).get("demo") === "success",
    start: async () => ({
      ready: new URLSearchParams(location.search).get("demo") === "success",
      error: "Local service is only available in the desktop app.",
    }),
    compress: async () => ({
      compressed_prompt: "Concise project update. Feature complete, tests passed, ready for review.",
      origin_tokens: 24,
      compressed_tokens: 14,
      ratio: "1.7x",
    }),
  },
  compressions: { create: async (value) => value },
  backups: {
    list: async () => [],
    create: async () => ({ name: "notebook-backup-preview.json", createdAt: new Date().toISOString(), size: 1024 }),
    restore: async () => mockNotes.map((note) => ({ ...note })),
  },
  settings: {
    version: async () => "0.7.6",
    export: async () => ({ filePath: "C:\\Temp\\notebook-backup.json" }),
    dataLocation: async () => "C:\\Notebook data",
  },
  clipboard: { writeText: async (text) => navigator.clipboard.writeText(text) },
  window: { hide: async () => {} },
  onNewInboxNote: () => {},
  onFocusEditor: () => {},
  onFlushEditor: () => {},
  onOverlayHiding: () => {},
  onOverlayShown: () => {},
};
const api = window.hushnote || mockApi;

function preview(note) {
  const text = (note.body || "").trim().replace(/\s+/g, " ");
  return text || "Empty note";
}

function noteName(note) {
  return note.title?.trim() || preview(note).slice(0, 42) || "Untitled";
}

function skillName(skill) {
  return skill.name?.trim() || preview({ body: skill.body }).slice(0, 42) || "Untitled skill";
}

function slashCommandName(item) {
  return item.name?.trim() || item.command?.trim() || preview({ body: item.body }).slice(0, 42) || "Untitled command";
}

function SlashCommandList({ items, currentId, onSelect, onRemove }) {
  if (!items.length) return <div className="notes"><p className="empty-list">No slash items found.<br />Use + to save one.</p></div>;
  const groups = [
    { label: "Commands", items: items.filter((item) => item.command?.trim()) },
    { label: "Reference", items: items.filter((item) => !item.command?.trim()) },
  ];
  return <div className="notes slash-list" aria-live="polite">
    {groups.filter((group) => group.items.length).map((group) => <section className="slash-group" key={group.label}>
      <div className="slash-group-label"><span>{group.label}</span><small>{group.items.length}</small></div>
      {group.items.map((item) => <div className={`note-row ${currentId === item.id ? "selected" : ""}`} key={item.id}>
        <button className="note-open" onClick={() => onSelect(item)}><strong>{slashCommandName(item)}</strong><span className={item.command?.trim() ? "slash-invocation" : "slash-reference"}>{item.command?.trim() || "Guide"}</span><small>{shortTime(item.updated_at)}</small></button>
        <button className="note-delete" aria-label={`Delete ${slashCommandName(item)}`} onClick={() => onRemove(item)}>×</button>
      </div>)}
    </section>)}
  </div>;
}

function shortTime(value) {
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}

function fullTime(value) {
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function bytes(value) {
  return value < 1024 ? `${value} B` : `${Math.max(1, Math.round(value / 1024))} KB`;
}

function markdownFor(note) {
  if (!note) return "";
  const title = note.title?.trim();
  const body = note.body?.trimEnd();
  return [title ? `# ${title}` : "", body || ""].filter(Boolean).join("\n\n");
}

function todoItems(body = "") {
  return body.split("\n").map((line, lineIndex) => {
    const match = line.match(/^\s*[-*]\s+\[([ xX])]\s+(.*)$/);
    return match ? { lineIndex, checked: match[1].toLowerCase() === "x", text: match[2] } : null;
  }).filter(Boolean);
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <main className="app-error"><strong>Notebook hit a screen error.</strong><span>Your notes are still saved locally.</span><button onClick={() => location.reload()}>Reload Notebook</button></main>;
    return this.props.children;
  }
}

function App() {
  const [view, setView] = useState("notes");
  const [notes, setNotes] = useState([]);
  const [notebooks, setNotebooks] = useState([]);
  const [activeNotebookId, setActiveNotebookId] = useState("inbox");
  const [current, setCurrent] = useState(null);
  const [filter, setFilter] = useState("");
  const [skills, setSkills] = useState([]);
  const [currentSkill, setCurrentSkill] = useState(null);
  const [skillFilter, setSkillFilter] = useState("");
  const [skillCategory, setSkillCategory] = useState("All");
  const [slashCommands, setSlashCommands] = useState([]);
  const [currentSlashCommand, setCurrentSlashCommand] = useState(null);
  const [slashCommandFilter, setSlashCommandFilter] = useState("");
  const [saveState, setSaveState] = useState("Loading…");
  const [compressOpen, setCompressOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [backups, setBackups] = useState([]);
  const [dataLocation, setDataLocation] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [closing, setClosing] = useState(false);
  const [showTick, setShowTick] = useState(0);
  const [editorMode, setEditorMode] = useState("write");
  const [notebookEditor, setNotebookEditor] = useState(null);
  const [appVersion, setAppVersion] = useState("");
  const saveTimer = useRef();
  const skillSaveTimer = useRef();
  const slashCommandSaveTimer = useRef();
  const noticeTimer = useRef();
  const editorRef = useRef();
  const surfaceRef = useRef(null);
  const currentRef = useRef(null);
  const currentSkillRef = useRef(null);
  const currentSlashCommandRef = useRef(null);

  const load = async () => {
    const [list, savedSkills, savedSlashCommands, savedNotebooks, version] = await Promise.all([api.notes.list(), api.skills.list(), api.slashCommands.list(), api.folders.list(), api.settings.version()]);
    const inboxId = savedNotebooks.find((notebook) => notebook.is_inbox)?.id || "inbox";
    setNotes(list);
    setSkills(savedSkills);
    setSlashCommands(savedSlashCommands);
    setNotebooks(savedNotebooks);
    setAppVersion(version);
    setActiveNotebookId(inboxId);
    const inboxNote = list.find((note) => !note.deleted_at && note.folder_id === inboxId);
    if (inboxNote) setCurrent(inboxNote);
    else if (list.some((note) => !note.deleted_at)) { setActiveNotebookId("all"); setCurrent(list.find((note) => !note.deleted_at)); }
    else {
      const note = await api.notes.create({ title: "", body: "", folderId: inboxId });
      setNotes([note]); setCurrent(note);
    }
    if (savedSkills.length) setCurrentSkill(savedSkills[0]);
    if (savedSlashCommands.length) setCurrentSlashCommand(savedSlashCommands[0]);
    setSaveState("Saved");
  };

  useEffect(() => {
    load().catch(() => setSaveState("Could not load notes"));
    api.onNewInboxNote(() => createNote("inbox"));
    api.onFocusEditor(() => setTimeout(() => editorRef.current?.focus(), 0));
    api.onFlushEditor(() => { if (currentRef.current) saveNow(currentRef.current); if (currentSkillRef.current) saveSkillNow(currentSkillRef.current); if (currentSlashCommandRef.current) saveSlashCommandNow(currentSlashCommandRef.current); });
    api.onOverlayHiding(() => setClosing(true));
    api.onOverlayShown(() => { setClosing(false); setShowTick((tick) => tick + 1); });
    return () => { clearTimeout(saveTimer.current); clearTimeout(skillSaveTimer.current); clearTimeout(slashCommandSaveTimer.current); clearTimeout(noticeTimer.current); };
  }, []);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const surface = surfaceRef.current;
    if (!surface?.animate) return;
    const animation = surface.animate(
      [
        { opacity: 0, transform: "translateY(34px) scale(0.96)" },
        { opacity: 1, offset: 0.7 },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
      { duration: 360, easing: "cubic-bezier(0.22, 1.32, 0.36, 1)" }
    );
    return () => animation.cancel();
  }, [showTick]);

  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { currentSkillRef.current = currentSkill; }, [currentSkill]);
  useEffect(() => { currentSlashCommandRef.current = currentSlashCommand; }, [currentSlashCommand]);
  useEffect(() => {
    const closeMenus = (event) => document.querySelectorAll("details[open]").forEach((details) => { if (!details.contains(event.target)) details.open = false; });
    const closeOnEscape = (event) => { if (event.key === "Escape") document.querySelectorAll("details[open]").forEach((details) => { details.open = false; }); };
    document.addEventListener("pointerdown", closeMenus);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeMenus); document.removeEventListener("keydown", closeOnEscape); };
  }, []);

  async function createNote(folderId) {
    const inboxId = notebooks.find((notebook) => notebook.is_inbox)?.id || "inbox";
    const destination = folderId || (activeNotebookId === "all" ? inboxId : activeNotebookId);
    try {
      const note = await api.notes.create({ title: "", body: "", folderId: destination });
      setNotes((items) => [note, ...items]);
      setActiveNotebookId(destination);
      setCurrent(note);
      setEditorMode("write");
      setCompressOpen(false);
      setSaveState("Saved");
      setTimeout(() => editorRef.current?.focus(), 0);
    } catch { setSaveState("Could not create note"); }
  }

  async function createSkill() {
    const skill = await api.skills.create({ name: "", category: "Unsorted", body: "" });
    setSkills((items) => [skill, ...items]);
    setCurrentSkill(skill);
    setSaveState("Saved");
  }

  async function createSlashCommand() {
    try {
      const item = await api.slashCommands.create({ name: "", command: "", body: "" });
      setSlashCommands((items) => [item, ...items]);
      setCurrentSlashCommand(item);
      setSaveState("Saved");
    } catch { setSaveState("Could not create command"); }
  }

  async function saveNow(note) {
    clearTimeout(saveTimer.current);
    setSaveState("Saving…");
    try {
      const saved = await api.notes.update(note.id, { title: note.title, body: note.body, folderId: note.folder_id });
      setNotes((items) => items.map((item) => item.id === saved.id ? saved : item));
      setCurrent((item) => item?.id === saved.id ? saved : item);
      setSaveState("Saved");
    } catch { setSaveState("Save failed"); }
  }

  function save(note) {
    clearTimeout(saveTimer.current);
    setSaveState("Saving…");
    saveTimer.current = setTimeout(() => saveNow(note), 280);
  }

  function edit(patch) {
    if (!current) return;
    const next = { ...current, ...patch, updated_at: new Date().toISOString() };
    setCurrent(next);
    setNotes((items) => items.map((item) => item.id === next.id ? next : item));
    save(next);
  }

  async function saveSkillNow(skill) {
    clearTimeout(skillSaveTimer.current);
    setSaveState("Saving…");
    try {
      const saved = await api.skills.update(skill.id, { name: skill.name, category: skill.category?.trim() || "Unsorted", body: skill.body });
      setSkills((items) => items.map((item) => item.id === saved.id ? saved : item));
      setCurrentSkill((item) => item?.id === saved.id ? saved : item);
      setSaveState("Saved");
    } catch { setSaveState("Save failed"); }
  }

  function saveSkill(skill) {
    clearTimeout(skillSaveTimer.current);
    setSaveState("Saving…");
    skillSaveTimer.current = setTimeout(() => saveSkillNow(skill), 280);
  }

  function editSkill(patch) {
    if (!currentSkill) return;
    const next = { ...currentSkill, ...patch, updated_at: new Date().toISOString() };
    setCurrentSkill(next);
    setSkills((items) => items.map((item) => item.id === next.id ? next : item));
    saveSkill(next);
  }

  async function saveSlashCommandNow(item) {
    clearTimeout(slashCommandSaveTimer.current);
    setSaveState("Saving…");
    try {
      const saved = await api.slashCommands.update(item.id, { name: item.name, command: item.command, body: item.body });
      setSlashCommands((items) => items.map((entry) => entry.id === saved.id ? saved : entry));
      setCurrentSlashCommand((entry) => entry?.id === saved.id ? saved : entry);
      setSaveState("Saved");
    } catch { setSaveState("Save failed"); }
  }

  function saveSlashCommand(item) {
    clearTimeout(slashCommandSaveTimer.current);
    setSaveState("Saving…");
    slashCommandSaveTimer.current = setTimeout(() => saveSlashCommandNow(item), 280);
  }

  function editSlashCommand(patch) {
    if (!currentSlashCommand) return;
    const next = { ...currentSlashCommand, ...patch, updated_at: new Date().toISOString() };
    setCurrentSlashCommand(next);
    setSlashCommands((items) => items.map((item) => item.id === next.id ? next : item));
    saveSlashCommand(next);
  }

  async function remove(note) {
    if (!window.confirm(`Move “${noteName(note)}” to Trash?`)) return;
    await api.notes.trash(note.id);
    const remaining = notes.filter((item) => item.id !== note.id);
    setNotes(remaining);
    const next = remaining.find((item) => activeNotebookId === "all" || item.folder_id === activeNotebookId);
    setCurrent(next || null);
    if (!remaining.length) await createNote();
  }

  function openNotebook(id) {
    setActiveNotebookId(id);
    setCurrent(notes.find((note) => !note.deleted_at && (id === "all" || note.folder_id === id)) || null);
    setEditorMode("write");
    setCompressOpen(false);
  }

  async function submitNotebook(event) {
    event.preventDefault();
    const name = notebookEditor?.value?.trim();
    if (!name) return;
    try {
      if (notebookEditor.mode === "create") {
        const notebook = await api.folders.create(name);
        setNotebooks(await api.folders.list());
        setNotebookEditor(null);
        await createNote(notebook.id);
      } else {
        await api.folders.rename(notebookEditor.id, name);
        setNotebooks(await api.folders.list());
        setNotebookEditor(null);
      }
    } catch { setSaveState(`Could not ${notebookEditor.mode} notebook`); }
  }

  function renameNotebook() {
    const notebook = notebooks.find((item) => item.id === activeNotebookId);
    if (!notebook || notebook.is_inbox) return;
    setNotebookEditor({ mode: "rename", id: notebook.id, value: notebook.name });
  }

  async function deleteNotebook() {
    const notebook = notebooks.find((item) => item.id === activeNotebookId);
    if (!notebook || notebook.is_inbox) return;
    if (!window.confirm(`Delete notebook “${notebook.name}”? Its notes will move to Inbox.`)) return;
    try {
      await api.folders.remove(notebook.id);
      const [savedNotes, savedNotebooks] = await Promise.all([api.notes.list(), api.folders.list()]);
      const inboxId = savedNotebooks.find((item) => item.is_inbox)?.id || "inbox";
      setNotes(savedNotes); setNotebooks(savedNotebooks); setActiveNotebookId(inboxId);
      setCurrent(savedNotes.find((note) => !note.deleted_at && note.folder_id === inboxId) || null);
      setSaveState("Saved");
    } catch { setSaveState("Could not delete notebook"); }
  }

  async function moveCurrentTo(folderId) {
    if (!current || folderId === current.folder_id) return;
    const next = { ...current, folder_id: folderId, updated_at: new Date().toISOString() };
    setCurrent(next);
    setNotes((items) => items.map((item) => item.id === next.id ? next : item));
    setActiveNotebookId(folderId);
    await saveNow(next);
  }

  async function removeSkill(skill) {
    if (!window.confirm(`Delete “${skillName(skill)}”?`)) return;
    await api.skills.remove(skill.id);
    const remaining = skills.filter((item) => item.id !== skill.id);
    setSkills(remaining); setCurrentSkill(remaining[0] || null);
  }

  async function removeSlashCommand(item) {
    if (!window.confirm(`Delete “${slashCommandName(item)}”?`)) return;
    await api.slashCommands.remove(item.id);
    const remaining = slashCommands.filter((entry) => entry.id !== item.id);
    setSlashCommands(remaining); setCurrentSlashCommand(remaining[0] || null);
  }

  async function openRecovery() {
    setRecoveryOpen(true); setCompressOpen(false); setRecoveryMessage("");
    try {
      const [savedBackups, location] = await Promise.all([api.backups.list(), api.settings.dataLocation()]);
      setBackups(savedBackups); setDataLocation(location);
    } catch { setRecoveryMessage("Could not load recovery information."); }
  }

  async function makeBackup() {
    setRecoveryMessage("Creating backup…");
    try {
      const backup = await api.backups.create();
      setBackups((items) => [backup, ...items]); setRecoveryMessage("Backup created.");
    } catch { setRecoveryMessage("Could not create backup."); }
  }

  async function restoreBackup(backup) {
    if (!window.confirm(`Replace your current notes with the backup from ${fullTime(backup.createdAt)}? A safety backup will be made first.`)) return;
    setRecoveryMessage("Restoring…");
    try {
      // Desktop returns { notes, skills, slashCommands }; the browser mock returns a notes array.
      const restored = await api.backups.restore(backup.name);
      const restoredNotes = Array.isArray(restored) ? restored : restored.notes;
      const restoredSkills = Array.isArray(restored) ? null : restored.skills;
      const restoredSlashCommands = Array.isArray(restored) ? null : restored.slashCommands;
      const restoredNotebooks = await api.folders.list();
      const inboxId = restoredNotebooks.find((notebook) => notebook.is_inbox)?.id || "inbox";
      setNotebooks(restoredNotebooks); setActiveNotebookId(inboxId);
      setNotes(restoredNotes.filter((note) => !note.deleted_at)); setCurrent(restoredNotes.find((note) => !note.deleted_at && note.folder_id === inboxId) || restoredNotes.find((note) => !note.deleted_at) || null);
      if (restoredSkills) { setSkills(restoredSkills); setCurrentSkill(restoredSkills[0] || null); }
      if (restoredSlashCommands) { setSlashCommands(restoredSlashCommands); setCurrentSlashCommand(restoredSlashCommands[0] || null); }
      setRecoveryMessage("Backup restored.");
    } catch { setRecoveryMessage("Could not restore that backup."); }
  }

  async function exportNotes(format) {
    try { const result = await api.settings.export(format); setRecoveryMessage(result?.canceled ? "Export cancelled." : "Export saved."); }
    catch { setRecoveryMessage("Could not export notes."); }
  }

  async function copyCurrent() {
    if (!current) return;
    const text = markdownFor(current);
    if (!text) return setSaveState("Nothing to copy");
    try { await api.clipboard.writeText(text); showSaveNotice("Copied"); }
    catch { setSaveState("Copy failed"); }
  }

  async function copySkill() {
    if (!currentSkill) return;
    const text = [currentSkill.name?.trim(), currentSkill.body?.trim()].filter(Boolean).join("\n\n");
    if (!text) return setSaveState("Nothing to copy");
    try { await api.clipboard.writeText(text); showSaveNotice("Copied"); }
    catch { setSaveState("Copy failed"); }
  }

  async function copySlashCommand() {
    if (!currentSlashCommand) return;
    const text = [currentSlashCommand.command?.trim(), currentSlashCommand.body?.trim()].filter(Boolean).join("\n\n");
    if (!text) return setSaveState("Nothing to copy");
    try { await api.clipboard.writeText(text); showSaveNotice("Copied"); }
    catch { setSaveState("Copy failed"); }
  }

  function showSaveNotice(message, duration = 1100) {
    clearTimeout(noticeTimer.current);
    setSaveState(message);
    noticeTimer.current = setTimeout(() => setSaveState("Saved"), duration);
  }

  function dragCurrent(event) {
    if (!current) return;
    if (!(current.body?.trim() || current.title?.trim())) return setSaveState("Nothing to drag");
    try {
      if (typeof api.notes.dragCleanName === "function") {
        event.preventDefault();
        api.notes.dragCleanName({ id: current.id, title: current.title, body: current.body });
        setSaveState("Dragging clean filename");
      } else {
        const drag = addBrowserFileDragData(event, current);
        if (!drag) return setSaveState("Drag not supported");
        setSaveState(`Dragging ${drag.fileName}`);
      }
    }
    catch { setSaveState("Drag failed"); }
  }

  async function copyDragName() {
    if (!current || !(current.body?.trim() || current.title?.trim())) return setSaveState("Nothing to share");
    try {
      const filePath = await api.notes.dragFile({ id: current.id, title: current.title, body: current.body });
      const fileName = filePath.split(/[\\/]/).pop();
      await api.clipboard.writeText(fileName);
      showSaveNotice("Filename copied", 1400);
    } catch { setSaveState("Could not create .md"); }
  }

  async function copyDragPath() {
    if (!current || !(current.body?.trim() || current.title?.trim())) return setSaveState("Nothing to share");
    try {
      const filePath = await api.notes.dragFile({ id: current.id, title: current.title, body: current.body });
      await api.clipboard.writeText(`"${filePath}"`);
      showSaveNotice("Path copied", 1400);
    } catch { setSaveState("Could not create .md"); }
  }

  function addTodo() {
    if (!current) return;
    const body = current.body || "";
    const editor = editorRef.current;
    const start = editorMode === "write" && editor ? editor.selectionStart : body.length;
    const end = editorMode === "write" && editor ? editor.selectionEnd : body.length;
    const selected = body.slice(start, end);
    let insertion;
    if (selected) insertion = selected.split("\n").map((line) => /^\s*[-*]\s+\[[ xX]]/.test(line) ? line : `- [ ] ${line}`).join("\n");
    else insertion = `${start > 0 && body[start - 1] !== "\n" ? "\n" : ""}- [ ] `;
    const nextBody = `${body.slice(0, start)}${insertion}${body.slice(end)}`;
    const caret = start + insertion.length;
    setEditorMode("write");
    edit({ body: nextBody });
    requestAnimationFrame(() => { editorRef.current?.focus(); editorRef.current?.setSelectionRange(caret, caret); });
  }

  function toggleTodo(lineIndex, checked) {
    if (!current) return;
    const lines = (current.body || "").split("\n");
    lines[lineIndex] = lines[lineIndex].replace(/^(\s*[-*]\s+\[)[ xX](])/, `$1${checked ? "x" : " "}$2`);
    edit({ body: lines.join("\n") });
  }

  const visible = notes.filter((note) => !note.deleted_at && (activeNotebookId === "all" || note.folder_id === activeNotebookId) && `${noteName(note)} ${note.body || ""}`.toLowerCase().includes(filter.toLowerCase()));
  const activeNotebook = notebooks.find((notebook) => notebook.id === activeNotebookId);
  const tasks = todoItems(current?.body);
  const categories = ["All", ...new Set(skills.map((skill) => skill.category?.trim() || "Unsorted"))].sort((left, right) => left === "All" ? -1 : left.localeCompare(right));
  const visibleSkills = skills.filter((skill) => {
    const matchesSearch = `${skillName(skill)} ${skill.category || ""} ${skill.body || ""}`.toLowerCase().includes(skillFilter.toLowerCase());
    return matchesSearch && (skillCategory === "All" || (skill.category?.trim() || "Unsorted") === skillCategory);
  });
  const visibleSlashCommands = slashCommands.filter((item) => `${slashCommandName(item)} ${item.command || ""} ${item.body || ""}`.toLowerCase().includes(slashCommandFilter.toLowerCase()));
  return <div className={`window-surface ${closing ? "is-closing" : ""}`} ref={surfaceRef}><main className="notebook">
    <aside className="note-list" aria-label={view === "notes" ? "Notes" : view === "skills" ? "Skills" : "Slash commands"}>
      <div className="list-top"><strong>Notebook</strong><div><button className="utility" onClick={openRecovery} aria-label="Backups and settings" title="Backups and settings">···</button><button className="new-note" onClick={view === "notes" ? () => createNote() : view === "skills" ? createSkill : createSlashCommand} aria-label={view === "notes" ? "New note" : view === "skills" ? "New skill" : "New slash command"}>+</button></div></div>
      <nav className="view-switch" aria-label="Notebook pages"><button className={view === "notes" ? "active" : ""} onClick={() => { setView("notes"); setCompressOpen(false); }}>Notes</button><button className={view === "skills" ? "active" : ""} onClick={() => { setView("skills"); setCompressOpen(false); }}>Skills</button><button className={view === "slash-commands" ? "active" : ""} onClick={() => { setView("slash-commands"); setCompressOpen(false); }} aria-label="Slash commands">Slash</button></nav>
      {view === "notes" ? <>
        <div className="notebook-picker">
          <select value={activeNotebookId} onChange={(event) => openNotebook(event.target.value)} aria-label="Current notebook">
            <option value="all">All notes</option>
            {notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.name} ({notes.filter((note) => !note.deleted_at && note.folder_id === notebook.id).length})</option>)}
          </select>
          <button onClick={() => setNotebookEditor({ mode: "create", value: "" })} aria-label="New notebook" title="New notebook">+</button>
          {activeNotebook && !activeNotebook.is_inbox && <details className="action-menu notebook-actions"><summary role="button" aria-label="Notebook actions" title="Notebook actions">···</summary><div className="menu-popover"><button onClick={(event) => { event.currentTarget.closest("details").open = false; renameNotebook(); }}>Rename</button><button className="danger" onClick={(event) => { event.currentTarget.closest("details").open = false; deleteNotebook(); }}>Delete</button></div></details>}
        </div>
        {notebookEditor && <form className="notebook-editor" onSubmit={submitNotebook}><input autoFocus value={notebookEditor.value} onChange={(event) => setNotebookEditor({ ...notebookEditor, value: event.target.value })} placeholder="Notebook name" aria-label="Notebook name" /><button type="submit">{notebookEditor.mode === "create" ? "Create" : "Save"}</button><button type="button" onClick={() => setNotebookEditor(null)} aria-label="Cancel notebook edit">×</button></form>}
        <label className="search"><span>⌕</span><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Find a note" aria-label="Find a note" /></label>
        <div className="notes" aria-live="polite">
          {visible.map((note) => <div className={`note-row ${current?.id === note.id ? "selected" : ""}`} key={note.id}>
            <button className="note-open" onClick={() => { setCurrent(note); setCompressOpen(false); }}><strong>{noteName(note)}</strong><span>{preview(note)}</span><small>{shortTime(note.updated_at)}</small></button>
            <button className="note-delete" aria-label={`Delete ${noteName(note)}`} onClick={() => remove(note)}>×</button>
          </div>)}
          {!visible.length && <p className="empty-list">No notes here.<br />Use + to create one.</p>}
        </div>
      </> : view === "skills" ? <>
        <label className="search"><span>⌕</span><input value={skillFilter} onChange={(event) => setSkillFilter(event.target.value)} placeholder="Find a skill" aria-label="Find a skill" /></label>
        <div className="category-filters" aria-label="Skill categories">{categories.map((category) => <button key={category} className={skillCategory === category ? "active" : ""} onClick={() => setSkillCategory(category)}>{category}</button>)}</div>
        <div className="notes" aria-live="polite">
          {visibleSkills.map((skill) => <div className={`note-row ${currentSkill?.id === skill.id ? "selected" : ""}`} key={skill.id}>
            <button className="note-open" onClick={() => setCurrentSkill(skill)}><strong>{skillName(skill)}</strong><span>{skill.category?.trim() || "Unsorted"} · {preview({ body: skill.body })}</span><small>{shortTime(skill.updated_at)}</small></button>
            <button className="note-delete" aria-label={`Delete ${skillName(skill)}`} onClick={() => removeSkill(skill)}>×</button>
          </div>)}
          {!visibleSkills.length && <p className="empty-list">No skills found.<br />Use + to save one.</p>}
        </div>
      </> : <>
        <label className="search"><span>⌕</span><input value={slashCommandFilter} onChange={(event) => setSlashCommandFilter(event.target.value)} placeholder="Find in Slash" aria-label="Find a slash command" /></label>
        <SlashCommandList items={visibleSlashCommands} currentId={currentSlashCommand?.id} onSelect={setCurrentSlashCommand} onRemove={removeSlashCommand} />
      </>}
      <p className="local-note">Local only{appVersion ? ` · v${appVersion}` : ""}</p>
    </aside>
    {view === "notes" ? <section className="editor">
      <header className="editor-bar">
        <div className="editor-context"><span className={`save-state ${saveState === "Save failed" ? "failed" : ""}`}>{saveState}</span>{current && <span className="notebook-name">{notebooks.find((notebook) => notebook.id === current.folder_id)?.name}</span>}</div>
        <div className="editor-actions">
          <div className={`drag-action ${current && (current.body?.trim() || current.title?.trim()) ? "" : "is-disabled"}`} role="button" tabIndex="0" draggable={Boolean(current && (current.body?.trim() || current.title?.trim()))} aria-disabled={Boolean(!current || !(current.body?.trim() || current.title?.trim()))} onDragStart={dragCurrent} onDragEnd={() => showSaveNotice("Drag finished", 900)} onClick={copyDragName} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); copyDragName(); } }} title={current && (current.body?.trim() || current.title?.trim()) ? "Drag a clean Markdown filename, or click to copy it" : "Write something before dragging a Markdown file"}>⠿ Drag .md</div>
          <details className="action-menu"><summary role="button" aria-label="More note actions" title="More note actions">···</summary><div className="menu-popover editor-menu"><button onClick={(event) => { event.currentTarget.closest("details").open = false; copyCurrent(); }}>Copy Markdown</button><button onClick={(event) => { event.currentTarget.closest("details").open = false; copyDragPath(); }}>Copy .md path</button><button onClick={(event) => { event.currentTarget.closest("details").open = false; setCompressOpen((value) => !value); }}>Compress</button>{current && <label><span>Move to</span><select value={current.folder_id} onChange={(event) => { event.currentTarget.closest("details").open = false; moveCurrentTo(event.target.value); }} aria-label="Move note to notebook">{notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.name}</option>)}</select></label>}</div></details>
          <button className="hide" onClick={() => api.window.hide()} aria-label="Hide notebook">×</button>
        </div>
      </header>
      {current ? <div className="note-canvas" key={current.id}>
        <input className="title" value={current.title || ""} onChange={(event) => edit({ title: event.target.value })} placeholder="Untitled" aria-label="Note title" autoFocus />
        <div className="note-tools"><button onClick={addTodo}>+ To-do</button><button className={editorMode === "checklist" ? "active" : ""} onClick={() => setEditorMode((mode) => mode === "write" ? "checklist" : "write")}>{editorMode === "write" ? `Checklist${tasks.length ? ` ${tasks.filter((task) => task.checked).length}/${tasks.length}` : ""}` : "Back to note"}</button></div>
        {editorMode === "write" ? <textarea ref={editorRef} className="writing" value={current.body || ""} onChange={(event) => edit({ body: event.target.value })} onBlur={() => saveNow(current)} placeholder="Write Markdown. It saves automatically." aria-label="Note content" /> : <div className="checklist" aria-label="To-do checklist">
          {tasks.map((task) => <label className={task.checked ? "done" : ""} key={task.lineIndex}><input type="checkbox" checked={task.checked} onChange={(event) => toggleTodo(task.lineIndex, event.target.checked)} /><span>{task.text}</span></label>)}
          {!tasks.length && <div className="checklist-empty"><strong>No to-dos yet</strong><span>Add one and it will be stored as <code>- [ ]</code> in this Markdown note.</span><button className="plain-button" onClick={addTodo}>Add to-do</button></div>}
        </div>}
      </div> : <div className="empty-editor"><strong>{activeNotebook?.name || "This notebook"} is empty</strong><span>Create a Markdown note to get started.</span><button className="plain-button" onClick={() => createNote()}>New note</button></div>}
    </section> : view === "skills" ? <SkillsEditor skill={currentSkill} categories={categories.slice(1)} saveState={saveState} onEdit={editSkill} onSave={saveSkillNow} onCopy={copySkill} onRemove={removeSkill} onHide={() => api.window.hide()} /> : <SlashCommandEditor item={currentSlashCommand} saveState={saveState} onEdit={editSlashCommand} onSave={saveSlashCommandNow} onCopy={copySlashCommand} onRemove={removeSlashCommand} onHide={() => api.window.hide()} />}
    {view === "notes" && compressOpen && <Compressor note={current} onClose={() => setCompressOpen(false)} />}
    {recoveryOpen && <Recovery backups={backups} message={recoveryMessage} dataLocation={dataLocation} onClose={() => setRecoveryOpen(false)} onBackup={makeBackup} onRestore={restoreBackup} onExport={exportNotes} />}
  </main></div>;
}

function SkillsEditor({ skill, categories, saveState, onEdit, onSave, onCopy, onRemove, onHide }) {
  if (!skill) return <section className="editor skill-empty"><strong>No skill selected</strong><span>Create one with + to save a prompt, workflow, or command.</span></section>;
  return <section className="editor">
    <header className="editor-bar">
      <span className={`save-state ${saveState === "Save failed" ? "failed" : ""}`}>{saveState}</span>
      <div><button className="text-action" onClick={onCopy}>Copy</button><button className="text-action danger" onClick={() => onRemove(skill)}>Delete</button><button className="hide" onClick={onHide} aria-label="Hide notebook">×</button></div>
    </header>
    <input className="title" value={skill.name || ""} onChange={(event) => onEdit({ name: event.target.value })} placeholder="Skill name" aria-label="Skill name" autoFocus />
    <label className="skill-category"><span>Category</span><input value={skill.category || ""} onChange={(event) => onEdit({ category: event.target.value })} onBlur={() => onSave(skill)} list="skill-categories" placeholder="Unsorted" aria-label="Skill category" /><datalist id="skill-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist></label>
    <textarea className="writing skill-writing" value={skill.body || ""} onChange={(event) => onEdit({ body: event.target.value })} onBlur={() => onSave(skill)} placeholder="Paste the prompt, workflow, command, or instructions here." aria-label="Skill notes" />
  </section>;
}

function SlashCommandEditor({ item, saveState, onEdit, onSave, onCopy, onRemove, onHide }) {
  if (!item) return <section className="editor skill-empty"><strong>No slash command selected</strong><span>Create one with + to save its invocation and instructions.</span></section>;
  return <section className="editor slash-editor">
    <header className="editor-bar">
      <span className={`save-state ${saveState === "Save failed" ? "failed" : ""}`}>{saveState}</span>
      <div><button className="text-action" onClick={onCopy}>Copy</button><button className="text-action danger" onClick={() => onRemove(item)}>Delete</button><button className="hide" onClick={onHide} aria-label="Hide notebook">×</button></div>
    </header>
    <input className="title" value={item.name || ""} onChange={(event) => onEdit({ name: event.target.value })} placeholder="Slash item name" aria-label="Slash command name" autoFocus />
    <div className="slash-fields"><label className="slash-field"><span>Invocation <small>optional for reference pages</small></span><input value={item.command || ""} onChange={(event) => onEdit({ command: event.target.value })} onBlur={() => onSave(item)} placeholder="/prompts:name" aria-label="Slash command invocation" spellCheck="false" /></label></div>
    <div className="slash-notes-heading"><span>Notes</span><small>Markdown supported</small></div>
    <textarea className="writing slash-writing" value={item.body || ""} onChange={(event) => onEdit({ body: event.target.value })} onBlur={() => onSave(item)} placeholder="Explain what it does, where it lives, and how to use it." aria-label="Slash command notes" />
  </section>;
}

function Recovery({ backups, message, dataLocation, onClose, onBackup, onRestore, onExport }) {
  return <aside className="recovery" aria-label="Backups and settings">
    <header><div><strong>Backups</strong><span>Stored only on this computer</span></div><button className="hide" onClick={onClose} aria-label="Close backups">×</button></header>
    <p className="recovery-copy">Notebook makes one rotating backup per day and keeps the latest 21.</p>
    <div className="recovery-actions"><button className="plain-button" onClick={onBackup}>Back up now</button><button className="text-action" onClick={() => onExport("json")}>Export JSON</button><button className="text-action" onClick={() => onExport("markdown")}>Export Markdown</button></div>
    {message && <p className="message">{message}</p>}
    <div className="backup-list">
      {backups.map((backup) => <div className="backup-row" key={backup.name}><div><strong>{fullTime(backup.createdAt)}</strong><span>{bytes(backup.size)}</span></div><button className="text-action" onClick={() => onRestore(backup)}>Restore</button></div>)}
      {!backups.length && <p className="empty-list">No backups yet.</p>}
    </div>
    {dataLocation && <p className="data-location" title={dataLocation}>Data: {dataLocation}</p>}
  </aside>;
}

function Compressor({ note, onClose }) {
  const [status, setStatus] = useState("checking");
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  useEffect(() => { api.compressor.status().then((ready) => setStatus(ready ? "ready" : "offline")).catch(() => { setStatus("offline"); setMessage("Could not check the local compressor."); }); }, []);
  async function start() {
    setStatus("starting"); setMessage("");
    try { const answer = await api.compressor.start(); setStatus(answer.ready ? "ready" : "offline"); setMessage(answer.error || ""); }
    catch { setStatus("offline"); setMessage("Could not start the local compressor."); }
  }
  async function compress() {
    const source = note?.body?.trim();
    if (!source) return setMessage("Write or paste something first.");
    if (status !== "ready") return setMessage("Start the local compressor first.");
    setStatus("working"); setMessage("");
    try {
      const output = await api.compressor.compress(source, 0.6);
      if (!output || typeof output.compressed_prompt !== "string" || !output.compressed_prompt.trim()) throw new Error("The local compressor returned no text.");
      setResult(output); setStatus("ready");
      try { await api.compressions.create({ noteId: note.id, sourceText: source, compressedText: output.compressed_prompt, preset: "Balanced", rate: 0.6, originTokens: output.origin_tokens, compressedTokens: output.compressed_tokens, ratio: output.ratio }); }
      catch { setMessage("Compressed successfully, but its local history could not be saved."); }
    } catch (error) { setStatus("ready"); setMessage(error.message || "Compression failed."); }
  }
  return <aside className="compressor" aria-label="Local compressor">
    <header><div><strong>Local compressor</strong><span>{status === "ready" ? "Ready" : status === "working" ? "Compressing…" : status === "checking" ? "Checking…" : "Offline"}</span></div><button className="hide" onClick={onClose} aria-label="Close compressor">×</button></header>
    <p>Compresses the open note locally. Your original stays as-is.</p>
    {message && <p className="message">{message}</p>}
    {status === "offline" ? <button className="plain-button" onClick={start}>Start compressor</button> : <button className="plain-button" onClick={compress} disabled={status === "working" || status === "starting"}>Compress note</button>}
    {result && <><div className="result-meta">{result.origin_tokens} → {result.compressed_tokens} tokens · {result.ratio}</div><textarea className="result" value={result.compressed_prompt} readOnly aria-label="Compressed note" /><button className="copy" onClick={async () => { try { await api.clipboard.writeText(result.compressed_prompt); } catch { setMessage("Could not copy. Select the text and copy it normally."); } }}>Copy</button></>}
  </aside>;
}

createRoot(document.getElementById("root")).render(<ErrorBoundary><App /></ErrorBoundary>);
