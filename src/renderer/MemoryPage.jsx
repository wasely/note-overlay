import React, { useEffect, useRef, useState } from "react";
import { Check, Copy, FolderOpen, Pencil, RefreshCw, X } from "lucide-react";
import { Markdown } from "./markdown.jsx";
import { MemoryIcon } from "./icons.jsx";

function formatDate(value) {
  return value ? new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Never";
}

// One page for what every agent should know. The text lives in ~/MASTER-MEMORY.md, the same file
// agents read, so an edit here is an edit for all of them.
export function MemoryPage({ api, onCopy, onHide }) {
  const [master, setMaster] = useState(null);
  const [stores, setStores] = useState([]);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const textRef = useRef(null);
  const dirty = editing && master && draft !== master.content;

  async function load() {
    setBusy(true);
    try {
      const [nextMaster, nextStores] = await Promise.all([api.memory.master(), api.memory.stores().catch(() => [])]);
      setMaster(nextMaster);
      setStores(nextStores);
      setDraft(nextMaster.content);
      setStatus(nextMaster.error ? nextMaster.error : "");
    } catch (error) { setStatus(error.message || "Memory could not load."); }
    finally { setBusy(false); }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { if (editing) textRef.current?.focus(); }, [editing]);

  async function save() {
    if (!master) return;
    setBusy(true);
    try {
      const saved = await api.memory.save(draft, master.modifiedAt);
      setMaster(saved);
      setDraft(saved.content);
      setEditing(false);
      setStatus("Saved for every agent");
    } catch (error) { setStatus(error.message || "Save failed"); }
    finally { setBusy(false); }
  }

  function cancel() { setDraft(master?.content || ""); setEditing(false); setStatus(""); }

  async function copy() {
    try { await onCopy(master?.content || ""); setStatus("Copied"); }
    catch { setStatus("Copy failed"); }
  }

  function onKeyDown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); save(); }
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); }
  }

  return <section className="memory-workspace" aria-label="Memory">
    <header className="keys-toolbar">
      <div className="keys-heading">
        <span className="keys-mark" aria-hidden="true"><MemoryIcon size={17} /></span>
        <div><h1>Memory</h1><p>What every agent should know about you.</p></div>
      </div>
      <div className="keys-toolbar-actions">
        {status && <span className={`memory-status ${/fail|changed|could not|too large/i.test(status) ? "is-error" : ""}`} role="status">{status}</span>}
        {editing
          ? <>
            <button type="button" className="button subtle" onClick={cancel} disabled={busy}>Cancel</button>
            <button type="button" aria-label="Save" title="Save" className="button primary" onClick={save} disabled={busy || !dirty}><Check size={14} strokeWidth={2} /><span>Save</span></button>
          </>
          : <>
            <button type="button" aria-label="Reload" title="Reload" className="button subtle" onClick={load} disabled={busy}><RefreshCw size={14} strokeWidth={1.8} className={busy ? "is-spinning" : ""} /><span>Reload</span></button>
            <button type="button" aria-label="Copy" title="Copy" className="button subtle" onClick={copy} disabled={!master?.content}><Copy size={14} strokeWidth={1.8} /><span>Copy</span></button>
            <button type="button" aria-label="Edit" title="Edit" className="button" onClick={() => { setEditing(true); setStatus(""); }} disabled={!master}><Pencil size={14} strokeWidth={1.8} /><span>Edit</span></button>
          </>}
        <button type="button" className="icon-button" onClick={onHide} aria-label="Hide Notebook" title="Hide Notebook"><X size={17} strokeWidth={1.8} /></button>
      </div>
    </header>

    <div className="memory-layout">
      <article className="memory-document">
        <div className="key-source-meta"><code>{master?.path || "MASTER-MEMORY.md"}</code><span>{master?.exists ? `Updated ${formatDate(master.modifiedAt)}` : master ? "Not created yet" : "Loading…"}</span></div>
        {editing
          ? <textarea ref={textRef} className="memory-editor" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} spellCheck="false" aria-label="Master memory Markdown" />
          : master?.content
            ? <div className="memory-rendered note-reading"><Markdown source={master.content} /></div>
            : <div className="key-source-empty"><strong>{master ? "No master memory yet" : "Loading memory…"}</strong><p>{master ? "Press Edit to write what every agent should know. It saves to MASTER-MEMORY.md in your home folder." : ""}</p></div>}
      </article>

      <aside className="memory-stores" aria-label="Agent memory stores">
        <div className="key-index-head"><strong>Agent memories</strong><small>{stores.reduce((total, store) => total + store.count, 0)}</small></div>
        {stores.map((store) => <button type="button" key={store.id} className="memory-store" onClick={() => api.memory.openStore(store.id).catch(() => setStatus(`${store.label} folder could not open`))} disabled={!store.exists} title={store.exists ? `Open ${store.path}` : "Not found on this PC"}>
          <span><strong>{store.label}</strong><small>{store.exists ? `${store.count} ${store.count === 1 ? "file" : "files"} · ${formatDate(store.modifiedAt)}` : "Not found"}</small><em>{store.detail}</em></span>
          <FolderOpen size={14} strokeWidth={1.8} aria-hidden="true" />
        </button>)}
      </aside>
    </div>
  </section>;
}
