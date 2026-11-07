# Notebook

A small, local-first Windows notebook. Press `Ctrl+Alt+Shift+N` anywhere, write, and carry on.

![Notebook](./screenshots/shot-wide-note-preview.png)

## What it does

- Opens compact and centred on the monitor under your cursor, always on top, over regular apps and borderless/windowed games.
- **Notes** — Markdown notes organised into notebooks, with autosave, pinning, word/task counts, and a WYSIWYG editor that styles text as you type (bold, headings, lists, checklists, quotes, code, links) while keeping Markdown underneath for the preview, copy, and drag-out features. Its rendered checkboxes are clickable and write straight back into the Markdown.
- **Today** — one page per day with a live seconds-left clock, a 24-hour activity map, exact one- or five-minute logs, and a separate task plan for today and tomorrow. The calendar pages back through both what you did and what you checked off; unfinished tasks keep moving forward until done.
- **Skills** — a browsable library: a home page of category cards, a page per category, and each skill as a readable page with its own outline and previous/next paging. Star the ones you actually use so they lead their category.
- **Commands** — a small library for saved slash-command invocations and reference pages.
- **Projects** — categorize work, drag it between Now/Next/Later/Parked, then review changed files and commit or push them from one GitHub page.
- **Bots** — connect Discord or Telegram once, then create named Discord agents or distinct Telegram bots from Notebook; every bot also gets a private resettable Notebook link.
- **Quick AI** — a fixed three-button panel for opening ChatGPT, Gemini, or DeepSeek in a secure embedded view with a persistent sign-in session.
- **Memory** — the master sheet every AI agent should know (`~/MASTER-MEMORY.md`), editable in place, plus a count of each agent's own memory folder (Claude Code, Grok, Aside, Codex).
- **Apps** — **Mailbrain** (the local unified inbox at `127.0.0.1:4390`, preloaded and always live, opening on its Everything tab), plus Notion, Twitter, and Excalidraw. Those three load on first open and unload after five minutes hidden to save memory.
- Search everything (`Ctrl+K`) across notes, tasks, skills, and commands.
- Copy full Markdown, or drag a clean `Title.md` file into a terminal or editor while the real file stays in local app data.
- Light, dark, or system theme.
- Rotating local backups, JSON/Markdown export, and automatic two-way sync through the private `blixvip/notebook-cloud` repository.

Notebook has no telemetry or auto-update feed. Sign in as `@blixvip` through GitHub CLI on each device; saved notes, notebooks, Today pages, skills, commands, projects, and bot definitions then merge automatically after edits and every 30 seconds. Device paths and encrypted account credentials remain local.

## Keyboard

| Shortcut | Action |
| --- | --- |
| `Ctrl+Alt+Shift+N` | Show or hide Notebook anywhere in Windows |
| `Ctrl+K` | Search everything |
| `Ctrl+N` | New note, skill, or command |
| `Ctrl+E` | Switch between editing and preview |
| `Alt+←` / `Alt+→` | Previous or next skill |
| `Ctrl+1`–`5` | Today, Notes, Skills & Commands, Keys, Memory |
| `Ctrl+Alt+Shift+M` | Show or hide Mailbrain |
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

Requires Node.js 20+, GitHub CLI, and the .NET Framework 4.x C# compiler (for the drag helper).

```powershell
npm install
npm run dev            # build and launch the app
npm test               # storage, bounds, hotkey, startup, Markdown, drag, Electron, and UI tests
npm run preview        # browser UI preview at 127.0.0.1:5181
npm run shot           # render screenshots into screenshots/
```

See [CLAUDE.md](CLAUDE.md) for architecture, safety rules, and release steps.

## Data

Local data lives at `%APPDATA%\note-overlay`: `hushnote.sqlite` plus rotating JSON backups in `backups`. Notebook keeps one automatic backup per day and holds the newest 21. Signed-in devices also merge the content snapshot through the private `blixvip/notebook-cloud` repository; every remote restore creates a local safety backup first.

## License

[MIT](LICENSE) · derived in part from [FastNote](https://github.com/creamIcec/FastNote) (MIT), see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Contributors wanted

Small, scoped work is labelled and waiting: [good first issues](https://github.com/wasely/note-overlay/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) name the files to touch and what "done" looks like. Comment to claim one. Pull requests get reviewed within a couple of days, and every contributor is credited in the release notes.

<!-- discord-incentive:start -->
### 💬 Why join the Discord first

**[discord.gg/grokbot](https://discord.gg/grokbot)** is the one server for every blixvip repo, and it gets you more than a chat window:

- 🟢 **Claim an issue and it is yours.** Say which one in `#contributors` and it is assigned to you, so two people never build the same thing twice.
- 🏷️ **A contributor role** on the server the moment your first pull request is merged.
- 🗺️ **A say in what gets built.** The roadmap is argued out there before it turns into issues.
- 🙋 **A human to ask.** Stuck on setup, or unsure whether an idea is even wanted? Faster than waiting on an issue thread.
<!-- discord-incentive:end -->