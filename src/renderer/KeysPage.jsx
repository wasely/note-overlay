import React, { useEffect, useMemo, useState } from "react";
import { Copy, KeyRound, RefreshCw, X } from "lucide-react";
import { KeysIcon } from "./icons.jsx";

function formatBytes(value = 0) {
  return value < 1024 ? `${value} B` : `${Math.max(1, Math.round(value / 1024))} KB`;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Unavailable";
}

export function KeysPage({ keys, onRefresh, onCopy, onHide }) {
  const [selectedId, setSelectedId] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [copyState, setCopyState] = useState("");
  const selected = useMemo(() => keys.find((item) => item.id === selectedId) || keys.find((item) => item.exists) || keys[0] || null, [keys, selectedId]);

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  async function refresh() {
    setRefreshing(true);
    try { await onRefresh(); }
    finally { setRefreshing(false); }
  }

  async function copySource() {
    if (!selected?.exists) return;
    try { await onCopy(selected.content); setCopyState("Copied"); }
    catch { setCopyState("Copy failed"); }
    setTimeout(() => setCopyState(""), 1200);
  }

  return <section className="keys-workspace" aria-label="Keys">
    <header className="keys-toolbar">
      <div className="keys-heading">
        <span className="keys-mark" aria-hidden="true"><KeysIcon size={17} /></span>
        <div><h1>Keys</h1><p>Verified fixes, exactly as installed.</p></div>
      </div>
      <div className="keys-toolbar-actions">
        <button type="button" className="button subtle" onClick={refresh} disabled={refreshing}><RefreshCw size={14} strokeWidth={1.8} className={refreshing ? "is-spinning" : ""} /><span>{refreshing ? "Refreshing…" : "Refresh"}</span></button>
        <button type="button" className="icon-button" onClick={onHide} aria-label="Hide Notebook" title="Hide Notebook"><X size={17} strokeWidth={1.8} /></button>
      </div>
    </header>

    <div className="keys-layout">
      <nav className="key-index" aria-label="Key library">
        <div className="key-index-head"><strong>Installed keys</strong><small>{keys.filter((item) => item.exists).length}/{keys.length || 2}</small></div>
        <div className="key-index-list">
          {keys.length ? keys.map((item) => <button type="button" key={item.id} className={selected?.id === item.id ? "is-selected" : ""} onClick={() => { setSelectedId(item.id); setCopyState(""); }}>
            <span className="key-card-mark"><KeyRound size={14} strokeWidth={1.8} /></span>
            <span><strong>{item.label}</strong><small>{item.exists ? `${item.lines} lines · ${formatBytes(item.bytes)}` : "Source missing"}</small></span>
          </button>) : <p className="key-empty-copy">Loading key sources…</p>}
        </div>
      </nav>

      <article className="key-document">
        {selected ? <>
          <header className="key-document-head">
            <div><span className="kicker">Exact SKILL.md</span><h2>{selected.label}</h2><p>{selected.description}</p></div>
            <button type="button" className="button" onClick={copySource} disabled={!selected.exists}><Copy size={14} strokeWidth={1.8} /><span>{copyState || "Copy source"}</span></button>
          </header>
          <div className="key-source-meta"><code>{selected.path}</code><span>{selected.exists ? `Updated ${formatDate(selected.modifiedAt)}` : selected.error}</span></div>
          {selected.exists
            ? <pre className="key-source" tabIndex="0" aria-label={`${selected.label} source`}>{selected.content}</pre>
            : <div className="key-source-empty"><strong>Key source unavailable</strong><p>{selected.error || "The installed SKILL.md could not be read."}</p></div>}
        </> : <div className="key-source-empty"><strong>No keys loaded</strong><p>Refresh to read the installed key sources.</p></div>}
      </article>
    </div>
  </section>;
}
