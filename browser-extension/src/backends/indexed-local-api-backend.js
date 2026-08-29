(function (root, factory) {
  const api = factory(
    root.PLCLocalApiMatcher || (typeof require === "function" ? require("./local-api-matcher.js") : null)
  );
  root.PLCIndexedLocalApiBackend = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (matcher) {
  "use strict";

  const CAPABILITIES = Object.freeze({
    mode: "standard",
    engine: "indexed",
    indexState: "ready",
    exactIdentifiers: true,
    exactTitle: true,
    exactIdentifierVerification: true,
    completeIdentifierRecall: true,
    exactTitleVerification: true,
    completeTitleRecall: true,
    completeNegativeResults: true,
    fuzzyTitle: false,
    possibleMatch: false,
    realtimeIndex: false,
    authenticatedProtocol: false,
    batch: true,
    complete: true
  });

  function makeIndexedError(code, cause) {
    const error = new Error(code);
    error.code = code;
    if (cause) error.cause = cause;
    return error;
  }

  function result(status, matchType = null, confidence = 0) {
    return {
      status,
      matchType,
      confidence,
      complete: true,
      mode: "standard",
      engine: "indexed",
      indexState: "ready"
    };
  }

  function hintsMatch(record, candidate) {
    if (candidate.year && record.year && candidate.year !== record.year) return false;
    if (candidate.creators.length && record.creatorKeys.length) {
      return candidate.creators.some((creator) => record.creatorKeys.includes(creator));
    }
    return true;
  }

  function matchPreparedCandidate(candidate, queryResult) {
    for (const type of matcher.IDENTIFIER_PRIORITY) {
      const value = candidate.identifiers[type];
      if (!value) continue;
      const key = `${type}:${value}`;
      if ((queryResult.identifiers[key] || []).some((record) => record.identifierKeys.includes(key))) {
        return result("matched", type, 1);
      }
    }
    if (candidate.title && (queryResult.titles[candidate.title] || []).some((record) => hintsMatch(record, candidate))) {
      return result("matched", "title", 0.95);
    }
    return result("not_found");
  }

  function queryKeys(preparedCandidates) {
    const identifierKeys = new Set();
    const titleKeys = new Set();
    for (const candidate of preparedCandidates) {
      for (const type of matcher.IDENTIFIER_PRIORITY) {
        if (candidate.identifiers[type]) identifierKeys.add(`${type}:${candidate.identifiers[type]}`);
      }
      if (candidate.title) titleKeys.add(candidate.title);
    }
    return { identifierKeys: [...identifierKeys], titleKeys: [...titleKeys] };
  }

  function notifyProgress(callback, index, value) {
    if (typeof callback !== "function") return;
    try {
      callback({ index, result: { ...value } });
    } catch (_error) {
      // Rendering progress must not affect the final batch result.
    }
  }

  function createIndexedLocalApiBackend(dependencies = {}) {
    const repository = dependencies.repository;
    const getIndexContext = dependencies.getIndexContext;
    if (!repository?.queryMany || typeof getIndexContext !== "function") {
      throw makeIndexedError("indexed_backend_dependencies_required");
    }

    async function readyContext() {
      const context = await getIndexContext();
      if (context?.state !== "ready" || !context.scopeKey || context.activeGeneration == null) {
        throw makeIndexedError("index_not_ready");
      }
      return context;
    }

    async function query(preparedCandidates) {
      const context = await readyContext();
      try {
        return await repository.queryMany(context.scopeKey, queryKeys(preparedCandidates));
      } catch (error) {
        throw makeIndexedError(error?.code || "indexeddb_query_failed", error);
      }
    }

    return Object.freeze({
      async probe() {
        await readyContext();
        return { ok: true, version: "3", indexReady: true, mode: "standard", engine: "indexed", indexState: "ready" };
      },
      async check(candidate) {
        const prepared = matcher.prepareCandidate(candidate);
        return matchPreparedCandidate(prepared, await query([prepared]));
      },
      async batchCheck(candidates, options = {}) {
        if (!Array.isArray(candidates)) throw makeIndexedError("invalid_batch_candidates");
        const unique = new Map();
        for (let index = 0; index < candidates.length; index += 1) {
          const key = matcher.candidateKey(candidates[index]);
          if (!unique.has(key)) unique.set(key, { prepared: matcher.prepareCandidate(candidates[index]), indices: [] });
          unique.get(key).indices.push(index);
        }
        let uniqueResults;
        try {
          const entries = [...unique.values()];
          const queryResult = await query(entries.map((entry) => entry.prepared));
          uniqueResults = entries.map((entry) => {
            try {
              return matchPreparedCandidate(entry.prepared, queryResult);
            } catch (error) {
              return {
                ...result("error"),
                complete: false,
                error: error?.code || "indexed_record_invalid"
              };
            }
          });
        } catch (error) {
          uniqueResults = [...unique.values()].map(() => ({
            ...result("error"),
            complete: false,
            error: error?.code || "indexeddb_query_failed"
          }));
        }
        const results = new Array(candidates.length);
        let uniqueIndex = 0;
        for (const entry of unique.values()) {
          const value = uniqueResults[uniqueIndex++];
          for (const index of entry.indices) {
            results[index] = { ...value };
            notifyProgress(options.onProgress, index, value);
          }
        }
        return { results };
      },
      getCapabilities: () => CAPABILITIES
    });
  }

  return { CAPABILITIES, createIndexedLocalApiBackend, hintsMatch, matchPreparedCandidate, queryKeys };
});
