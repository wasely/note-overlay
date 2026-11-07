import React from "react";

// Notebook's own icon set. One 24px grid, 1.6 stroke, rounded joins. Each mark has a soft
// "tone" layer (currentColor at low opacity) that deepens on the active item via CSS, so the
// set reads as one family and stays monochrome with the rest of the chrome.
function Glyph({ size = 18, className = "", children, strokeWidth: _ignored, ...props }) {
  return <svg className={`nb-icon ${className}`.trim()} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>;
}

const Tone = ({ children }) => <g className="nb-tone" fill="currentColor" stroke="none">{children}</g>;

export function TodayIcon(props) {
  return <Glyph {...props}>
    <Tone><rect x="3.5" y="5" width="17" height="15.5" rx="3.2" /></Tone>
    <rect x="3.5" y="5" width="17" height="15.5" rx="3.2" />
    <path d="M3.5 9.6h17M8 3v3.6M16 3v3.6" />
    <path d="m8.7 14.6 2.3 2.2 4.4-4.6" />
  </Glyph>;
}

export function NotesIcon(props) {
  return <Glyph {...props}>
    <Tone><path d="M6.2 3h8.3L19.5 8v11.3A1.7 1.7 0 0 1 17.8 21H6.2a1.7 1.7 0 0 1-1.7-1.7V4.7A1.7 1.7 0 0 1 6.2 3Z" /></Tone>
    <path d="M6.2 3h8.3L19.5 8v11.3A1.7 1.7 0 0 1 17.8 21H6.2a1.7 1.7 0 0 1-1.7-1.7V4.7A1.7 1.7 0 0 1 6.2 3Z" />
    <path d="M14.3 3.2v3.6a1.3 1.3 0 0 0 1.3 1.3h3.7" />
    <path d="M8.2 12.4h7.6M8.2 16h5" />
  </Glyph>;
}

export function SkillsIcon(props) {
  return <Glyph {...props}>
    <Tone><path d="M12 3.4 20.5 8 12 12.6 3.5 8Z" /></Tone>
    <path d="M12 3.4 20.5 8 12 12.6 3.5 8Z" />
    <path d="m3.5 12.1 8.5 4.6 8.5-4.6" />
    <path d="m3.5 16.2 8.5 4.6 8.5-4.6" />
  </Glyph>;
}

export function KeysIcon(props) {
  return <Glyph {...props}>
    <Tone><circle cx="8.5" cy="12" r="5" /></Tone>
    <circle cx="8.5" cy="12" r="5" />
    <circle cx="8.5" cy="12" r="1.5" />
    <path d="M13.5 12h7.5M18.2 12v3M21 12v2.2" />
  </Glyph>;
}

export function MemoryIcon(props) {
  return <Glyph {...props}>
    <Tone><path d="M12 4.2c-1.6-1.3-4.6-.8-5.4 1.5-2.3.2-3.6 2.6-2.6 4.6-1.4 1.4-1 4.1.9 4.9.1 2.4 2.5 3.9 4.6 3.1.6 1.1 1.5 1.7 2.5 1.7Z" /><path d="M12 4.2c1.6-1.3 4.6-.8 5.4 1.5 2.3.2 3.6 2.6 2.6 4.6 1.4 1.4 1 4.1-.9 4.9-.1 2.4-2.5 3.9-4.6 3.1-.6 1.1-1.5 1.7-2.5 1.7Z" /></Tone>
    <path d="M12 4.2c-1.6-1.3-4.6-.8-5.4 1.5-2.3.2-3.6 2.6-2.6 4.6-1.4 1.4-1 4.1.9 4.9.1 2.4 2.5 3.9 4.6 3.1.6 1.1 1.5 1.7 2.5 1.7" />
    <path d="M12 4.2c1.6-1.3 4.6-.8 5.4 1.5 2.3.2 3.6 2.6 2.6 4.6 1.4 1.4 1 4.1-.9 4.9-.1 2.4-2.5 3.9-4.6 3.1-.6 1.1-1.5 1.7-2.5 1.7" />
    <path d="M12 4.2V20M8.2 9.4c1.4 0 2.4.8 2.6 2M15.8 9.4c-1.4 0-2.4.8-2.6 2M8.6 15.2c1.2-.2 2.2.3 2.7 1.3M15.4 15.2c-1.2-.2-2.2.3-2.7 1.3" />
  </Glyph>;
}

export function ExtensionsIcon(props) {
  const piece = "M4 9.5A1.5 1.5 0 0 1 5.5 8H9V7a2.5 2.5 0 0 1 5 0v1h3.5A1.5 1.5 0 0 1 19 9.5V13h1a2.5 2.5 0 0 1 0 5h-1v1.5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19.5Z";
  return <Glyph {...props}>
    <Tone><path d={piece} /></Tone>
    <path d={piece} />
  </Glyph>;
}

export function ProjectsIcon(props) {
  const folder = "M3 7.4A2.4 2.4 0 0 1 5.4 5h3.8l2.1 2.3h7.3A2.4 2.4 0 0 1 21 9.7v8.9a2.4 2.4 0 0 1-2.4 2.4H5.4A2.4 2.4 0 0 1 3 18.6Z";
  return <Glyph {...props}>
    <Tone><path d={folder} /></Tone>
    <path d={folder} />
    <path d="M8.2 11.4v5.2M12 11.4v3M15.8 11.4v1.4" strokeWidth="2.1" />
  </Glyph>;
}

export function BotsIcon(props) {
  return <Glyph {...props}>
    <Tone><rect x="4.5" y="7.5" width="15" height="12" rx="4" /></Tone>
    <rect x="4.5" y="7.5" width="15" height="12" rx="4" />
    <path d="M12 7.5V4.3M2.8 12.2v3.2M21.2 12.2v3.2M9.6 16.4h4.8" />
    <circle cx="12" cy="3.6" r="1" fill="currentColor" stroke="none" />
    <circle cx="9.3" cy="12.6" r="1.25" fill="currentColor" stroke="none" />
    <circle cx="14.7" cy="12.6" r="1.25" fill="currentColor" stroke="none" />
  </Glyph>;
}

// Mailbrain: an envelope whose flap is a spark, the "AI-sorted inbox". Brand-coloured, unlike
// the monochrome page icons, so it reads as an app beside Notion and X.
export function MailbrainMark({ size = 16, className = "" }) {
  return <svg className={`nb-mailbrain ${className}`.trim()} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="1.2" y="5.6" width="19.2" height="15" rx="3.4" fill="#1A73E8" />
    <path d="m2.6 7.8 8.2 6L19 7.8" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M19.2.6c.55 2.5 1.7 3.65 4.2 4.2-2.5.55-3.65 1.7-4.2 4.2-.55-2.5-1.7-3.65-4.2-4.2 2.5-.55 3.65-1.7 4.2-4.2Z" fill="#FBBC04" stroke="var(--color-canvas, #fff)" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>;
}
