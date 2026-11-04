function normalizeNavigationUrl(value, baseUrl) {
  try {
    const url = new URL(value, baseUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if ((url.protocol === "http:" && url.port === "80") ||
        (url.protocol === "https:" && url.port === "443")) url.port = "";
    return url.href;
  } catch (error) {
    return null;
  }
}

function isHashOnlyNavigation(currentUrl, targetUrl) {
  try {
    const normalizedCurrent = normalizeNavigationUrl(currentUrl);
    const normalizedTarget = normalizeNavigationUrl(targetUrl, currentUrl);
    if (!normalizedCurrent || !normalizedTarget) return false;
    const current = new URL(normalizedCurrent);
    const target = new URL(normalizedTarget);
    return current.origin === target.origin &&
      current.pathname === target.pathname &&
      current.search === target.search &&
      current.hash !== target.hash;
  } catch (error) {
    return false;
  }
}

function getPageContentSignature(document) {
  const text = document?.body?.innerText ?? document?.body?.textContent ?? "";
  return String(text.length) + ":" + String(text).slice(0, 4096);
}

function monitorHashContentChange(beforeSignature) {
  showToast("Checking hash-based pagination");
  window.setTimeout(() => {
    const afterSignature = getPageContentSignature(getPageDocument());
    if (afterSignature !== beforeSignature) {
      showToast("Page content updated");
    } else {
      showToast("Fragment changed, but page content did not update");
    }
  }, 1200);
}

function navigateHashTarget(tab, targetUrl, mode) {
  const browser = tab?.linkedBrowser;
  const contentWindow = browser?.contentWindow;
  if (!contentWindow?.location) return false;
  let target;
  try {
    target = new URL(targetUrl);
  } catch (error) {
    return false;
  }
  const beforeSignature = getPageContentSignature(browser.contentDocument || contentWindow.document);
  try {
    contentWindow.location.hash = target.hash;
  } catch (error) {
    debugLog("hash-navigation-failed", { errorName: error?.name || "Error" });
    return false;
  }
  if (mode === "allow") {
    showToast("Fragment changed; page content may not have changed");
  } else {
    monitorHashContentChange(beforeSignature);
  }
  return true;
}

const pendingNavigations = new WeakMap();
const PENDING_NAVIGATION_WINDOW_MS = 10000;

function clearPendingNavigation(browser, pending) {
  if (pendingNavigations.get(browser) === pending) pendingNavigations.delete(browser);
  if (pending.listener) {
    try { browser.removeEventListener("pageshow", pending.listener, true); } catch (error) {}
  }
}

function beginPendingNavigation(browser, sourceUrl, targetUrl) {
  const pending = {
    source: normalizeNavigationUrl(sourceUrl),
    target: normalizeNavigationUrl(targetUrl),
    expiresAt: Date.now() + PENDING_NAVIGATION_WINDOW_MS,
    listener: null
  };
  pendingNavigations.set(browser, pending);
  if (typeof browser.addEventListener === "function") {
    pending.listener = () => {
      const current = normalizeNavigationUrl(browser.currentURI?.spec);
      if (current && current !== pending.source) clearPendingNavigation(browser, pending);
    };
    browser.addEventListener("pageshow", pending.listener, true);
  }
  window.setTimeout(() => clearPendingNavigation(browser, pending), PENDING_NAVIGATION_WINDOW_MS);
  return pending;
}

function isPendingNavigationCycle(browser, targetUrl) {
  const pending = pendingNavigations.get(browser);
  if (!pending) return false;
  if (pending.expiresAt <= Date.now()) {
    clearPendingNavigation(browser, pending);
    return false;
  }
  const target = normalizeNavigationUrl(targetUrl);
  const cycle = Boolean(target && (target === pending.target || target === pending.source));
  if (cycle) {
    debugLog("navigation-cycle-rejected", {
      reason: target === pending.target ? "repeated-pending-target" : "pending-navigation-backtrack"
    });
  }
  return cycle;
}

let lastNavigationWasHash = false;

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

