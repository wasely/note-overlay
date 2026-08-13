const assert = require("node:assert/strict");
const { createHotkeyManager } = require("../src/main/hotkey-manager.cjs");

function fakeGlobalShortcut(blocked = []) {
  const registered = new Set();
  const unavailable = new Set(blocked);
  return {
    register(accelerator) { if (unavailable.has(accelerator) || registered.has(accelerator)) return false; registered.add(accelerator); return true; },
    unregister(accelerator) { registered.delete(accelerator); },
    isRegistered(accelerator) { return registered.has(accelerator); },
    block(accelerator) { unavailable.add(accelerator); registered.delete(accelerator); },
    unblock(accelerator) { unavailable.delete(accelerator); },
    registered,
  };
}

const preferred = "Control+Alt+Shift+N";
const fallback = "Control+Alt+N";

{
  const shortcuts = fakeGlobalShortcut();
  const manager = createHotkeyManager({ globalShortcut: shortcuts, onTriggered() {}, fallbacks: [fallback] });
  assert.equal(manager.start(preferred), preferred);
  assert.deepEqual([...shortcuts.registered], [preferred]);
}

{
  const shortcuts = fakeGlobalShortcut([preferred]);
  const manager = createHotkeyManager({ globalShortcut: shortcuts, onTriggered() {}, fallbacks: [fallback] });
  assert.equal(manager.start(preferred), fallback);
  shortcuts.unblock(preferred);
  assert.equal(manager.repair(), preferred);
  assert.deepEqual([...shortcuts.registered], [preferred]);
}

{
  const shortcuts = fakeGlobalShortcut(["F9"]);
  const manager = createHotkeyManager({ globalShortcut: shortcuts, onTriggered() {}, fallbacks: [fallback] });
  manager.start(preferred);
  assert.equal(manager.setPreferred("F9"), false);
  assert.equal(manager.getActive(), preferred);
  assert.equal(manager.getPreferred(), preferred);
}

{
  const shortcuts = fakeGlobalShortcut();
  const manager = createHotkeyManager({ globalShortcut: shortcuts, onTriggered() {}, fallbacks: [fallback] });
  manager.start(preferred);
  shortcuts.block(preferred);
  assert.equal(manager.repair(), fallback);
}

console.log("Hotkey recovery regression tests passed.");
