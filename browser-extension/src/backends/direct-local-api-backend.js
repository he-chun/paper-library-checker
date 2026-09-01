(function (root, factory) {
  const api = factory(
    root,
    root.PLCLocalApiMatcher || (typeof require === "function" ? require("./local-api-matcher.js") : null),
    root.PLCBackendContract || (typeof require === "function" ? require("../common/backend-contract.js") : null)
  );
  root.PLCDirectLocalApiBackend = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (runtimeRoot, defaultMatcher, backendContract) {
  "use strict";

  const DEFAULT_ENDPOINT = "http://127.0.0.1:23119/api/";
  const REQUEST_TIMEOUT_MS = 30000;
  const DEFAULT_CONCURRENCY = 4;
  const IDENTIFIER_CONCURRENCY = 1;
  const MAX_CONCURRENCY = 4;
  const FOREGROUND_PRIORITY = 1;
  const REFERENCE_PRIORITY = 0;
  const INDEX_PRIORITY = -1;
  const INDEX_PAGE_SIZE = 250;
  const TIMEOUT_COOLDOWN_MS = 60000;
  const QUERY_CACHE_TTL_MS = 5000;
  const QUERY_CACHE_MAX_ENTRIES = 256;
  const GROUP_CACHE_TTL_MS = 30000;
  const CAPABILITIES = backendContract.createCapabilities({
    mode: "standard",
    engine: "direct",
    indexState: "unavailable",
    freshness: "unavailable",
    fuzzyTitle: false,
    possibleMatch: false,
    batch: true,
    realtimeIndex: false,
    authenticatedProtocol: false,
    exactIdentifierVerification: true,
    completeIdentifierRecall: false,
    exactTitleVerification: true,
    completeTitleRecall: false,
    complete: false
  });

  function withDirectResultMetadata(result) {
    const projected = { ...result, engine: "direct", indexState: "unavailable" };
    if (projected.status === "not_found") {
      projected.complete = false;
      projected.reason = "direct_search_no_candidate";
    }
    return projected;
  }

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

  function createLimiter(maximum, laneLimits = {}) {
    const limit = Math.max(1, Math.min(MAX_CONCURRENCY, Math.floor(maximum || DEFAULT_CONCURRENCY)));
    const queue = [];
    const activeByLane = new Map();
    let active = 0;
    let sequence = 0;

    function canRun(entry) {
      const laneLimit = Math.max(1, Math.min(limit, Math.floor(laneLimits[entry.lane] || limit)));
      return (activeByLane.get(entry.lane) || 0) < laneLimit;
    }

    function drain() {
      while (active < limit && queue.length) {
        const index = queue.findIndex(canRun);
        if (index < 0) return;
        const [entry] = queue.splice(index, 1);
        if (entry.signal?.aborted) {
          entry.reject(makeLocalApiError("batch_superseded"));
          continue;
        }
        active += 1;
        activeByLane.set(entry.lane, (activeByLane.get(entry.lane) || 0) + 1);
        Promise.resolve().then(entry.task).then(entry.resolve, entry.reject).finally(() => {
          active -= 1;
          const laneActive = (activeByLane.get(entry.lane) || 1) - 1;
          if (laneActive > 0) activeByLane.set(entry.lane, laneActive);
          else activeByLane.delete(entry.lane);
          drain();
        });
      }
    }

    return function schedule(task, signal, priority = REFERENCE_PRIORITY, lane = "default") {
      return new Promise((resolve, reject) => {
        queue.push({ task, signal, resolve, reject, priority, lane, sequence: sequence++ });
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
    if (typeof result?.engine === "string") minimized.engine = result.engine;
    if (typeof result?.indexState === "string") minimized.indexState = result.indexState;
    if (typeof result?.complete === "boolean") minimized.complete = result.complete;
    try {
      callback({ index, result: minimized });
    } catch (_error) {
      // Rendering progress must never affect the final batch result.
    }
  }

  function createDirectLocalApiBackend(dependencies = {}) {
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
    const concurrency = Math.max(1, Math.min(
      MAX_CONCURRENCY,
      Math.floor(dependencies.concurrency || DEFAULT_CONCURRENCY)
    ));
    const schedule = createLimiter(concurrency, { identifier: IDENTIFIER_CONCURRENCY, index: 1 });
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
      const lane = details?.workload === "index"
        ? "index"
        : phase === "item_query" && details?.queryType !== "title" ? "identifier" : "default";
      return schedule(() => requestDirect(url, signal, phase, details), signal, priority, lane);
    }

    async function readJsonArrayResponse(url, signal, phase, details, priority) {
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
      return { payload, response };
    }

    async function readJsonArray(url, signal, phase, details, priority) {
      return (await readJsonArrayResponse(url, signal, phase, details, priority)).payload;
    }

    function headerValue(headers, name) {
      const value = headers?.get?.(name);
      return typeof value === "string" ? value.trim() : "";
    }

    function safeIntegerHeader(headers, name) {
      const text = headerValue(headers, name);
      if (!/^\d+$/.test(text)) return null;
      const value = Number(text);
      return Number.isSafeInteger(value) && value >= 0 ? value : null;
    }

    function probeInformation(response) {
      const apiVersion = headerValue(response.headers, "Zotero-API-Version");
      if (apiVersion !== "3") throw makeLocalApiError("local_api_incompatible");
      const stableInstanceHeaders = ["Zotero-Instance-ID", "Zotero-Profile-ID", "Zotero-Server-ID"];
      let instanceIdentifier = "";
      for (const name of stableInstanceHeaders) {
        const value = headerValue(response.headers, name);
        if (/^[A-Za-z0-9._:-]{8,200}$/.test(value)) {
          instanceIdentifier = value;
          break;
        }
      }
      return {
        apiVersion,
        schemaVersion: headerValue(response.headers, "Zotero-Schema-Version"),
        instanceIdentifier
      };
    }

    async function probe() {
      const response = await requestDirect(endpoint, null, "probe");
      const information = probeInformation(response);
      return { ok: true, version: information.apiVersion, indexReady: true, engine: "direct", indexState: "unavailable" };
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
      const titles = matcher.candidateTitleValues(candidate);
      if (titles.length) {
        return titles.map((term) => ({ term, type: "title", qmode: "titleCreatorYear" }));
      }
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
      if (!queries.length) return withDirectResultMetadata({ status: "not_found", matchType: null, confidence: 0 });
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
              if (result.matchType !== "title" || !hasIdentifiers) return withDirectResultMetadata(result);
              titleFallback = titleFallback || result;
            }
          } catch (error) {
            if (error.code === "batch_superseded") throw error;
            errors.push(error);
          }
        }
      }

      if (errors.length) throw errors[0];
      if (titleFallback) return withDirectResultMetadata(titleFallback);
      if (!successfulLibraries.size) throw makeLocalApiError("local_api_unavailable");
      return withDirectResultMetadata({ status: "not_found", matchType: null, confidence: 0 });
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
        concurrency
      });
      const active = { batchId, controller, key: batchKey, promise: null };
      active.promise = (async () => {
        for (const entry of unique.values()) {
          const resultPromise = check(entry.candidate, {
            signal: controller.signal,
            batchId,
            workload: options.workload
          }).catch((error) => withDirectResultMetadata({
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

    function validateLibraryPath(value) {
      const path = String(value || "");
      if (path !== "users/0" && !/^groups\/\d+$/.test(path)) {
        throw makeLocalApiError("invalid_local_api_library");
      }
      return path;
    }

    function createIndexSource() {
      return Object.freeze({
        async probe(options = {}) {
          const response = await requestDirect(endpoint, options.signal, "probe", { workload: "index" });
          return probeInformation(response);
        },
        async discoverGroupIDs(options = {}) {
          const url = new URL("users/0/groups", endpoint);
          url.searchParams.set("format", "json");
          const payload = await readJsonArray(
            url.href,
            options.signal,
            "group_list",
            { workload: "index" },
            INDEX_PRIORITY
          );
          return parseGroupIDs(payload);
        },
        async readLibraryPage(libraryPath, options = {}) {
          const path = validateLibraryPath(libraryPath);
          const start = options.start == null ? 0 : Number(options.start);
          const limit = options.limit == null ? INDEX_PAGE_SIZE : Number(options.limit);
          if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
            throw makeLocalApiError("invalid_local_api_page");
          }
          const url = new URL(`${path}/items/top`, endpoint);
          url.searchParams.set("format", "json");
          url.searchParams.set("include", "data");
          url.searchParams.set("itemType", "-attachment");
          url.searchParams.set("start", String(start));
          url.searchParams.set("limit", String(limit));
          const { payload, response } = await readJsonArrayResponse(
            url.href,
            options.signal,
            "index_page",
            { workload: "index", library: path === "users/0" ? "personal" : "group", start, limit },
            INDEX_PRIORITY
          );
          return {
            items: payload,
            totalItems: safeIntegerHeader(response.headers, "Total-Results"),
            sourceVersion: safeIntegerHeader(response.headers, "Last-Modified-Version")
          };
        }
      });
    }

    return Object.freeze({
      batchCheck,
      check,
      createIndexSource,
      getCapabilities: () => CAPABILITIES,
      probe
    });
  }

  return {
    CAPABILITIES,
    DEFAULT_CONCURRENCY,
    DEFAULT_ENDPOINT,
    GROUP_CACHE_TTL_MS,
    IDENTIFIER_CONCURRENCY,
    INDEX_PAGE_SIZE,
    INDEX_PRIORITY,
    QUERY_CACHE_MAX_ENTRIES,
    QUERY_CACHE_TTL_MS,
    REQUEST_TIMEOUT_MS,
    MAX_CONCURRENCY,
    TIMEOUT_COOLDOWN_MS,
    createLimiter,
    createDirectLocalApiBackend,
    createLocalApiBackend: createDirectLocalApiBackend,
    makeLocalApiError,
    validateDirectLocalApiEndpoint: validateLocalApiEndpoint,
    validateLocalApiEndpoint,
    withDirectResultMetadata
  };
});
