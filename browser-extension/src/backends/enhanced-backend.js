(function (root, factory) {
  const api = factory(
    root,
    root.PLCRequestAuth || (typeof require === "function" ? require("../common/request-auth.js") : null),
    root.PLCCandidateNormalization ||
      (typeof require === "function" ? require("../common/candidate-normalization.js") : null)
  );
  root.PLCEnhancedBackend = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (runtimeRoot, defaultRequestAuth, defaultCandidateNormalization) {
  "use strict";

  const DEFAULT_ENDPOINT = "http://127.0.0.1:23119/zotero-checker";
  const CAPABILITIES = Object.freeze({
    mode: "enhanced",
    probe: true,
    check: true,
    batchCheck: true,
    authenticated: true
  });

  function makeLocalApiError(status, code) {
    const error = new Error(code);
    error.status = status;
    error.code = code;
    return error;
  }

  function validateLoopbackEndpoint(value) {
    const url = new URL(value);
    if (url.protocol !== "http:" || url.username || url.password || url.search || url.hash ||
        !["127.0.0.1", "localhost"].includes(url.hostname) ||
        url.pathname.replace(/\/$/, "") !== "/zotero-checker") {
      throw new Error("Zotero endpoint must use HTTP on a loopback hostname");
    }
    return url.href.replace(/\/$/, "");
  }

  function createEnhancedBackend(dependencies = {}) {
    const requestAuth = dependencies.requestAuth || defaultRequestAuth;
    const candidateNormalization = dependencies.candidateNormalization || defaultCandidateNormalization;
    const storage = dependencies.storage || runtimeRoot.chrome?.storage;
    const fetchImpl = dependencies.fetch || ((...args) => runtimeRoot.fetch(...args));

    async function getConnectionOptions() {
      const [stored, secrets] = await Promise.all([
        storage.sync.get({ endpoint: DEFAULT_ENDPOINT }),
        storage.local.get({ token: "" })
      ]);
      return { endpoint: stored.endpoint || DEFAULT_ENDPOINT, token: secrets.token || "" };
    }

    async function request(path, body, method = "POST") {
      const options = await getConnectionOptions();
      const endpoint = validateLoopbackEndpoint(options.endpoint);
      if (!requestAuth.isUsableSecret(options.token)) {
        throw new Error("Pairing token is not configured");
      }

      const payload = method === "GET"
        ? null
        : path === "/batch-check"
          ? { items: (body || []).map(candidateNormalization.normalizeCandidateForLocalAPI) }
          : { item: candidateNormalization.normalizeCandidateForLocalAPI(body) };
      const bodyText = payload ? JSON.stringify(payload) : "";
      const headers = await requestAuth.createHeaders({
        secret: options.token,
        method,
        path: `/zotero-checker${path}`,
        body: bodyText
      });
      const response = await fetchImpl(`${endpoint}${path}`, {
        method,
        headers,
        body: payload ? bodyText : undefined
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw makeLocalApiError(response.status, result.error || "request_failed");
      return result;
    }

    return Object.freeze({
      probe() {
        return request("/health", null, "GET");
      },
      check(candidate) {
        return request("/check", candidate);
      },
      batchCheck(candidates) {
        return request("/batch-check", candidates);
      },
      getCapabilities() {
        return CAPABILITIES;
      }
    });
  }

  return {
    CAPABILITIES,
    DEFAULT_ENDPOINT,
    createEnhancedBackend,
    makeLocalApiError,
    validateLoopbackEndpoint
  };
});
