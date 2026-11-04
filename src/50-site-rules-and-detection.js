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
  let labelledText = "";
  const labelledBy = element?.getAttribute("aria-labelledby");
  if (labelledBy && element.ownerDocument?.getElementById) {
    labelledText = labelledBy.split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent || "")
      .filter(Boolean)
      .join(" ");
  }
  return (element?.getAttribute("aria-label") || element?.getAttribute("title") || labelledText || element?.textContent || "")
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
    element.hasAttribute("hidden") ||
    element.hidden === true ||
    element.getAttribute("aria-hidden") === "true" ||
    element.getAttribute("aria-disabled") === "true" ||
    element.getAttribute("aria-current") === "page" ||
    element.classList?.contains("disabled") === true ||
    (typeof element.getClientRects === "function" && element.getClientRects().length === 0);
}

function isInPaginationContext(element) {
  return Boolean(element.closest('nav[aria-label*="pagination" i], [role="navigation"][aria-label*="pagination" i], nav[class*="pagination"], [role="navigation"][class*="pagination"], [class*="pagination"], [id*="pagination"], [class*="pager"], [id*="pager"]'));
}

function isInExcludedWidgetContext(element) {
  try {
    return Boolean(element.closest('[role="tablist"], [aria-roledescription="carousel"], [class*="carousel"], [id*="carousel"], [class*="slider"], [id*="slider"], [class*="recommend"], [id*="recommend"], [class*="post-navigation"], [id*="post-navigation"], [class*="article-navigation"], [id*="article-navigation"]'));
  } catch (error) {
    return true;
  }
}

function isSafeNavigationControl(element, explicitlySelected = false) {
  const tag = element.tagName?.toLowerCase();
  const role = element.getAttribute("role");
  if (!["a", "button"].includes(tag) && role !== "button") return false;
  if (isDisabled(element) || element.hasAttribute("download")) return false;
  if (tag !== "a" && element.closest("form")) return false;
  if (element.getAttribute("aria-haspopup") || element.getAttribute("aria-expanded") === "true") return false;
  if (["dialog", "menuitem", "menuitemcheckbox", "menuitemradio"].includes(role)) return false;
  if (element.closest('dialog, [role="dialog"]')) return false;
  if (!explicitlySelected && isInExcludedWidgetContext(element)) return false;
  const label = normalizedText(element);
  const destructive = ["delete", "remove", "unsubscribe", "purchase", "buy", "pay", "submit", "confirm", "cancel", "logout", "log out", "sign out", "archive"];
  if (destructive.some((word) => label === word || label.startsWith(word + " ") || label.endsWith(" " + word))) return false;
  if (tag === "a") {
    const href = element.getAttribute("href")?.trim();
    return Boolean(href) && !/^(?:javascript|data|vbscript):/i.test(href);
  }
  return (explicitlySelected || isInPaginationContext(element)) && element.getAttribute("type")?.toLowerCase() !== "submit";
}

function findRelPaginationUrl(direction, document, currentUrl) {
  try {
    for (const link of Array.from(document.querySelectorAll('link[rel]'))) {
      if (!hasRel(link, direction) || isDisabled(link)) continue;
      const href = link.getAttribute("href")?.trim();
      if (!href || /^(?:javascript|data|vbscript):/i.test(href)) continue;
      const target = normalizeNavigationUrl(href, document.baseURI || currentUrl);
      const current = normalizeNavigationUrl(currentUrl);
      if (target && current && target !== current) return target;
    }
  } catch (error) {
    return null;
  }
  return null;
}

