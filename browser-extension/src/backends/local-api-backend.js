(function (root, factory) {
  const api = factory(
    root,
    root.PLCLocalApiMatcher || (typeof require === "function" ? require("./local-api-matcher.js") : null)
  );
  root.PLCLocalApiBackend = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (runtimeRoot, defaultMatcher) {
  "use strict";

  const DEFAULT_ENDPOINT = "http://127.0.0.1:23119/api/";
  const REQUEST_TIMEOUT_MS = 3000;
  const CAPABILITIES = Object.freeze({
    exactIdentifiers: true,
    exactTitle: true,
    fuzzyTitle: false,
    possibleMatch: false,
    batch: false,
    realtimeIndex: false,
    authenticatedProtocol: false
  });

  function makeLocalApiError(code, status) {
    const error = new Error(code);
    error.code = code;
    if (status != null) error.status = status;
    return error;
  }

  function validateLocalApiEndpoint(value) {
    const url = new URL(value);
    if (url.protocol !== "http:" || url.username || url.password || url.search || url.hash ||
        !["127.0.0.1", "localhost"].includes(url.hostname) ||
        url.port !== "23119" || url.pathname !== "/api/") {
      throw makeLocalApiError("invalid_local_api_endpoint");
    }
    return url.href;
  }

  function createLocalApiBackend(dependencies = {}) {
    const endpoint = validateLocalApiEndpoint(dependencies.endpoint || DEFAULT_ENDPOINT);
    const fetchImpl = dependencies.fetch || ((...args) => runtimeRoot.fetch(...args));
    const matcher = dependencies.matcher || defaultMatcher;
    const timeoutMs = dependencies.timeoutMs == null ? REQUEST_TIMEOUT_MS : dependencies.timeoutMs;

    async function request(url) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchImpl(url, {
          method: "GET",
          headers: {
            "Zotero-API-Version": "3",
            "Zotero-Allowed-Request": "true"
          },
          signal: controller.signal
        });
      } catch (error) {
        if (error?.name === "AbortError") throw makeLocalApiError("local_api_timeout");
        throw makeLocalApiError("local_api_unavailable");
      } finally {
        clearTimeout(timeout);
      }
      if (response.status === 403) throw makeLocalApiError("local_api_disabled", 403);
      if (response.status === 501) throw makeLocalApiError("local_api_incompatible", 501);
      if (!response.ok) throw makeLocalApiError("local_api_unavailable", response.status);
      return response;
    }

    async function probe() {
      const response = await request(endpoint);
      const apiVersion = response.headers?.get?.("Zotero-API-Version") || "";
      if (apiVersion !== "3") throw makeLocalApiError("local_api_incompatible");
      return { ok: true, version: apiVersion, indexReady: true };
    }

    async function readItems(term) {
      const url = new URL("users/0/items", endpoint);
      url.searchParams.set("format", "json");
      url.searchParams.set("include", "data");
      url.searchParams.set("itemType", "-attachment");
      url.searchParams.set("qmode", "everything");
      url.searchParams.set("q", term);
      const response = await request(url.href);
      let payload;
      try {
        payload = await response.json();
      } catch (_error) {
        throw makeLocalApiError("local_api_malformed_response");
      }
      if (!Array.isArray(payload)) throw makeLocalApiError("local_api_malformed_response");
      return payload;
    }

    async function check(candidate) {
      const terms = matcher.searchTerms(candidate);
      if (!terms.length) return { status: "not_found", matchType: null, confidence: 0 };
      const items = [];
      for (const term of terms) items.push(...await readItems(term));
      return matcher.matchCandidate(candidate, items);
    }

    function batchCheck() {
      return Promise.reject(makeLocalApiError("standard_batch_unavailable", 501));
    }

    return Object.freeze({ check, batchCheck, getCapabilities: () => CAPABILITIES, probe });
  }

  return {
    CAPABILITIES,
    DEFAULT_ENDPOINT,
    REQUEST_TIMEOUT_MS,
    createLocalApiBackend,
    makeLocalApiError,
    validateLocalApiEndpoint
  };
});
