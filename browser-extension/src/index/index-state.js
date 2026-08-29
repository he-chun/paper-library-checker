(function (root, factory) {
  const api = factory();
  root.PLCIndexState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const INDEX_STATES = Object.freeze({
    NOT_BUILT: "not_built",
    BUILDING: "building",
    READY: "ready",
    STALE: "stale",
    ERROR: "error"
  });

  function isIndexState(value) {
    return Object.values(INDEX_STATES).includes(value);
  }

  function createInitialMeta(scopeKey, schemaVersion) {
    return {
      scopeKey: String(scopeKey),
      schemaVersion,
      activeGeneration: null,
      pendingGeneration: null,
      scopeConfidence: null,
      state: INDEX_STATES.NOT_BUILT,
      lastSuccessfulBuildAt: null,
      lastAttemptAt: null,
      errorCode: ""
    };
  }

  return { INDEX_STATES, createInitialMeta, isIndexState };
});