function getSiteRule(url) {
  try {
    const raw = Services.prefs.getStringPref(PREF_BRANCH + "site-rules", "");
    if (!raw || raw.length > 8192) return null;
    const rules = JSON.parse(raw);
    if (!rules || typeof rules !== "object" || Array.isArray(rules)) return null;
    const hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
    const entries = Object.entries(rules).filter(([pattern]) => {
      const host = String(pattern).toLowerCase();
      return host.startsWith("*.") ? hostname.endsWith("." + host.slice(2)) : hostname === host;
    }).sort((a, b) => b[0].length - a[0].length);
    const rule = entries[0]?.[1];
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) return null;
    const cleanSelector = (value) => typeof value === "string" && value.length <= 512 ? value.trim() : "";
    const cleanWords = (value) => Array.isArray(value) ? value.filter((word) => typeof word === "string" && word.trim() && word.length <= 80).slice(0, 50).map((word) => word.trim().toLowerCase()) : [];
    return {
      nextSelector: cleanSelector(rule.nextSelector),
      previousSelector: cleanSelector(rule.previousSelector),
      nextWords: cleanWords(rule.nextWords),
      previousWords: cleanWords(rule.previousWords),
      confidenceThreshold: Number.isInteger(rule.confidenceThreshold) ? Math.min(Math.max(rule.confidenceThreshold, 50), 150) : null,
      infiniteScroll: rule.infiniteScroll === "allow" || rule.infiniteScroll === "block" ? rule.infiniteScroll : null,
      pageTemplate: typeof rule.pageTemplate === "string" && rule.pageTemplate.length <= 512 ? rule.pageTemplate : "",
      enabled: typeof rule.enabled === "boolean" ? rule.enabled : null,
      action: ["auto", "click", "url"].includes(rule.action) ? rule.action : "auto",
      hashMode: ["verify", "allow", "disable"].includes(rule.hashMode) ? rule.hashMode : "verify"
    };
  } catch (error) {
    debugLog("site-rules-invalid", {});
    return null;
  }
}

function isInfiniteScrollPage(document) {
  try {
    return Boolean(document.querySelector('[role="feed"], [data-infinite-scroll], [data-infinite-scroll-container], [class*="infinite-scroll"], [id*="infinite-scroll"]'));
  } catch (error) {
    return false;
  }
}

function hasExplicitPaginationContainer(document) {
  try {
    return Boolean(document.querySelector('nav[class*="pagination"], [role="navigation"][class*="pagination"], nav[aria-label*="pagination"], [role="navigation"][aria-label*="pagination"]'));
  } catch (error) {
    return false;
  }
}

function shouldSkipInfiniteScroll(document, siteRule) {
  if (siteRule?.infiniteScroll === "block") return true;
  if (siteRule?.infiniteScroll === "allow" || siteRule?.nextSelector || siteRule?.previousSelector) return false;
  return isInfiniteScrollPage(document) && !hasExplicitPaginationContainer(document);
}

function findPaginationControl(direction) {
  const document = getPageDocument();
  if (!document) return null;

  const siteRule = getSiteRule(getCurrentUrl());
  const selector = direction === 1 ? siteRule?.nextSelector : siteRule?.previousSelector;
  if (selector) {
    try {
      const custom = document.querySelector(selector);
      if (!custom) {
        debugLog("site-selector-not-found", { reason: "no-match" });
      } else {
        const excluded = isExcludedByUserSelector(custom, document);
        if (isSafeNavigationControl(custom, true) && !excluded) {
          debugLog("site-selector-selected", { method: "site-selector" });
          return custom;
        }
        debugLog("site-selector-rejected", { reason: excluded ? "user-excluded-selector" : "unsafe-control" });
      }
    } catch (error) {
      debugLog("site-selector-invalid", {});
    }
  }
  const extraWords = direction === 1 ? siteRule?.nextWords : siteRule?.previousWords;
  const words = [...getPaginationWords(direction), ...(extraWords || [])];
  const symbols = direction === 1 ? NEXT_SYMBOLS : PREVIOUS_SYMBOLS;
  const candidates = Array.from(document.querySelectorAll('a, button, [role="button"]'));
  const scored = [];
  const threshold = siteRule?.confidenceThreshold ?? getConfidenceThreshold();

  for (const element of candidates) {
    const text = normalizedText(element);
    if (!isSafeNavigationControl(element)) {
      debugLog("candidate-rejected", { tag: element.tagName, reason: "unsafe-control" });
      continue;
    }
    if (isExcludedByUserSelector(element, document)) {
      debugLog("candidate-rejected", { tag: element.tagName, reason: "user-excluded-selector" });
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
      debugLog("candidate-rejected", { tag: element.tagName, reason: "no-pagination-context" });
      continue;
    }
    if (!exactLabel && !symbolLabel && !rel && !directionalMetadata) {
      debugLog("candidate-rejected", { tag: element.tagName, reason: "no-directional-signal" });
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
    debugLog("candidate-scored", { tag: element.tagName, score, threshold, accepted });
    if (accepted) scored.push({ element, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const selected = scored[0]?.element ?? null;
  debugLog(selected ? "control-selected" : "no-control-selected", selected ? { tag: selected.tagName, method: "automatic" } : {});
  return selected;
}

