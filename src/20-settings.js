const SETTINGS_SCHEMA = {
  "next-shortcut": { type: "string", defaultValue: "Alt+]" },
  "previous-shortcut": { type: "string", defaultValue: "Alt+[" },
  "jump-to-page-shortcut": { type: "string", defaultValue: "Alt+Shift+P" },
  "toggle-site-shortcut": { type: "string", defaultValue: "Alt+Shift+D" },
  "toggle-tab-shortcut": { type: "string", defaultValue: "Alt+Shift+X" },
  "disabled-sites": { type: "string", defaultValue: "" },
  "cooldown-ms": { type: "string", defaultValue: "400" },
  "toast-enabled": { type: "boolean", defaultValue: true },
  "toast-duration-ms": { type: "integer", defaultValue: 1800 },
  "confidence-threshold": { type: "integer", defaultValue: 70 },
  "excluded-selectors": { type: "string", defaultValue: "" },
  "debug-mode": { type: "boolean", defaultValue: false },
  "preview-before-navigation": { type: "boolean", defaultValue: false },
  "next-words": { type: "string", defaultValue: "" },
  "previous-words": { type: "string", defaultValue: "" },
  "site-rules": { type: "string", defaultValue: "" }
};

function readSetting(name, schema) {
  const key = PREF_BRANCH + name;
  if (schema.type === "boolean") return Services.prefs.getBoolPref(key, schema.defaultValue);
  if (schema.type === "integer") return Services.prefs.getIntPref(key, schema.defaultValue);
  return Services.prefs.getStringPref(key, schema.defaultValue);
}

function exportSettings() {
  const settings = {};
  for (const [name, schema] of Object.entries(SETTINGS_SCHEMA)) {
    try {
      settings[name] = readSetting(name, schema);
    } catch (error) {
      settings[name] = schema.defaultValue;
    }
  }
  return JSON.stringify({ schemaVersion: 1, settings }, null, 2);
}

function validateImportedSiteRules(value) {
  let rules;
  try {
    rules = JSON.parse(value);
  } catch (error) {
    return false;
  }
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) return false;
  const entries = Object.entries(rules);
  if (entries.length > 100) return false;

  const allowedKeys = new Set([
    "nextSelector", "previousSelector", "nextWords", "previousWords",
    "confidenceThreshold", "infiniteScroll", "pageTemplate", "enabled",
    "action", "hashMode"
  ]);
  const validHost = /^(?:\\*\\.)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i;

  for (const [pattern, rule] of entries) {
    const hostnamePattern = pattern.startsWith("*.") ? pattern.slice(2) : pattern;
    const labels = hostnamePattern.split(".");
    const validHostname = hostnamePattern.length <= 253 &&
      labels.every((label) => label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label));
    if (!validHost.test(pattern) || !validHostname ||
        !rule || typeof rule !== "object" || Array.isArray(rule)) return false;
    for (const key of Object.keys(rule)) {
      if (!allowedKeys.has(key)) return false;
    }

    for (const key of ["nextSelector", "previousSelector"]) {
      if (rule[key] === undefined) continue;
      if (typeof rule[key] !== "string" || rule[key].length > 512) return false;
      if (!rule[key].trim()) continue;
      try {
        if (typeof document?.createElement !== "function") return false;
        document.createElement("div").matches(rule[key]);
      } catch (error) {
        return false;
      }
    }

    for (const key of ["nextWords", "previousWords"]) {
      if (rule[key] === undefined) continue;
      if (!Array.isArray(rule[key]) || rule[key].length > 50 ||
          rule[key].some((word) => typeof word !== "string" || !word.trim() || word.length > 80)) return false;
    }

    if (rule.confidenceThreshold !== undefined &&
        (!Number.isInteger(rule.confidenceThreshold) || rule.confidenceThreshold < 50 || rule.confidenceThreshold > 150)) return false;
    if (rule.infiniteScroll !== undefined && !["allow", "block"].includes(rule.infiniteScroll)) return false;
    if (rule.enabled !== undefined && typeof rule.enabled !== "boolean") return false;
    if (rule.action !== undefined && !["auto", "click", "url"].includes(rule.action)) return false;
    if (rule.hashMode !== undefined && !["verify", "allow", "disable"].includes(rule.hashMode)) return false;

    if (rule.pageTemplate !== undefined) {
      if (typeof rule.pageTemplate !== "string" || rule.pageTemplate.length > 512) return false;
      if (rule.pageTemplate) {
        if (rule.pageTemplate.split("{page}").length !== 2) return false;
        const host = pattern.startsWith("*.") ? "zenpageskip." + pattern.slice(2) : pattern;
        try {
          const base = new URL("https://" + host + "/");
          const target = new URL(rule.pageTemplate.replace("{page}", "2"), base.href);
          if (!["http:", "https:"].includes(target.protocol) || target.origin !== base.origin ||
              target.username || target.password) return false;
        } catch (error) {
          return false;
        }
      }
    }
  }
  return true;
}

