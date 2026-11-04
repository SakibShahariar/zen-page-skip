function isEditable(target) {
  if (target?.ownerDocument?.designMode?.toLowerCase() === "on" || target?.isContentEditable === true) return true;
  try {
    if (target?.closest?.('[contenteditable]:not([contenteditable="false"])')) return true;
  } catch (error) {
    return true;
  }
  const tag = target?.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

function parseShortcut(shortcut) {
  if (typeof shortcut !== "string" || !shortcut.trim()) return null;
  const parts = shortcut.split("+").map((part) => part.trim().toLowerCase());
  if (parts.some((part) => !part)) return null;

  const modifiers = {
    ctrl: ["ctrl", "control"],
    alt: ["alt", "option"],
    shift: ["shift"],
    meta: ["meta", "cmd", "command", "super", "win", "windows"]
  };
  const parsed = { ctrl: false, alt: false, shift: false, meta: false, key: "" };
  for (const part of parts.slice(0, -1)) {
    const modifier = Object.keys(modifiers).find((name) => modifiers[name].includes(part));
    if (!modifier || parsed[modifier]) return null;
    parsed[modifier] = true;
  }

  const aliases = {
    esc: "escape", return: "enter", spacebar: " ", space: " ",
    left: "arrowleft", right: "arrowright", up: "arrowup", down: "arrowdown"
  };
  parsed.key = aliases[parts.at(-1)] || parts.at(-1);
  if (["ctrl", "control", "alt", "option", "shift", "meta", "cmd", "command", "super", "win", "windows"].includes(parsed.key)) return null;
  return parsed;
}

function shortcutSignature(shortcut) {
  const parsed = parseShortcut(shortcut);
  return parsed ? JSON.stringify(parsed) : null;
}

function getShortcutWarnings() {
  const shortcuts = getShortcuts();
  const entries = [
    ["next-page", shortcuts.next],
    ["previous-page", shortcuts.previous],
    ["jump-to-page", shortcuts.jump],
    ["toggle-current-site", shortcuts.toggleSite],
    ["toggle-current-tab", shortcuts.toggleTab]
  ];
  const warnings = [];
  for (const entry of entries) {
    if (entry[1] && !parseShortcut(entry[1])) warnings.push("Invalid " + entry[0] + " shortcut: " + entry[1]);
  }
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const first = shortcutSignature(entries[i][1]);
      const second = shortcutSignature(entries[j][1]);
      if (first && first === second) warnings.push(entries[i][0] + " and " + entries[j][0] + " shortcuts are identical.");
    }
  }
  const reserved = [
    "Ctrl+T", "Ctrl+W", "Ctrl+N", "Ctrl+Q", "Ctrl+L", "Ctrl+R", "Ctrl+F", "Ctrl+H", "Ctrl+J",
    "Ctrl+Shift+T", "Ctrl+Shift+P", "Ctrl+Tab", "Ctrl+Shift+Tab", "Alt+Left", "Alt+Right",
    "Meta+T", "Meta+W", "Meta+N", "Meta+Q", "Meta+L", "Meta+R", "Meta+F", "Meta+H", "Meta+J",
    "Meta+Shift+T", "Meta+Shift+P"
  ];
  const reservedSignatures = new Set(reserved.map(shortcutSignature));
  for (const entry of entries) {
    const signature = shortcutSignature(entry[1]);
    if (signature && reservedSignatures.has(signature)) warnings.push(entry[0] + " shortcut " + entry[1] + " conflicts with a common browser shortcut.");
  }
  return warnings;
}
function reportShortcutWarnings() {
  for (const warning of getShortcutWarnings()) console.warn("[Zen Page Skip]", warning);
}

window.zenPageSkipGetShortcutWarnings = getShortcutWarnings;
window.addEventListener("unload", () => {
  if (window.zenPageSkipGetShortcutWarnings === getShortcutWarnings) delete window.zenPageSkipGetShortcutWarnings;
}, { once: true });

function matches(event, shortcut) {
  const parsed = parseShortcut(shortcut);
  if (!parsed) return false;
  const eventKey = event.key?.toLowerCase();
  const keyMatches = eventKey === parsed.key ||
    (parsed.key === "]" && event.code === "BracketRight") ||
    (parsed.key === "[" && event.code === "BracketLeft");
  return keyMatches &&
    event.altKey === parsed.alt &&
    event.ctrlKey === parsed.ctrl &&
    event.metaKey === parsed.meta &&
    event.shiftKey === parsed.shift;
}

function onKeyDown(event) {
  if (event.isComposing || event.repeat || isEditable(event.target)) return;

  const shortcuts = getShortcuts();

  if (matches(event, shortcuts.next)) {
    if (isCooldownActive()) return;
    event.preventDefault();
    event.stopPropagation();
    jump(1);
    return;
  }

  if (matches(event, shortcuts.previous)) {
    if (isCooldownActive()) return;
    event.preventDefault();
    event.stopPropagation();
    jump(-1);
    return;
  }

  if (matches(event, shortcuts.jump)) {
    if (isCooldownActive()) return;
    event.preventDefault();
    event.stopPropagation();
    jumpToPage();
    return;
  }

  if (matches(event, shortcuts.toggleSite)) {
    if (isCooldownActive()) return;
    event.preventDefault();
    event.stopPropagation();
    toggleCurrentSite();
    return;
  }

  if (matches(event, shortcuts.toggleTab)) {
    if (isCooldownActive()) return;
    event.preventDefault();
    event.stopPropagation();
    toggleCurrentTabPause();
  }
}

observeShortcutPreferences();
reportShortcutWarnings();
window.addEventListener("keydown", onKeyDown, true);
