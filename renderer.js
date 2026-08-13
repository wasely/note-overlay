const fallbackApi = {
  listNotes: async () => [],
  saveNote: async (note) => [note],
  deleteNote: async () => [],
  hideOverlay: async () => {},
  compressorStatus: async () => false,
  startCompressor: async () => ({ ready: false, error: "Preview mode: start the desktop app." }),
  compress: async () => {
    throw new Error("Preview mode: open the desktop app to use the compressor.");
  },
};

const api = window.desktop || fallbackApi;
const byId = (id) => document.getElementById(id);
const state = { notes: [], selectedId: null, tab: "note", ready: false };

function newNote() {
  return { id: crypto.randomUUID(), title: "", body: "", updatedAt: new Date().toISOString() };
}

function selectedNote() {
  return state.notes.find((note) => note.id === state.selectedId) || null;
}

function formatTime(iso) {
  if (!iso) return "Not saved yet";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "Not saved yet" : `Saved ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function renderNotes() {
  const list = byId("noteList");
  list.replaceChildren();
  state.notes
    .slice()
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .forEach((note) => {
      const item = document.createElement("button");
      item.className = `note-item${note.id === state.selectedId ? " selected" : ""}`;
      item.innerHTML = `<strong>${escapeHtml(note.title || "Untitled note")}</strong><span>${escapeHtml((note.body || "Empty note").replace(/\s+/g, " ").slice(0, 52))}</span>`;
      item.addEventListener("click", () => {
        state.selectedId = note.id;
        renderEditor();
        renderNotes();
      });
      list.append(item);
    });
}

function escapeHtml(text) {
  return text.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function renderEditor() {
  const note = selectedNote();
  byId("emptyState").classList.toggle("hidden", Boolean(note));
  byId("editor").classList.toggle("hidden", !note);
  if (!note) return;
  byId("noteTitle").value = note.title;
  byId("noteBody").value = note.body;
  byId("saveMessage").textContent = formatTime(note.updatedAt);
}

async function createNote() {
  const note = newNote();
  state.notes = await api.saveNote(note);
  state.selectedId = note.id;
  renderNotes();
  renderEditor();
  byId("noteTitle").focus();
}

async function saveNote() {
  const note = selectedNote();
  if (!note) return createNote();
  const saved = { ...note, title: byId("noteTitle").value.trim(), body: byId("noteBody").value };
  state.notes = await api.saveNote(saved);
  renderNotes();
  renderEditor();
  byId("saveMessage").textContent = "Saved locally ✓";
}

async function deleteNote() {
  const note = selectedNote();
  if (!note) return;
  state.notes = await api.deleteNote(note.id);
  state.selectedId = state.notes[0]?.id || null;
  renderNotes();
  renderEditor();
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item.dataset.tab === tab));
  byId("notePanel").classList.toggle("active", tab === "note");
  byId("compressorPanel").classList.toggle("active", tab === "compressor");
}

function updateServiceState(ready) {
  state.ready = ready;
  byId("statusDot").classList.toggle("offline", !ready);
  byId("compressorBadge").textContent = ready ? "Ready on this PC" : "Not running";
  byId("compressorBadge").classList.toggle("ready", ready);
  byId("startCompressorButton").textContent = ready ? "Compressor running" : "Start local compressor";
  byId("startCompressorButton").disabled = ready;
}

function showMessage(id, text) {
  const message = byId(id);
  message.textContent = text;
  message.classList.remove("hidden");
}

function clearMessages() {
  byId("compressorError").classList.add("hidden");
  byId("compressorSuccess").classList.add("hidden");
}

async function startCompressor() {
  clearMessages();
  const button = byId("startCompressorButton");
  button.disabled = true;
  button.textContent = "Starting…";
  const result = await api.startCompressor();
  updateServiceState(Boolean(result.ready));
  if (result.ready) showMessage("compressorSuccess", "Local compressor is ready. It stays on this PC.");
  else showMessage("compressorError", result.error || "Could not start the local compressor.");
}

async function compress() {
  clearMessages();
  const text = byId("sourceText").value;
  if (!text.trim()) {
    showMessage("compressorError", "Paste a prompt or note first.");
    return;
  }
  if (!state.ready) {
    showMessage("compressorError", "Start the local compressor first.");
    return;
  }
  const button = byId("compressButton");
  button.disabled = true;
  button.textContent = "Compressing…";
  try {
    const result = await api.compress(text, Number(byId("rateInput").value));
    byId("resultText").value = result.compressed_prompt;
    byId("tokenStats").textContent = `${result.origin_tokens} → ${result.compressed_tokens} tokens · ${result.ratio}`;
    byId("resultWrap").classList.remove("hidden");
    showMessage("compressorSuccess", "Compressed locally. Ready to copy.");
  } catch (error) {
    showMessage("compressorError", error.message || "Compression failed.");
  } finally {
    button.disabled = false;
    button.textContent = "Compress";
  }
}

async function copyResult() {
  const result = byId("resultText").value;
  if (!result) return;
  await navigator.clipboard.writeText(result);
  byId("copyResultButton").textContent = "Copied ✓";
  setTimeout(() => { byId("copyResultButton").textContent = "Copy result"; }, 1400);
}

function bindEvents() {
  byId("hideButton").addEventListener("click", () => api.hideOverlay());
  byId("newNoteButton").addEventListener("click", createNote);
  byId("emptyNewButton").addEventListener("click", createNote);
  byId("saveButton").addEventListener("click", saveNote);
  byId("deleteButton").addEventListener("click", deleteNote);
  byId("startCompressorButton").addEventListener("click", startCompressor);
  byId("compressButton").addEventListener("click", compress);
  byId("copyResultButton").addEventListener("click", copyResult);
  byId("rateInput").addEventListener("input", (event) => { byId("rateValue").textContent = `${Math.round(event.target.value * 100)}%`; });
  document.querySelectorAll(".tab").forEach((item) => item.addEventListener("click", () => setTab(item.dataset.tab)));
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "s") {
      event.preventDefault();
      saveNote();
    }
  });
}

async function init() {
  bindEvents();
  state.notes = await api.listNotes();
  state.selectedId = state.notes[0]?.id || null;
  renderNotes();
  renderEditor();
  updateServiceState(await api.compressorStatus());
}

init();
