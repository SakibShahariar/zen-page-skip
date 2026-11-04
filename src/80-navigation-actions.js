function navigate(tab, url) {
  const browser = tab?.linkedBrowser;
  lastNavigationWasHash = false;
  const currentUrl = browser?.currentURI?.spec;
  const normalizedTarget = normalizeNavigationUrl(url, currentUrl);
  const normalizedCurrent = normalizeNavigationUrl(currentUrl);
  if (!normalizedTarget) {
    debugLog("navigation-rejected", { reason: "invalid-or-unsafe-url" });
    return false;
  }
  if (normalizedCurrent && normalizedTarget === normalizedCurrent) {
    debugLog("navigation-rejected", { reason: "self-navigation" });
    return false;
  }
  if (browser && isPendingNavigationCycle(browser, normalizedTarget)) return false;
  url = normalizedTarget;
  if (currentUrl && isHashOnlyNavigation(currentUrl, url)) {
    lastNavigationWasHash = true;
    const mode = getSiteRule(currentUrl)?.hashMode || "verify";
    if (mode === "disable") {
      showToast("Hash pagination disabled for this site");
      return false;
    }
    if (!navigateHashTarget(tab, url, mode)) {
      showToast("Hash navigation unavailable");
      return false;
    }
    return true;
  }

  const compatibility = getNavigationCompatibility(tab);
  if (!compatibility.compatible) {
    debugLog("navigation-api-unavailable", { missing: compatibility.missing });
    return false;
  }

  const principal = Services.scriptSecurityManager.getSystemPrincipal();
  const options = { triggeringPrincipal: principal };
  try {
    if (typeof browser.loadURI === "function") {
      const pending = beginPendingNavigation(browser, currentUrl, url);
      try {
        browser.loadURI(Services.io.newURI(url), options);
        return true;
      } catch (error) {
        clearPendingNavigation(browser, pending);
        throw error;
      }
    }
  } catch (error) {
    debugLog("loadURI-failed", { errorName: error?.name || "Error" });
  }

  try {
    if (typeof browser.fixupAndLoadURIString === "function") {
      const pending = beginPendingNavigation(browser, currentUrl, url);
      try {
        browser.fixupAndLoadURIString(url, options);
        return true;
      } catch (error) {
        clearPendingNavigation(browser, pending);
        throw error;
      }
    }
  } catch (error) {
    debugLog("fixup-navigation-failed", { errorName: error?.name || "Error" });
  }
  return false;
}

function jumpToPage() {
  if (isCurrentTabPaused()) {
    showToast("Pagination paused for this tab");
    return false;
  }
  try {
    jumpToPageInternal();
  } catch (error) {
    debugLog("jump-to-page-failed-safely", { errorName: error?.name || "Error" });
    showToast("Jump failed safely; see local diagnostics");
  }
}

function jumpToPageInternal() {
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
  if (getSiteRule(url)?.enabled === false) {
    showToast("Disabled by this site's rule");
    return;
  }
  if (typeof Services.prompt?.prompt !== "function") {
    showToast("Page-number prompt unavailable");
    return;
  }

  const input = { value: "" };
  let accepted = false;
  try {
    accepted = Services.prompt.prompt(window, "Zen Page Skip", "Enter the page number:", input, null, null);
  } catch (error) {
    debugLog("page-prompt-failed", { errorName: error?.name || "Error" });
    showToast("Page-number prompt unavailable");
    return;
  }
  if (!accepted) return;

  const value = String(input.value || "").trim();
  const page = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(page) || page < 1 || page > 1000000) {
    showToast("Enter a valid positive page number");
    return;
  }
  const target = getSpecificPageUrl(url, page);
  if (!target) {
    showToast("No supported page-number URL pattern found");
    return;
  }
  if (target === url) {
    showToast("Already on that page");
    return;
  }
  if (!confirmNavigation(describeNavigationTarget(target))) {
    showToast("Navigation cancelled");
    return;
  }
  if (!navigate(tab, target)) {
    if (!lastNavigationWasHash) showToast("Navigation unavailable in this browser");
    return;
  }
  if (!lastNavigationWasHash) showToast("Going to page " + page);
}

