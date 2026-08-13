# Electron drag-out and persistence plan

Scope: Windows Electron note overlay. Sources below are official Electron docs only (checked 2026-08-10).

## Decision

Ship two separate actions on every note:

1. **Copy text** — copies the note body as plain text; this is the reliable terminal workflow: click Copy, focus the terminal, paste.
2. **Drag file** — a small, clearly labelled grip (for example `Drag .txt`) creates a temporary UTF-8 `.txt` snapshot and begins the OS native file drag. It is useful for Explorer, Desktop, editors, upload targets, and any terminal that elects to accept file drops.

Do **not** present drag-out as “insert this note into any terminal.” Electron’s supported API drags an absolute *file path* into the OS; it does not carry arbitrary text and Electron gives no target-terminal compatibility promise. A terminal may reject it, insert a file path, or handle it in its own way. Copy + paste is therefore the guaranteed text path; native file drag is an optional convenience.

## Supported Electron route

Electron’s official native file-drag tutorial says to start an OS drag from the renderer’s `ondragstart` event, bridge it through preload IPC, then call `webContents.startDrag()` in the main process. The API accepts an absolute `file` path (or `files`) and an icon. [Native File Drag & Drop](https://www.electronjs.org/docs/latest/tutorial/native-file-drag-drop/) · [`webContents.startDrag`](https://www.electronjs.org/docs/latest/api/web-contents/#contentsstartdragitem)

Implementation shape (not applied by this research task):

```text
renderer: drag grip `ondragstart`
  -> preventDefault()
  -> desktop.startNoteDrag(noteId)
preload: ipcRenderer.send('note:drag-out', noteId)
main: validate noteId; load note from SQLite; write temp `<uuid>.txt`
  -> event.sender.startDrag({ file: absoluteTempPath, icon })
Windows drag target
```

Use a non-blocking IPC `send` exactly as in Electron’s guide, rather than an async renderer `invoke`/await chain. Keep the drag grip outside any draggable window-title region and make only that element `draggable="true"`; otherwise normal text selection and note editing become frustrating.

### Temp-file rules

- Generate the content in main from the stored note ID, not from renderer-supplied text. This limits the exposed API and ensures the drag snapshot matches saved content.
- Use `app.getPath('temp')/Notebook-drag/` and a random UUID filename ending in `.txt`; ensure the directory exists and write UTF-8 before `startDrag`.
- Do not delete the file when the mouse is released: Windows targets may still be reading it. Purge old files at next startup (for example, files older than 24 hours), and best-effort purge on quit.
- Treat the temp copy as potentially sensitive. Show the UI label as **Drag as .txt** and do not claim it is an in-memory text transfer.
- Main should accept only a string note ID, retrieve that ID from the database, and reject missing/deleted notes. Never accept a renderer-provided path.

An icon may be a valid `NativeImage` or icon-path string; a non-empty icon is specifically required on macOS, but include a small local icon on Windows too for a clear cursor affordance. [API details](https://www.electronjs.org/docs/latest/api/web-contents/#contentsstartdragitem)

### Terminal limitation

The Electron docs demonstrate dragging to the desktop and describe the feature as moving a file from web content to the operating system; they do not document a way to make another application receive a note’s text from a drag. [Electron guide](https://www.electronjs.org/docs/latest/tutorial/native-file-drag-drop/)

So test the intended terminal(s) manually after implementation (Windows Terminal / PowerShell / cmd / Git Bash, if relevant). Target behavior belongs to the target application and shell. If dropping a file is not accepted, use Copy then terminal paste; do not fake keystrokes into another process or silently launch/read the file.

## Copy implementation

Add a visible **Copy** button beside the drag grip. Electron now deprecates direct renderer use of its `clipboard` module and recommends calling it in preload then exposing a narrow API through `contextBridge`; `clipboard.writeText(text)` writes plain text. [Clipboard API](https://www.electronjs.org/docs/latest/api/clipboard/)

Recommended boundary:

```text
renderer -> desktop.copyNoteText(noteId)
preload  -> ipcRenderer.invoke('note:copy-text', noteId)
main     -> load note by ID -> clipboard.writeText(body) -> { ok: true }
```

This avoids exposing Node or the full Electron IPC surface to the renderer. The project already has `contextIsolation: true` and `nodeIntegration: false`; Electron recommends context isolation and using a preload/contextBridge API for privileged functionality. [Security guide](https://www.electronjs.org/docs/latest/tutorial/security/)

Copy and drag should use the same text serializer: `body` by default, with an explicit future option for Markdown (`# title` plus body). Do not include metadata accidentally.

## Persisting window size and position

Persist the *window bounds* in the existing SQLite `settings` table under a dedicated key such as `windowBounds`:

```json
{ "x": 120, "y": 80, "width": 940, "height": 700 }
```

At creation, validate numeric values, clamp width/height to the existing minimums, then pass restored bounds to `new BrowserWindow`. Do this before showing the overlay, falling back to current defaults if absent or invalid. Electron exposes `getBounds()` for the full window rectangle and `setBounds()` / constructor options for restoration. [`BrowserWindow` bounds API](https://www.electronjs.org/docs/latest/api/browser-window/#wingetbounds)

After user movement/resizing, write `overlay.getBounds()` to settings:

- `moved` runs once after a manual move on Windows.
- `resized` runs once after manual resize finishes on Windows.
- Optionally listen to `move` / `resize` too with a short debounce as a safety net; those fire during changes.

Electron documents these events and their Windows behavior. [Window events](https://www.electronjs.org/docs/latest/api/browser-window/#event-resized-macos-windows) · [move event](https://www.electronjs.org/docs/latest/api/browser-window/#event-move)

Before restoring, ensure the rectangle remains visible after monitor layout/DPI changes: use Electron’s `screen.getDisplayMatching(bounds)` and clamp it to that display’s work area, or recenter on the primary display if it would be completely off-screen. Keep this persistence independent of the existing general app settings so a hotkey/settings reset does not unexpectedly erase user layout.

## Verification checklist

1. Resize and move; quit/relaunch; exact usable bounds return.
2. Disconnect the monitor used last session; relaunch; overlay is visible on an active display.
3. Copy a multiline/nonn-ASCII note and paste it into each intended terminal.
4. Drag the grip to Desktop/Explorer: the exported `.txt` arrives and opens with the exact saved text.
5. Drag into each intended terminal; record its actual behavior. A failure there is handled by the Copy action, not by simulated input.
6. Confirm drag works from a visible overlay after hotkey show/hide, and old temp exports are purged on next launch.
