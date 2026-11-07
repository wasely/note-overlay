# Notebook — agent handoff

## Product

Notebook is a Windows-only, local-first Markdown notebook. `Ctrl+Alt+Shift+N` toggles a compact, centered, always-on-top window on the monitor under the cursor.

Its primary notebook pages are:

- **Today** — one page per calendar day with two sections. **Day log** shows a live seconds-left clock, a 24-hour map, and editable one- or five-minute activity entries. **Tasks** keeps the day's checklist and next-day plan. Previous/next arrows and the sidebar calendar page through both histories. An earlier page keeps its own record: what was logged, checked off, or moved on unfinished. Unfinished work rolls forward once per day — `dailyPage(viewDate)` rolls only when the viewed date is the real local today, so opening an old page never rewrites it, and a window left open past midnight turns its own page.
- **Notes** — Markdown notes in notebooks, autosaving, pinnable, with a WYSIWYG editor and a preview toggle. The editor (TipTap) styles text as you type but serializes back to Markdown, which remains the source of truth; preview renders headings, lists, quotes, code, inline styles, and task lists, and ticking a rendered checkbox rewrites that exact source line.
- **Skills** — a library with three places: an **All categories** home of category cards, a **category page** listing that category's skills with a one-line summary and a star toggle, and the **skill page** itself (rendered Markdown, edit toggle, heading outline, `Alt+←`/`Alt+→` paging). The sidebar shows collapsed category rows — the chevron expands a shelf, the label opens the category page. Scope is Active/Starred/All; archive shelves sit below one Archive divider. Stars persist in `skills.pinned`.
- **Commands** — saved slash-command invocations and reference pages.

Two explicit workspaces follow the notebook pages: **Projects** for local project/Git priorities, and **Bots** for Discord/Telegram operations. A **Memory** page shows and edits `~/MASTER-MEMORY.md` (the one sheet every agent reads; saves refuse to overwrite a newer agent edit) and counts each agent's memory store. The sidebar also has **Mailbrain** (the local unified inbox, `src/main/mail-view.cjs`; preloaded, never unloaded, starts the `Mailbrain` scheduled task if it is down), optional Notion/Twitter/Excalidraw web apps (lazy-loaded, unloaded after 5 min hidden), plus a separate fixed **AI** strip with ChatGPT, Gemini, and DeepSeek. AI buttons are side by side and open one full-window embedded website at a time.

Search (`Ctrl+K`) spans notes, tasks, skills, and commands. Settings holds theme (system/light/dark), start-at-login, the keyboard reference, local backups, JSON/Markdown export, and automatic `@blixvip` cloud sync.

Notebook has no telemetry. Embedded websites make their normal provider requests only after the user opens them, and Notebook content is never injected into those sites. After GitHub sign-in, content snapshots merge through the private `blixvip/notebook-cloud` repository; device paths and encrypted credentials stay local.

Supported target: normal Windows apps and borderless/windowed games. Do not promise support for exclusive-fullscreen games.

**Keep the UI deliberate.** MCP was removed from every user-facing/API surface in v0.10.0. Its old SQLite table and relation rows remain only for non-destructive backup/restore compatibility; never expose them again without an explicit request. User-facing notebooks are backed by the existing folders table.

## Architecture

- `src/main/main.cjs`: Electron lifecycle, single-instance lock, global shortcut, tray, window placement, validated IPC, drag-out.
- `src/main/ai-view.cjs`: sandboxed ChatGPT/Gemini/DeepSeek `WebContentsView` lifecycle, URL allowlists, persistent partitions, and bounds.
- `src/main/preload.cjs`: the only renderer bridge. Add every native capability here as a narrowly scoped function.
- `src/main/storage.cjs`: SQLite (`better-sqlite3`) schema, migrations, note/skill/command/daily operations, JSON export/import, rotating backups and restores. `dailyPage(viewDate, today)` returns one day's activity log and task lines plus the next day's tasks; `dailyMonth(month)` returns per-day task and logged-minute totals for the calendar.
- `src/main/github-sync.cjs` + the runner in `src/main/projects.cjs`: fixed-account two-way merge, conflict retry, private repository creation, and sandboxed `gh`/`git` execution.
  Change detection (`sameContent`, `fingerprint`) deliberately ignores noise so the 30-second sync never loops: bot telemetry (runtime, derivedState, run/event logs, credential check times), bare `updated_at` bumps, row order, restored tag ids, the per-device inbox `created_at`, computed project `workshop` data, and fields another build omits or adds (`shapedLike`). Merging still carries all of it. When a remote change does rewrite local data, the changed paths are written to `github-cloud/last-remote-change.json`. Editors save only pending edits on the pre-sync flush.
