import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, FolderOpen, RefreshCw, X } from "lucide-react";
import { SimpleLogo } from "./SimpleLogo.jsx";
import "./cep-extensions.css";

function Mark({ item, compact = false }) {
  return <span className={`cep-product-mark tone-${item.id}${compact ? " is-compact" : ""}`}>
    {item.logo ? <img src={item.logo} alt="" draggable={false} /> : <SimpleLogo name={item.name} seed={item.id} />}
  </span>;
}

function Status({ item }) {
  if (item.attention) return <span className="cep-status is-attention"><AlertTriangle aria-hidden="true" />{item.attention}</span>;
  if (item.installed) return <span className="cep-status is-installed"><CheckCircle2 aria-hidden="true" />Installed</span>;
  return <span className="cep-status">Not installed</span>;
}

function Actions({ item, onProject, onFolder }) {
  return <div className="cep-card-actions">
    {item.projectId && <button type="button" className="cep-open-project" onClick={() => onProject(item.projectId)}>Open workspace<ArrowUpRight aria-hidden="true" /></button>}
    <button type="button" className={item.projectId ? "cep-folder-button" : "cep-open-project"} disabled={!item.sourcePath} onClick={() => onFolder(item)} aria-label={item.projectId ? `Open ${item.name} source folder` : undefined} title={item.projectId ? "Open source folder" : undefined}>
      <FolderOpen aria-hidden="true" />{!item.projectId && <span>Open source</span>}
    </button>
  </div>;
}

function MainCard({ item, onProject, onFolder }) {
  return <article className={`cep-main-card${item.rank === 1 ? " is-lead" : ""}`}>
    <header>
      <span className="cep-rank" aria-label={`Rank ${item.rank}`}>{String(item.rank).padStart(2, "0")}</span>
      <Status item={item} />
    </header>
    <div className="cep-card-body">
      <Mark item={item} />
      <div>
        <h3>{item.name}</h3>
        <p>{item.summary}</p>
      </div>
    </div>
    <footer>
      <code title={item.sourcePath || "Source folder unavailable"}>{item.sourcePath || "Source folder unavailable"}</code>
      <Actions item={item} onProject={onProject} onFolder={onFolder} />
    </footer>
  </article>;
}

function SecondaryCard({ item, onProject, onFolder }) {
  return <article className="cep-secondary-card">
    <Mark item={item} compact />
    <div className="cep-secondary-copy">
      <span><h3>{item.name}</h3><Status item={item} /></span>
      <p>{item.summary}</p>
    </div>
    <Actions item={item} onProject={onProject} onFolder={onFolder} />
  </article>;
}

function Empty({ error, onRetry }) {
  return <div className="cep-empty" role={error ? "alert" : "status"}>
    <span className="cep-page-mark" aria-hidden="true">C</span>
    <strong>{error ? "CEP library unavailable" : "Loading CEP extensions"}</strong>
    <p>{error || "Checking source folders and installed panels…"}</p>
    {error && <button type="button" onClick={onRetry}><RefreshCw aria-hidden="true" />Try again</button>}
  </div>;
}

export function CepExtensionsPage({ api, projectsApi, onOpenProject, onHide }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    setLoading(true); setError("");
    try { setItems(await api.list()); }
    catch (loadError) { setError(loadError.message || "Could not read the CEP library."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (!notice) return undefined; const timer = setTimeout(() => setNotice(""), 3500); return () => clearTimeout(timer); }, [notice]);
  const main = useMemo(() => items.filter((item) => item.group === "main").sort((a, b) => a.rank - b.rank), [items]);
  const secondary = useMemo(() => items.filter((item) => item.group === "secondary").sort((a, b) => a.rank - b.rank), [items]);
  async function openFolder(item) {
    if (!item.sourcePath) return;
    try { await projectsApi.open({ kind: "folder", path: item.sourcePath }); }
    catch (openError) { setNotice(openError.message || "Could not open that folder."); }
  }

  return <section className="cep-page">
    <header className="cep-page-header">
      <div className="cep-title-lockup">
        <span className="cep-page-mark" aria-hidden="true">C</span>
        <div><span className="cep-kicker">Premiere Pro · CEP</span><h1>CEP Extensions</h1><p>Your editing tools, ranked by what matters now.</p></div>
      </div>
      <button type="button" className="cep-hide" aria-label="Hide notebook" onClick={onHide}><X aria-hidden="true" /></button>
    </header>
    {notice && <div className="cep-notice" role="status">{notice}</div>}
    {loading || error ? <Empty error={error} onRetry={load} /> : <div className="cep-library">
      <section className="cep-main-section" aria-labelledby="cep-main-heading">
        <header><div><span>Priority stack</span><h2 id="cep-main-heading">Main four</h2></div><small>{main.length} core tools</small></header>
        <div className="cep-main-grid">{main.map((item) => <MainCard key={item.id} item={item} onProject={onOpenProject} onFolder={openFolder} />)}</div>
      </section>
      <section className="cep-secondary-section" aria-labelledby="cep-secondary-heading">
        <header><div><span>Supporting panels</span><h2 id="cep-secondary-heading">Secondary</h2></div><small>{secondary.length} extensions</small></header>
        <div className="cep-secondary-grid">{secondary.map((item) => <SecondaryCard key={item.id} item={item} onProject={onOpenProject} onFolder={openFolder} />)}</div>
      </section>
    </div>}
  </section>;
}
