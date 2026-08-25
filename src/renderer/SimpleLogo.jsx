import React from "react";
import "./simple-logo.css";

const CONNECTORS = new Set(["and", "for", "of", "the"]);

function logoIndex(value) {
  let hash = 2166136261;
  for (const character of String(value || "project")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 8;
}

function monogram(value) {
  const words = String(value || "Project").match(/[A-Za-z0-9]+/g) || ["Project"];
  const meaningful = words.filter((word) => !CONNECTORS.has(word.toLowerCase()));
  const selected = meaningful.length ? meaningful : words;
  if (selected.length === 1) return selected[0].slice(0, 2).toUpperCase();
  return `${selected[0][0]}${selected.at(-1)[0]}`.toUpperCase();
}

export function SimpleLogo({ name, seed = name, className = "" }) {
  const tone = logoIndex(seed);
  return <svg className={`simple-logo tone-${tone} ${className}`.trim()} data-fallback-logo="true" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <rect className="simple-logo-background" width="64" height="64" rx="14" />
    <path className="simple-logo-accent" d="M42 0h22v22L42 0Z" />
    <circle className="simple-logo-dot" cx="52" cy="12" r="3.5" />
    <text x="32" y="34" dominantBaseline="middle" textAnchor="middle">{monogram(name)}</text>
  </svg>;
}
