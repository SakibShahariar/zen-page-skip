"use strict";

const PREF_BRANCH = "zen-page-skip.";
const DEFAULT_NEXT_SHORTCUT = "Alt+]";
const DEFAULT_PREVIOUS_SHORTCUT = "Alt+[";

const NEXT_TEXT = ["next", "next page", "go to next page", "older", "older posts", "siguiente", "siguiente página", "suivant", "prochain", "weiter", "nächste", "próximo", "próxima", "下一页", "下页", "次へ", "次のページ", "다음", "다음 페이지", "التالي", "الصفحة التالية", "следующая", "следующий", "следующая страница", "następna", "następna strona", "volgende", "pagina successiva", "prossimo"];
const PREVIOUS_TEXT = ["previous", "prev", "previous page", "go to previous page", "newer", "newer posts", "anterior", "página anterior", "précédent", "précédente", "zurück", "vorherige", "上一页", "前一页", "前へ", "前のページ", "이전", "이전 페이지", "السابق", "الصفحة السابقة", "предыдущая", "предыдущий", "предыдущая страница", "poprzednia", "poprzednia strona", "vorige", "pagina precedente", "precedente"];
const NEXT_SYMBOLS = [">", "»", "›", "→"];
const PREVIOUS_SYMBOLS = ["<", "«", "‹", "←"];

