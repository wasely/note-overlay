const assert = require("node:assert/strict");
const { LOGIN_ITEM_ARGS, syncStartAtLogin } = require("../src/main/startup.cjs");

const calls = [];
const app = {
  isPackaged: true,
  setLoginItemSettings(settings) { calls.push(settings); },
  getLoginItemSettings(options) { calls.push(options); return { openAtLogin: true, executableWillLaunchAtLogin: true }; },
};

const status = syncStartAtLogin(app, true, { path: "C:\\Apps\\Notebook.exe" });
assert.equal(status.executableWillLaunchAtLogin, true);
assert.deepEqual(calls[0], { openAtLogin: true, enabled: true, path: "C:\\Apps\\Notebook.exe", args: LOGIN_ITEM_ARGS, name: "Notebook" });
assert.deepEqual(calls[1], { path: "C:\\Apps\\Notebook.exe", args: LOGIN_ITEM_ARGS });

const developmentApp = { isPackaged: false };
assert.deepEqual(syncStartAtLogin(developmentApp, true), { skipped: true });
console.log("Startup registration regression tests passed.");
