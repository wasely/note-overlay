# Notebook — agent handoff

## Product

Notebook is a Windows-only, local-first Markdown notebook. `Ctrl+Alt+Shift+N` toggles a compact, centered, always-on-top overlay on the monitor under the cursor for fast notes. Notes can be organized into separate notebooks and use standard Markdown task syntax with a clickable checklist view. It also has a separate Skills page for reusable instructions: name, custom category, and freeform notes. It autosaves, supports full-note copy and terminal drag-out as a `.md` file, and has an optional local LLMLingua compressor. No accounts, telemetry, cloud sync, or background network requests.

It also has a Slash Commands page for saving command invocations and usage notes. New installs seed a Git push command page and a Markdown/prompts/skills/slash-command explainer.

Supported target: normal Windows apps and borderless/windowed games. Do not promise support for exclusive-fullscreen games; Windows, GPU presentation, and anti-cheat can block normal desktop overlays.

Keep the UI intentionally small. User-facing notebooks are backed by the existing folders table. Skills use custom category text and category filters; do not add a separate category-management screen. Do not surface tags/archive functionality unless the user explicitly asks; the storage support remains for compatibility/imports.

## Architecture

- `src/main/main.cjs`: Electron lifecycle, single-instance lock, global shortcut, tray, window placement, validated IPC, drag-out, compressor process/service calls.
- `src/main/preload.cjs`: the only renderer bridge. Add every native capability here as a narrowly scoped function.
- `src/main/storage.cjs`: SQLite (`better-sqlite3`) schema, migrations, note/skill operations, JSON export/import, rotating backups and restores.
- `src/renderer/main.jsx`: React UI. `window.hushnote` is real in Electron and mocked for browser screenshots.
- `src/renderer/styles.css`: production UI styles. Read `C:\Code\UI-PLAYBOOK.md` before any UI work.

User data lives at `%APPDATA%\note-overlay`: `hushnote.sqlite` plus `backups\notebook-backup-*.json`. Never delete, reset, or overwrite this data without explicit user approval. Restore always creates a safety backup first.

## Development and verification

```powershell
npm install
npm run dev
npm run preview       # browser UI mock at 127.0.0.1:5181
npm run shot          # narrow + wide screenshots; inspect the PNGs
npm test              # storage, window bounds, Electron smoke test
npm run pack:dir      # portable test build
npm run pack:release  # signed NSIS release; requires signing credentials
```

Before claiming any UI change: run preview/screenshots at narrow and wide widths, inspect them, then confirm in the real Electron build. Test empty/loading/error/success states. The preview mock must be updated whenever a new preload API is added.

## Safety and extension rules

- Preserve context isolation, sandboxing, CSP, permission denial, navigation denial, and Zod validation. Never expose raw IPC, Node, shell, or filesystem access to the renderer.
- Any schema change must be backward compatible, use `CREATE ... IF NOT EXISTS`/migration logic, and get a storage regression test. Keep `foreign_keys = ON`.
- New note-editing behavior must autosave, report failures visibly, and flush on hide. Do not make the overlay block normal work.
- Compressor failures are normal: service offline, startup timeout, malformed output, and missing local model must give an actionable message without affecting notes.
- The global shortcut may already be owned by another program; preserve fallback/error behavior and do not silently replace user shortcuts.

## Release

1. Bump `package.json` version and release output folder.
2. Run `npm test`, `npm run preview` + `npm run shot`, inspect images, then test a clean `pack:dir` build.
3. Set Windows signing credentials (`CSC_LINK` and `CSC_KEY_PASSWORD`, or the organization certificate configuration) and run `npm run pack:release`.
4. Verify the installer signature, install/upgrade, Start Menu/Desktop shortcut, data preservation, uninstall behavior, and the hotkey on multiple monitors.
5. Publish manual download + release notes only. No auto-update feed exists in v1.
