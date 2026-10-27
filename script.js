"use strict";

const PAGE_PATTERNS = [
  {
    regex: /([?&])page=(\d+)/i,
    build: (url, page) => url.replace(/([?&])page=\d+/i, `$1page=${page}`)
  },
  {
    regex: /([?&])p=(\d+)/i,
    build: (url, page) => url.replace(/([?&])p=\d+/i, `$1p=${page}`)
  },
  {
    regex: /\/page\/(\d+)/i,
    build: (url, page) => url.replace(/\/page\/\d+/i, `/page/${page}`)
  },
  {
    regex: /#page=(\d+)/i,
    build: (url, page) => url.replace(/#page=\d+/i, `#page=${page}`)
  }
];

const TOAST_ID = "zen-page-skip-toast";
const TOAST_DURATION_MS = 1800;

function getActiveTab() {
  return window.gBrowser?.selectedTab ?? null;
}

function getCurrentUrl() {
  return getActiveTab()?.linkedBrowser?.currentURI?.spec ?? null;
}

function findPage(url) {
  for (const item of PAGE_PATTERNS) {
    const match = url.match(item.regex);

    if (match) {
      return {
        item,
        currentPage: Number.parseInt(match[2], 10)
      };
    }
  }

  return null;
}

function buildUrl(url, item, page) {
  const nextUrl = item.build(url, page);
  return nextUrl === url ? null : nextUrl;
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
    browser.loadURI(Services.io.newURI(url), {
      triggeringPrincipal: principal
    });
  } catch (error) {
    browser.fixupAndLoadURIString(url, {
      triggeringPrincipal: principal
    });
  }
}

function jump(direction) {
  const tab = getActiveTab();
  const url = getCurrentUrl();

  if (!tab || !url) {
    showToast("No active page");
    return;
  }

  const found = findPage(url);

  if (!found) {
    showToast("No numbered page found");
    return;
  }

  const nextPage = found.currentPage + direction;

  if (nextPage < 1) {
    showToast("Already on page 1");
    return;
  }

  const nextUrl = buildUrl(url, found.item, nextPage);

  if (!nextUrl) {
    showToast("Could not build page URL");
    return;
  }

  navigate(tab, nextUrl);
  showToast(`Jumped to page ${nextPage}`);
}

function isEditable(target) {
  const tag = target?.tagName?.toLowerCase();

  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target?.isContentEditable === true
  );
}

function matches(event, shortcut) {
  const parts = shortcut
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  const key = parts.at(-1);
  const wantsAlt = parts.includes("alt");
  const wantsCtrl = parts.includes("ctrl") || parts.includes("cmd");
  const wantsShift = parts.includes("shift");

  const keyMatches =
    event.key?.toLowerCase() === key ||
    (key === "]" && event.code === "BracketRight") ||
    (key === "[" && event.code === "BracketLeft");

  return (
    keyMatches &&
    event.altKey === wantsAlt &&
    (event.ctrlKey || event.metaKey) === wantsCtrl &&
    event.shiftKey === wantsShift
  );
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
