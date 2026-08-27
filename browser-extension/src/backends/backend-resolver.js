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
  const STANDARD_BACKEND_UNAVAILABLE = "standard_backend_unavailable";

  function normalizeConnectionMode(value) {
    return Object.values(CONNECTION_MODES).includes(value) ? value : CONNECTION_MODES.AUTO;
  }

  function makeUnavailableError() {
    const error = new Error(STANDARD_BACKEND_UNAVAILABLE);
    error.code = STANDARD_BACKEND_UNAVAILABLE;
    error.status = 503;
    return error;
  }

  function createUnavailableStandardBackend() {
    const reject = () => Promise.reject(makeUnavailableError());
    return Object.freeze({
      probe: reject,
      check: reject,
      batchCheck: reject,
      getCapabilities() {
        return Object.freeze({
          mode: CONNECTION_MODES.STANDARD,
          available: false,
          probe: false,
          check: false,
          batchCheck: false
        });
      }
    });
  }

  function createBackendResolver(dependencies = {}) {
    const storage = dependencies.storage || runtimeRoot.chrome?.storage;
    const enhancedBackend = dependencies.enhancedBackend;
    const standardBackend = dependencies.standardBackend || createUnavailableStandardBackend();

    function resolveMode(value) {
      const mode = normalizeConnectionMode(value);
      return {
        mode,
        backend: mode === CONNECTION_MODES.STANDARD ? standardBackend : enhancedBackend
      };
    }

    async function resolve() {
      const options = await storage.sync.get({ connectionMode: CONNECTION_MODES.AUTO });
      return resolveMode(options.connectionMode);
    }

    return Object.freeze({ resolve, resolveMode });
  }

  return {
    CONNECTION_MODES,
    STANDARD_BACKEND_UNAVAILABLE,
    createBackendResolver,
    createUnavailableStandardBackend,
    makeUnavailableError,
    normalizeConnectionMode
  };
});
