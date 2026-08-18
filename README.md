# Notebook

A small, local-first Windows notebook. Press `Ctrl+Alt+Shift+N` anywhere, write, and carry on.

![Notebook](./screenshots/shot-wide-note-preview.png)

## What it does

- Opens compact and centred on the monitor under your cursor, always on top, over regular apps and borderless/windowed games.
- **Notes** — Markdown notes organised into notebooks, with autosave, pinning, word/task counts, and a rendered preview whose checkboxes are clickable and write straight back into the Markdown.
- **Today** — one paper page per day: a plain checklist you tick off, the next day's page underneath, and arrows plus a month calendar to page back through what you finished on any date. Anything still unchecked at midnight moves onto the next day's page and keeps moving until it is done.
- **Skills** — a browsable library: a home page of category cards, a page per category, and each skill as a readable page with its own outline and previous/next paging. Star the ones you actually use so they lead their category.
- **Commands** — a small library for saved slash-command invocations and reference pages.
- Search everything (`Ctrl+K`) across notes, tasks, skills, and commands.
- Copy full Markdown, or drag a clean `Title.md` file into a terminal or editor while the real file stays in local app data.
- Light, dark, or system theme.
- Rotating local backups, JSON/Markdown export, and an optional private GitHub repository backup.

No account, telemetry, cloud service, or auto-update feed. Notes never leave your computer unless you turn on the GitHub backup yourself.

## Keyboard

| Shortcut | Action |
| --- | --- |
| `Ctrl+Alt+Shift+N` | Show or hide Notebook anywhere in Windows |
| `Ctrl+K` | Search everything |
| `Ctrl+N` | New note, skill, or command |
| `Ctrl+E` | Switch between writing and Markdown preview |
| `Alt+←` / `Alt+→` | Previous or next skill |
| `Ctrl+1`–`4` | Today, Notes, Skills, Commands |
| `Esc` | Clear search, close a panel, or hide the window |

## Install

Prebuilt Windows installers are manual downloads. To build one:

```powershell
npm install
npm run pack:dir       # portable unpacked build
npm run pack:release   # signed NSIS installer (requires signing credentials)
```

> Exclusive-fullscreen games can block normal Windows overlays; use borderless or windowed mode. Unsigned builds may trigger a SmartScreen prompt.

## Develop

Requires Node.js 20+ and the .NET Framework 4.x C# compiler (for the drag helper).

```powershell
npm install
npm run dev            # build and launch the app
npm test               # storage, bounds, hotkey, startup, Markdown, drag, Electron, and UI tests
npm run preview        # browser UI preview at 127.0.0.1:5181
npm run shot           # render screenshots into screenshots/
```

See [CLAUDE.md](CLAUDE.md) for architecture, safety rules, and release steps.

## Data

Everything lives at `%APPDATA%\note-overlay`: `hushnote.sqlite` plus rotating JSON backups in `backups`. Notebook keeps one automatic backup per day and holds the newest 21.

## License

[MIT](LICENSE) · derived in part from [FastNote](https://github.com/creamIcec/FastNote) (MIT), see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
