# Notebook

A tiny Windows overlay notebook. Press `Ctrl+Alt+Shift+N`, type, and carry on. Notes are stored locally and autosaved.

## What it does

- Opens compact and centered on the monitor under your cursor.
- Works over regular desktop apps and borderless/windowed games.
- Organizes Markdown notes into separate notebooks.
- Adds standard Markdown to-dos and a clickable checklist view.
- Copies full Markdown or drags a clean `Title.md` reference into terminals and other apps while keeping the real file in local app data. Clicking the drag control copies the clean filename; the full path remains available from `···`.
- Keeps a searchable Skills library with custom categories and autosaving instructions.
- Keeps a separate Slash Commands library with autosaving invocation and documentation pages.
- Makes rotating local backups; export and restore are available from `···`.
- Optionally compresses the open note with a locally running LLMLingua service.

No account, cloud sync, telemetry, or auto-update service.

## Run locally

```powershell
npm install
npm run dev
```

For development, run `npm test` and `npm run preview` / `npm run shot`. See [CLAUDE.md](CLAUDE.md) for architecture, safety, and release instructions.

## Data

Your data is under `%APPDATA%\note-overlay`. The SQLite database is `hushnote.sqlite`; backups are JSON files in `backups`.

Exclusive-fullscreen games can prevent normal Windows overlays from appearing. Use borderless/windowed mode for reliable use.
