function getDebugEnabled() {
  try {
    return Services.prefs.getBoolPref(PREF_BRANCH + "debug-mode", false);
  } catch (error) {
    return false;
  }
}

const diagnosticEntries = [];
function sanitizeDiagnosticDetails(details) {
  const allowed = new Set([
    "reason", "direction", "tag", "score", "threshold", "accepted",
    "missing", "observedPages", "method", "valid", "errorName"
  ]);
  const safe = {};
  try {
    for (const [key, value] of Object.entries(details || {})) {
      if (!allowed.has(key)) continue;
      if (key === "missing" && Array.isArray(value)) {
        safe[key] = value.filter((item) => typeof item === "string").slice(0, 8);
      } else if (key === "observedPages" && Array.isArray(value)) {
        safe[key] = value.filter((item) => Number.isSafeInteger(item)).slice(0, 20);
      } else if (typeof value === "string" && value.length <= 64) {
        safe[key] = value;
      } else if (typeof value === "number" && Number.isFinite(value)) {
        safe[key] = value;
      } else if (typeof value === "boolean") {
        safe[key] = value;
      }
    }
  } catch (error) {
    return {};
  }
  return safe;
}

function debugLog(event, details = {}) {
  if (!getDebugEnabled()) return;
  try {
    const safeDetails = sanitizeDiagnosticDetails(details);
    const entry = `${Date.now()} ${event} ${JSON.stringify(safeDetails)}`;
    diagnosticEntries.push(entry);
    if (diagnosticEntries.length > 100) diagnosticEntries.shift();
    console.debug("[Zen Page Skip]", entry);
  } catch (error) {
    // Diagnostics must never interfere with pagination.
  }
}

function getDiagnostics() {
  return diagnosticEntries.join("\n");
}

window.zenPageSkipGetDiagnostics = getDiagnostics;
function createTroubleshootingReport() {
  const report = {
    product: "Zen Page Skip",
    version: MOD_VERSION,
    diagnosticsEnabled: getDebugEnabled(),
    browser: Services.appinfo ? {
      name: Services.appinfo.name || null,
      version: Services.appinfo.version || null
    } : null,
    generatedAt: new Date().toISOString(),
    diagnostics: getDebugEnabled() ? diagnosticEntries.slice(-50) : [],
    privacy: {
      pageContentIncluded: false,
      controlLabelsIncluded: false,
      hostnamesIncluded: false,
      urlsIncluded: false,
      queryParametersIncluded: false,
      fragmentsIncluded: false,
      telemetrySent: false
    }
  };
  if (!report.diagnosticsEnabled) {
    report.message = "Enable zen-page-skip.debug-mode, reproduce the issue, then generate the report again.";
  }
  return JSON.stringify(report, null, 2);
}

window.zenPageSkipCreateTroubleshootingReport = createTroubleshootingReport;

window.addEventListener("unload", () => {
  if (window.zenPageSkipGetDiagnostics === getDiagnostics) delete window.zenPageSkipGetDiagnostics;
  if (window.zenPageSkipCreateTroubleshootingReport === createTroubleshootingReport) delete window.zenPageSkipCreateTroubleshootingReport;
  if (window.zenPageSkipExplainPagination === explainPagination) delete window.zenPageSkipExplainPagination;
}, { once: true });

