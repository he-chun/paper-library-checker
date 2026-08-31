(function (root, factory) {
  const api = factory(
    root.PLCIndexRecordNormalizer ||
      (typeof require === "function" ? require("./index-record-normalizer.js") : null)
  );
  root.PLCLocalApiIndexBuilder = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (recordNormalizer) {
  "use strict";

  const DEFAULT_PAGE_SIZE = 250;
  const MAX_PAGE_SIZE = 1000;

  function makeIndexBuildError(code, cause) {
    const error = new Error(code);
    error.code = code;
    if (cause) error.cause = cause;
    return error;
  }

  function cancellationError(signal, error) {
    if (signal?.aborted || error?.code === "batch_superseded") return makeIndexBuildError("index_build_cancelled", error);
    return error;
  }

  function isDeletedOrChild(item) {
    const data = item && typeof item.data === "object" && item.data ? item.data : item || {};
    return item?.deleted === true || data.deleted === true || item?.meta?.deleted === true ||
      Boolean(item?.parentItem || data.parentItem);
  }

  function normalizePage(scopeKey, generation, libraryKey, items) {
    const records = [];
    for (const item of items) {
      if (isDeletedOrChild(item)) continue;
      try {
        records.push(recordNormalizer.normalizeIndexRecord(scopeKey, generation, { ...item, libraryKey }));
      } catch (error) {
        if (error?.code !== "non_bibliographic_index_record") throw error;
      }
    }
    return records;
  }

  function createLocalApiIndexBuilder(dependencies = {}) {
    const source = dependencies.source;
    const discovery = dependencies.discovery;
    const repository = dependencies.repository;
    const generationManager = dependencies.generationManager;
    const progress = dependencies.progress;
    const now = dependencies.now || Date.now;
    const pageSize = Number(dependencies.pageSize || DEFAULT_PAGE_SIZE);
    if (!source?.readLibraryPage || !discovery?.discover || !repository || !generationManager || !progress) {
      throw makeIndexBuildError("index_builder_dependencies_required");
    }
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw makeIndexBuildError("invalid_index_page_size");
    }

    async function build(options = {}) {
      const signal = options.signal;
      let scopeKey = "";
      let generation = null;
      let processedItems = 0;
      let indexedItems = 0;
      let totalItems = 0;
      let allTotalsKnown = true;
      const previousMeta = await repository.getLatestMeta().catch(() => null);
      progress.begin({
        refreshing: options.refreshing === true,
        activeGeneration: previousMeta?.activeGeneration ?? null
      });
      try {
        if (signal?.aborted) throw makeIndexBuildError("index_build_cancelled");
        const discovered = await discovery.discover({ signal });
        scopeKey = discovered.scopeKey;
        const oldActiveGeneration = await repository.getActiveGeneration(scopeKey);
        progress.begin({
          refreshing: oldActiveGeneration != null,
          activeGeneration: oldActiveGeneration
        });
        progress.update({
          scopeKey,
          scopeConfidence: discovered.scopeConfidence,
          totalLibraries: discovered.libraries.length,
          activeGeneration: oldActiveGeneration
        });
        generation = await generationManager.beginGeneration(scopeKey, {
          scopeConfidence: discovered.scopeConfidence
        });

        for (let libraryIndex = 0; libraryIndex < discovered.libraries.length; libraryIndex += 1) {
          const library = discovered.libraries[libraryIndex];
          let start = 0;
          let libraryIndexedItems = 0;
          let libraryTotal = null;
          progress.update({ currentLibraryKey: library.libraryKey });
          while (true) {
            if (signal?.aborted) throw makeIndexBuildError("index_build_cancelled");
            const page = await source.readLibraryPage(library.libraryPath, { start, limit: pageSize, signal });
            if (!Array.isArray(page?.items)) throw makeIndexBuildError("local_api_malformed_response");
            if (libraryTotal == null && Number.isSafeInteger(page.totalItems) && page.totalItems >= 0) {
              libraryTotal = page.totalItems;
            }
            const records = normalizePage(scopeKey, generation, library.libraryKey, page.items);
            if (records.length) await generationManager.putRecords(scopeKey, generation, records);
            libraryIndexedItems += records.length;
            indexedItems += records.length;
            processedItems += page.items.length;
            progress.update({ processedItems });
            if (page.items.length === 0 || page.items.length < pageSize ||
                (libraryTotal != null && start + page.items.length >= libraryTotal)) break;
            start += page.items.length;
          }
          if (libraryTotal == null) allTotalsKnown = false;
          else totalItems += libraryTotal;
          await generationManager.putLibraryMetadata(scopeKey, generation, {
            libraryKey: library.libraryKey,
            itemCount: libraryIndexedItems,
            sourceVersion: null,
            indexedAt: now()
          });
          progress.update({
            processedLibraries: libraryIndex + 1,
            totalItems: allTotalsKnown && libraryIndex + 1 === discovered.libraries.length ? totalItems : null
          });
        }

        if (signal?.aborted) throw makeIndexBuildError("index_build_cancelled");
        const meta = await generationManager.commitGeneration(scopeKey, generation, {
          itemCount: indexedItems,
          libraryCount: discovered.libraries.length
        });
        progress.ready({
          activeGeneration: meta.activeGeneration,
          totalItems: allTotalsKnown ? totalItems : processedItems,
          itemCount: indexedItems,
          libraryCount: discovered.libraries.length,
          lastSuccessfulBuildAt: meta.lastSuccessfulBuildAt
        });
        return {
          ok: true,
          scopeKey,
          scopeConfidence: discovered.scopeConfidence,
          generation: meta.activeGeneration,
          processedItems,
          indexedItems,
          processedLibraries: discovered.libraries.length
        };
      } catch (caught) {
        const error = cancellationError(signal, caught);
        const cancelled = error?.code === "index_build_cancelled";
        if (generation != null && scopeKey) {
          await generationManager.abortGeneration(
            scopeKey,
            generation,
            cancelled ? "" : error?.code || "index_build_failed"
          ).catch(() => {});
        }
        const activeGeneration = scopeKey ? await repository.getActiveGeneration(scopeKey).catch(() => null) : null;
        if (cancelled) progress.cancel({ activeGeneration });
        else progress.fail(error?.code || "index_build_failed", { activeGeneration });
        throw error;
      }
    }

    return Object.freeze({ build, pageSize });
  }

  return { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, createLocalApiIndexBuilder, isDeletedOrChild, makeIndexBuildError, normalizePage };
});
