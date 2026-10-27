"use strict";

const PAGE_PATTERNS = [
  /([?&])page=(\d+)/i,
  /([?&])p=(\d+)/i,
  /\/page\/(\d+)/i,
  /#page=(\d+)/i
];

function getActiveBrowser() {
  return window.gBrowser || window.browser?.gBrowser;
}

function parsePage(url) {
  for (const pattern of PAGE_PATTERNS) {
    const match = url.match(pattern);

    if (!match) continue;

    return {
      pattern,
      current: Number.parseInt(match[2], 10)
    };
  }

  return null;
}

function buildNextUrl(url, match, direction) {
  const nextPage = match.current + direction;

  if (nextPage < 1) return null;

  if (match.pattern.source.startsWith("([?&])page=")) {
    return url.replace(/([?&])page=(\d+)/i, `$1page=${nextPage}`);
  }

  if (match.pattern.source.startsWith("([?&])p=")) {
    return url.replace(/([?&])p=(\d+)/i, `$1p=${nextPage}`);
  }

  if (match.pattern.source.startsWith("\\/page\\/")) {
    return url.replace(/\/page\/(\d+)/i, `/page/${nextPage}`);
  }

  return url.replace(/#page=(\d+)/i, `#page=${nextPage}`);
}

function showToast(message) {
  try {
    const zenUI = window.gZenUIManager;

    if (zenUI?.showToast) {
      zenUI.showToast({ label: message });
      return;
    }
  } catch (error) {
    console.warn("[Zen Page Skip] Native Zen toast failed:", error);
  }

  try {
    const browser = getActiveBrowser();
    const notificationBox = browser.getNotificationBox();
    const notification = notificationBox.appendNotification(
      "zen-page-skip-toast",
      {
        label: message,
        priority: notificationBox.PRIORITY_INFO_MEDIUM
      }
    );

    setTimeout(() => notification?.close(), 2000);
  } catch (error) {
    console.warn("[Zen Page Skip] Notification fallback failed:", error);
  }
}

function jump(direction) {
  const browser = getActiveBrowser();
  const tab = browser?.selectedTab;
  const url = tab?.linkedBrowser?.currentURI?.spec;

  if (!url) return;

  const match = parsePage(url);

  if (!match) {
    showToast("No numbered page found");
    return;
  }

  const nextUrl = buildNextUrl(url, match, direction);

  if (!nextUrl) {
    showToast(direction < 0 ? "Already on page 1" : "Cannot go further back");
    return;
  }

  tab.linkedBrowser.loadURI(Services.io.newURI(nextUrl), {
    triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()
  });

  showToast(`Jumped to page ${match.current + direction}`);
}

function shouldTrigger(event, shortcut) {
  if (!shortcut) return false;

  const parts = shortcut.split("+").map((part) => part.trim().toLowerCase());
  const key = parts.at(-1);
  const needsAlt = parts.includes("alt");
  const needsCtrl = parts.includes("ctrl") || parts.includes("cmd");
  const needsShift = parts.includes("shift");

  const keyMatches =
    event.key.toLowerCase() === key ||
    (key === "]" && event.code === "BracketRight") ||
    (key === "[" && event.code === "BracketLeft");

  return (
    keyMatches &&
    event.altKey === needsAlt &&
    (event.ctrlKey || event.metaKey) === needsCtrl &&
    event.shiftKey === needsShift
  );
}

function onKeyDown(event) {
  const target = event.target;

  if (
    target instanceof Ci.nsIDOMHTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable)
  ) {
    return;
  }

  const nextShortcut = "Alt+]";
  const previousShortcut = "Alt+[";

  if (shouldTrigger(event, nextShortcut)) {
    event.preventDefault();
    event.stopPropagation();
    jump(1);
  } else if (shouldTrigger(event, previousShortcut)) {
    event.preventDefault();
    event.stopPropagation();
    jump(-1);
  }
}

window.addEventListener("keydown", onKeyDown, true);