const pausedTabs = new WeakSet();

function isCurrentTabPaused() {
  const tab = getActiveTab();
  return Boolean(tab && pausedTabs.has(tab));
}

function toggleCurrentTabPause() {
  const tab = getActiveTab();
  if (!tab) {
    showToast("No active tab");
    return false;
  }
  const paused = pausedTabs.has(tab);
  if (paused) pausedTabs.delete(tab);
  else pausedTabs.add(tab);
  debugLog("tab-pause-changed", { reason: paused ? "resumed" : "paused" });
  showToast(paused ? "Pagination resumed for this tab" : "Pagination paused for this tab");
  return !paused;
}

function jump(direction) {
  if (isCurrentTabPaused()) {
    showToast("Pagination paused for this tab");
    return false;
  }
  try {
    jumpInternal(direction);
  } catch (error) {
    debugLog("navigation-failed-safely", { direction: direction === 1 ? "next" : "previous", errorName: error?.name || "Error" });
    showToast("Pagination failed safely; see local diagnostics");
  }
}

function jumpInternal(direction) {
  debugLog("navigation-requested", { direction: direction === 1 ? "next" : "previous" });
  const tab = getActiveTab();
  const url = getCurrentUrl();

  if (!tab || !url) {
    debugLog("navigation-aborted", { reason: "no-active-page" });
    showToast("No active page");
    return;
  }

  if (isSiteDisabled(url)) {
    debugLog("navigation-aborted", { reason: "site-disabled" });
    showToast("Zen Page Skip disabled on this site");
    return;
  }

  const siteRule = getSiteRule(url);
  if (siteRule?.enabled === false) {
    showToast("Disabled by this site's rule");
    return;
  }

  const document = getPageDocument();
  if (document) {
    const relUrl = findRelPaginationUrl(direction, document, url);
    if (relUrl) {
      const targetDescription = describeNavigationTarget(relUrl);
      if (!confirmNavigation(targetDescription)) {
        showToast("Navigation cancelled");
        return;
      }
      debugLog("head-rel-navigation", { method: "document-rel" });
      if (!navigate(tab, relUrl)) {
        if (!lastNavigationWasHash) showToast("Navigation unavailable in this browser");
        return;
      }
      if (!lastNavigationWasHash) showToast(direction === 1 ? "Going to next page" : "Going to previous page");
      return;
    }
  }

  if (document && shouldSkipInfiniteScroll(document, siteRule)) {
    debugLog("navigation-aborted", { reason: "infinite-scroll-page" });
    showToast("Infinite-scroll page detected; no numbered pagination found");
    return;
  }

  const action = siteRule?.action || "auto";
  const control = action === "url" ? null : findPaginationControl(direction);
  if (action === "click" && !control) {
    showToast("No configured pagination control found");
    return;
  }

  if (control) {
    const label = normalizedText(control) || "pagination control";
    const href = control.getAttribute("href");
    const targetDescription = href ? describeControlTarget(href, url, label) : label;
    const controlTarget = href ? describeControlTargetUrl(href, url) : null;
    const hashOnly = controlTarget ? isHashOnlyNavigation(url, controlTarget) : false;
    const hashMode = siteRule?.hashMode || "verify";
    if (hashOnly && hashMode === "disable") {
      showToast("Hash pagination disabled for this site");
      return;
    }
    const beforeHashSignature = hashOnly ? getPageContentSignature(document) : null;
    if (!confirmNavigation(targetDescription)) {
      showToast("Navigation cancelled");
      return;
    }
    control.scrollIntoView({ block: "nearest", behavior: "instant" });
    try {
      control.click();
      if (hashOnly) {
        if (hashMode === "allow") showToast("Fragment changed; page content may not have changed");
        else monitorHashContentChange(beforeHashSignature);
      } else {
        showToast(direction === 1 ? "Going to next page" : "Going to previous page");
      }
    } catch (error) {
      debugLog("control-click-failed", { errorName: error?.name || "Error" });
      showToast("Pagination control could not be activated");
    }
    return;
  }

  const nextUrl = getNumberedPageUrl(url, direction);

  if (nextUrl) {
    const validation = validateNumberedFallback(url, nextUrl, document);
    if (!validation.valid) {
      debugLog("numbered-fallback-rejected", validation);
      showToast("No further numbered page detected");
      return;
    }
    const targetDescription = describeNavigationTarget(nextUrl);
    if (!confirmNavigation(targetDescription)) {
      showToast("Navigation cancelled");
      return;
    }
    debugLog("url-fallback", { method: "numbered-url" });
    if (!navigate(tab, nextUrl)) {
      if (!lastNavigationWasHash) showToast("Navigation unavailable in this browser");
      return;
    }
    if (!lastNavigationWasHash) showToast(direction === 1 ? "Going to next page" : "Going to previous page");
    return;
  }

  debugLog("navigation-aborted", { reason: "no-pagination-target" });
  showToast(direction === 1 ? "No next page found" : "No previous page found");
}

