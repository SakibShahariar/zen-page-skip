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

function isPreviewEnabled() {
  try {
    return Services.prefs.getBoolPref(PREF_BRANCH + "preview-before-navigation", false);
  } catch (error) {
    return false;
  }
}

function describeNavigationTarget(url, label = "page") {
  try {
    const target = new URL(url);
    return `${label}: ${target.origin}${target.pathname}`;
  } catch (error) {
    return label;
  }
}

function describeControlTarget(href, currentUrl, label) {
  try {
    return describeNavigationTarget(new URL(href, currentUrl).href, label);
  } catch (error) {
    debugLog("invalid-control-target", {});
    return label;
  }
}

function describeControlTargetUrl(href, currentUrl) {
  try {
    return new URL(href, currentUrl).href;
  } catch (error) {
    return null;
  }
}

function confirmNavigation(description) {
  if (!isPreviewEnabled()) return true;
  try {
    if (typeof Services.prompt?.confirm !== "function") {
      debugLog("preview-unavailable", { reason: "prompt-api-missing" });
      return false;
    }
    const confirmed = Services.prompt.confirm(window, "Zen Page Skip", `Navigate to ${description}?`);
    if (!confirmed) debugLog("navigation-cancelled", { reason: "user-cancelled" });
    return confirmed;
  } catch (error) {
    debugLog("preview-unavailable", { errorName: error?.name || "Error" });
    return false;
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

