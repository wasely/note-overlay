const { contextBridge, ipcRenderer } = require("electron");
const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const AI_IDS = ["chatgpt", "gemini", "deepseek"];
const aiBridge = Object.fromEntries(AI_IDS.map((id) => [id, {
  show: () => call(`ai:${id}:show`),
  hide: () => call(`ai:${id}:hide`),
  reload: () => call(`ai:${id}:reload`),
  openExternal: () => call(`ai:${id}:open-external`),
}]));

contextBridge.exposeInMainWorld("hushnote", {
  notes: { list: () => call("notes:list"), backlinks: (id) => call("notes:backlinks", id), create: (data) => call("notes:create", data), update: (id, data) => call("notes:update", id, data), dragFile: (data) => call("notes:drag-file", data), dragCleanName: (data) => ipcRenderer.send("notes:drag-clean-name", data), setTags: (id, tags) => call("notes:tags", id, tags), trash: (id) => call("notes:trash", id), restore: (id) => call("notes:restore", id), remove: (id) => call("notes:remove", id) },
  skills: { list: () => call("skills:list"), create: (data) => call("skills:create", data), update: (id, data) => call("skills:update", id, data), remove: (id) => call("skills:remove", id), openSource: (url) => call("skills:open-source", url), relatedBots: (id) => call("skills:related-bots", id) },
  keys: { list: () => call("keys:list") },
  memory: { master: () => call("memory:master"), stores: () => call("memory:stores"), save: (content, expectedModifiedAt) => call("memory:save", content, expectedModifiedAt), openStore: (id) => call("memory:open-store", id) },
  bots: {
    list: (options) => call("bots:list", options), get: (id) => call("bots:get", id), create: (data) => call("bots:create", data), update: (id, data) => call("bots:update", id, data), archive: (id) => call("bots:archive", id), restore: (id) => call("bots:restore", id),
    check: (id) => call("bots:check", id), checkAll: () => call("bots:check-all"), testMonitoring: (data) => call("bots:test-monitoring", data), verifyConnection: (botId, connectionId) => call("bots:verify-connection", botId, connectionId),
    activity: (id) => call("bots:activity", id), runs: (id) => call("bots:runs", id), upcoming: (limit) => call("bots:upcoming", limit), openSetup: (botId, connectionId, action) => call("bots:open-setup", botId, connectionId, action), openResource: (botId, kind) => call("bots:open-resource", botId, kind),
    link: (botId) => call("bots:link-get", botId), resetLink: (botId) => call("bots:link-reset", botId), createInstant: (data) => call("bots:factory-create-instant", data),
    connectorStatus: () => call("bots:connector-status"), setConnectorUrl: (url) => call("bots:connector-set-url", url), openConnectorPlatform: (url) => call("bots:connector-open-platform", url), createManaged: (data) => call("bots:factory-create-managed", data),
    startDiscordConnect: () => call("bots:discord-connect-start"), pollDiscordConnect: (pairing) => call("bots:discord-connect-poll", pairing),
    startTelegramAuth: () => call("bots:telegram-auth-start"), telegramAuthState: () => call("bots:telegram-auth-state"), submitTelegramPassword: (password) => call("bots:telegram-auth-password", password), cancelTelegramAuth: () => call("bots:telegram-auth-cancel"), logoutTelegram: () => call("bots:telegram-auth-logout"),
    factoryDefaults: () => call("bots:factory-defaults"), chooseFactoryParent: () => call("bots:factory-choose-parent"), openFactoryPlatform: (platform) => call("bots:factory-open-platform", platform), openFactoryInstall: (data) => call("bots:factory-open-install", data), createProject: (data) => call("bots:factory-create", data),
    provisioningStatus: () => call("bots:provisioning-status"), configureProvisioning: (data) => call("bots:provisioning-configure", data), beginProvisioning: (data) => call("bots:provisioning-begin", data), completeTelegramProvisioning: (data) => call("bots:provisioning-complete-telegram", data),
    processStatus: (botId) => call("bots:process-status", botId), startProcess: (botId) => call("bots:process-start", botId), stopProcess: (botId) => call("bots:process-stop", botId),
    onStatus: (handler) => { const listener = (_event, update) => handler(update); ipcRenderer.on("bots:status", listener); return () => ipcRenderer.removeListener("bots:status", listener); },
    onOpenLink: (handler) => { const listener = (_event, botId) => handler(botId); ipcRenderer.on("bots:open-link", listener); return () => ipcRenderer.removeListener("bots:open-link", listener); },
  },
  slashCommands: { list: () => call("slash-commands:list"), create: (data) => call("slash-commands:create", data), update: (id, data) => call("slash-commands:update", id, data), remove: (id) => call("slash-commands:remove", id) },
  projects: {
    list: () => call("projects:list"), syncWorkshop: () => call("projects:workshop-sync"),
    onUpdated: (handler) => { const listener = (_event, items) => handler(items); ipcRenderer.on("projects:updated", listener); return () => ipcRenderer.removeListener("projects:updated", listener); }, create: (data) => call("projects:create", data), update: (id, data) => call("projects:update", id, data), reorder: (ids) => call("projects:reorder", ids), move: (data) => call("projects:move", data), remove: (id) => call("projects:remove", id), logo: (id) => call("projects:logo", id),
    chooseFolder: () => call("projects:choose-folder"), chooseParent: () => call("projects:choose-parent"), inspect: (path) => call("projects:inspect", path), status: (root) => call("projects:status", root), diff: (data) => call("projects:diff", data),
    stage: (data) => call("projects:stage", data), unstage: (data) => call("projects:unstage", data), commit: (data) => call("projects:commit", data), push: (root) => call("projects:push", root), publish: (data) => call("projects:publish", data), fetch: (root) => call("projects:fetch", root),
    githubAuthStatus: () => call("projects:github-auth-status"), githubSignIn: () => call("projects:github-sign-in"), githubSetup: (data) => call("projects:github-setup", data),
    agentsRead: (root) => call("projects:agents-read", root), agentsWrite: (data) => call("projects:agents-write", data), readme: (root) => call("projects:readme", root), open: (data) => call("projects:open", data),
    tasks: { create: (projectId, data) => call("project-tasks:create", projectId, data), update: (id, data) => call("project-tasks:update", id, data), move: (data) => call("project-tasks:move", data), remove: (id) => call("project-tasks:remove", id) },
    canvas: { create: (projectId, data) => call("project-canvas:create", projectId, data), update: (id, data) => call("project-canvas:update", id, data), remove: (id) => call("project-canvas:remove", id) },
    assign: (projectId, data) => call("projects:assign", projectId, data),
    toolsStatus: (projectId) => call("projects:tools-status", projectId), toolInstall: (data) => call("projects:tool-install", data), toolUninstall: (data) => call("projects:tool-uninstall", data),
  },
  cepExtensions: { list: () => call("cep-extensions:list") },
  daily: { get: () => call("daily:get"), page: (date) => call("daily:page", date), month: (month) => call("daily:month", month), create: (data, date) => call("daily:create", data, date), update: (id, data, date) => call("daily:update", id, data, date), complete: (id, completed, date) => call("daily:complete", id, completed, date), remove: (id, date) => call("daily:remove", id, date), activityCreate: (data, date) => call("daily:activity-create", data, date), activityUpdate: (id, data) => call("daily:activity-update", id, data), activityRemove: (id) => call("daily:activity-remove", id) },
  folders: { list: () => call("folders:list"), create: (name) => call("folders:create", name), rename: (id, name) => call("folders:rename", id, name), remove: (id) => call("folders:remove", id) },
  tags: { list: () => call("tags:list") },
  compressions: { list: (noteId) => call("compressions:list", noteId), create: (data) => call("compressions:create", data) },
  compressor: { status: () => call("compressor:status"), start: () => call("compressor:start"), compress: (text, rate) => call("compressor:compress", text, rate) },
  settings: { get: () => call("settings:get"), set: (settings) => call("settings:set", settings), version: () => call("app:version"), export: (format) => call("data:export", format), import: () => call("data:import"), dataLocation: () => call("data:location") },
  backups: { list: () => call("backups:list"), create: () => call("backups:create"), restore: (name) => call("backups:restore", name) },
  githubSync: {
    status: () => call("github-sync:status"), signIn: () => call("github-sync:sign-in"), configure: (data) => call("github-sync:configure", data), sync: () => call("github-sync:sync"), push: (data) => call("github-sync:push", data), pull: (data) => call("github-sync:pull", data), open: () => call("github-sync:open"),
    onUpdated: (handler) => { const listener = (_event, update) => handler(update); ipcRenderer.on("github-sync:updated", listener); return () => ipcRenderer.removeListener("github-sync:updated", listener); },
  },
  clipboard: { writeText: (text) => call("clipboard:write-text", text), writeRich: (data) => call("clipboard:write-rich", data) },
  googleDocs: { create: () => call("docs:new") },
  hq: { ensure: () => call("hq:ensure") },
  mail: { show: () => call("mail:show"), hide: () => call("mail:hide"), reload: () => call("mail:reload"), openExternal: () => call("mail:open-external") },
  notion: { show: () => call("notion:show"), hide: () => call("notion:hide"), reload: () => call("notion:reload"), openExternal: () => call("notion:open-external") },
  twitter: { show: () => call("twitter:show"), hide: () => call("twitter:hide"), reload: () => call("twitter:reload"), openExternal: () => call("twitter:open-external") },
  excalidraw: { show: () => call("excalidraw:show"), hide: () => call("excalidraw:hide"), reload: () => call("excalidraw:reload"), openExternal: () => call("excalidraw:open-external") },
  ai: aiBridge,
  window: { hide: () => call("window:hide"), newNote: () => call("window:new-note") },
  voiceLog: { complete: () => call("voice-log:complete") },
  onNewInboxNote: (handler) => ipcRenderer.on("overlay:new-inbox", handler),
  onFocusEditor: (handler) => ipcRenderer.on("overlay:focus-editor", handler),
  onFlushEditor: (handler) => ipcRenderer.on("overlay:flush-editor", handler),
  onOverlayHiding: (handler) => ipcRenderer.on("overlay:hiding", handler),
  onOverlayShown: (handler) => ipcRenderer.on("overlay:shown", handler),
  onQuickVoiceLog: (handler) => { const listener = (_event, update) => handler(update); ipcRenderer.on("overlay:quick-voice-log", listener); return () => ipcRenderer.removeListener("overlay:quick-voice-log", listener); },
  onOpenMail: (handler) => { const listener = () => handler(); ipcRenderer.on("overlay:open-mail", listener); return () => ipcRenderer.removeListener("overlay:open-mail", listener); },
  onMailStatus: (handler) => { const listener = (_event, status) => handler(status); ipcRenderer.on("mail:status", listener); return () => ipcRenderer.removeListener("mail:status", listener); },
  onOpenNotion: (handler) => { const listener = () => handler(); ipcRenderer.on("overlay:open-notion", listener); return () => ipcRenderer.removeListener("overlay:open-notion", listener); },
  onNotionStatus: (handler) => { const listener = (_event, status) => handler(status); ipcRenderer.on("notion:status", listener); return () => ipcRenderer.removeListener("notion:status", listener); },
  onOpenTwitter: (handler) => { const listener = () => handler(); ipcRenderer.on("overlay:open-twitter", listener); return () => ipcRenderer.removeListener("overlay:open-twitter", listener); },
  onTwitterStatus: (handler) => { const listener = (_event, status) => handler(status); ipcRenderer.on("twitter:status", listener); return () => ipcRenderer.removeListener("twitter:status", listener); },
  onExcalidrawStatus: (handler) => { const listener = (_event, status) => handler(status); ipcRenderer.on("excalidraw:status", listener); return () => ipcRenderer.removeListener("excalidraw:status", listener); },
  onAiStatus: (id, handler) => {
    if (!AI_IDS.includes(id)) throw new Error("Unknown AI service.");
    const channel = `ai:${id}:status`;
    const listener = (_event, status) => handler(status);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
