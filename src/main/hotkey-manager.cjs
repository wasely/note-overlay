function createHotkeyManager({ globalShortcut, onTriggered, fallbacks = [], onChange = () => {}, logger = console }) {
  let preferred = null;
  let active = null;

  function candidates() {
    return [...new Set([preferred, ...fallbacks].filter(Boolean))];
  }

  function register(accelerator) {
    try { return globalShortcut.register(accelerator, onTriggered); }
    catch (error) { logger.error(`Could not register ${accelerator}: ${error.message}`); return false; }
  }

  function setActive(accelerator) {
    if (active === accelerator) return;
    active = accelerator;
    onChange(active, preferred);
  }

  function repair() {
    if (active && !globalShortcut.isRegistered(active)) setActive(null);
    if (active === preferred) return active;

    if (preferred && register(preferred)) {
      const previous = active;
      setActive(preferred);
      if (previous && previous !== preferred) globalShortcut.unregister(previous);
      return active;
    }

    if (!active) {
      for (const accelerator of candidates().slice(1)) {
        if (register(accelerator)) { setActive(accelerator); break; }
      }
    }
    return active;
  }

  function start(accelerator) {
    preferred = accelerator;
    return repair();
  }

  function setPreferred(accelerator) {
    if (accelerator === preferred) return Boolean(repair());
    if (accelerator === active && globalShortcut.isRegistered(accelerator)) {
      preferred = accelerator;
      onChange(active, preferred);
      return true;
    }
    if (!register(accelerator)) return false;
    const previous = active;
    preferred = accelerator;
    setActive(accelerator);
    if (previous && previous !== accelerator) globalShortcut.unregister(previous);
    return true;
  }

  function stop() {
    if (active) globalShortcut.unregister(active);
    setActive(null);
  }

  return { start, repair, setPreferred, stop, getActive: () => active, getPreferred: () => preferred };
}

function shouldHideOverlay(window) {
  return Boolean(window && !window.isDestroyed() && window.isVisible() && window.isFocused());
}

module.exports = { createHotkeyManager, shouldHideOverlay };
