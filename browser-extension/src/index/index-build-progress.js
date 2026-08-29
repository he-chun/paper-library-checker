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
      begin() {
        const timestamp = now();
        value = {
          state: "building",
          processedItems: 0,
          totalItems: null,
          processedLibraries: 0,
          totalLibraries: 0,
          currentLibraryKey: "",
          startedAt: timestamp,
          updatedAt: timestamp,
          scopeKey: "",
          scopeConfidence: null,
          activeGeneration: value.activeGeneration,
          errorCode: ""
        };
        return snapshot();
      },
      update(patch = {}) {
        const allowed = {};
        for (const key of [
          "processedItems", "totalItems", "processedLibraries", "totalLibraries",
          "currentLibraryKey", "scopeKey", "scopeConfidence", "activeGeneration"
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
          errorCode: ""
        });
      },
      fail(errorCode, details = {}) {
        return replace({
          state: "error",
          currentLibraryKey: "",
          activeGeneration: details.activeGeneration ?? value.activeGeneration,
          errorCode: String(errorCode || "index_build_failed")
        });
      },
      cancel(details = {}) {
        const activeGeneration = details.activeGeneration ?? value.activeGeneration;
        return replace({
          state: activeGeneration == null ? "not_built" : "ready",
          currentLibraryKey: "",
          activeGeneration,
          errorCode: ""
        });
      },
      hydrate(meta) {
        if (!meta) return snapshot();
        const hydratedState = meta.scopeConfidence === "legacy" && meta.state === "ready"
          ? "stale"
          : meta.state;
        return replace({
          state: ["not_built", "building", "ready", "stale", "error"].includes(hydratedState)
            ? hydratedState
            : "not_built",
          scopeKey: String(meta.scopeKey || ""),
          scopeConfidence: meta.scopeConfidence === "stable" ? "stable" : meta.scopeConfidence === "legacy" ? "legacy" : null,
          activeGeneration: meta.activeGeneration ?? null,
          errorCode: String(meta.errorCode || ""),
          startedAt: meta.lastAttemptAt ?? null
        });
      },
      snapshot
    });
  }

  return { createIndexBuildProgress };
});
