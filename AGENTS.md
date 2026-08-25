# AGENTS.md

## Project

Windows-only Electron notebook with Today, Markdown notes, skills/commands, project Git controls, bots, and embedded web apps.
React renderer talks to native capabilities only through the validated preload/IPC bridge; SQLite is the local source of truth.

## Commands

- Install: `npm install`
- Dev app: `npm run dev`
- Build renderer: `npm run build`
- Preview UI: `npm run preview`
- Screenshot matrix: `npm run shot`
- Full tests: `npm test`
- Projects tests: `npm run test:projects` and `npm run test:projects-app`
- Portable build: `npm run pack:dir`

## Structure

- `src/main/main.cjs` — Electron lifecycle, validated IPC, shortcut, tray, and views.
- `src/main/storage.cjs` — SQLite schema, migrations, backups, import/export, and domains.
- `src/main/projects.cjs` — repository inspection, scoped Git operations, and `AGENTS.md` file access.
- `src/main/github-sync.cjs` — private `blixvip/notebook-cloud` merge and conflict handling.
- `src/main/preload.cjs` — narrow renderer API; never expose raw IPC, Node, shell, or filesystem access.
- `src/renderer/main.jsx` — app shell and browser-preview mocks.
- `src/renderer/ProjectsPage.jsx` — project ranking, tasks, repository actions, and `AGENTS.md` editor.
- `scripts/` — unit, Electron, UI, screenshot, and packaging helpers.

## Rules

- Read `C:\code\UI-PLAYBOOK.md` before UI work; inspect narrow/wide and light/dark screenshots.
- Preserve context isolation, sandboxing, permission/navigation denial, and Zod validation.
- Keep Markdown as stored note source; do not render user Markdown with `dangerouslySetInnerHTML`.
- Schema changes must be backward compatible, keep foreign keys on, and include storage regression tests.
- Never delete/reset `%APPDATA%\note-overlay`; restore and cloud replacement create a safety backup first.
- `AGENTS.md` edits must target the connected repository root, write atomically, and reject stale versions.
- Project commits remain file-scoped and must guard secrets, conflicts, large files, and remote freshness.
- Keep browser preview mocks synchronized with preload API changes.

## Before finishing

- Run focused tests, then `npm test` for cross-domain changes.
- For UI changes, run `npm run shot`, inspect all images, and confirm in Electron.
- For release work, test `npm run pack:dir`; signing is required only for `npm run pack:release`.
