(function (root, factory) {
  const api = factory(root);
  root.PLCBackendResolver = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (runtimeRoot) {
  "use strict";

  const CONNECTION_MODES = Object.freeze({
    AUTO: "auto",
    STANDARD: "standard",
    ENHANCED: "enhanced"
  });

  function normalizeConnectionMode(value) {
    return Object.values(CONNECTION_MODES).includes(value) ? value : CONNECTION_MODES.AUTO;
  }

  function enhancedProbeFailure(result, extensionVersion) {
    if (!result || result.ok !== true) return "enhanced_backend_unavailable";
    if (result.version !== extensionVersion) return "enhanced_backend_incompatible";
    if (result.indexReady !== true) return "enhanced_index_unavailable";
    return "";
  }

  function errorReason(error) {
    return error?.code || "enhanced_backend_unavailable";
  }

  function createBackendResolver(dependencies = {}) {
    const storage = dependencies.storage || runtimeRoot.chrome?.storage;
    const enhancedBackend = dependencies.enhancedBackend;
    const standardBackend = dependencies.standardBackend;
    const getExtensionVersion = dependencies.getExtensionVersion ||
      (() => runtimeRoot.chrome?.runtime?.getManifest?.().version || "");

    async function resolveMode(value) {
      const mode = normalizeConnectionMode(value);
      if (mode === CONNECTION_MODES.ENHANCED) {
        return { mode, selectedMode: CONNECTION_MODES.ENHANCED, backend: enhancedBackend };
      }
      if (mode === CONNECTION_MODES.STANDARD) {
        return { mode, selectedMode: CONNECTION_MODES.STANDARD, backend: standardBackend };
      }

      let degradedReason = "";
      try {
        const probeResult = await enhancedBackend.probe();
        degradedReason = enhancedProbeFailure(probeResult, getExtensionVersion());
        if (!degradedReason) {
          return { mode, selectedMode: CONNECTION_MODES.ENHANCED, backend: enhancedBackend, probeResult };
        }
      } catch (error) {
        degradedReason = errorReason(error);
      }

      try {
        const probeResult = await standardBackend.probe();
        return {
          mode,
          selectedMode: CONNECTION_MODES.STANDARD,
          backend: standardBackend,
          probeResult,
          degradedReason
        };
      } catch (error) {
        error.degradedReason = degradedReason;
        throw error;
      }
    }

    async function resolve() {
      const options = await storage.sync.get({ connectionMode: CONNECTION_MODES.AUTO });
      return resolveMode(options.connectionMode);
    }

    return Object.freeze({ resolve, resolveMode });
  }

  return {
    CONNECTION_MODES,
    createBackendResolver,
    enhancedProbeFailure,
    errorReason,
    normalizeConnectionMode
  };
});
