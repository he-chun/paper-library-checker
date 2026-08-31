(function (root, factory) {
  const api = factory();
  root.PLCBackendContract = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CAPABILITY_SCHEMA_KEYS = Object.freeze([
    "mode", "engine", "indexState", "freshness",
    "exactIdentifierVerification", "completeIdentifierRecall",
    "exactTitleVerification", "completeTitleRecall",
    "fuzzyTitle", "possibleMatch", "realtimeIndex", "batch",
    "authenticatedProtocol", "complete"
  ]);

  const DEFAULT_CAPABILITIES = Object.freeze({
    mode: "standard",
    engine: "direct",
    indexState: "unavailable",
    freshness: "unavailable",
    exactIdentifierVerification: false,
    completeIdentifierRecall: false,
    exactTitleVerification: false,
    completeTitleRecall: false,
    fuzzyTitle: false,
    possibleMatch: false,
    realtimeIndex: false,
    batch: false,
    authenticatedProtocol: false,
    complete: false
  });

  function createCapabilities(values = {}) {
    const contract = {};
    for (const key of CAPABILITY_SCHEMA_KEYS) {
      contract[key] = values[key] ?? DEFAULT_CAPABILITIES[key];
    }
    // Compatibility aliases remain projections of the canonical contract.
    contract.exactIdentifiers = values.exactIdentifiers ?? contract.exactIdentifierVerification;
    contract.exactTitle = values.exactTitle ?? contract.exactTitleVerification;
    contract.completeNegativeResults = values.completeNegativeResults ?? contract.complete;
    return Object.freeze(contract);
  }

  function withResultContract(result, capabilities) {
    if (!result || typeof result !== "object" || Array.isArray(result)) return result;
    const projected = { ...result };
    for (const key of ["mode", "engine", "indexState", "freshness"]) {
      if (projected[key] === undefined && capabilities?.[key] !== undefined) projected[key] = capabilities[key];
    }
    if (projected.complete === undefined && typeof capabilities?.complete === "boolean") {
      projected.complete = capabilities.complete;
    }
    return projected;
  }

  function withBatchResultContract(payload, capabilities) {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.results)) return payload;
    return { ...payload, results: payload.results.map((result) => withResultContract(result, capabilities)) };
  }

  function isIncompleteNotFound(result) {
    return result?.status === "not_found" && result.complete === false;
  }

  return {
    CAPABILITY_SCHEMA_KEYS,
    DEFAULT_CAPABILITIES,
    createCapabilities,
    isIncompleteNotFound,
    withBatchResultContract,
    withResultContract
  };
});
