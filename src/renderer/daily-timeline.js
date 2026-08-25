export function minuteFromClock(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function clockFromMinute(value) {
  const minute = Math.min(1439, Math.max(0, Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 0));
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function formatRemaining(value) {
  const total = Math.max(0, Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export function formatLoggedTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time unavailable";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export function progressThroughDay(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return 0;
  const elapsed = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
  return Math.round((elapsed / 86400) * 10_000) / 100;
}
