import React, { useEffect, useRef, useState } from "react";
import { Bot, Check, Copy, ExternalLink, Link2, MessageCircle, RefreshCw, Send, ShieldCheck, X } from "lucide-react";
import { BotIcon, BotIconPicker, DEFAULT_BOT_ICON } from "./BotIcon.jsx";

const PERMISSIONS = [
  { id: "read_notes", label: "Read notes", detail: "Use note content as context." },
  { id: "write_notes", label: "Edit notes", detail: "Create and update notes." },
  { id: "projects", label: "Use projects", detail: "Read project context and tasks." },
  { id: "skills", label: "Run skills", detail: "Use installed skills and commands." },
];

function useDialogKeyboard(dialogRef, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.querySelector("[data-autofocus]")?.focus();
    function keydown(event) {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus?.(); };
  }, []);
}

function Field({ label, hint, children }) {
  return <label className="quick-field"><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>;
}

export function BotCreateDialog({ api, onClose, onCreated, onOpenBot }) {
  const dialogRef = useRef(null);
  const [platform, setPlatform] = useState("discord");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState(DEFAULT_BOT_ICON);
  const [permissions, setPermissions] = useState(["read_notes"]);
  const [system, setSystem] = useState(null);
  const [systemLoading, setSystemLoading] = useState(true);
  const [connectorUrl, setConnectorUrl] = useState("");
  const [pairing, setPairing] = useState(null);
  const [telegramState, setTelegramState] = useState(null);
  const [telegramPassword, setTelegramPassword] = useState("");
  const [created, setCreated] = useState(null);
  const [link, setLink] = useState("");
  const [platformUrl, setPlatformUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  function closeDialog() {
    if (["waiting_qr", "waiting_password", "checking_password", "starting"].includes(telegramState?.status)) api.bots.cancelTelegramAuth?.().catch(() => {});
    onClose();
  }
  useDialogKeyboard(dialogRef, closeDialog);

  async function loadSystem() {
    try {
      const value = await api.bots.connectorStatus();
      setSystem(value);
      setConnectorUrl(value.connector?.baseUrl || "");
      setTelegramState(value.telegramAuth || null);
      return value;
    } catch (reason) {
      setError(reason.message || "Bot connection status could not be loaded.");
      return null;
    } finally { setSystemLoading(false); }
  }

  useEffect(() => { loadSystem(); }, []);
  useEffect(() => {
    if (!pairing) return undefined;
    let cancelled = false; let timer;
    async function poll() {
      try {
        const result = await api.bots.pollDiscordConnect(pairing);
        if (cancelled) return;
        if (result.status === "ready") {
          setPairing(null); setNotice("Discord connected. Future agents need only a name."); await loadSystem(); return;
        }
      } catch (reason) {
        if (!cancelled) { setPairing(null); setError(reason.message || "Discord connection failed."); }
        return;
      }
      timer = setTimeout(poll, 1200);
    }
    timer = setTimeout(poll, 700);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [pairing]);
  useEffect(() => {
    if (!["waiting_qr", "waiting_password", "checking_password", "starting"].includes(telegramState?.status)) return undefined;
    let cancelled = false; let timer;
    async function poll() {
      try {
        const value = await api.bots.telegramAuthState();
        if (cancelled) return;
        setTelegramState(value);
        if (value.status === "ready") { setNotice("Telegram connected. Future bots need only a name."); await loadSystem(); return; }
        if (value.status === "error") { setError(value.error || "Telegram connection failed."); return; }
      } catch (reason) { if (!cancelled) setError(reason.message || "Telegram connection failed."); return; }
      timer = setTimeout(poll, 1000);
    }
    timer = setTimeout(poll, 900);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [telegramState?.status]);

  function togglePermission(id) {
    setPermissions((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    setError("");
  }

  async function saveConnectorUrl(event) {
    event.preventDefault(); setBusy("connector"); setError("");
    try { await api.bots.setConnectorUrl(connectorUrl); await loadSystem(); setNotice("Connector saved."); }
    catch (reason) { setError(reason.message || "Connector URL could not be saved."); }
    finally { setBusy(""); }
  }
  async function connectDiscord() {
    setBusy("discord"); setError(""); setNotice("Discord opened in your browser. Approve once, then return here.");
    try { setPairing(await api.bots.startDiscordConnect()); }
    catch (reason) { setNotice(""); setError(reason.message || "Discord connection could not start."); }
    finally { setBusy(""); }
  }
  async function connectTelegram() {
    setBusy("telegram"); setError(""); setNotice("Scan with Telegram, then approve this Notebook session.");
    try { setTelegramState(await api.bots.startTelegramAuth()); }
    catch (reason) { setNotice(""); setError(reason.message || "Telegram connection could not start."); }
    finally { setBusy(""); }
  }
  async function sendTelegramPassword(event) {
    event.preventDefault(); setBusy("password"); setError("");
    try { setTelegramState(await api.bots.submitTelegramPassword(telegramPassword)); setTelegramPassword(""); }
    catch (reason) { setError(reason.message || "Telegram could not verify that password."); }
    finally { setBusy(""); }
  }

  const connector = system?.connector;
  const platformConnectionReady = platform === "discord"
    ? Boolean(connector?.configured && !connector?.reason && connector?.discord?.ready && connector?.discord?.connected)
    : Boolean(connector?.configured && !connector?.reason && connector?.telegram?.ready && telegramState?.authorized);
  const connectionReason = systemLoading
    ? "Checking connection…"
    : connector?.reason || (!connector?.configured ? "This Notebook build needs its Bot Connector URL." : platform === "discord"
      ? (!connector.discord?.ready ? "Discord is not configured on Bot Connector." : "Connect Discord once.")
      : (!connector.telegram?.ready ? "Telegram manager mode is not configured on Bot Connector." : !telegramState?.configured ? telegramState?.error || "Telegram publisher credentials are missing from this build." : "Connect Telegram once."));

  async function createBot(event) {
    event.preventDefault();
    if (!name.trim()) { setError("Enter a bot name."); return; }
    if (!description.trim()) { setError("Describe what the bot should do."); return; }
    if (!permissions.length) { setError("Choose at least one permission."); return; }
    if (!platformConnectionReady) { setError(connectionReason); return; }
    setBusy("create"); setError(""); setNotice("Creating bot…");
    try {
      const result = await api.bots.createManaged({ platform, name: name.trim(), description: description.trim(), icon, permissions });
      setCreated(result.bot); setLink(result.link); setPlatformUrl(result.platformUrl || "");
      setNotice(platform === "discord" ? "Discord agent created. Its server install link is ready." : "Distinct Telegram bot created. Its @bot link is ready.");
      await onCreated(result);
    } catch (reason) { setNotice(""); setError(reason.message || "The bot could not be created."); }
    finally { setBusy(""); }
  }

  async function copyLink() {
    try { await api.clipboard.writeText(link); setNotice("Link copied."); }
    catch { setError("The link could not be copied."); }
  }

  async function resetLink() {
    setBusy("reset"); setError("");
    try { const result = await api.bots.resetLink(created.id); setLink(result.url); setNotice("New link ready. The old link no longer works."); }
    catch (reason) { setError(reason.message || "The link could not be reset."); }
    finally { setBusy(""); }
  }
  async function openPlatform() {
    try { await api.bots.openConnectorPlatform(platformUrl); }
    catch (reason) { setError(reason.message || "The platform link could not be opened."); }
  }

  return <div className="bot-form-overlay"><section ref={dialogRef} className="bot-create bot-create-instant" role="dialog" aria-modal="true" aria-labelledby="create-bot-title">
    <header><div><span className="section-kicker">Bot Factory</span><h1 id="create-bot-title">{created ? `${created.name} Is Ready` : "Create Bot"}</h1><p>{created ? "Both the platform identity and Notebook link are ready." : "Connect once. After that: name, access, create."}</p></div><button type="button" className="quick-close" onClick={closeDialog} aria-label="Close Create Bot"><X size={17} aria-hidden="true" /></button></header>
    <div className="bot-create-body">
      {error ? <p className="bot-form-error" role="alert">{error}</p> : null}
      {notice ? <p className="bot-create-notice" role="status" aria-live="polite">{notice}</p> : null}
      {!created ? <form className="quick-step instant-bot-form" onSubmit={createBot}>
        <div className="bot-connection-rail" aria-label="Bot creation path"><span className="complete"><Check size={12} aria-hidden="true" /> Account</span><i aria-hidden="true">→</i><span className={platformConnectionReady ? "complete" : "current"}>{platformConnectionReady ? <Check size={12} aria-hidden="true" /> : "2"} Platform</span><i aria-hidden="true">→</i><span>3 Identity</span></div>
        <fieldset className="bot-platform-picker"><legend>Platform</legend><div>
          <label className={platform === "discord" ? "selected" : ""}><input type="radio" name="bot-platform" value="discord" checked={platform === "discord"} onChange={() => { setPlatform("discord"); setError(""); }} /><span className="platform-mark discord"><MessageCircle size={15} aria-hidden="true" /></span><span><strong>Discord agent</strong><small>Separate agent; shared Notebook bot identity.</small></span><Check size={14} aria-hidden="true" /></label>
          <label className={platform === "telegram" ? "selected" : ""}><input type="radio" name="bot-platform" value="telegram" checked={platform === "telegram"} onChange={() => { setPlatform("telegram"); setError(""); }} /><span className="platform-mark telegram"><Send size={15} aria-hidden="true" /></span><span><strong>Telegram bot</strong><small>Distinct @bot identity every time.</small></span><Check size={14} aria-hidden="true" /></label>
        </div></fieldset>
        <section className={`bot-account-status ${platformConnectionReady ? "ready" : "needs-connection"}`}>
          <div><span>{platformConnectionReady ? <ShieldCheck size={16} aria-hidden="true" /> : platform === "discord" ? <MessageCircle size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}</span><div><strong>{platformConnectionReady ? `${platform === "discord" ? "Discord" : "Telegram"} connected` : connectionReason}</strong><small>{platformConnectionReady ? (platform === "discord" ? "New names become agents instantly." : `Signed in as ${telegramState?.user?.displayName || telegramState?.user?.username || "Telegram user"}.`) : "One-time connection; never requested again on this device."}</small></div></div>
          {!platformConnectionReady && connector?.configured && !connector?.reason && (platform === "discord"
            ? <button type="button" onClick={connectDiscord} disabled={busy === "discord" || Boolean(pairing)}>{pairing ? "Waiting for approval…" : busy === "discord" ? "Opening…" : "Connect Discord"}</button>
            : telegramState?.configured && !["waiting_qr", "waiting_password", "checking_password", "starting"].includes(telegramState?.status) ? <button type="button" onClick={connectTelegram} disabled={busy === "telegram"}>{busy === "telegram" ? "Starting…" : "Connect Telegram"}</button> : null)}
        </section>
        {platform === "telegram" && telegramState?.status === "waiting_qr" && <section className="telegram-qr-panel"><img src={telegramState.qrImage} alt="Telegram login QR code" /><div><strong>Scan in Telegram</strong><span>Settings → Devices → Link Desktop Device</span><small>This saves an encrypted session, never your password.</small></div></section>}
        {platform === "telegram" && telegramState?.status === "waiting_password" && <div className="telegram-password"><Field label="Telegram 2FA password" hint={telegramState.passwordHint ? `Hint: ${telegramState.passwordHint}` : "Used once; never stored."}><input type="password" value={telegramPassword} onChange={(event) => setTelegramPassword(event.target.value)} autoComplete="current-password" /></Field><button type="button" onClick={sendTelegramPassword} disabled={busy === "password"}>{busy === "password" ? "Checking…" : "Continue"}</button></div>}
        {(!connector?.configured || connector?.reason) && <details className="connector-setup"><summary>Connector setup</summary><p>A production build preconfigures this. Local builds can point to your deployed Worker.</p><div><input type="url" value={connectorUrl} onChange={(event) => setConnectorUrl(event.target.value)} placeholder="https://notebook-bot-connector.example" aria-label="Bot Connector URL" /><button type="button" onClick={saveConnectorUrl} disabled={busy === "connector"}>{busy === "connector" ? "Saving…" : "Save"}</button></div></details>}
        <div className="quick-heading"><span><Bot size={14} aria-hidden="true" /></span><div><h2>Bot identity</h2><p>{platform === "discord" ? "Shown as a named agent under Notebook." : "Used for the bot's real Telegram profile."}</p></div></div>
        <Field label="Bot name"><input data-autofocus name="bot-name" autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} placeholder="Daily Brief" /></Field>
        <Field label="Description" hint="What should this bot do?"><textarea name="bot-description" autoComplete="off" value={description} onChange={(event) => setDescription(event.target.value)} rows="3" placeholder="Turns my project notes into a concise morning brief." /></Field>
        <BotIconPicker icon={icon} name={name} onChange={(next) => { setIcon(next); setError(""); }} compact />
        <fieldset className="bot-permission-picker"><legend>Permissions</legend><p>Only grant what this bot needs.</p><div>{PERMISSIONS.map((permission) => <label key={permission.id} className={permissions.includes(permission.id) ? "selected" : ""}><input type="checkbox" checked={permissions.includes(permission.id)} onChange={() => togglePermission(permission.id)} /><span><strong>{permission.label}</strong><small>{permission.detail}</small></span><Check size={14} aria-hidden="true" /></label>)}</div></fieldset>
        <div className="instant-create-summary"><Link2 size={16} aria-hidden="true" /><span><strong>Two links included</strong><small>{platform === "discord" ? "Server install + private Notebook link." : "Telegram @bot + private Notebook link."}</small></span></div>
        <button type="submit" className="primary instant-create-button" disabled={busy === "create" || !platformConnectionReady}>{busy === "create" ? (platform === "telegram" ? "Creating real Telegram bot…" : "Creating Discord agent…") : platform === "discord" ? "Create Discord Agent" : "Create Telegram Bot"}</button>
      </form> : <section className="bot-create-success">
        <span className="success-mark"><Check size={23} aria-hidden="true" /></span><BotIcon icon={created.icon} name={created.name} size="large" /><h2>Bot Created</h2><p>{platform === "discord" ? "The named agent uses Notebook's shared Discord identity." : `@${created.connections?.[0]?.username || created.name} is a distinct Telegram bot.`}</p>
        {platformUrl ? <button type="button" className="platform-ready-link" onClick={openPlatform}><ExternalLink size={14} aria-hidden="true" /> {platform === "discord" ? "Add Notebook Bot to Server" : "Open Telegram Bot"}</button> : null}
        <label className="bot-link-field"><span>Private bot link</span><input value={link} readOnly aria-label="Private bot link" /></label>
        <div className="success-actions"><button type="button" onClick={copyLink}><Copy size={13} aria-hidden="true" /> Copy Link</button><button type="button" onClick={resetLink} disabled={busy === "reset"}><RefreshCw size={13} className={busy === "reset" ? "spin" : ""} aria-hidden="true" /> {busy === "reset" ? "Resetting…" : "Reset Link"}</button></div>
        <button type="button" className="primary view-created" onClick={() => onOpenBot(created)}>Open Bot</button>
      </section>}
    </div>
  </section></div>;
}