function validateImportedSetting(name, value, schema) {
  if (schema.type === "boolean") return typeof value === "boolean" ? { valid: true, value } : { valid: false };
  if (schema.type === "integer") {
    if (!Number.isInteger(value)) return { valid: false };
    if (name === "toast-duration-ms") return { valid: true, value: Math.min(Math.max(value, 500), 10000) };
    if (name === "confidence-threshold") return { valid: true, value: Math.min(Math.max(value, 50), 150) };
    return { valid: false };
  }
  if (typeof value !== "string" || value.length > 8192) return { valid: false };
  if (name === "cooldown-ms") {
    if (!value || Array.from(value).some((character) => character < "0" || character > "9")) return { valid: false };
    const numeric = Number(value);
    if (!Number.isSafeInteger(numeric)) return { valid: false };
    return { valid: true, value: String(Math.min(numeric, 5000)) };
  }
  if (name.endsWith("-shortcut") && value.trim() && !parseShortcut(value)) return { valid: false };
  if (name.endsWith("-shortcut") && !value.trim()) return { valid: true, value: "" };
  if (name === "site-rules" && value && !validateImportedSiteRules(value)) {
    return { valid: false };
  }
  return { valid: true, value };
}

function previewSettings(input) {
  if (typeof input !== "string" || input.length > 65536) {
    return { success: false, added: [], changed: [], unchanged: [], ignored: [], rejected: ["input"] };
  }
  let payload;
  try {
    payload = JSON.parse(input);
  } catch (error) {
    return { success: false, added: [], changed: [], unchanged: [], ignored: [], rejected: ["invalid JSON"] };
  }
  if (!payload || payload.schemaVersion !== 1 || !payload.settings ||
      typeof payload.settings !== "object" || Array.isArray(payload.settings)) {
    return { success: false, added: [], changed: [], unchanged: [], ignored: [], rejected: ["unsupported schema"] };
  }

  const staged = [];
  const rejected = [];
  const ignored = [];
  for (const [name, value] of Object.entries(payload.settings)) {
    const schema = SETTINGS_SCHEMA[name];
    if (!schema) {
      ignored.push(name);
      continue;
    }
    const validated = validateImportedSetting(name, value, schema);
    if (!validated.valid) rejected.push(name);
    else staged.push({ name, schema, value: validated.value });
  }
  if (rejected.length) return { success: false, added: [], changed: [], unchanged: [], ignored, rejected };

  const added = [];
  const changed = [];
  const unchanged = [];
  let currentRules = {};
  let incomingRules = {};
  try {
    for (const item of staged) {
      const key = PREF_BRANCH + item.name;
      const hadUserValue = typeof Services.prefs.prefHasUserValue === "function"
        ? Services.prefs.prefHasUserValue(key)
        : true;
      const currentValue = readSetting(item.name, item.schema);
      if (!hadUserValue) added.push(item.name);
      else if (currentValue === item.value) unchanged.push(item.name);
      else changed.push(item.name);

      if (item.name === "site-rules") {
        try { currentRules = currentValue ? JSON.parse(currentValue) : {}; } catch (error) { currentRules = {}; }
        try { incomingRules = item.value ? JSON.parse(item.value) : {}; } catch (error) { incomingRules = {}; }
      }
    }
  } catch (error) {
    return { success: false, added: [], changed: [], unchanged: [], ignored, rejected: ["preferences-unavailable"] };
  }

  const newRules = [];
  const changedRules = [];
  const unchangedRules = [];
  const removedRules = [];
  for (const [host, rule] of Object.entries(incomingRules)) {
    if (!Object.prototype.hasOwnProperty.call(currentRules, host)) newRules.push(host);
    else if (JSON.stringify(currentRules[host]) === JSON.stringify(rule)) unchangedRules.push(host);
    else changedRules.push(host);
  }
  for (const host of Object.keys(currentRules)) {
    if (!Object.prototype.hasOwnProperty.call(incomingRules, host)) removedRules.push(host);
  }

  return {
    success: true, added, changed, unchanged, ignored, rejected: [],
    siteRules: { added: newRules, changed: changedRules, unchanged: unchangedRules, removed: removedRules }
  };
}