function getMatchedSiteRulePattern(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/\\.$/, "");
    const raw = Services.prefs.getStringPref(PREF_BRANCH + "site-rules", "");
    if (!raw || raw.length > 8192) return null;
    const rules = JSON.parse(raw);
    if (!rules || typeof rules !== "object" || Array.isArray(rules)) return null;
    return Object.keys(rules).filter((pattern) => {
      const host = pattern.toLowerCase().replace(/\\.$/, "");
      return host.startsWith("*.") ? hostname !== host.slice(2) && hostname.endsWith("." + host.slice(2)) : hostname === host;
    }).sort((a, b) => b.length - a.length)[0] || null;
  } catch (error) {
    return null;
  }
}

function explainPagination(direction = 1) {
  if (direction !== 1 && direction !== -1) {
    return { success: false, direction: null, method: null, target: null, reason: "invalid-direction", matchedRule: null };
  }
  const tab = getActiveTab();
  const url = getCurrentUrl();
  const normalizedUrl = normalizeNavigationUrl(url);
  const directionName = direction === 1 ? "next" : "previous";
  if (!tab || !normalizedUrl) {
    return { success: false, direction: directionName, method: null, target: null, reason: "no-active-page", matchedRule: null };
  }
  if (isSiteDisabled(normalizedUrl)) {
    return { success: false, direction: directionName, method: null, target: null, reason: "site-disabled", matchedRule: null };
  }

  const siteRule = getSiteRule(normalizedUrl);
  if (siteRule?.enabled === false) {
    return { success: false, direction: directionName, method: null, target: null, reason: "site-rule-disabled", matchedRule: { pattern: getMatchedSiteRulePattern(normalizedUrl) } };
  }
  const selector = direction === 1 ? siteRule?.nextSelector : siteRule?.previousSelector;
  const words = direction === 1 ? siteRule?.nextWords : siteRule?.previousWords;
  const matchedRule = siteRule ? {
    pattern: getMatchedSiteRulePattern(normalizedUrl),
    action: siteRule.action,
    selector: selector || null,
    customWordCount: words?.length || 0,
    confidenceThreshold: siteRule.confidenceThreshold,
    hashMode: siteRule.hashMode
  } : null;
  const document = getPageDocument();

  if (document) {
    const relUrl = findRelPaginationUrl(direction, document, normalizedUrl);
    if (relUrl) return { success: true, direction: directionName, method: "document-rel", target: relUrl, action: "navigate", hashOnly: isHashOnlyNavigation(normalizedUrl, relUrl), reason: null, matchedRule };
  }

  if (document && shouldSkipInfiniteScroll(document, siteRule)) {
    return { success: false, direction: directionName, method: null, target: null, reason: "infinite-scroll-page", matchedRule };
  }

  const action = siteRule?.action || "auto";
  const control = action === "url" ? null : findPaginationControl(direction);
  if (control) {
    const href = control.getAttribute("href");
    const target = href ? normalizeNavigationUrl(href, normalizedUrl) : null;
    if (href && !target) {
      return { success: false, direction: directionName, method: null, target: null, reason: "unsafe-control-target", matchedRule };
    }
    let method = "automatic-control";
    if (selector && document) {
      try {
        if (document.querySelector(selector) === control) method = "site-selector";
      } catch (error) {}
    }
    const hashOnly = target ? isHashOnlyNavigation(normalizedUrl, target) : false;
    if (hashOnly && siteRule?.hashMode === "disable") {
      return { success: false, direction: directionName, method, target, action: "click", hashOnly, reason: "hash-pagination-disabled", matchedRule };
    }
    return { success: true, direction: directionName, method, target, action: "click", hashOnly, reason: null, matchedRule };
  }

  if (action === "click") {
    return { success: false, direction: directionName, method: "site-rule-click", target: null, action: "click", reason: "configured-control-not-found", matchedRule };
  }
  const nextUrl = getNumberedPageUrl(normalizedUrl, direction);
  if (!nextUrl) {
    return { success: false, direction: directionName, method: null, target: null, reason: "no-pagination-target", matchedRule };
  }
  const validation = validateNumberedFallback(normalizedUrl, nextUrl, document);
  if (!validation.valid) {
    return { success: false, direction: directionName, method: "numbered-url", target: null, reason: validation.reason || "numbered-url-rejected", matchedRule };
  }
  return { success: true, direction: directionName, method: "numbered-url", target: nextUrl, action: "navigate", hashOnly: isHashOnlyNavigation(normalizedUrl, nextUrl), reason: null, matchedRule };
}

