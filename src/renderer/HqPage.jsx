// HQ inside Notebook. HQ (C:\code\coldsend, http://127.0.0.1:4510) is the master app for the
// websites, traffic, sign-ups and cold email. Notebook embeds its ?embed=1 page, which drops HQ's
// own window frame and rail; Notebook's sidebar lists HQ's pages instead (HqSidebar), so the two
// read as one app.
//
// The page HQ is on lives in Notebook's hash as #/hq/<hq-hash>, so a reload, Back, and the sidebar
// all agree. The two sides talk by postMessage: HQ reports {hq:"route"} when its page changes, and
// Notebook sends {hq:"go"} when a sidebar row is clicked. Both check origin and source.
import React, { useEffect, useRef, useState } from "react";
import { AtSign, Ban, BookOpen, ChartColumn, ChevronRight, CirclePlay, Globe, House, Inbox, List, Mail, Reply, Search, Settings, Shield, TrendingUp, User, Users } from "lucide-react";
import hqLogoUrl from "./hq-logo.png";

export const HQ_ORIGIN = "http://127.0.0.1:4510";
export { hqLogoUrl };

// Mirrors TABS/GROUPS in coldsend/public/index.html. Cold email has never sent a message, so like
// HQ's own rail it folds away until opened (or until you are on one of its pages).
const HQ_GROUPS = [
  { label: "", pages: [["home", "Home", House]] },
  { label: "Websites", pages: [["sites", "Traffic", TrendingUp], ["people", "People", User], ["recordings", "Recordings", CirclePlay], ["seo", "SEO", Globe], ["domains", "Domains", Shield], ["addresses", "Email addresses", AtSign]] },
  { label: "Cold email", fold: true, pages: [["find", "Find leads", Search], ["leads", "Leads", Users], ["campaigns", "Campaigns", Mail], ["inboxes", "Inboxes", Inbox], ["inbox", "Replies", Reply], ["statsTab", "Email stats", ChartColumn], ["suppression", "Blocked", Ban], ["log", "Log", List]] },
  { label: "", pages: [["learn", "Learn", BookOpen], ["settings", "Settings", Settings]] },
];

function hqHash() {
  const match = location.hash.match(/^#\/?hq\/?(.*)$/);
  return match ? decodeURIComponent(match[1]) : "";
}
function useHqHash() {
  const [hash, setHash] = useState(hqHash);
  useEffect(() => {
    const sync = () => setHash(hqHash());
    addEventListener("hashchange", sync);
    addEventListener("notebook:hq-route", sync);
    return () => { removeEventListener("hashchange", sync); removeEventListener("notebook:hq-route", sync); };
  }, []);
  return hash;
}
// HQ moved by itself (a link, its command bar, Back inside it): record it without a hashchange,
// so Notebook does not echo it straight back.
function recordHqHash(hash) {
  if (hash === hqHash()) return;
  history.replaceState(null, "", `#/hq/${hash}`);
  dispatchEvent(new Event("notebook:hq-route"));
}

export function HqSidebar() {
  const hash = useHqHash();
  const here = hash.split("/")[0] || "home";
  const [foldOpen, setFoldOpen] = useState(false);
  const go = (key) => { location.hash = `/hq/${key}`; };
  return <nav className="hq-pages" aria-label="HQ pages">
    {HQ_GROUPS.map((group, index) => {
      const keys = group.pages.map(([key]) => key);
      const open = !group.fold || foldOpen || keys.includes(here);
      return <React.Fragment key={group.label || index}>
        {group.fold
          ? <button type="button" className={`nav-heading hq-fold ${open ? "is-open" : ""}`} aria-expanded={open} onClick={() => setFoldOpen(!open)}>{group.label}<ChevronRight aria-hidden="true" /></button>
          : group.label ? <span className="nav-heading">{group.label}</span> : index > 0 ? <span className="hq-gap" aria-hidden="true" /> : null}
        {open && group.pages.map(([key, label, Icon]) => <button type="button" key={key} className={here === key ? "is-active" : ""} aria-current={here === key ? "page" : undefined} onClick={() => go(key)}>
          <Icon strokeWidth={1.8} aria-hidden="true" /><span>{label}</span>
        </button>)}
      </React.Fragment>;
    })}
  </nav>;
}

export function HqPage({ api }) {
  const frameRef = useRef(null);
  const reportedRef = useRef(null);
  const hash = useHqHash();
  const [server, setServer] = useState({ status: "starting", message: "" });
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // The first page comes from the hash; after that HQ is steered by message, never by reloading.
  const [src] = useState(() => `${HQ_ORIGIN}/?embed=1${hqHash() ? `#${hqHash()}` : ""}`);

  useEffect(() => {
    let live = true;
    setServer({ status: "starting", message: "" });
    Promise.resolve(api.hq?.ensure ? api.hq.ensure() : { ready: true })
      .then((result) => { if (live) setServer(result?.ready ? { status: "ready", message: "" } : { status: "error", message: result?.error || "HQ is not answering." }); })
      .catch((error) => { if (live) setServer({ status: "error", message: error.message || "HQ is not answering." }); });
    return () => { live = false; };
  }, [api, attempt]);

  useEffect(() => {
    const receive = (event) => {
      if (event.origin !== HQ_ORIGIN || event.source !== frameRef.current?.contentWindow) return;
      const data = event.data;
      if (data?.hq === "route" && typeof data.hash === "string") { reportedRef.current = data.hash; recordHqHash(data.hash); }
      if (data?.hq === "ready") setLoaded(true);
    };
    addEventListener("message", receive);
    return () => removeEventListener("message", receive);
  }, []);

  useEffect(() => {
    if (!loaded || !hash || hash === reportedRef.current) return;
    frameRef.current?.contentWindow?.postMessage({ hq: "go", hash }, HQ_ORIGIN);
  }, [hash, loaded]);

  const showFrame = server.status === "ready";
  return <section className="hq-page" aria-label="HQ">
    {showFrame && <iframe
      key={attempt}
      ref={frameRef}
      title="HQ"
      src={src}
      className={loaded ? "is-ready" : ""}
      allow="clipboard-write"
      onLoad={() => setLoaded(true)}
    />}
    {(!showFrame || !loaded) && <div className={`hq-state ${server.status === "error" ? "is-error" : "is-loading"}`} role="status">
      <img src={hqLogoUrl} alt="" />
      {server.status === "error"
        ? <><strong>HQ isn’t running</strong><p>{server.message}</p><button type="button" className="button primary" onClick={() => { setLoaded(false); setAttempt((value) => value + 1); }}>Try again</button></>
        : <><strong>Opening HQ</strong><p>{server.status === "starting" ? "Starting the local server…" : "Loading your sites…"}</p></>}
    </div>}
  </section>;
}
