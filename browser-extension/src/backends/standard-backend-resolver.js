(function (root, factory) {
  const api = factory();
  root.PLCStandardBackendResolver = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DIRECT_BATCH_FALLBACK_LIMIT = 10;

  function indexGateResult(code, indexState) {
    return {
      status: "error",
      matchType: null,
      confidence: 0,
      complete: false,
      mode: "standard",
      engine: "direct",
      indexState,
      error: code
    };
  }

  function createStandardBackendResolver(dependencies = {}) {
    const directBackend = dependencies.directBackend;
    const getIndexedBackend = dependencies.getIndexedBackend;
    const getIndexStatus = dependencies.getIndexStatus;
    const startIndexBuild = dependencies.startIndexBuild;
    if (!directBackend || typeof getIndexedBackend !== "function" || typeof getIndexStatus !== "function") {
      throw new Error("standard_backend_resolver_dependencies_required");
    }
    let capabilities = directBackend.getCapabilities();

    async function selection() {
      let status;
      try {
        status = await getIndexStatus();
      } catch (error) {
        status = { state: "error", activeGeneration: null, errorCode: error?.code || "indexeddb_unavailable" };
      }
      if (["ready", "stale", "refreshing", "error"].includes(status?.state) &&
          status.scopeKey && status.activeGeneration != null) {
        const backend = getIndexedBackend();
        capabilities = backend.getCapabilities();
        return { backend, status, engine: "indexed" };
      }
      capabilities = directBackend.getCapabilities();
      return { backend: directBackend, status: status || { state: "not_built" }, engine: "direct" };
    }

    function suggestBuild(status) {
      if (["building", "refreshing"].includes(status?.state) || typeof startIndexBuild !== "function") return;
      try {
        startIndexBuild();
      } catch (_error) {
        // The stable gate result remains useful when a build cannot start.
      }
    }

    return Object.freeze({
      async probe() {
        const resolved = await selection();
        const value = await resolved.backend.probe();
        if (resolved.engine === "direct" && ["not_built", "error"].includes(resolved.status?.state)) {
          suggestBuild(resolved.status);
        }
        capabilities = resolved.backend.getCapabilities();
        return value;
      },
      async check(candidate, options) {
        const resolved = await selection();
        if (resolved.engine === "direct" && ["not_built", "error"].includes(resolved.status?.state)) {
          suggestBuild(resolved.status);
        }
        return resolved.backend.check(candidate, options);
      },
      async batchCheck(candidates, options = {}) {
        if (!Array.isArray(candidates)) throw new Error("invalid_batch_candidates");
        const resolved = await selection();
        if (resolved.engine === "indexed" || candidates.length <= DIRECT_BATCH_FALLBACK_LIMIT) {
          return resolved.backend.batchCheck(candidates, options);
        }
        const code = resolved.status.state === "building" ? "index_building" : "index_required";
        suggestBuild(resolved.status);
        const results = candidates.map((_candidate, index) => {
          const value = indexGateResult(code, resolved.status.state || "not_built");
          if (typeof options.onProgress === "function") {
            try { options.onProgress({ index, result: { ...value } }); } catch (_error) {}
          }
          return value;
        });
        return { results };
      },
      getCapabilities: () => capabilities
    });
  }

  return { DIRECT_BATCH_FALLBACK_LIMIT, createStandardBackendResolver, indexGateResult };
});
