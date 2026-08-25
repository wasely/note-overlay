import React, { useRef, useState } from "react";
import { ImagePlus, RotateCcw } from "lucide-react";

export const BOT_ICON_COLORS = ["violet", "blue", "teal", "amber", "rose", "slate"];
export const BOT_ICON_SYMBOLS = ["🤖", "⚡", "✦", "📣", "🛡️", "📊", "🧭", "🛠️"];
export const DEFAULT_BOT_ICON = { type: "symbol", value: "🤖", color: "violet" };
const MAX_ICON_BYTES = 512 * 1024;
const ALLOWED_ICON_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function botInitials(name) {
  const parts = String(name || "Bot").trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0]?.slice(0, 2) || "B").toUpperCase();
}

export function normalizedBotIcon(icon) {
  if (!icon || !["symbol", "initials", "image"].includes(icon.type)) return DEFAULT_BOT_ICON;
  return { type: icon.type, value: String(icon.value || ""), color: BOT_ICON_COLORS.includes(icon.color) ? icon.color : "violet" };
}

export function BotIcon({ icon, name, size = "medium", className = "" }) {
  const current = normalizedBotIcon(icon);
  return <span className={`bot-icon bot-icon-${size} bot-icon-${current.color} ${className}`} aria-hidden="true">
    {current.type === "image" && current.value ? <img src={current.value} alt="" width="42" height="42" /> : current.type === "initials" ? <strong>{botInitials(name)}</strong> : <span>{current.value || "🤖"}</span>}
  </span>;
}

export function BotIconPicker({ icon, name, onChange, onError, compact = false }) {
  const inputRef = useRef(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const current = normalizedBotIcon(icon);

  function patch(next) { setError(""); onChange({ ...current, ...next }); }
  function fail(message) { setError(message); onError?.(message); }
  function chooseFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ALLOWED_ICON_TYPES.has(file.type)) { fail("Choose a PNG, JPEG, or WebP image."); return; }
    if (file.size > MAX_ICON_BYTES) { fail("Icon images must be 512 KB or smaller."); return; }
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => { patch({ type: "image", value: String(reader.result || "") }); setReading(false); };
    reader.onerror = () => { fail("That image could not be read. Choose another file."); setReading(false); };
    reader.readAsDataURL(file);
  }

  return <div className={`bot-icon-picker ${compact ? "compact" : ""}`}>
    <div className="bot-icon-picker-preview"><BotIcon icon={current} name={name} size="large" /><span><strong>Bot icon</strong><small>Unique to this bot.</small></span></div>
    <div className="bot-icon-symbols" role="group" aria-label="Bot icon symbol">
      {BOT_ICON_SYMBOLS.map((symbol) => <button type="button" key={symbol} className={current.type === "symbol" && current.value === symbol ? "selected" : ""} aria-label={`Use ${symbol} icon`} aria-pressed={current.type === "symbol" && current.value === symbol} onClick={() => patch({ type: "symbol", value: symbol })}>{symbol}</button>)}
    </div>
    <div className="bot-icon-picker-actions">
      <button type="button" onClick={() => inputRef.current?.click()} disabled={reading}><ImagePlus size={13} aria-hidden="true" /> {reading ? "Reading…" : "Upload Image"}</button>
      <button type="button" onClick={() => patch({ type: "initials", value: "" })}><RotateCcw size={13} aria-hidden="true" /> Use Initials</button>
      <input ref={inputRef} className="visually-hidden" type="file" name="bot-icon-file" accept="image/png,image/jpeg,image/webp" aria-label="Upload bot icon image" onChange={chooseFile} tabIndex={-1} />
    </div>
    <div className="bot-icon-colors" role="group" aria-label="Bot icon color">
      {BOT_ICON_COLORS.map((color) => <button type="button" key={color} className={`bot-icon-color bot-icon-${color} ${current.color === color ? "selected" : ""}`} aria-label={`Use ${color} icon color`} aria-pressed={current.color === color} onClick={() => patch({ color })}><span /></button>)}
    </div>
    {error && <p className="bot-icon-error" role="alert">{error}</p>}
  </div>;
}
