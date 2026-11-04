function getShortcut(name, fallback) {
  try {
    const key = PREF_BRANCH + name;
    const value = Services.prefs.getStringPref(key, "");
    if (value.trim()) return value.trim();
    if (name.endsWith("-shortcut") && Services.prefs.prefHasUserValue?.(key)) return "";
    return fallback;
  } catch (error) {
    console.warn(`[Zen Page Skip] Could not read preference ${name}:`, error);
    return fallback;
  }
}

let cachedShortcuts = null;
let shortcutObserversRegistered = false;

function getShortcuts() {
  if (shortcutObserversRegistered && cachedShortcuts) return cachedShortcuts;
  const shortcuts = {
    next: getShortcut("next-shortcut", DEFAULT_NEXT_SHORTCUT),
    previous: getShortcut("previous-shortcut", DEFAULT_PREVIOUS_SHORTCUT),
    jump: getShortcut("jump-to-page-shortcut", DEFAULT_JUMP_SHORTCUT),
    toggleSite: getShortcut("toggle-site-shortcut", DEFAULT_TOGGLE_SITE_SHORTCUT),
    toggleTab: getShortcut("toggle-tab-shortcut", DEFAULT_TOGGLE_TAB_SHORTCUT)
  };
  if (shortcutObserversRegistered) cachedShortcuts = shortcuts;
  return shortcuts;
}

function observeShortcutPreferences() {
  if (typeof Services.prefs.addObserver !== "function") return;
  const names = ["next-shortcut", "previous-shortcut", "jump-to-page-shortcut", "toggle-site-shortcut", "toggle-tab-shortcut"].map((name) => PREF_BRANCH + name);
  const observer = {
    observe(_subject, topic, data) {
      if (topic === "nsPref:changed" && names.includes(data)) {
        cachedShortcuts = null;
        reportShortcutWarnings();
      }
    }
  };
  const registered = [];
  try {
    for (const name of names) {
      Services.prefs.addObserver(name, observer);
      registered.push(name);
    }
    shortcutObserversRegistered = true;
    window.addEventListener("unload", () => {
      for (const name of registered) Services.prefs.removeObserver(name, observer);
      shortcutObserversRegistered = false;
      cachedShortcuts = null;
    }, { once: true });
  } catch (error) {
    for (const name of registered) {
      try { Services.prefs.removeObserver(name, observer); } catch (removeError) {}
    }
    shortcutObserversRegistered = false;
    cachedShortcuts = null;
  }
}

function getDisabledSites() {
  try {
    return Services.prefs.getStringPref(PREF_BRANCH + "disabled-sites", "")
      .split(/[\n,]/)
      .map((site) => site.trim().toLowerCase())
      .filter(Boolean);
  } catch (error) {
    return [];
  }
}

function getCooldownMs() {
  const value = Number(getShortcut("cooldown-ms", "400"));
  if (!Number.isFinite(value)) return 400;
  return Math.min(Math.max(Math.round(value), 0), 5000);
}

function isCooldownActive() {
  const now = Date.now();
  if (now - lastShortcutAt < getCooldownMs()) return true;
  lastShortcutAt = now;
  return false;
}

function getToastEnabled() {
  try {
    return Services.prefs.getBoolPref(PREF_BRANCH + "toast-enabled", true);
  } catch (error) {
    return true;
  }
}

function getToastDuration() {
  try {
    const value = Services.prefs.getIntPref(PREF_BRANCH + "toast-duration-ms", TOAST_DURATION_MS);
    return Math.min(Math.max(value, 500), 10000);
  } catch (error) {
    return TOAST_DURATION_MS;
  }
}

