(function (root, factory) {
  const api = factory();
  root.PLCIndexFreshness = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const INDEX_MAX_AGE_MS = 30 * 60 * 1000;

  function evaluateIndexFreshness(meta, now = Date.now(), maxAgeMs = INDEX_MAX_AGE_MS) {
    if (!meta || meta.activeGeneration == null) {
      return { state: meta?.state || "not_built", freshness: "unavailable", stale: false };
    }
    if (meta.state === "refreshing" || meta.state === "building") {
      return { state: "refreshing", freshness: "stale", stale: true };
    }
    if (meta.state === "error") {
      return { state: "error", freshness: "stale", stale: true };
    }
    const builtAt = Number(meta.lastSuccessfulBuildAt || 0);
    const stale = builtAt <= 0 || now - builtAt > maxAgeMs || meta.state === "stale";
    return { state: stale ? "stale" : "ready", freshness: stale ? "stale" : "fresh", stale };
  }

  return { INDEX_MAX_AGE_MS, evaluateIndexFreshness };
});
