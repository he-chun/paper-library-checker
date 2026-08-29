(function (root, factory) {
  const api = factory();
  root.PLCIndexBuildProgress = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createIndexBuildProgress(dependencies = {}) {
    const now = dependencies.now || Date.now;
    let value = {
      state: "not_built",
      processedItems: 0,
      totalItems: null,
      processedLibraries: 0,
      totalLibraries: 0,
      currentLibraryKey: "",
      startedAt: null,
      updatedAt: null,
      scopeKey: "",
      scopeConfidence: null,
      activeGeneration: null,
      itemCount: 0,
      libraryCount: 0,
      lastSuccessfulBuildAt: null,
      lastAttemptAt: null,
      freshness: "unavailable",
      errorCode: ""
    };

    function replace(patch) {
      value = { ...value, ...patch, updatedAt: now() };
      return snapshot();
    }

    function snapshot() {
      return { ...value };
    }

    return Object.freeze({
      clear() {
        value = {
          state: "not_built",
          processedItems: 0,
          totalItems: null,
          processedLibraries: 0,
          totalLibraries: 0,
          currentLibraryKey: "",
          startedAt: null,
          updatedAt: now(),
          scopeKey: "",
          scopeConfidence: null,
          activeGeneration: null,
          itemCount: 0,
          libraryCount: 0,
          lastSuccessfulBuildAt: null,
          lastAttemptAt: null,
          freshness: "unavailable",
          errorCode: ""
        };
        return snapshot();
      },
      begin(details = {}) {
        const timestamp = now();
        const activeGeneration = Object.hasOwn(details, "activeGeneration")
          ? details.activeGeneration
          : value.activeGeneration;
        value = {
          state: details.refreshing || activeGeneration != null ? "refreshing" : "building",
          processedItems: 0,
          totalItems: null,
          processedLibraries: 0,
          totalLibraries: 0,
          currentLibraryKey: "",
          startedAt: timestamp,
          updatedAt: timestamp,
          scopeKey: activeGeneration == null ? "" : value.scopeKey,
          scopeConfidence: activeGeneration == null ? null : value.scopeConfidence,
          activeGeneration,
          itemCount: value.itemCount,
          libraryCount: value.libraryCount,
          lastSuccessfulBuildAt: value.lastSuccessfulBuildAt,
          lastAttemptAt: timestamp,
          freshness: activeGeneration == null ? "unavailable" : "stale",
          errorCode: ""
        };
        return snapshot();
      },
      update(patch = {}) {
        const allowed = {};
        for (const key of [
          "processedItems", "totalItems", "processedLibraries", "totalLibraries",
          "currentLibraryKey", "scopeKey", "scopeConfidence", "activeGeneration",
          "itemCount", "libraryCount", "lastSuccessfulBuildAt", "lastAttemptAt", "freshness"
        ]) {
          if (patch[key] !== undefined) allowed[key] = patch[key];
        }
        return replace(allowed);
      },
      ready(details = {}) {
        return replace({
          state: "ready",
          currentLibraryKey: "",
          activeGeneration: details.activeGeneration ?? value.activeGeneration,
          totalItems: details.totalItems ?? value.totalItems,
          itemCount: details.itemCount ?? details.totalItems ?? value.itemCount,
          libraryCount: details.libraryCount ?? value.libraryCount,
          lastSuccessfulBuildAt: details.lastSuccessfulBuildAt ?? now(),
          freshness: "fresh",
          errorCode: ""
        });
      },
      fail(errorCode, details = {}) {
        return replace({
          state: "error",
          currentLibraryKey: "",
          activeGeneration: details.activeGeneration ?? value.activeGeneration,
          freshness: details.activeGeneration == null && value.activeGeneration == null ? "unavailable" : "stale",
          errorCode: String(errorCode || "index_build_failed")
        });
      },
      cancel(details = {}) {
        const activeGeneration = details.activeGeneration ?? value.activeGeneration;
        return replace({
          state: activeGeneration == null ? "not_built" : "stale",
          currentLibraryKey: "",
          activeGeneration,
          freshness: activeGeneration == null ? "unavailable" : "stale",
          errorCode: ""
        });
      },
      hydrate(meta, freshness) {
        if (!meta) return snapshot();
        const hydratedState = freshness?.state || meta.state;
        return replace({
          state: ["not_built", "building", "ready", "stale", "refreshing", "error"].includes(hydratedState)
            ? hydratedState
            : "not_built",
          scopeKey: String(meta.scopeKey || ""),
          scopeConfidence: meta.scopeConfidence === "stable" ? "stable" : meta.scopeConfidence === "legacy" ? "legacy" : null,
          activeGeneration: meta.activeGeneration ?? null,
          itemCount: Number(meta.itemCount || 0),
          libraryCount: Number(meta.libraryCount || 0),
          lastSuccessfulBuildAt: meta.lastSuccessfulBuildAt ?? null,
          lastAttemptAt: meta.lastAttemptAt ?? null,
          freshness: freshness?.freshness || (meta.activeGeneration == null ? "unavailable" : "stale"),
          errorCode: String(meta.errorCode || ""),
          startedAt: meta.lastAttemptAt ?? null
        });
      },
      snapshot
    });
  }

  return { createIndexBuildProgress };
});
