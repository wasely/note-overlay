# Scratchpad source check

Checked 2026-08-10 against the projects' own GitHub repositories.

## Decision

Use **[FastNote](https://github.com/creamIcec/FastNote)** as the reusable foundation. It is an MIT-licensed Electron + React + Vite app built specifically around a compact, always-available notes window. Keep its copyright and MIT notice in `THIRD_PARTY_NOTICES.md` when copying substantial code.

Do **not** copy Heynote source. It is a very good product reference, but its current license is *MIT with the Commons Clause*, which withholds the right to sell software whose value substantially derives from it. That is not the plain permissive MIT license requested here.

## FastNote — selected foundation

- Its [MIT license](https://github.com/creamIcec/FastNote/blob/main/LICENSE) permits use, copying, modification, distribution, sublicensing, and sale when the copyright and license notice travel with substantial copies.
- Its [package manifest](https://github.com/creamIcec/FastNote/blob/main/package.json) shows the compatible architecture: Electron, React, Vite, TypeScript, SQLite, Zustand, and electron-builder. Its build is split into a Vite renderer and a separately transpiled Electron main process.
- The [main process](https://github.com/creamIcec/FastNote/blob/main/src/electron/main.ts) makes the relevant product choices: a small window (512 x 650), `nodeIntegration: false`, `contextIsolation: true`, preload bridge, local database, global toggle shortcut, and tray.
- Its small [window action module](https://github.com/creamIcec/FastNote/blob/main/src/electron/actions/window-actions.ts) is the exact hide/show behavior needed for a hotkey scratchpad. The [global-shortcut module](https://github.com/creamIcec/FastNote/blob/main/src/electron/events/glabol-event-handlers.ts) demonstrates persisted shortcut registration.
- Its [preload bridge](https://github.com/creamIcec/FastNote/blob/main/src/electron/preload.cts) is a narrow, context-isolated renderer API. Its [note service](https://github.com/creamIcec/FastNote/blob/main/src/electron/io/note-service.ts) stores named notes locally in SQLite, and its [database setup](https://github.com/creamIcec/FastNote/blob/main/src/electron/io/database-manager.ts) puts the database in Electron user data.
- Its [editor](https://github.com/creamIcec/FastNote/blob/main/src/ui/components/noteArea/noteArea.tsx) has the desired core interaction: one focused textarea, throttled automatic saves, and visible save/error state. The [sidebar](https://github.com/creamIcec/FastNote/blob/main/src/ui/components/sidebar/sidebar.tsx) supplies a minimal named-note switcher.

### What to reuse

Reuse/adapt only the small, proven pieces: `main.ts` window/tray/hotkey pattern, `preload.cts` API boundary, `note-service.ts` data shape, and `noteArea.tsx` autosave interaction. Keep the present app's newer Electron version and secure IPC validation, rather than downgrading dependencies to FastNote's versions.

Do not inherit FastNote's less-essential material components, i18n, reminders, theme controls, animations, or its unfinished deletion/migration paths. The resulting UI should be one editor, a compact note picker, and a hidden-until-needed compressor action.

## Heynote — reference only

- [Heynote](https://github.com/heyman/heynote) is a mature developer scratchpad with persistent buffers, blocks, tabs, a global hotkey option, and desktop support, as described in its [README](https://github.com/heyman/heynote/blob/main/README.md).
- Its [package manifest](https://github.com/heyman/heynote/blob/main/package.json) identifies Electron + Vue + Vite + Pinia + CodeMirror, which is a much larger and incompatible stack for the current React app.
- Its [license](https://github.com/heyman/heynote/blob/main/LICENSE) attaches Commons Clause terms to MIT and explicitly excludes a right to sell the software. Treat it as a behavior/UX reference, not copied app source.
- Useful non-code inspiration: its [editor component](https://github.com/heyman/heynote/blob/main/src/components/Editor.vue), [editor modules](https://github.com/heyman/heynote/tree/main/src/editor), and [file library](https://github.com/heyman/heynote/blob/main/electron/main/file-library.js) demonstrate why a scratchpad should feel like one persistent buffer rather than a dense note-management system.

## Implementation call

Rebuild the renderer around FastNote's autosaving scratchpad pattern, with only named notes and a compact picker. Preserve local-only SQLite storage, the global show/hide hotkey, and the existing local LLMLingua service behind one secondary action. Add FastNote attribution before shipping copied source.
