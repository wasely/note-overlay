const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  listNotes: () => ipcRenderer.invoke("notes:list"),
  saveNote: (note) => ipcRenderer.invoke("notes:save", note),
  deleteNote: (id) => ipcRenderer.invoke("notes:delete", id),
  hideOverlay: () => ipcRenderer.invoke("overlay:hide"),
  compressorStatus: () => ipcRenderer.invoke("compressor:status"),
  startCompressor: () => ipcRenderer.invoke("compressor:start"),
  compress: (text, rate) => ipcRenderer.invoke("compressor:compress", text, rate),
});
