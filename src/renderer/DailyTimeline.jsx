import React, { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Mic, Plus, Trash2 } from "lucide-react";
import { clockFromMinute, formatLoggedTime, formatRemaining, minuteFromClock } from "./daily-timeline.js";

function currentClock() {
  const now = new Date();
  return clockFromMinute(now.getHours() * 60 + now.getMinutes());
}

function ActivityRow({ activity, onUpdate, onRemove }) {
  const [text, setText] = useState(activity.text);
  useEffect(() => setText(activity.text), [activity.id, activity.text]);
  const saveText = () => {
    const clean = text.trim();
    if (!clean) setText(activity.text);
    else if (clean !== activity.text) onUpdate(activity.id, { text: clean });
  };
  const updateDuration = (durationMinutes) => {
    const startMinute = Math.min(activity.start_minute, 1440 - durationMinutes);
    onUpdate(activity.id, { durationMinutes, startMinute });
  };
  return <li className="activity-row">
    <span className="activity-dot" aria-hidden="true" />
    <div className="activity-fields">
      <div className="activity-meta">
        <div className="activity-when">
          <input
            type="time"
            value={clockFromMinute(activity.start_minute)}
            aria-label={`Start time for ${activity.text}`}
            onChange={(event) => {
              const startMinute = minuteFromClock(event.target.value);
              if (startMinute !== null) onUpdate(activity.id, { startMinute: Math.min(startMinute, 1440 - activity.duration_minutes) });
            }}
          />
          <select value={activity.duration_minutes} aria-label={`Duration for ${activity.text}`} onChange={(event) => updateDuration(Number(event.target.value))}>
            <option value="1">1 min</option>
            <option value="5">5 min</option>
          </select>
        </div>
        <time className="activity-logged" dateTime={activity.created_at} title="Exact time this entry was logged">Logged at {formatLoggedTime(activity.created_at)}</time>
      </div>
      <input className="activity-text" value={text} maxLength={500} aria-label={`Edit activity: ${activity.text}`} onChange={(event) => setText(event.target.value)} onBlur={saveText} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
    </div>
    <button type="button" className="icon-button activity-remove" aria-label={`Delete activity: ${activity.text}`} onClick={() => onRemove(activity.id)}><Trash2 size={14} strokeWidth={1.8} /></button>
  </li>;
}

export function DailyTimeline({ page, onAdd, onUpdate, onRemove, voiceSession, onVoiceComplete }) {
  const [now, setNow] = useState(() => new Date());
  const [text, setText] = useState("");
  const [time, setTime] = useState(() => currentClock());
  const [duration, setDuration] = useState(5);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const captureRef = useRef(null);
  const voiceSubmitTimer = useRef(null);
  useEffect(() => {
    setTime(page.isToday ? currentClock() : "09:00");
  }, [page.date, page.isToday]);
  useEffect(() => {
    if (!page.isToday) return undefined;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [page.isToday]);
  useEffect(() => {
    clearTimeout(voiceSubmitTimer.current);
    if (!voiceSession || voiceSession.phase === "error") return undefined;
    if (voiceSession.phase === "recording") {
      setText("");
      if (page.isToday) setTime(currentClock());
    }
    const focusTimer = setTimeout(() => captureRef.current?.focus(), 0);
    return () => clearTimeout(focusTimer);
  }, [voiceSession?.id, voiceSession?.phase, page.date, page.isToday]);
  useEffect(() => () => clearTimeout(voiceSubmitTimer.current), []);
  const secondsLeft = useMemo(() => {
    if (!page.isToday) return 0;
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return Math.max(0, Math.ceil((midnight.getTime() - now.getTime()) / 1000));
  }, [now, page.isToday]);
  const activities = page.activities || [];
  async function saveActivity(rawText, voice = false) {
    const startMinute = minuteFromClock(time);
    const clean = String(rawText || "").trim().slice(0, 500);
    if (!clean || startMinute === null || busyRef.current || page.isFuture) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      const saved = await onAdd({ text: clean, startMinute: Math.min(startMinute, 1440 - duration), durationMinutes: duration });
      if (saved) {
        setText("");
        if (page.isToday) setTime(currentClock());
        if (voice) await onVoiceComplete?.();
      }
      return Boolean(saved);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function submit(event) {
    event.preventDefault();
    await saveActivity(text);
  }
  function updateCaptureText(next) {
    setText(next);
    clearTimeout(voiceSubmitTimer.current);
    if (voiceSession?.phase === "transcribing" && next.trim()) voiceSubmitTimer.current = setTimeout(() => saveActivity(next, true), 500);
  }
  return <section className="day-log" aria-label="Day log">
    <div className="day-composer">
      <div className="day-clock" aria-live="off">
        <span><Clock3 size={16} strokeWidth={1.8} aria-hidden="true" />{page.isToday ? "Time left today" : "Recorded time"}</span>
        <strong>{page.isToday ? formatRemaining(secondsLeft) : `${page.loggedMinutes || 0} min`}</strong>
        <small>{page.isToday ? now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : `${activities.length} ${activities.length === 1 ? "entry" : "entries"}`}</small>
      </div>

      {voiceSession && <div className={`voice-log-status is-${voiceSession.phase}`} role="status">
        <Mic size={15} strokeWidth={1.9} aria-hidden="true" />
        <span>{voiceSession.phase === "recording" ? "Listening… Press Ctrl + Alt + Shift + L again when done." : voiceSession.phase === "transcribing" ? "Transcribing locally… It will save and close automatically." : voiceSession.message}</span>
      </div>}

      <form className="activity-capture" onSubmit={submit}>
        <div className="activity-capture-fields">
          <input type="time" value={time} aria-label="Activity start time" disabled={page.isFuture} onChange={(event) => setTime(event.target.value)} />
          <div className="duration-switch" role="group" aria-label="Activity duration">
            {[1, 5].map((value) => <button key={value} type="button" className={duration === value ? "is-active" : ""} aria-pressed={duration === value} onClick={() => setDuration(value)}>{value}m</button>)}
          </div>
        </div>
        <div className="activity-capture-text">
          <input ref={captureRef} value={text} maxLength={500} disabled={page.isFuture} aria-label="What were you doing?" placeholder={page.isFuture ? "You can log this day once it arrives" : voiceSession?.phase === "recording" ? "Speak now…" : "What were you doing?"} onChange={(event) => updateCaptureText(event.target.value)} />
          <button type="submit" className="button primary" disabled={!text.trim() || page.isFuture || busy}><Plus size={14} strokeWidth={2} />{busy ? "Logging…" : "Log"}</button>
        </div>
      </form>
    </div>

    <div className="activity-history">
      <div className="activity-history-head">
        <div><h2>Activity</h2><p>A running record of your day</p></div>
        <span>{activities.length} {activities.length === 1 ? "entry" : "entries"} · {page.loggedMinutes || 0} min</span>
      </div>
      {activities.length ? <ol className="activity-list">{activities.map((activity) => <ActivityRow key={activity.id} activity={activity} onUpdate={onUpdate} onRemove={onRemove} />)}</ol>
        : <p className="activity-empty">Nothing logged yet. Capture the last minute or five minutes above.</p>}
    </div>
  </section>;
}
