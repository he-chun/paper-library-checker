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
  const REQUEST_TIMEOUT_MS = 30000;
  const DEFAULT_CONCURRENCY = 6;
  const QUERY_CACHE_TTL_MS = 5000;
  const QUERY_CACHE_MAX_ENTRIES = 256;
  const GROUP_CACHE_TTL_MS = 30000;
  const CAPABILITIES = Object.freeze({
    exactIdentifiers: true,
    exactTitle: true,
    fuzzyTitle: false,
    possibleMatch: false,
    batch: true,
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

  function createLimiter(maximum) {
    const limit = Math.max(1, Math.min(DEFAULT_CONCURRENCY, Math.floor(maximum || DEFAULT_CONCURRENCY)));
    const queue = [];
    let active = 0;

    function drain() {
      while (active < limit && queue.length) {
        const entry = queue.shift();
        if (entry.signal?.aborted) {
          entry.reject(makeLocalApiError("batch_superseded"));
          continue;
        }
        active += 1;
        Promise.resolve().then(entry.task).then(entry.resolve, entry.reject).finally(() => {
          active -= 1;
          drain();
        });
      }
    }

    return function schedule(task, signal) {
      return new Promise((resolve, reject) => {
        queue.push({ task, signal, resolve, reject });
        drain();
      });
    };
  }

  function createLocalApiBackend(dependencies = {}) {
    const endpoint = validateLocalApiEndpoint(dependencies.endpoint || DEFAULT_ENDPOINT);
    const fetchImpl = dependencies.fetch || ((...args) => runtimeRoot.fetch(...args));
    const matcher = dependencies.matcher || defaultMatcher;
    const timeoutMs = dependencies.timeoutMs == null ? REQUEST_TIMEOUT_MS : dependencies.timeoutMs;
    const queryCacheTtlMs = dependencies.queryCacheTtlMs == null ? QUERY_CACHE_TTL_MS : dependencies.queryCacheTtlMs;
    const queryCacheMaxEntries = dependencies.queryCacheMaxEntries == null
      ? QUERY_CACHE_MAX_ENTRIES
      : Math.max(1, Math.floor(dependencies.queryCacheMaxEntries));
    const groupCacheTtlMs = dependencies.groupCacheTtlMs == null ? GROUP_CACHE_TTL_MS : dependencies.groupCacheTtlMs;
    const now = dependencies.now || Date.now;
    const schedule = createLimiter(dependencies.concurrency || DEFAULT_CONCURRENCY);
    const queryCache = new Map();
    const queryInFlight = new Map();
    let groupCache = { expiresAt: 0, value: null, promise: null };
    let activeBatchController = null;

    async function requestDirect(url, externalSignal) {
      const controller = new AbortController();
      const abortFromExternal = () => controller.abort();
      if (externalSignal?.aborted) throw makeLocalApiError("batch_superseded");
      externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
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
        if (externalSignal?.aborted) throw makeLocalApiError("batch_superseded");
        if (error?.name === "AbortError") throw makeLocalApiError("local_api_timeout");
        throw makeLocalApiError("local_api_unavailable");
      } finally {
        clearTimeout(timeout);
        externalSignal?.removeEventListener("abort", abortFromExternal);
      }
      if (response.status === 403) throw makeLocalApiError("local_api_disabled", 403);
      if (response.status === 501) throw makeLocalApiError("local_api_incompatible", 501);
      if (!response.ok) throw makeLocalApiError("local_api_unavailable", response.status);
      return response;
    }

    function request(url, signal) {
      return schedule(() => requestDirect(url, signal), signal);
    }

    async function readJsonArray(url, signal) {
      const response = await request(url, signal);
      let payload;
      try {
        payload = await response.json();
      } catch (_error) {
        throw makeLocalApiError("local_api_malformed_response");
      }
      if (!Array.isArray(payload)) throw makeLocalApiError("local_api_malformed_response");
      return payload;
    }

    async function probe() {
      const response = await request(endpoint);
      const apiVersion = response.headers?.get?.("Zotero-API-Version") || "";
      if (apiVersion !== "3") throw makeLocalApiError("local_api_incompatible");
      return { ok: true, version: apiVersion, indexReady: true };
    }

    function parseGroupIDs(payload) {
      const result = [];
      const seen = new Set();
      for (const entry of payload) {
        const value = entry?.id ?? entry?.data?.id;
        const id = String(value == null ? "" : value);
        if (!/^\d+$/.test(id) || seen.has(id)) continue;
        seen.add(id);
        result.push(id);
      }
      return result;
    }

    async function getGroupIDs(signal) {
      if (groupCache.value && groupCache.expiresAt > now()) return groupCache.value;
      if (groupCache.promise) return groupCache.promise;
      const url = new URL("users/0/groups", endpoint);
      url.searchParams.set("format", "json");
      const promise = readJsonArray(url.href, signal).then((payload) => {
        const value = parseGroupIDs(payload);
        if (groupCache.promise === promise) {
          groupCache = { value, expiresAt: now() + groupCacheTtlMs, promise: null };
        }
        return value;
      }).catch((error) => {
        if (groupCache.promise === promise) groupCache.promise = null;
        throw error;
      });
      groupCache.promise = promise;
      return promise;
    }

    function cachedQuery(key) {
      const entry = queryCache.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        queryCache.delete(key);
        return null;
      }
      queryCache.delete(key);
      queryCache.set(key, entry);
      return entry.value;
    }

    function cacheQuery(key, value) {
      queryCache.delete(key);
      queryCache.set(key, { value, expiresAt: now() + queryCacheTtlMs });
      while (queryCache.size > queryCacheMaxEntries) {
        queryCache.delete(queryCache.keys().next().value);
      }
    }

    async function readItems(libraryPath, term, signal) {
      const url = new URL(`${libraryPath}/items`, endpoint);
      url.searchParams.set("format", "json");
      url.searchParams.set("include", "data");
      url.searchParams.set("itemType", "-attachment");
      url.searchParams.set("qmode", "everything");
      url.searchParams.set("q", term);
      const key = url.href;
      const cached = cachedQuery(key);
      if (cached) return cached;
      const existing = queryInFlight.get(key);
      if (existing && existing.signal === signal) return existing.promise;
      const promise = readJsonArray(key, signal).then((payload) => {
        cacheQuery(key, payload);
        return payload;
      }).finally(() => {
        if (queryInFlight.get(key)?.promise === promise) queryInFlight.delete(key);
      });
      queryInFlight.set(key, { promise, signal });
      return promise;
    }

    async function libraryPaths(signal) {
      let groupError = null;
      let groupIDs = [];
      try {
        groupIDs = await getGroupIDs(signal);
      } catch (error) {
        if (error.code === "batch_superseded") throw error;
        groupError = error;
      }
      return {
        paths: ["users/0", ...groupIDs.map((id) => `groups/${id}`)],
        groupError
      };
    }

    async function check(candidate, options = {}) {
      const signal = options.signal;
      const terms = matcher.searchTerms(candidate);
      if (!terms.length) return { status: "not_found", matchType: null, confidence: 0 };
      const { paths, groupError } = await libraryPaths(signal);
      const errors = groupError ? [groupError] : [];
      const seenItems = new Set();
      let successfulLibraries = 0;

      for (const path of paths) {
        let librarySucceeded = false;
        try {
          for (const term of terms) {
            const items = await readItems(path, term, signal);
            librarySucceeded = true;
            const uniqueItems = items.filter((item) => {
              const key = matcher.itemFingerprint(item);
              if (!key || seenItems.has(key)) return false;
              seenItems.add(key);
              return true;
            });
            const result = matcher.matchCandidate(candidate, uniqueItems);
            if (result.status === "matched") return result;
          }
        } catch (error) {
          if (error.code === "batch_superseded") throw error;
          errors.push(error);
        }
        if (librarySucceeded) successfulLibraries += 1;
      }

      if (errors.length) throw errors[0];
      if (!successfulLibraries) throw makeLocalApiError("local_api_unavailable");
      return { status: "not_found", matchType: null, confidence: 0 };
    }

    async function batchCheck(candidates) {
      if (!Array.isArray(candidates)) throw makeLocalApiError("invalid_batch_candidates");
      if (activeBatchController) activeBatchController.abort();
      const controller = new AbortController();
      activeBatchController = controller;
      groupCache.promise = null;

      const unique = new Map();
      for (const candidate of candidates) {
        const key = matcher.candidateKey(candidate);
        if (!unique.has(key)) unique.set(key, { candidate, promise: null });
      }
      for (const entry of unique.values()) {
        entry.promise = check(entry.candidate, { signal: controller.signal }).catch((error) => ({
          status: "error",
          matchType: null,
          confidence: 0,
          error: error.code || "local_api_unavailable"
        }));
      }

      const results = await Promise.all(candidates.map((candidate) => unique.get(matcher.candidateKey(candidate)).promise));
      if (activeBatchController === controller) activeBatchController = null;
      return { results };
    }

    return Object.freeze({
      batchCheck,
      check,
      getCapabilities: () => CAPABILITIES,
      probe
    });
  }

  return {
    CAPABILITIES,
    DEFAULT_CONCURRENCY,
    DEFAULT_ENDPOINT,
    GROUP_CACHE_TTL_MS,
    QUERY_CACHE_MAX_ENTRIES,
    QUERY_CACHE_TTL_MS,
    REQUEST_TIMEOUT_MS,
    createLimiter,
    createLocalApiBackend,
    makeLocalApiError,
    validateLocalApiEndpoint
  };
});
