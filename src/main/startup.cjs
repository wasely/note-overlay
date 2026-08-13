const LOGIN_ITEM_ARGS = ["--background"];
const LOGIN_ITEM_NAME = "Notebook";

function syncStartAtLogin(app, enabled, options = {}) {
  if (!app.isPackaged || process.env.NOTEBOOK_DISABLE_STARTUP_REGISTRATION === "1") return { skipped: true };
  const path = options.path || process.execPath;
  const args = options.args || LOGIN_ITEM_ARGS;
  const name = options.name || LOGIN_ITEM_NAME;
  const openAtLogin = Boolean(enabled);
  app.setLoginItemSettings({ openAtLogin, enabled: openAtLogin, path, args, name });
  return app.getLoginItemSettings({ path, args });
}

module.exports = { LOGIN_ITEM_ARGS, LOGIN_ITEM_NAME, syncStartAtLogin };