window.zenPageSkipExplainPagination = explainPagination;

function toggleCurrentSite() {
  const url = getCurrentUrl();
  if (!url) {
    showToast("No active page");
    return false;
  }
  if (isSiteDisabled(url)) {
    showToast("Remove this host from Disabled sites before toggling it");
    return false;
  }

  let hostname;
  let rules;
  try {
    hostname = new URL(url).hostname.toLowerCase();
    const raw = Services.prefs.getStringPref(PREF_BRANCH + "site-rules", "");
    if (raw.length > 8192) throw new Error("site-rules-too-large");
    rules = raw ? JSON.parse(raw) : {};
    if (!rules || typeof rules !== "object" || Array.isArray(rules)) throw new Error("invalid-site-rules");
  } catch (error) {
    debugLog("site-toggle-failed", { reason: "invalid-site-rules" });
    showToast("Could not toggle this site's pagination; check its site rules");
    return false;
  }

  const currentRule = getSiteRule(url);
  const enabled = currentRule?.enabled === false;
  const existing = rules[hostname];
  if (existing !== undefined && (!existing || typeof existing !== "object" || Array.isArray(existing))) {
    showToast("Could not toggle this site's pagination; check its site rules");
    return false;
  }
  rules[hostname] = { ...(existing || {}), enabled };
  const serialized = JSON.stringify(rules);
  if (serialized.length > 8192) {
    showToast("Site rules are full; remove an old rule before toggling this site");
    return false;
  }
  try {
    Services.prefs.setStringPref(PREF_BRANCH + "site-rules", serialized);
    debugLog("site-toggle-changed", { reason: enabled ? "enabled" : "disabled" });
    showToast(enabled ? "Pagination enabled for this site" : "Pagination paused for this site");
    return true;
  } catch (error) {
    debugLog("site-toggle-failed", { reason: "preference-write-failed" });
    showToast("Could not save this site's pagination state");
    return false;
  }
}

