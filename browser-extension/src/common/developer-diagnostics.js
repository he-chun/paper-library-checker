(function (root, factory) {
  const api = factory();
  root.PLCDeveloperDiagnostics = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_MAX_ENTRIES = 200;
  const TEXT_FIELDS = new Set([
    "backend", "operation", "phase", "outcome", "error", "cache", "library", "queryType", "workload", "degradedReason"
  ]);
  const NUMBER_FIELDS = new Set([
    "durationMs", "httpStatus", "inputCount", "uniqueCount", "resultCount", "libraryCount", "matchedCount",
    "notFoundCount", "errorCount", "concurrency", "operationId", "batchId", "cooldownMs"
  ]);

  function safeText(value) {
    const text = String(value == null ? "" : value);
    return /^[a-z0-9_.:-]{1,64}$/i.test(text) ? text : "redacted";
  }

  function createDeveloperDiagnostics(options = {}) {
    const maxEntries = Math.max(1, Math.floor(options.maxEntries || DEFAULT_MAX_ENTRIES));
    const now = options.now || Date.now;
    let enabled = options.enabled === true;
    let entries = [];

    function record(event, details = {}) {
      if (!enabled) return;
      const entry = {
        timestamp: new Date(now()).toISOString(),
        event: safeText(event)
      };
      for (const field of TEXT_FIELDS) {
        if (details[field] != null) entry[field] = safeText(details[field]);
      }
      for (const field of NUMBER_FIELDS) {
        if (Number.isFinite(details[field])) entry[field] = Math.max(0, Math.round(details[field]));
      }
      entries.push(Object.freeze(entry));
      if (entries.length > maxEntries) entries = entries.slice(-maxEntries);
    }

    return Object.freeze({
      clear() {
        entries = [];
      },
      getEntries() {
        return entries.map((entry) => ({ ...entry }));
      },
      isEnabled() {
        return enabled;
      },
      record,
      setEnabled(value) {
        enabled = value === true;
      }
    });
  }

  return { DEFAULT_MAX_ENTRIES, createDeveloperDiagnostics };
});
