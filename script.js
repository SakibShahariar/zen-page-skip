"use strict";

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

const TOAST_ID = "zen-page-skip-toast";
const TOAST_DURATION_MS = 1800;

function getActiveTab() {
  return window.gBrowser?.selectedTab ?? null;
}

function getCurrentUrl() {
  return getActiveTab()?.linkedBrowser?.currentURI?.spec ?? null;
}

function getPageDocument() {
  return getActiveTab()?.linkedBrowser?.contentDocument ?? null;
}

function normalizedText(element) {
  return (element?.getAttribute("aria-label") || element?.getAttribute("title") || element?.textContent || "").trim().toLowerCase();
}

function hasRel(element, direction) {
  const rel = (element?.getAttribute("rel") || "").toLowerCase().split(/\s+/);
  return direction === 1 ? rel.includes("next") : rel.includes("prev") || rel.includes("previous");
}

function matchesWords(text, words) {
  return words.some((word) => text === word || text.includes(word));
}

function isDisabled(element) {
  return element.getAttribute("aria-disabled") === "true" || element.hasAttribute("disabled") || element.classList.contains("disabled") || element.getAttribute("aria-current") === "page";
}

function isInPaginationContext(element) {
  return Boolean(element.closest('nav, [role="navigation"], [class*="pagination"], [id*="pagination"], [class*="pager"], [id*="pager"]'));
}

function findPaginationControl(direction) {
  const document = getPageDocument();
  if (!document) return null;

  const words = direction === 1 ? NEXT_TEXT : PREVIOUS_TEXT;
  const symbols = direction === 1 ? NEXT_SYMBOLS : PREVIOUS_SYMBOLS;
  const candidates = Array.from(document.querySelectorAll('a, button, [role="button"]'));
  const scored = [];

  for (const element of candidates) {
    if (isDisabled(element)) continue;

    const text = normalizedText(element);
    let score = 0;

    if (hasRel(element, direction)) score += 100;
    if (matchesWords(text, words)) score += text.includes("page") ? 60 : 40;
    if (symbols.includes(text)) score += 30;
    if (isInPaginationContext(element)) score += 25;

    const metadata = `${element.className || ""} ${element.id || ""}`.toLowerCase();
    if (metadata.includes(direction === 1 ? "next" : "prev")) score += 20;
    if (element.tagName === "A" && element.getAttribute("href")) score += 10;

    if (score >= 40) scored.push({ element, score });
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

  const control = findPaginationControl(direction);

  if (control) {
    control.scrollIntoView({ block: "nearest", behavior: "instant" });
    control.click();
    showToast(direction === 1 ? "Going to next page" : "Going to previous page");
    return;
  }

  let nextUrl = null;

  for (const item of PAGE_PATTERNS) {
    const match = url.match(item.regex);
    if (!match) continue;

    const nextPage = Number.parseInt(match[2], 10) + direction;
    if (nextPage < 1) break;

    const candidate = item.build(url, nextPage);
    if (candidate !== url) {
      nextUrl = candidate;
      break;
    }
  }

  if (nextUrl) {
    navigate(tab, nextUrl);
    showToast(direction === 1 ? "Going to next page" : "Going to previous page");
    return;
  }

  showToast(direction === 1 ? "No next page found" : "No previous page found");
}

function isEditable(target) {
  const tag = target?.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable === true;
}

function matches(event, shortcut) {
  const parts = shortcut.split("+").map((part) => part.trim().toLowerCase()).filter(Boolean);
  const key = parts.at(-1);
  const wantsAlt = parts.includes("alt");
  const wantsCtrl = parts.includes("ctrl") || parts.includes("cmd");
  const wantsShift = parts.includes("shift");
  const keyMatches = event.key?.toLowerCase() === key || (key === "]" && event.code === "BracketRight") || (key === "[" && event.code === "BracketLeft");

  return keyMatches && event.altKey === wantsAlt && (event.ctrlKey || event.metaKey) === wantsCtrl && event.shiftKey === wantsShift;
}

function onKeyDown(event) {
  if (isEditable(event.target)) return;

  if (matches(event, "Alt+]")) {
    event.preventDefault();
    event.stopPropagation();
    jump(1);
    return;
  }

  if (matches(event, "Alt+[")) {
    event.preventDefault();
    event.stopPropagation();
    jump(-1);
  }
}

window.addEventListener("keydown", onKeyDown, true);
