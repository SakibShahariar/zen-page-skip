"use strict";

const PREF_BRANCH = "zen-page-skip.";
const DEFAULT_NEXT_SHORTCUT = "Alt+]";
const DEFAULT_PREVIOUS_SHORTCUT = "Alt+[";

const NEXT_TEXT = ["next", "next page", "go to next page", "older", "older posts", "forward", "continue"];
const PREVIOUS_TEXT = ["previous", "prev", "previous page", "go to previous page", "newer", "newer posts", "back"];
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

function getShortcuts() {
  return {
    next: getShortcut("next-shortcut", DEFAULT_NEXT_SHORTCUT),
    previous: getShortcut("previous-shortcut", DEFAULT_PREVIOUS_SHORTCUT)
  };
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
  return getActiveTab()?.linkedBrowser?.currentURI?.spec ?? null;
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
  if (!["a", "button"].includes(tag) && element.getAttribute("role") !== "button") return false;
  if (isDisabled(element) || element.hasAttribute("download")) return false;
  if (element.closest("form") || element.getAttribute("aria-haspopup") || element.getAttribute("aria-expanded") === "true") return false;
  if (["menuitem", "menuitemcheckbox", "menuitemradio"].includes(element.getAttribute("role"))) return false;

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

  const words = direction === 1 ? NEXT_TEXT : PREVIOUS_TEXT;
  const symbols = direction === 1 ? NEXT_SYMBOLS : PREVIOUS_SYMBOLS;
  const candidates = Array.from(document.querySelectorAll('a, button, [role="button"]'));
  const scored = [];

  for (const element of candidates) {
    if (!isSafeNavigationControl(element)) continue;

    const text = normalizedText(element);
    const exactLabel = matchesWords(text, words);
    const symbolLabel = symbols.includes(text);
    const inPagination = isInPaginationContext(element);
    const rel = hasRel(element, direction);
    const metadata = `${element.className || ""} ${element.id || ""}`.toLowerCase();
    const directionalMetadata = new RegExp(direction === 1 ? "(?:^|[-_ ])next(?:$|[-_ ])" : "(?:^|[-_ ])(?:prev|previous)(?:$|[-_ ])").test(metadata);
    const specificLabel = text.includes("page");

    if (!rel && !inPagination && !directionalMetadata && !specificLabel) continue;
    if (!exactLabel && !symbolLabel && !rel && !directionalMetadata) continue;

    let score = 0;
    if (rel) score += 120;
    if (exactLabel) score += specificLabel ? 70 : 45;
    if (symbolLabel) score += 35;
    if (inPagination) score += 35;
    if (directionalMetadata) score += 25;
    if (element.tagName === "A" && element.getAttribute("href")) score += 10;
    if (score >= 70) scored.push({ element, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.element ?? null;
}

function showToast(message) {
  try {
    const zenUI = window.gZenUIManager;
    if (typeof zenUI?.showToast === "function") {
      zenUI.showToast({ label: message });
      return;
    }
    if (typeof zenUI?.toast === "function") {
      zenUI.toast(message);
      return;
    }
  } catch (error) {
    console.warn("[Zen Page Skip] Zen toast unavailable:", error);
  }

  try {
    const notificationBox = window.gBrowser.getNotificationBox();
    notificationBox.getNotificationWithValue(TOAST_ID)?.close();
    const notification = notificationBox.appendNotification(TOAST_ID, {
      label: message,
      priority: notificationBox.PRIORITY_INFO_MEDIUM
    });
    window.setTimeout(() => notification?.close(), TOAST_DURATION_MS);
  } catch (error) {
    console.warn("[Zen Page Skip] Notification unavailable:", error);
  }
}

function navigate(tab, url) {
  const browser = tab.linkedBrowser;
  const principal = Services.scriptSecurityManager.getSystemPrincipal();
  try {
    browser.loadURI(Services.io.newURI(url), { triggeringPrincipal: principal });
  } catch (error) {
    browser.fixupAndLoadURIString(url, { triggeringPrincipal: principal });
  }
}

function jump(direction) {
  const tab = getActiveTab();
  const url = getCurrentUrl();

  if (!tab || !url) {
    showToast("No active page");
    return;
  }

  if (isSiteDisabled(url)) {
    showToast("Zen Page Skip disabled on this site");
    return;
  }

  const document = getPageDocument();
  if (document) {
    const relUrl = findRelPaginationUrl(direction, document, url);
    if (relUrl) {
      navigate(tab, relUrl);
      showToast(direction === 1 ? "Going to next page" : "Going to previous page");
      return;
    }
  }

  const control = findPaginationControl(direction);

  if (control) {
    control.scrollIntoView({ block: "nearest", behavior: "instant" });
    control.click();
    showToast(direction === 1 ? "Going to next page" : "Going to previous page");
    return;
  }

  const nextUrl = getNumberedPageUrl(url, direction);

  if (nextUrl) {
    navigate(tab, nextUrl);
    showToast(direction === 1 ? "Going to next page" : "Going to previous page");
    return;
  }

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
    event.preventDefault();
    event.stopPropagation();
    jump(1);
    return;
  }

  if (matches(event, shortcuts.previous)) {
    event.preventDefault();
    event.stopPropagation();
    jump(-1);
  }
}

window.addEventListener("keydown", onKeyDown, true);
