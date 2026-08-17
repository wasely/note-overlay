# Notebook

A tiny, local-first Windows overlay notebook. Press `Ctrl+Alt+Shift+N`, type, and carry on.

![Notebook overlay](./screenshots/overview.png)

## What it does

- Opens compact and centered on the monitor under your cursor, always on top.
- Works over regular desktop apps and borderless/windowed games.
- Organizes Markdown notes into separate notebooks.
- Standard Markdown to-dos (`- [ ]`) with a clickable checklist view.
- Dedicated **Daily** loop: today’s work, completed wins, tomorrow planning, automatic carry-forward, and a seven-day completion history.
- Copies full Markdown, or drags a clean `Title.md` reference into terminals and other apps while the real file stays in local app data.
- Ranked **Skill Stack** landing page: active workflow first, archived references grouped by reason, plus searchable autosaving skill instructions.
- Separate **Slash Commands** library with autosaving invocation and documentation pages.
- Local **Bots** operations registry for Discord/Telegram setup, app-open health checks, cron evidence, job history, commands, runbooks, MCP/Skill links, and archive/restore. See [Bot operations](docs/bot-operations.md).
- Full-window Gmail view from the **Mail** tab or `Ctrl+Alt+Shift+M`, with an external-browser fallback when Google blocks embedded sign-in.
- Full-window Notion view from the **Notion** tab or `Ctrl+Alt+Shift+O`, with its own persistent sign-in session and external-browser fallback.
- Rotating local backups; export/import JSON and Markdown from the `···` menu.
- Optional local LLMLingua compressor.

No Notebook account, cloud sync, telemetry, or auto-update service. Notes never leave your computer. Gmail and Notion connect directly to their services only when you open those views.

## Install

Prebuilt Windows installers are distributed as manual downloads. To build one:

```powershell
npm install
npm run pack:dir       # portable unpacked build
npm run pack:release   # signed NSIS installer (requires signing credentials)
```

> Exclusive-fullscreen games can block normal Windows overlays. Use borderless/windowed mode for reliable use. Unsigned builds may trigger a Windows SmartScreen prompt.

## Develop

Requires Node.js 20+ and the .NET Framework 4.x C# compiler (for the drag helper).

```powershell
npm install
npm run dev            # build + launch the app
npm test               # storage, bounds, hotkey, startup, drag, and app tests
npm run preview        # browser UI preview at 127.0.0.1:5181
npm run shot           # render screenshots
```

See [CLAUDE.md](CLAUDE.md) for architecture, safety, and release instructions.

## Data

Your notes live at `%APPDATA%\note-overlay` — a `hushnote.sqlite` database plus rotating JSON backups in `backups`. Gmail and Notion cookies stay in separate persistent Electron sessions under the same app-data folder so you remain signed in.

## License

[MIT](LICENSE) · derived in part from [FastNote](https://github.com/creamIcec/FastNote) (MIT), see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
