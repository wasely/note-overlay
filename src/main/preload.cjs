const { contextBridge, ipcRenderer } = require("electron");
const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("hushnote", {
  notes: { list: () => call("notes:list"), create: (data) => call("notes:create", data), update: (id, data) => call("notes:update", id, data), dragFile: (data) => call("notes:drag-file", data), dragCleanName: (data) => ipcRenderer.send("notes:drag-clean-name", data), setTags: (id, tags) => call("notes:tags", id, tags), trash: (id) => call("notes:trash", id), restore: (id) => call("notes:restore", id), remove: (id) => call("notes:remove", id) },
  skills: { list: () => call("skills:list"), create: (data) => call("skills:create", data), update: (id, data) => call("skills:update", id, data), remove: (id) => call("skills:remove", id) },
  slashCommands: { list: () => call("slash-commands:list"), create: (data) => call("slash-commands:create", data), update: (id, data) => call("slash-commands:update", id, data), remove: (id) => call("slash-commands:remove", id) },
  daily: { get: () => call("daily:get"), create: (data) => call("daily:create", data), update: (id, text) => call("daily:update", id, text), complete: (id, completed) => call("daily:complete", id, completed), remove: (id) => call("daily:remove", id) },
  folders: { list: () => call("folders:list"), create: (name) => call("folders:create", name), rename: (id, name) => call("folders:rename", id, name), remove: (id) => call("folders:remove", id) },
  tags: { list: () => call("tags:list") },
  compressions: { list: (noteId) => call("compressions:list", noteId), create: (data) => call("compressions:create", data) },
  compressor: { status: () => call("compressor:status"), start: () => call("compressor:start"), compress: (text, rate) => call("compressor:compress", text, rate) },
  settings: { get: () => call("settings:get"), set: (settings) => call("settings:set", settings), version: () => call("app:version"), export: (format) => call("data:export", format), import: () => call("data:import"), dataLocation: () => call("data:location") },
  backups: { list: () => call("backups:list"), create: () => call("backups:create"), restore: (name) => call("backups:restore", name) },
  clipboard: { writeText: (text) => call("clipboard:write-text", text) },
  mail: { show: () => call("mail:show"), hide: () => call("mail:hide"), reload: () => call("mail:reload"), openExternal: () => call("mail:open-external") },
  window: { hide: () => call("window:hide"), newNote: () => call("window:new-note") },
  onNewInboxNote: (handler) => ipcRenderer.on("overlay:new-inbox", handler),
  onFocusEditor: (handler) => ipcRenderer.on("overlay:focus-editor", handler),
  onFlushEditor: (handler) => ipcRenderer.on("overlay:flush-editor", handler),
  onOverlayHiding: (handler) => ipcRenderer.on("overlay:hiding", handler),
  onOverlayShown: (handler) => ipcRenderer.on("overlay:shown", handler),
  onOpenMail: (handler) => { const listener = () => handler(); ipcRenderer.on("overlay:open-mail", listener); return () => ipcRenderer.removeListener("overlay:open-mail", listener); },
  onMailStatus: (handler) => { const listener = (_event, status) => handler(status); ipcRenderer.on("mail:status", listener); return () => ipcRenderer.removeListener("mail:status", listener); },
});