function importSettings(input) {
  const preview = previewSettings(input);
  if (!preview.success) {
    return { success: false, imported: [], rejected: preview.rejected, ignored: preview.ignored };
  }
  if (typeof Services.prompt?.confirm !== "function") {
    return { success: false, imported: [], rejected: ["confirmation-unavailable"], ignored: preview.ignored };
  }
  const summary = [
    "Review the settings import before applying it:",
    "New preferences: " + (preview.added.join(", ") || "none"),
    "Changed preferences: " + (preview.changed.join(", ") || "none"),
    "Unchanged preferences: " + (preview.unchanged.join(", ") || "none"),
    "New site rules: " + (preview.siteRules?.added.join(", ") || "none"),
    "Changed site rules: " + (preview.siteRules?.changed.join(", ") || "none"),
    "Removed site rules: " + (preview.siteRules?.removed.join(", ") || "none"),
    "Ignored unknown settings: " + (preview.ignored.join(", ") || "none")
  ].join("\n");
  let confirmed = false;
  try {
    confirmed = Services.prompt.confirm(window, "Zen Page Skip", summary);
  } catch (error) {
    debugLog("settings-import-confirmation-failed", { errorName: error?.name || "Error" });
    return { success: false, imported: [], rejected: ["confirmation-unavailable"], ignored: preview.ignored };
  }
  if (!confirmed) return { success: false, imported: [], rejected: ["cancelled"], ignored: preview.ignored };

  if (typeof input !== "string" || input.length > 65536) {
    return { success: false, imported: [], rejected: ["input"], ignored: [] };
  }
  let payload;
  try {
    payload = JSON.parse(input);
  } catch (error) {
    return { success: false, imported: [], rejected: ["invalid JSON"], ignored: [] };
  }
  if (!payload || payload.schemaVersion !== 1 || !payload.settings ||
      typeof payload.settings !== "object" || Array.isArray(payload.settings)) {
    return { success: false, imported: [], rejected: ["unsupported schema"], ignored: [] };
  }

  const staged = [];
  const rejected = [];
  const ignored = [];
  for (const [name, value] of Object.entries(payload.settings)) {
    const schema = SETTINGS_SCHEMA[name];
    if (!schema) {
      ignored.push(name);
      continue;
    }
    const validated = validateImportedSetting(name, value, schema);
    if (!validated.valid) rejected.push(name);
    else staged.push({ name, schema, value: validated.value });
  }
  if (rejected.length) return { success: false, imported: [], rejected, ignored };

  const snapshots = [];
  try {
    for (const item of staged) {
      const key = PREF_BRANCH + item.name;
      snapshots.push({
        item,
        hadUserValue: typeof Services.prefs.prefHasUserValue === "function"
          ? Services.prefs.prefHasUserValue(key)
          : true,
        value: readSetting(item.name, item.schema)
      });
    }
  } catch (error) {
    return { success: false, imported: [], rejected: ["preferences-unavailable"], ignored };
  }

  const imported = [];
  for (let index = 0; index < staged.length; index++) {
    const item = staged[index];
    const key = PREF_BRANCH + item.name;
    try {
      if (item.schema.type === "boolean") Services.prefs.setBoolPref(key, item.value);
      else if (item.schema.type === "integer") Services.prefs.setIntPref(key, item.value);
      else Services.prefs.setStringPref(key, item.value);
      imported.push(item.name);
    } catch (error) {
      rejected.push(item.name);
      const rollback = snapshots.slice(0, index + 1).reverse();
      for (const snapshot of rollback) {
        const restoreKey = PREF_BRANCH + snapshot.item.name;
        try {
          if (!snapshot.hadUserValue && typeof Services.prefs.clearUserPref === "function") {
            Services.prefs.clearUserPref(restoreKey);
          } else if (snapshot.item.schema.type === "boolean") {
            Services.prefs.setBoolPref(restoreKey, snapshot.value);
          } else if (snapshot.item.schema.type === "integer") {
            Services.prefs.setIntPref(restoreKey, snapshot.value);
          } else {
            Services.prefs.setStringPref(restoreKey, snapshot.value);
          }
        } catch (rollbackError) {
          rejected.push("rollback:" + snapshot.item.name);
        }
      }
      return { success: false, imported: [], rejected, ignored };
    }
  }
  return { success: true, imported, rejected, ignored };
}

window.zenPageSkipExportSettings = exportSettings;
window.zenPageSkipImportSettings = importSettings;
window.zenPageSkipPreviewSettings = previewSettings;
window.addEventListener("unload", () => {
  if (window.zenPageSkipExportSettings === exportSettings) delete window.zenPageSkipExportSettings;
  if (window.zenPageSkipImportSettings === importSettings) delete window.zenPageSkipImportSettings;
  if (window.zenPageSkipPreviewSettings === previewSettings) delete window.zenPageSkipPreviewSettings;
}, { once: true });