- `src/main/projects.cjs` + `src/renderer/ProjectsPage.jsx`: categorized Now/Next/Later/Parked ordering, local repository status, scoped commits, pushes, and explicit GitHub setup.
- `src/main/hotkey-manager.cjs`, `window-bounds.cjs`, `startup.cjs`: shortcut recovery, multi-monitor placement, start-at-login repair.
- `src/renderer/main.jsx`: the whole React UI. `window.hushnote` is real in Electron and mocked for the browser preview.
- `src/renderer/skills.jsx` + `skills.css`: the Skills page. Its grouping, shelf ordering, and label rules live in `skill-stack.js` so `scripts/skill-stack-test.mjs` can cover them.
- `src/renderer/markdown-blocks.js` (pure parser, unit-tested) + `markdown.jsx` (React renderer). Markdown is never turned into HTML strings — no `dangerouslySetInnerHTML`.
- `src/renderer/rich-markdown.js` (pure Markdown ↔ TipTap JSON converter, unit-tested) + `RichNoteEditor.jsx` (the WYSIWYG note editor built on TipTap). Markdown stays the stored format; the editor parses it on open and serializes back on every change.
- `src/renderer/styles.css` + `tokens.css`: one spacing/type scale. Minimum rendered text size is 11px and interactive controls are at least 22px tall; `scripts/ui-test.mjs` enforces both.

Legacy MCP rows remain dormant so an upgrade never destroys user data. They are excluded from hydrated bots, renderer APIs, IPC, and UI.

User data lives at `%APPDATA%\note-overlay`: `hushnote.sqlite` plus `backups\notebook-backup-*.json`. Never delete or reset this data. Cloud replacement and manual restore always create a local safety backup first.

## Development and verification

```powershell
npm install
npm run dev
npm run preview       # browser UI mock at 127.0.0.1:5181
npm run shot          # narrow + wide screenshots, light and dark; inspect the PNGs
npm test              # storage, bounds, hotkey, startup, Markdown, GitHub sync, drag, Electron, UI
npm run pack:dir      # portable test build
npm run pack:release  # signed NSIS release; requires signing credentials
```

Before claiming any UI change: run `npm run shot`, actually look at the images at both widths and in dark mode, then confirm in the real Electron build. Test empty/loading/error/success states. The preview mock in `main.jsx` must be updated whenever a preload API changes.

`scripts/hotkey-app-test.mjs` drives a real global shortcut with SendKeys and asserts window focus; it fails when another window holds the Windows foreground lock. Re-run it on an idle desktop before treating a failure as a regression.

## Safety and extension rules

- Preserve context isolation, sandboxing, permission denial, navigation denial, and Zod validation. Never expose raw IPC, Node, shell, or filesystem access to the renderer.
- Any schema change must be backward compatible, use `CREATE ... IF NOT EXISTS`/migration logic, and get a storage regression test. Keep `foreign_keys = ON`.
- New note-editing behavior must autosave, report failures visibly, and flush on hide. Do not make the window block normal work.
- The global shortcut may already be owned by another program; preserve fallback/error behavior and do not silently replace user shortcuts.

## Release

1. Bump `package.json` version and the release output folder.
2. Run `npm test`, `npm run shot`, inspect images, then test a clean `pack:dir` build.
3. Set Windows signing credentials (`CSC_LINK` and `CSC_KEY_PASSWORD`) and run `npm run pack:release`.
4. Verify the installer signature, install/upgrade, Start Menu/Desktop shortcut, data preservation, uninstall behavior, and the hotkey on multiple monitors.
5. Publish manual download + release notes only. No auto-update feed exists.