const PAGE_PATTERNS = [
  { regex: /([?&])page=(\d+)/i, build: (url, page) => url.replace(/([?&])page=\d+/i, `$1page=${page}`) },
  { regex: /([?&])p=(\d+)/i, build: (url, page) => url.replace(/([?&])p=\d+/i, `$1p=${page}`) },
  { regex: /\/page\/(\d+)/i, build: (url, page) => url.replace(/\/page\/\d+/i, `/page/${page}`) },
  { regex: /#page=(\d+)/i, build: (url, page) => url.replace(/#page=\d+/i, `#page=${page}`) }
];

function getNumberedPageUrl(url, direction) {
  for (const pattern of PAGE_PATTERNS) {
    const match = url.match(pattern.regex);
    if (!match) continue;
    const nextPage = Number.parseInt(match[2], 10) + direction;
    if (!Number.isSafeInteger(nextPage) || nextPage < 1) return null;
    const candidate = pattern.build(url, nextPage);
    return candidate !== url ? candidate : null;
  }
  return null;
}

let lastShortcutAt = 0;

const TOAST_ID = "zen-page-skip-toast";
const TOAST_DURATION_MS = 1800;

function getShortcut(name, fallback) {
  try {
    const value = Services.prefs.getStringPref(PREF_BRANCH + name, "");
    return value.trim() || fallback;
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
    previous: getShortcut("previous-shortcut", DEFAULT_PREVIOUS_SHORTCUT)
  };
  if (shortcutObserversRegistered) cachedShortcuts = shortcuts;
  return shortcuts;
}

function observeShortcutPreferences() {
  if (typeof Services.prefs.addObserver !== "function") return;
  const names = ["next-shortcut", "previous-shortcut"].map((name) => PREF_BRANCH + name);
  const observer = {
    observe(_subject, topic, data) {
      if (topic === "nsPref:changed" && names.includes(data)) cachedShortcuts = null;
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

function getDebugEnabled() {
  try {
    return Services.prefs.getBoolPref(PREF_BRANCH + "debug-mode", false);
  } catch (error) {
    return false;
  }
}

const diagnosticEntries = [];
function debugLog(event, details = {}) {
  if (!getDebugEnabled()) return;
  const entry = `${Date.now()} ${event} ${JSON.stringify(details)}`;
  diagnosticEntries.push(entry);
  if (diagnosticEntries.length > 100) diagnosticEntries.shift();
  console.debug("[Zen Page Skip]", entry);
}

function getDiagnostics() {
  return diagnosticEntries.join("\n");
}

window.zenPageSkipGetDiagnostics = getDiagnostics;
window.addEventListener("unload", () => {
  if (window.zenPageSkipGetDiagnostics === getDiagnostics) delete window.zenPageSkipGetDiagnostics;
}, { once: true });

function getPaginationWords(direction) {
  const defaults = direction === 1 ? NEXT_TEXT : PREVIOUS_TEXT;
  const preference = direction === 1 ? "next-words" : "previous-words";
  try {
    const custom = Services.prefs.getStringPref(PREF_BRANCH + preference, "")
      .split(String.fromCharCode(10))
      .flatMap((line) => line.split(","))
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 100);
    return [...new Set([...defaults, ...custom])];
  } catch (error) {
    return defaults;
  }
}

function getConfidenceThreshold() {
  try {
    const value = Services.prefs.getIntPref(PREF_BRANCH + "confidence-threshold", 70);
    return Math.min(Math.max(value, 50), 150);
  } catch (error) {
    return 70;
  }
}

function getExcludedSelectors() {
  try {
    return Services.prefs.getStringPref(PREF_BRANCH + "excluded-selectors", "")
      .split(String.fromCharCode(10))
      .map((selector) => selector.trim())
      .filter(Boolean)
      .slice(0, 25);
  } catch (error) {
    return [];
  }
}

function isExcludedByUserSelector(element, document) {
  for (const selector of getExcludedSelectors()) {
    try {
      if (element.matches(selector) || element.closest(selector)) return true;
    } catch (error) {
      // Ignore invalid selectors without disabling the remaining rules.
    }
  }
  return false;
}

function isSiteDisabled(url) {
  let hostname;
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch (error) {
    return false;
  }

  return getDisabledSites().some((rule) => {
    const wildcard = rule.startsWith("*.");
    const host = (wildcard ? rule.slice(2) : rule).replace(/\.$/, "");
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(host)) return false;
    return wildcard ? hostname !== host && hostname.endsWith("." + host) : hostname === host;
  });
}

function getActiveTab() {
  return window.gBrowser?.selectedTab ?? null;
}

function getCurrentUrl() {
  try {
    return getActiveTab()?.linkedBrowser?.currentURI?.spec ?? null;
  } catch (error) {
    return null;
  }
}

function getPageDocument() {
  try {
    return getActiveTab()?.linkedBrowser?.contentDocument ?? null;
  } catch (error) {
    return null;
  }
}

function normalizedText(element) {
  return (element?.getAttribute("aria-label") || element?.getAttribute("title") || element?.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function hasRel(element, direction) {
  const rel = (element?.getAttribute("rel") || "").toLowerCase().split(/\s+/);
  return direction === 1 ? rel.includes("next") : rel.includes("prev") || rel.includes("previous");
}

function matchesWords(text, words) {
  return words.includes(text);
}

function isDisabled(element) {
  return element.hasAttribute("disabled") ||
    element.getAttribute("aria-disabled") === "true" ||
    element.getAttribute("aria-current") === "page" ||
    element.classList?.contains("disabled") === true;
}

function isInPaginationContext(element) {
  return Boolean(element.closest('nav, [role="navigation"], [class*="pagination"], [id*="pagination"], [class*="pager"], [id*="pager"]'));
}

function isSafeNavigationControl(element) {
  const tag = element.tagName?.toLowerCase();
  const role = element.getAttribute("role");
  if (!["a", "button"].includes(tag) && role !== "button") return false;
  if (isDisabled(element) || element.hasAttribute("download")) return false;
  if (tag !== "a" && element.closest("form")) return false;
  if (element.getAttribute("aria-haspopup") || element.getAttribute("aria-expanded") === "true") return false;
  if (["dialog", "menuitem", "menuitemcheckbox", "menuitemradio"].includes(role)) return false;
  if (element.closest('dialog, [role="dialog"]')) return false;

  const label = normalizedText(element);
  const destructiveLabels = ["delete", "remove", "unsubscribe", "purchase", "buy", "pay", "submit", "confirm", "cancel", "logout", "log out", "sign out", "archive"];
  if (destructiveLabels.some((word) => label === word || label.startsWith(word + " ") || label.endsWith(" " + word))) return false;

  if (tag === "a") {
    const href = element.getAttribute("href")?.trim();
    return Boolean(href) && !/^(?:javascript|data|vbscript):/i.test(href);
  }

  return isInPaginationContext(element) && element.getAttribute("type")?.toLowerCase() !== "submit";
}

function findRelPaginationUrl(direction, document, currentUrl) {
  try {
    for (const link of Array.from(document.querySelectorAll('link[rel]'))) {
      if (!hasRel(link, direction) || isDisabled(link)) continue;
      const href = link.getAttribute("href")?.trim();
      if (!href || /^(?:javascript|data|vbscript):/i.test(href)) continue;
      const target = new URL(href, document.baseURI || currentUrl);
      if (["http:", "https:"].includes(target.protocol) && target.href !== currentUrl) return target.href;
    }
  } catch (error) {
    return null;
  }
  return null;
}

function findPaginationControl(direction) {
  const document = getPageDocument();
  if (!document) return null;

  const words = getPaginationWords(direction);
  const symbols = direction === 1 ? NEXT_SYMBOLS : PREVIOUS_SYMBOLS;
  const candidates = Array.from(document.querySelectorAll('a, button, [role="button"]'));
  const scored = [];
  const threshold = getConfidenceThreshold();

  for (const element of candidates) {
    const text = normalizedText(element);
    if (!isSafeNavigationControl(element)) {
      debugLog("candidate-rejected", { label: text, reason: "unsafe-control" });
      continue;
    }
    if (isExcludedByUserSelector(element, document)) {
      debugLog("candidate-rejected", { label: text, reason: "user-excluded-selector" });
      continue;
    }

    const exactLabel = matchesWords(text, words);
    const symbolLabel = symbols.includes(text);
    const inPagination = isInPaginationContext(element);
    const rel = hasRel(element, direction);
    const metadata = `${element.className || ""} ${element.id || ""}`.toLowerCase();
    const directionalMetadata = new RegExp(direction === 1 ? "(?:^|[-_ ])next(?:$|[-_ ])" : "(?:^|[-_ ])(?:prev|previous)(?:$|[-_ ])").test(metadata);
    const specificLabel = text.includes("page");

    if (!rel && !inPagination && !directionalMetadata && !specificLabel) {
      debugLog("candidate-rejected", { label: text, reason: "no-pagination-context" });
      continue;
    }
    if (!exactLabel && !symbolLabel && !rel && !directionalMetadata) {
      debugLog("candidate-rejected", { label: text, reason: "no-directional-signal" });
      continue;
    }

    let score = 0;
    if (rel) score += 120;
    if (exactLabel) score += specificLabel ? 70 : 45;
    if (symbolLabel) score += 35;
    if (inPagination) score += 35;
    if (directionalMetadata) score += 25;
    if (element.tagName === "A" && element.getAttribute("href")) score += 10;
    const accepted = score >= threshold;
    debugLog("candidate-scored", { label: text, tag: element.tagName, score, threshold, accepted });
    if (accepted) scored.push({ element, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const selected = scored[0]?.element ?? null;
  debugLog(selected ? "control-selected" : "no-control-selected", selected ? { label: normalizedText(selected), tag: selected.tagName } : {});
  return selected;
}

function showToast(message) {
  if (!getToastEnabled()) return;

  try {
    // Zen's current showToast API requires a Fluent message ID, not a raw label.
    // Use the browser notification box for this mod's dynamic messages.
    const notificationBox = window.gBrowser.getNotificationBox();
    notificationBox.getNotificationWithValue(TOAST_ID)?.close();
    const notification = notificationBox.appendNotification(TOAST_ID, {
      label: message,
      priority: notificationBox.PRIORITY_INFO_MEDIUM
    });
    window.setTimeout(() => notification?.close(), getToastDuration());
  } catch (error) {
    console.warn("[Zen Page Skip] Notification unavailable:", error);
  }
}

function getNavigationCompatibility(tab) {
  const browser = tab?.linkedBrowser;
  const missing = [];
  if (!browser) missing.push("selected tab browser");
  if (typeof Services.scriptSecurityManager?.getSystemPrincipal !== "function") missing.push("system principal API");
  if (typeof browser?.loadURI !== "function" && typeof browser?.fixupAndLoadURIString !== "function") {
    missing.push("browser URI navigation API");
  }
  if (typeof browser?.loadURI === "function" &&
      typeof Services.io?.newURI !== "function" &&
      typeof browser?.fixupAndLoadURIString !== "function") {
    missing.push("URI construction API");
  }
  return { compatible: missing.length === 0, missing };
}

function navigate(tab, url) {
  const browser = tab?.linkedBrowser;
  const compatibility = getNavigationCompatibility(tab);
  if (!compatibility.compatible) {
    debugLog("navigation-api-unavailable", { missing: compatibility.missing });
    return false;
  }

  const principal = Services.scriptSecurityManager.getSystemPrincipal();
  const options = { triggeringPrincipal: principal };
  try {
    if (typeof browser.loadURI === "function") {
      browser.loadURI(Services.io.newURI(url), options);
      return true;
    }
  } catch (error) {
    debugLog("loadURI-failed", { message: String(error) });
  }

  try {
    if (typeof browser.fixupAndLoadURIString === "function") {
      browser.fixupAndLoadURIString(url, options);
      return true;
    }
  } catch (error) {
    debugLog("fixup-navigation-failed", { message: String(error) });
  }
  return false;
}

function jump(direction) {
  debugLog("navigation-requested", { direction: direction === 1 ? "next" : "previous" });
  const tab = getActiveTab();
  const url = getCurrentUrl();

  if (!tab || !url) {
    debugLog("navigation-aborted", { reason: "no-active-page" });
    showToast("No active page");
    return;
  }

  if (isSiteDisabled(url)) {
    debugLog("navigation-aborted", { reason: "site-disabled", host: new URL(url).hostname });
    showToast("Zen Page Skip disabled on this site");
    return;
  }

  const document = getPageDocument();
  if (document) {
    const relUrl = findRelPaginationUrl(direction, document, url);
    if (relUrl) {
      debugLog("head-rel-navigation", { target: new URL(relUrl).origin + new URL(relUrl).pathname });
      if (!navigate(tab, relUrl)) {
        showToast("Navigation unavailable in this browser");
        return;
      }
      showToast(direction === 1 ? "Going to next page" : "Going to previous page");
      return;
    }
  }

  const control = findPaginationControl(direction);

  if (control) {
    control.scrollIntoView({ block: "nearest", behavior: "instant" });
    try {
      control.click();
      showToast(direction === 1 ? "Going to next page" : "Going to previous page");
    } catch (error) {
      debugLog("control-click-failed", { message: String(error) });
      showToast("Pagination control could not be activated");
    }
    return;
  }

  const nextUrl = getNumberedPageUrl(url, direction);

  if (nextUrl) {
    debugLog("url-fallback", { target: new URL(nextUrl).origin + new URL(nextUrl).pathname });
    if (!navigate(tab, nextUrl)) {
      showToast("Navigation unavailable in this browser");
      return;
    }
    showToast(direction === 1 ? "Going to next page" : "Going to previous page");
    return;
  }

  debugLog("navigation-aborted", { reason: "no-pagination-target" });
  showToast(direction === 1 ? "No next page found" : "No previous page found");
}

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
  }
}

observeShortcutPreferences();
window.addEventListener("keydown", onKeyDown, true);
