# GitHub competitive landscape — Hushnote

Checked 2026-08-10. Sources below are first-party GitHub repos/source files. Star counts are a rough popularity signal, not a quality guarantee.

## Bottom line

No established open-source project found combines all three parts: **Windows global-hotkey overlay**, **light local notes organised into folders**, and a **bundled local LLMLingua-2 prompt compressor**. The closest direct match is FastNote, but it is small. The best references are therefore complementary, not a codebase to fork.

## Closest projects

| Project | Why it is relevant | Overlap / gap | Activity and license | Useful takeaway |
| --- | --- | --- | --- | --- |
| [FastNote](https://github.com/creamIcec/FastNote) | Electron + React/Vite quick-note app. Its README lists a configurable global shortcut to toggle the window, keyboard shortcuts, export, always-on-top, reminders, and Windows support. | **Closest overlay/quick-capture match.** Has no LLMLingua feature and is much smaller than a full notes organiser. | 12 stars; last pushed 2025-06-16; [MIT](https://github.com/creamIcec/FastNote/blob/main/LICENSE). | Follow its product boundary: instant capture first, optional organisation second. Its [main process](https://github.com/creamIcec/FastNote/blob/main/src/electron/main.ts) also wires database migration, hotkey, tray, and close-to-tray separately. |
| [Joplin](https://github.com/laurent22/joplin) | Major desktop note app: README says notes are organised into notebooks, searchable, tagged, offline-first, and available on Windows/macOS/Linux. | Strong organisation/data-model reference; not an overlay app and has no local prompt compression. | 55.9k stars; pushed 2026-08-10; repository default is [AGPL-3.0-or-later](https://github.com/laurent22/joplin/blob/dev/LICENSE) (with directory exceptions). | Implement a small slice only: folder/notebook, tags, full-text search, import/export, then backups. Do not copy AGPL code into Hushnote. |
| [Notesnook](https://github.com/streetwriters/notesnook) | Large Electron/React desktop-note monorepo focused on privacy; its README explicitly identifies its desktop Electron client and shared core. | Good architecture and local/privacy reference; not quick-overlay-first and no LLMLingua integration. | 14.4k stars; pushed 2026-08-10; [GPL-3.0](https://github.com/streetwriters/notesnook/blob/master/LICENSE). | Keep renderer, desktop shell, storage, and shared types clearly separated. Borrow structure/ideas, not source, due GPL. |
| [Trilium Notes](https://github.com/TriliumNext/Trilium) | Mature hierarchical notes app: arbitrary-depth tree, full-text search, note revisions, attributes, Markdown import/export; desktop is built via Electron Forge. | Best reference for deep organisation; deliberately far beyond Hushnote’s fast-overlay scope. | 37.3k stars; pushed 2026-08-10; [AGPL-3.0](https://github.com/TriliumNext/Trilium/blob/main/LICENSE). | Put a hard scope limit on v2: one-level folders, tags, pinned/recent first. Do not build a knowledge-base tree, scripting, sync, etc. |

## Prompt-compression references

| Project | Evidence / relevance | Useful takeaway |
| --- | --- | --- |
| [Microsoft LLMLingua](https://github.com/microsoft/LLMLingua) | The official README describes LLMLingua-2 as a BERT-level task-agnostic compressor, 3–6x faster than the original approach, and shows the small `microsoft/llmlingua-2-bert-base-multilingual-cased-meetingbank` model. [MIT license](https://github.com/microsoft/LLMLingua/blob/main/LICENSE); 6.5k stars; pushed 2026-04-08. | Keep the local Python compressor as a dedicated service. Show original vs result and token/ratio metrics; protect essential sections with structured compression rather than blindly compressing everything. |
| [LlamaIndex LongLLMLingua integration](https://github.com/run-llama/llama_index/tree/main/llama-index-integrations/postprocessor/llama-index-postprocessor-longllmlingua) | The integration’s [source](https://github.com/run-llama/llama_index/blob/main/llama-index-integrations/postprocessor/llama-index-postprocessor-longllmlingua/llama_index/postprocessor/longllmlingua/base.py) retains node metadata while producing compressed text, and exposes `target_token`, `use_llmlingua2`, and a query/instruction. Main repo: 51.5k stars, pushed 2026-08-09, [MIT](https://github.com/run-llama/llama_index/blob/main/LICENSE). | Hushnote should never overwrite the source note when compressing. Save a linked compression record: original, result, settings, timestamp, and copy action. |
| [Tamp](https://github.com/sliday/tamp) | A recent localhost token-compression proxy. Its README documents a Python LLMLingua sidecar health endpoint, explicit compression levels, local binding, secret redaction, and a no-neural conservative mode. | Excellent operational pattern: lazy/startup state, `ready/loading/error`, a health check, conservative/balanced/aggressive presets, and clear privacy wording. It is a coding-agent proxy, not a notes app. Its README declares [MIT](https://github.com/sliday/tamp#license). |

## Recommended product direction

Build Hushnote as a **fast local scratchpad with organisation and a deliberate “compress a copy” workflow**—not as a Joplin/Trilium clone.

1. Keep the hotkey overlay, `Esc` hide, tray, quick capture, and always-on-top as first-class.
2. Add only folders, tags, pinned/recent, search, autosave, archive, and export before advanced notes features.
3. Treat compression as a sidecar with health/status; keep output/history separate from the original note.
4. Add backup/export before moving from JSON to SQLite; migration must preserve existing notes.
5. Use these projects for UX/architecture evidence only. FastNote and LLMLingua are MIT, but the three large note-app references have reciprocal licenses; do not copy their source into a proprietary/MIT Hushnote without complying with those licenses.
