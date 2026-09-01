(function (root, factory) {
  const api = factory(
    root,
    root.PLCIndexSchema || (typeof require === "function" ? require("./index-schema.js") : null),
    root.PLCIndexState || (typeof require === "function" ? require("./index-state.js") : null),
    root.PLCIndexRecordNormalizer ||
      (typeof require === "function" ? require("./index-record-normalizer.js") : null)
  );
  root.PLCIndexedDBIndexRepository = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (runtimeRoot, schema, indexState, normalizer) {
  "use strict";

  function makeRepositoryError(code, cause) {
    const error = new Error(code);
    error.code = code;
    if (cause) error.cause = cause;
    return error;
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || makeRepositoryError("indexeddb_request_failed"));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || makeRepositoryError("indexeddb_transaction_aborted"));
      transaction.onerror = () => {};
    });
  }

  function copyRecord(value) {
    if (!value || typeof value !== "object") return value;
    return {
      scopeKey: value.scopeKey,
      generation: value.generation,
      libraryKey: value.libraryKey,
      itemKey: value.itemKey,
      itemVersion: value.itemVersion,
      identifierKeys: Array.isArray(value.identifierKeys) ? [...value.identifierKeys] : [],
      titleKey: value.titleKey || "",
      publicationTitleKey: value.publicationTitleKey || "",
      year: value.year || "",
      creatorKeys: Array.isArray(value.creatorKeys) ? [...value.creatorKeys] : [],
      itemType: value.itemType || ""
    };
  }

  function createIndexedDBIndexRepository(dependencies = {}) {
    const indexedDBFactory = dependencies.indexedDB || runtimeRoot.indexedDB;
    const keyRange = dependencies.IDBKeyRange || runtimeRoot.IDBKeyRange;
    const databaseName = dependencies.databaseName || schema.DATABASE_NAME;
    const now = dependencies.now || Date.now;
    if (!indexedDBFactory || !keyRange) throw makeRepositoryError("indexeddb_unavailable");

    let database = null;
    let opening = null;

    function openDatabase() {
      return new Promise((resolve, reject) => {
        const request = indexedDBFactory.open(databaseName, schema.SCHEMA_VERSION);
        request.onupgradeneeded = () => schema.upgradeSchema(request.result, request.transaction, request.oldVersion);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || makeRepositoryError("indexeddb_open_failed"));
        request.onblocked = () => reject(makeRepositoryError("indexeddb_open_blocked"));
      });
    }

    function deleteDatabase() {
      return new Promise((resolve, reject) => {
        const request = indexedDBFactory.deleteDatabase(databaseName);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error || makeRepositoryError("indexeddb_delete_failed"));
        request.onblocked = () => reject(makeRepositoryError("indexeddb_delete_blocked"));
      });
    }

    async function openValidatedDatabase() {
      let opened = await openDatabase();
      if (!schema.validateSchema(opened)) {
        opened.close();
        await deleteDatabase();
        opened = await openDatabase();
        if (!schema.validateSchema(opened)) {
          opened.close();
          throw makeRepositoryError("indexeddb_schema_invalid");
        }
      }
      opened.onversionchange = () => {
        opened.close();
        if (database === opened) database = null;
      };
      return opened;
    }

    async function withTransaction(storeNames, mode, action) {
      const opened = await open();
      const transaction = opened.transaction(storeNames, mode);
      const completed = transactionDone(transaction);
      try {
        const result = await action(transaction);
        await completed;
        return result;
      } catch (error) {
        try {
          transaction.abort();
        } catch (_abortError) {
          // The transaction may already have aborted because of the request error.
        }
        await completed.catch(() => {});
        throw error;
      }
    }

    function defaultMeta(scopeKey) {
      return indexState.createInitialMeta(scopeKey, schema.SCHEMA_VERSION);
    }

    async function deleteCursorMatches(index, query, predicate) {
      await new Promise((resolve, reject) => {
        const request = index.openCursor(query);
        request.onerror = () => reject(request.error || makeRepositoryError("indexeddb_cursor_failed"));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve();
            return;
          }
          if (!predicate || predicate(cursor.value)) cursor.delete();
          cursor.continue();
        };
      });
    }

    async function deleteGenerationInTransaction(transaction, scopeKey, generation) {
      const query = keyRange.only([scopeKey, generation]);
      await Promise.all([
        deleteCursorMatches(
          transaction.objectStore(schema.STORES.RECORDS).index(schema.INDEXES.SCOPE_GENERATION),
          query
        ),
        deleteCursorMatches(
          transaction.objectStore(schema.STORES.LIBRARIES).index(schema.INDEXES.SCOPE_GENERATION),
          query
        )
      ]);
    }

    async function deleteNonActiveGenerationsInTransaction(transaction, scopeKey, activeGeneration) {
      const query = keyRange.only(scopeKey);
      const predicate = (value) => value.generation !== activeGeneration;
      await Promise.all([
        deleteCursorMatches(
          transaction.objectStore(schema.STORES.RECORDS).index(schema.INDEXES.SCOPE_KEY),
          query,
          predicate
        ),
        deleteCursorMatches(
          transaction.objectStore(schema.STORES.LIBRARIES).index(schema.INDEXES.SCOPE_KEY),
          query,
          predicate
        )
      ]);
    }

    async function recoverScopeInDatabase(opened, scopeKey) {
      const transaction = opened.transaction(Object.values(schema.STORES), "readwrite");
      const completed = transactionDone(transaction);
      try {
        const metaStore = transaction.objectStore(schema.STORES.META);
        const meta = await requestResult(metaStore.get(scopeKey));
        if (!meta || (![indexState.INDEX_STATES.BUILDING, indexState.INDEX_STATES.REFRESHING].includes(meta.state) && meta.pendingGeneration == null)) {
          await completed;
          return false;
        }
        await deleteNonActiveGenerationsInTransaction(transaction, scopeKey, meta.activeGeneration);
        meta.pendingGeneration = null;
        meta.state = meta.activeGeneration == null
          ? indexState.INDEX_STATES.NOT_BUILT
          : indexState.INDEX_STATES.STALE;
        meta.errorCode = "index_build_interrupted";
        meta.schemaVersion = schema.SCHEMA_VERSION;
        metaStore.put(meta);
        await completed;
        return true;
      } catch (error) {
        try { transaction.abort(); } catch (_abortError) {}
        await completed.catch(() => {});
        throw error;
      }
    }

    async function recoverAllIncomplete(opened) {
      const transaction = opened.transaction(schema.STORES.META, "readonly");
      const completed = transactionDone(transaction);
      const allMeta = await requestResult(transaction.objectStore(schema.STORES.META).getAll());
      await completed;
      for (const meta of allMeta) {
        if ([indexState.INDEX_STATES.BUILDING, indexState.INDEX_STATES.REFRESHING].includes(meta.state) || meta.pendingGeneration != null) {
          await recoverScopeInDatabase(opened, meta.scopeKey);
        }
      }
    }

    async function open() {
      if (database) return database;
      if (opening) return opening;
      opening = (async () => {
        const opened = await openValidatedDatabase();
        database = opened;
        await recoverAllIncomplete(opened);
        return opened;
      })().catch((error) => {
        database = null;
        throw makeRepositoryError(error.code || "indexeddb_open_failed", error);
      }).finally(() => {
        opening = null;
      });
      return opening;
    }

    function close() {
      database?.close();
      database = null;
    }

    async function getMeta(scopeKey) {
      const value = await withTransaction(schema.STORES.META, "readonly", (transaction) =>
        requestResult(transaction.objectStore(schema.STORES.META).get(String(scopeKey))));
      return value ? { ...value } : defaultMeta(scopeKey);
    }

    async function getLatestMeta() {
      const values = await withTransaction(schema.STORES.META, "readonly", (transaction) =>
        requestResult(transaction.objectStore(schema.STORES.META).getAll()));
      if (!values.length) return null;
      values.sort((left, right) =>
        Number(right.lastAttemptAt || right.lastSuccessfulBuildAt || 0) -
        Number(left.lastAttemptAt || left.lastSuccessfulBuildAt || 0));
      return { ...values[0] };
    }

    async function setState(scopeKey, state, details = {}) {
      if (!indexState.isIndexState(state)) throw makeRepositoryError("invalid_index_state");
      return withTransaction(schema.STORES.META, "readwrite", async (transaction) => {
        const store = transaction.objectStore(schema.STORES.META);
        const meta = await requestResult(store.get(String(scopeKey))) || defaultMeta(scopeKey);
        meta.state = state;
        meta.schemaVersion = schema.SCHEMA_VERSION;
        if (details.errorCode !== undefined) meta.errorCode = String(details.errorCode || "");
        if (details.lastAttemptAt !== undefined) meta.lastAttemptAt = details.lastAttemptAt;
        if (details.lastSuccessfulBuildAt !== undefined) meta.lastSuccessfulBuildAt = details.lastSuccessfulBuildAt;
        store.put(meta);
        return { ...meta };
      });
    }

    async function beginGeneration(scopeKey, details = {}) {
      return withTransaction(schema.STORES.META, "readwrite", async (transaction) => {
        const key = String(scopeKey);
        const store = transaction.objectStore(schema.STORES.META);
        const meta = await requestResult(store.get(key)) || defaultMeta(key);
        if ([indexState.INDEX_STATES.BUILDING, indexState.INDEX_STATES.REFRESHING].includes(meta.state) || meta.pendingGeneration != null) {
          throw makeRepositoryError("index_generation_already_building");
        }
        const generation = Math.max(meta.activeGeneration || 0, meta.pendingGeneration || 0) + 1;
        meta.schemaVersion = schema.SCHEMA_VERSION;
        meta.pendingGeneration = generation;
        if (details.scopeConfidence !== undefined) {
          meta.scopeConfidence = details.scopeConfidence === "stable" ? "stable" : "legacy";
        }
        meta.state = meta.activeGeneration == null
          ? indexState.INDEX_STATES.BUILDING
          : indexState.INDEX_STATES.REFRESHING;
        meta.lastAttemptAt = now();
        meta.errorCode = "";
        store.put(meta);
        return generation;
      });
    }

    async function requirePendingGeneration(transaction, scopeKey, generation) {
      const meta = await requestResult(transaction.objectStore(schema.STORES.META).get(String(scopeKey)));
      if (!meta || ![indexState.INDEX_STATES.BUILDING, indexState.INDEX_STATES.REFRESHING].includes(meta.state) ||
          meta.pendingGeneration !== generation) {
        throw makeRepositoryError("index_generation_not_building");
      }
      return meta;
    }

    async function putRecords(scopeKey, generation, records) {
      if (!Array.isArray(records)) throw makeRepositoryError("invalid_index_records");
      const normalized = records.map((record) => normalizer.normalizeIndexRecord(scopeKey, generation, record));
      await withTransaction([schema.STORES.META, schema.STORES.RECORDS], "readwrite", async (transaction) => {
        await requirePendingGeneration(transaction, scopeKey, generation);
        const store = transaction.objectStore(schema.STORES.RECORDS);
        await Promise.all(normalized.map((record) => requestResult(store.put(record))));
      });
      return normalized.length;
    }

    async function putLibraryMetadata(scopeKey, generation, metadata) {
      const values = Array.isArray(metadata) ? metadata : [metadata];
      const normalized = values.map((entry) => normalizer.normalizeLibraryMetadata(scopeKey, generation, entry));
      await withTransaction([schema.STORES.META, schema.STORES.LIBRARIES], "readwrite", async (transaction) => {
        await requirePendingGeneration(transaction, scopeKey, generation);
        const store = transaction.objectStore(schema.STORES.LIBRARIES);
        await Promise.all(normalized.map((entry) => requestResult(store.put(entry))));
      });
      return normalized.length;
    }

    async function commitGeneration(scopeKey, generation, details = {}) {
      return withTransaction(schema.STORES.META, "readwrite", async (transaction) => {
        const store = transaction.objectStore(schema.STORES.META);
        const meta = await requirePendingGeneration(transaction, scopeKey, generation);
        meta.activeGeneration = generation;
        meta.pendingGeneration = null;
        meta.state = indexState.INDEX_STATES.READY;
        meta.lastSuccessfulBuildAt = now();
        meta.itemCount = Number(details.itemCount || 0);
        meta.libraryCount = Number(details.libraryCount || 0);
        meta.errorCode = "";
        meta.schemaVersion = schema.SCHEMA_VERSION;
        store.put(meta);
        return { ...meta };
      });
    }

    async function abortGeneration(scopeKey, generation, errorCode = "") {
      return withTransaction(Object.values(schema.STORES), "readwrite", async (transaction) => {
        const store = transaction.objectStore(schema.STORES.META);
        const meta = await requestResult(store.get(String(scopeKey))) || defaultMeta(scopeKey);
        if (meta.pendingGeneration !== generation) return false;
        await deleteGenerationInTransaction(transaction, String(scopeKey), generation);
        meta.pendingGeneration = null;
        meta.state = errorCode
          ? indexState.INDEX_STATES.ERROR
          : meta.activeGeneration == null
            ? indexState.INDEX_STATES.NOT_BUILT
            : indexState.INDEX_STATES.ERROR;
        meta.errorCode = String(errorCode || "");
        meta.schemaVersion = schema.SCHEMA_VERSION;
        store.put(meta);
        return true;
      });
    }

    async function getActiveGeneration(scopeKey) {
      return (await getMeta(scopeKey)).activeGeneration;
    }

    async function queryByIdentifier(scopeKey, identifierKey) {
      const activeGeneration = await getActiveGeneration(scopeKey);
      if (activeGeneration == null) return [];
      const values = await withTransaction(schema.STORES.RECORDS, "readonly", (transaction) =>
        requestResult(transaction.objectStore(schema.STORES.RECORDS)
          .index(schema.INDEXES.IDENTIFIER_KEYS).getAll(String(identifierKey))));
      return values
        .filter((record) => record.scopeKey === String(scopeKey) && record.generation === activeGeneration)
        .map(copyRecord);
    }

    async function queryByTitle(scopeKey, titleKey) {
      const activeGeneration = await getActiveGeneration(scopeKey);
      if (activeGeneration == null) return [];
      const values = await withTransaction(schema.STORES.RECORDS, "readonly", (transaction) =>
        requestResult(transaction.objectStore(schema.STORES.RECORDS)
          .index(schema.INDEXES.SCOPE_GENERATION_TITLE)
          .getAll([String(scopeKey), activeGeneration, String(titleKey)])));
      return values.map(copyRecord);
    }

    async function queryMany(scopeKey, queries = {}) {
      const identifierKeys = [...new Set((queries.identifierKeys || []).map(String).filter(Boolean))];
      const titleKeys = [...new Set((queries.titleKeys || []).map(String).filter(Boolean))];
      return withTransaction([schema.STORES.META, schema.STORES.RECORDS], "readonly", async (transaction) => {
        const normalizedScope = String(scopeKey);
        const meta = await requestResult(transaction.objectStore(schema.STORES.META).get(normalizedScope));
        const activeGeneration = meta?.activeGeneration;
        if (activeGeneration == null) {
          throw makeRepositoryError("index_not_ready");
        }
        const store = transaction.objectStore(schema.STORES.RECORDS);
        const identifierIndex = store.index(schema.INDEXES.IDENTIFIER_KEYS);
        const titleIndex = store.index(schema.INDEXES.SCOPE_GENERATION_TITLE);
        const identifierEntries = await Promise.all(identifierKeys.map(async (key) => [
          key,
          (await requestResult(identifierIndex.getAll(key)))
            .filter((record) => record.scopeKey === normalizedScope && record.generation === activeGeneration)
            .map(copyRecord)
        ]));
        const titleEntries = await Promise.all(titleKeys.map(async (key) => [
          key,
          (await requestResult(titleIndex.getAll([normalizedScope, activeGeneration, key]))).map(copyRecord)
        ]));
        return {
          activeGeneration,
          identifiers: Object.fromEntries(identifierEntries),
          titles: Object.fromEntries(titleEntries)
        };
      });
    }

    async function clearLibrary(scopeKey, libraryKey) {
      await withTransaction([schema.STORES.LIBRARIES, schema.STORES.RECORDS], "readwrite", async (transaction) => {
        const query = keyRange.only([String(scopeKey), String(libraryKey)]);
        await Promise.all([
          deleteCursorMatches(transaction.objectStore(schema.STORES.LIBRARIES).index(schema.INDEXES.SCOPE_LIBRARY), query),
          deleteCursorMatches(transaction.objectStore(schema.STORES.RECORDS).index(schema.INDEXES.SCOPE_LIBRARY), query)
        ]);
      });
    }

    async function clearScope(scopeKey) {
      await withTransaction(Object.values(schema.STORES), "readwrite", async (transaction) => {
        const query = keyRange.only(String(scopeKey));
        transaction.objectStore(schema.STORES.META).delete(String(scopeKey));
        await Promise.all([
          deleteCursorMatches(transaction.objectStore(schema.STORES.LIBRARIES).index(schema.INDEXES.SCOPE_KEY), query),
          deleteCursorMatches(transaction.objectStore(schema.STORES.RECORDS).index(schema.INDEXES.SCOPE_KEY), query)
        ]);
      });
    }

    async function clearAll() {
      await withTransaction(Object.values(schema.STORES), "readwrite", async (transaction) => {
        await Promise.all(Object.values(schema.STORES).map((name) =>
          requestResult(transaction.objectStore(name).clear())));
      });
    }

    async function pruneOldGenerations(scopeKey) {
      const activeGeneration = await getActiveGeneration(scopeKey);
      await withTransaction([schema.STORES.LIBRARIES, schema.STORES.RECORDS], "readwrite", (transaction) =>
        deleteNonActiveGenerationsInTransaction(transaction, String(scopeKey), activeGeneration));
    }

    async function recoverIncompleteGenerations(scopeKey) {
      return recoverScopeInDatabase(await open(), String(scopeKey));
    }

    return Object.freeze({
      abortGeneration,
      beginGeneration,
      clearAll,
      clearLibrary,
      clearScope,
      close,
      commitGeneration,
      getActiveGeneration,
      getLatestMeta,
      getMeta,
      open,
      pruneOldGenerations,
      putLibraryMetadata,
      putRecords,
      queryByIdentifier,
      queryMany,
      queryByTitle,
      recoverIncompleteGenerations,
      setState
    });
  }

  return { createIndexedDBIndexRepository, makeRepositoryError, requestResult, transactionDone };
});
