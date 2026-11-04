"use strict";

const MOD_VERSION = "0.27.0";
const PREF_BRANCH = "zen-page-skip.";
const DEFAULT_NEXT_SHORTCUT = "Alt+]";
const DEFAULT_PREVIOUS_SHORTCUT = "Alt+[";
const DEFAULT_JUMP_SHORTCUT = "Alt+Shift+P";
const DEFAULT_TOGGLE_SITE_SHORTCUT = "Alt+Shift+D";
const DEFAULT_TOGGLE_TAB_SHORTCUT = "Alt+Shift+X";

const NEXT_TEXT = ["next", "next page", "go to next page", "older", "older posts", "siguiente", "siguiente página", "suivant", "prochain", "weiter", "nächste", "próximo", "próxima", "下一页", "下页", "次へ", "次のページ", "다음", "다음 페이지", "التالي", "الصفحة التالية", "следующая", "следующий", "следующая страница", "następna", "następna strona", "volgende", "pagina successiva", "prossimo"];
const PREVIOUS_TEXT = ["previous", "prev", "previous page", "go to previous page", "newer", "newer posts", "anterior", "página anterior", "précédent", "précédente", "zurück", "vorherige", "上一页", "前一页", "前へ", "前のページ", "이전", "이전 페이지", "السابق", "الصفحة السابقة", "предыдущая", "предыдущий", "предыдущая страница", "poprzednia", "poprzednia strona", "vorige", "pagina precedente", "precedente"];
const NEXT_SYMBOLS = [">", "»", "›", "→"];
const PREVIOUS_SYMBOLS = ["<", "«", "‹", "←"];

const PAGE_PATTERNS = [
  { regex: /([?&])page=(\d+)/i, build: (url, page) => url.replace(/([?&])page=\d+/i, `$1page=${page}`) },
  { regex: /([?&])p=(\d+)/i, build: (url, page) => url.replace(/([?&])p=\d+/i, `$1p=${page}`) },
  { regex: /\/page\/(\d+)/i, build: (url, page) => url.replace(/\/page\/\d+/i, `/page/${page}`) },
  { regex: /(#page=)(\d+)/i, build: (url, page) => url.replace(/#page=\d+/i, `#page=${page}`) }
];

function getPageNumberFromUrl(url) {
  for (const pattern of PAGE_PATTERNS) {
    const match = url.match(pattern.regex);
    if (match) return Number.parseInt(match[2], 10);
  }
  return getCustomPageTemplate(url)?.page ?? null;
}

function validateNumberedFallback(currentUrl, targetUrl, document) {
  if (!document || typeof document.querySelectorAll !== "function") {
    return { valid: true, reason: "document-unavailable", observedPages: [] };
  }
  const currentPage = getPageNumberFromUrl(currentUrl);
  const targetPage = getPageNumberFromUrl(targetUrl);
  if (currentPage === null || targetPage === null) {
    return { valid: true, reason: "page-number-unavailable", observedPages: [] };
  }

  const observedPages = new Set();
  try {
    const origin = new URL(currentUrl).origin;
    for (const anchor of document.querySelectorAll("a[href]")) {
      const href = anchor.href || anchor.getAttribute("href");
      if (!href) continue;
      const candidate = new URL(href, currentUrl);
      if (candidate.origin !== origin) continue;
      const page = getPageNumberFromUrl(candidate.href);
      if (page !== null) observedPages.add(page);
    }
  } catch (error) {
    debugLog("numbered-fallback-validation-unavailable", {});
    return { valid: true, reason: "validation-error", observedPages: [] };
  }

  if (observedPages.size === 0) {
    return { valid: true, reason: "no-observed-page-links", observedPages: [] };
  }
  return {
    valid: observedPages.has(targetPage),
    reason: observedPages.has(targetPage) ? "target-observed" : "target-not-observed",
    observedPages: Array.from(observedPages).sort((a, b) => a - b)
  };
}

function getNumberedPageUrl(url, direction) {
  for (const pattern of PAGE_PATTERNS) {
    const match = url.match(pattern.regex);
    if (!match) continue;
    const nextPage = Number.parseInt(match[2], 10) + direction;
    if (!Number.isSafeInteger(nextPage) || nextPage < 1) return null;
    const candidate = pattern.build(url, nextPage);
    return candidate !== url ? candidate : null;
  }
  return getCustomNumberedPageUrl(url, direction);
}

function escapeRegExp(value) {
  const special = new Set(["\\", ".", "+", "*", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]"]);
  return Array.from(value).map((character) => special.has(character) ? "\\" + character : character).join("");
}

function getCustomPageTemplate(url) {
  const template = getSiteRule(url)?.pageTemplate;
  if (!template) return null;
  if (template.split("{page}").length !== 2) {
    debugLog("custom-page-template-invalid", { reason: "placeholder-count" });
    return null;
  }
  try {
    const current = new URL(url);
    const marker = "ZENPAGESKIPMARKER";
    const templateUrl = new URL(template.replace("{page}", marker), current.href);
    if (templateUrl.origin !== current.origin) {
      debugLog("custom-page-template-invalid", { reason: "cross-origin" });
      return null;
    }
    const parts = templateUrl.href.split(marker);
    if (parts.length !== 2) {
      debugLog("custom-page-template-invalid", { reason: "placeholder-count" });
      return null;
    }
    const expression = new RegExp("^" + escapeRegExp(parts[0]) + "(\\d+)" + escapeRegExp(parts[1]) + "$");
    const match = current.href.match(expression);
    if (!match) return null;
    return { template, page: Number(match[1]), current };
  } catch (error) {
    debugLog("custom-page-template-invalid", { reason: "invalid-url" });
    return null;
  }
}

function getCustomPageUrl(url, page) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) return null;
  const info = getCustomPageTemplate(url);
  if (!info) return null;
  try {
    const target = new URL(info.template.replace("{page}", String(page)), info.current.href);
    return target.origin === info.current.origin ? target.href : null;
  } catch (error) {
    return null;
  }
}

function getCustomNumberedPageUrl(url, direction) {
  const info = getCustomPageTemplate(url);
  if (!info) return null;
  return getCustomPageUrl(url, info.page + direction);
}

function getSpecificPageUrl(url, page) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) return null;
  for (const pattern of PAGE_PATTERNS) {
    if (url.match(pattern.regex)) return pattern.build(url, page);
  }
  return getCustomPageUrl(url, page);
}

let lastShortcutAt = 0;

const TOAST_ID = "zen-page-skip-toast";
const TOAST_DURATION_MS = 1800;

