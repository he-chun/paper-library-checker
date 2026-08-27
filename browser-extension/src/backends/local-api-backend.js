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
  const DEFAULT_CONCURRENCY = 1;
  const MAX_CONCURRENCY = 6;
  const FOREGROUND_PRIORITY = 1;
  const REFERENCE_PRIORITY = 0;
  const TIMEOUT_COOLDOWN_MS = 60000;
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
    const limit = Math.max(1, Math.min(MAX_CONCURRENCY, Math.floor(maximum || DEFAULT_CONCURRENCY)));
    const queue = [];
    let active = 0;
    let sequence = 0;

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

    return function schedule(task, signal, priority = REFERENCE_PRIORITY) {
      return new Promise((resolve, reject) => {
        queue.push({ task, signal, resolve, reject, priority, sequence: sequence++ });
        queue.sort((left, right) => right.priority - left.priority || left.sequence - right.sequence);
        drain();
      });
    };
  }

  function requestPriorityForWorkload(workload) {
    return workload === "references" ? REFERENCE_PRIORITY : FOREGROUND_PRIORITY;
  }

  function notifyBatchProgress(callback, index, result) {
    if (typeof callback !== "function") return;
    const minimized = {
      status: result?.status || "error",
      matchType: result?.matchType || null,
      confidence: Number.isFinite(result?.confidence) ? result.confidence : 0
    };
    if (typeof result?.error === "string") minimized.error = result.error;
    if (typeof result?.reason === "string") minimized.reason = result.reason;
    try {
      callback({ index, result: minimized });
    } catch (_error) {
      // Rendering progress must never affect the final batch result.
    }
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
    const timeoutCooldownMs = dependencies.timeoutCooldownMs == null ? TIMEOUT_COOLDOWN_MS : dependencies.timeoutCooldownMs;
    const now = dependencies.now || Date.now;
    const clock = dependencies.clock || Date.now;
    const onDiagnostic = typeof dependencies.onDiagnostic === "function" ? dependencies.onDiagnostic : () => {};
    const schedule = createLimiter(dependencies.concurrency || DEFAULT_CONCURRENCY);
    const queryCache = new Map();
    const queryInFlight = new Map();
    let groupCache = { expiresAt: 0, value: null, promise: null };
    const activeBatches = new Map();
    let batchSequence = 0;
    let itemQueryCooldownUntil = 0;

    function report(event, details) {
      try {
        onDiagnostic(event, { backend: "standard", ...details });
      } catch (_error) {
        // Diagnostics must never affect matching.
      }
    }

    function elapsed(startedAt) {
      return Math.max(0, clock() - startedAt);
    }

    function cooldownRemaining() {
      return Math.max(0, itemQueryCooldownUntil - now());
    }

    async function requestDirect(url, externalSignal, phase, details = {}) {
      const remaining = phase === "item_query" ? cooldownRemaining() : 0;
      if (remaining > 0) {
        report("backend_request_skipped", {
          phase,
          ...details,
          durationMs: 0,
          error: "local_api_timeout",
          cooldownMs: remaining
        });
        throw makeLocalApiError("local_api_timeout");
      }
      const controller = new AbortController();
      const abortFromExternal = () => controller.abort();
      if (externalSignal?.aborted) throw makeLocalApiError("batch_superseded");
      externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const startedAt = clock();
      let response;
      report("backend_request_started", { phase, ...details });
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
        const mapped = externalSignal?.aborted
          ? makeLocalApiError("batch_superseded")
          : error?.name === "AbortError"
            ? makeLocalApiError("local_api_timeout")
            : makeLocalApiError("local_api_unavailable");
        if (phase === "item_query" && mapped.code === "local_api_timeout") {
          itemQueryCooldownUntil = Math.max(itemQueryCooldownUntil, now() + timeoutCooldownMs);
        }
        report("backend_request_failed", {
          phase,
          ...details,
          durationMs: elapsed(startedAt),
          error: mapped.code
        });
        throw mapped;
      } finally {
        clearTimeout(timeout);
        externalSignal?.removeEventListener("abort", abortFromExternal);
      }
      let responseError = null;
      if (response.status === 403) responseError = makeLocalApiError("local_api_disabled", 403);
      else if (response.status === 501) responseError = makeLocalApiError("local_api_incompatible", 501);
      else if (!response.ok) responseError = makeLocalApiError("local_api_unavailable", response.status);
      if (responseError) {
        report("backend_request_failed", {
          phase,
          ...details,
          durationMs: elapsed(startedAt),
          httpStatus: response.status,
          error: responseError.code
        });
        throw responseError;
      }
      report("backend_request_completed", {
        phase,
        ...details,
        durationMs: elapsed(startedAt),
        httpStatus: response.status
      });
      return response;
    }

    function request(url, signal, phase, details, priority) {
      return schedule(() => requestDirect(url, signal, phase, details), signal, priority);
    }

    async function readJsonArray(url, signal, phase, details, priority) {
      const response = await request(url, signal, phase, details, priority);
      let payload;
      try {
        payload = await response.json();
      } catch (_error) {
        report("backend_response_failed", { phase, ...details, error: "local_api_malformed_response" });
        throw makeLocalApiError("local_api_malformed_response");
      }
      if (!Array.isArray(payload)) {
        report("backend_response_failed", { phase, ...details, error: "local_api_malformed_response" });
        throw makeLocalApiError("local_api_malformed_response");
      }
      return payload;
    }

    async function probe() {
      const response = await requestDirect(endpoint, null, "probe");
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

    async function getGroupIDs(signal, batchId, priority) {
      if (groupCache.value && groupCache.expiresAt > now()) {
        report("cache_used", { phase: "group_list", cache: "hit", resultCount: groupCache.value.length, batchId });
        return groupCache.value;
      }
      if (groupCache.promise) {
        report("cache_used", { phase: "group_list", cache: "inflight", batchId });
        return groupCache.promise;
      }
      const url = new URL("users/0/groups", endpoint);
      url.searchParams.set("format", "json");
      const promise = readJsonArray(url.href, null, "group_list", { batchId }, priority).then((payload) => {
        const value = parseGroupIDs(payload);
        report("group_list_loaded", { libraryCount: value.length + 1, batchId });
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

    async function readItems(libraryPath, query, signal, batchId, priority) {
      const url = new URL(`${libraryPath}/items`, endpoint);
      url.searchParams.set("format", "json");
      url.searchParams.set("include", "data");
      url.searchParams.set("itemType", "-attachment");
      url.searchParams.set("qmode", query.qmode);
      url.searchParams.set("q", query.term);
      const key = url.href;
      const cached = cachedQuery(key);
      const library = libraryPath === "users/0" ? "personal" : "group";
      if (cached) {
        report("cache_used", { phase: "item_query", cache: "hit", library, queryType: query.type, resultCount: cached.length, batchId });
        return cached;
      }
      const existing = queryInFlight.get(key);
      if (existing && existing.signal === signal) {
        report("cache_used", { phase: "item_query", cache: "inflight", library, queryType: query.type, batchId });
        return existing.promise;
      }
      const promise = readJsonArray(key, signal, "item_query", { library, queryType: query.type, batchId }, priority).then((payload) => {
        cacheQuery(key, payload);
        report("query_results_received", { library, queryType: query.type, resultCount: payload.length, batchId });
        return payload;
      }).finally(() => {
        if (queryInFlight.get(key)?.promise === promise) queryInFlight.delete(key);
      });
      queryInFlight.set(key, { promise, signal });
      return promise;
    }

    function searchQueries(candidate) {
      const title = String(candidate?.title || "").trim();
      if (title) return [{ term: title, type: "title", qmode: "titleCreatorYear" }];
      const prepared = matcher.prepareCandidate(candidate);
      const queries = [];
      for (const type of matcher.IDENTIFIER_PRIORITY) {
        const term = prepared.identifiers[type];
        if (term) queries.push({ term, type, qmode: "everything" });
      }
      const seen = new Set();
      return queries.filter((query) => {
        const key = `${query.qmode}\n${query.term}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    async function libraryPaths(signal, batchId, priority) {
      let groupError = null;
      let groupIDs = [];
      try {
        groupIDs = await getGroupIDs(signal, batchId, priority);
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
      const batchId = options.batchId;
      const priority = requestPriorityForWorkload(options.workload);
      const queries = searchQueries(candidate);
      if (!queries.length) return { status: "not_found", matchType: null, confidence: 0 };
      const prepared = matcher.prepareCandidate(candidate);
      const hasIdentifiers = Object.keys(prepared.identifiers).length > 0;
      const { paths, groupError } = await libraryPaths(signal, batchId, priority);
      const errors = groupError ? [groupError] : [];
      const seenItems = new Set();
      const successfulLibraries = new Set();
      let titleFallback = null;

      for (const query of queries) {
        for (const path of paths) {
          try {
            const items = await readItems(path, query, signal, batchId, priority);
            successfulLibraries.add(path);
            const uniqueItems = items.filter((item) => {
              const key = matcher.itemFingerprint(item);
              if (!key || seenItems.has(key)) return false;
              seenItems.add(key);
              return true;
            });
            const result = matcher.matchCandidate(candidate, uniqueItems);
            if (result.status === "matched") {
              if (result.matchType !== "title" || !hasIdentifiers) return result;
              titleFallback = titleFallback || result;
            }
          } catch (error) {
            if (error.code === "batch_superseded") throw error;
            errors.push(error);
          }
        }
      }

      if (errors.length) throw errors[0];
      if (titleFallback) return titleFallback;
      if (!successfulLibraries.size) throw makeLocalApiError("local_api_unavailable");
      return { status: "not_found", matchType: null, confidence: 0 };
    }

    async function batchCheck(candidates, options = {}) {
      if (!Array.isArray(candidates)) throw makeLocalApiError("invalid_batch_candidates");
      const scope = String(options.scope == null ? "default" : options.scope);
      const batchKey = JSON.stringify(candidates.map((candidate) => matcher.candidateKey(candidate)));
      const existing = activeBatches.get(scope);
      if (existing?.key === batchKey) {
        report("batch_reused", {
          operation: "batch",
          workload: options.workload,
          batchId: existing.batchId,
          inputCount: candidates.length
        });
        return existing.promise;
      }
      if (existing) existing.controller.abort();
      const controller = new AbortController();
      const startedAt = clock();
      const batchId = Number.isFinite(options.batchId) ? options.batchId : ++batchSequence;

      const unique = new Map();
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        const key = matcher.candidateKey(candidate);
        if (!unique.has(key)) unique.set(key, { candidate, indices: [], promise: null });
        unique.get(key).indices.push(index);
      }
      report("batch_started", {
        operation: "batch",
        workload: options.workload,
        batchId,
        inputCount: candidates.length,
        uniqueCount: unique.size,
        concurrency: dependencies.concurrency || DEFAULT_CONCURRENCY
      });
      const active = { batchId, controller, key: batchKey, promise: null };
      active.promise = (async () => {
        for (const entry of unique.values()) {
          const resultPromise = check(entry.candidate, {
            signal: controller.signal,
            batchId,
            workload: options.workload
          }).catch((error) => ({
            status: "error",
            matchType: null,
            confidence: 0,
            error: error.code || "local_api_unavailable"
          }));
          entry.promise = resultPromise.then((result) => {
            for (const index of entry.indices) {
              notifyBatchProgress(options.onProgress, index, result);
            }
            return result;
          });
        }

        const results = await Promise.all(candidates.map((candidate) => unique.get(matcher.candidateKey(candidate)).promise));
        const errorCount = results.filter((result) => result.status === "error").length;
        report("batch_completed", {
          operation: "batch",
          workload: options.workload,
          batchId,
          inputCount: candidates.length,
          uniqueCount: unique.size,
          durationMs: elapsed(startedAt),
          matchedCount: results.filter((result) => result.status === "matched").length,
          notFoundCount: results.filter((result) => result.status === "not_found").length,
          errorCount,
          outcome: errorCount === 0 ? "ok" : errorCount === results.length ? "error" : "partial"
        });
        return { results };
      })().finally(() => {
        if (activeBatches.get(scope) === active) activeBatches.delete(scope);
      });
      activeBatches.set(scope, active);
      return active.promise;
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
    MAX_CONCURRENCY,
    TIMEOUT_COOLDOWN_MS,
    createLimiter,
    createLocalApiBackend,
    makeLocalApiError,
    validateLocalApiEndpoint
  };
});
