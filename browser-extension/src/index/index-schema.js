(function (root, factory) {
  const api = factory();
  root.PLCIndexSchema = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DATABASE_NAME = "paper-library-checker-standard-index";
  const SCHEMA_VERSION = 2;
  const STORES = Object.freeze({ META: "meta", LIBRARIES: "libraries", RECORDS: "records" });
  const INDEXES = Object.freeze({
    IDENTIFIER_KEYS: "identifierKeys",
    TITLE_KEY: "titleKey",
    LIBRARY_KEY: "libraryKey",
    GENERATION: "generation",
    SCOPE_KEY: "scopeKey",
    SCOPE_GENERATION: "scopeGeneration",
    SCOPE_GENERATION_TITLE: "scopeGenerationTitle",
    SCOPE_GENERATION_LIBRARY: "scopeGenerationLibrary",
    SCOPE_LIBRARY: "scopeLibrary"
  });

  const STORE_DEFINITIONS = Object.freeze({
    [STORES.META]: { keyPath: "scopeKey", indexes: [] },
    [STORES.LIBRARIES]: {
      keyPath: ["scopeKey", "generation", "libraryKey"],
      indexes: [
        [INDEXES.LIBRARY_KEY, "libraryKey"],
        [INDEXES.GENERATION, "generation"],
        [INDEXES.SCOPE_KEY, "scopeKey"],
        [INDEXES.SCOPE_GENERATION, ["scopeKey", "generation"]],
        [INDEXES.SCOPE_GENERATION_LIBRARY, ["scopeKey", "generation", "libraryKey"]],
        [INDEXES.SCOPE_LIBRARY, ["scopeKey", "libraryKey"]]
      ]
    },
    [STORES.RECORDS]: {
      keyPath: ["scopeKey", "generation", "libraryKey", "itemKey"],
      indexes: [
        [INDEXES.IDENTIFIER_KEYS, "identifierKeys", { multiEntry: true }],
        [INDEXES.TITLE_KEY, "titleKey"],
        [INDEXES.LIBRARY_KEY, "libraryKey"],
        [INDEXES.GENERATION, "generation"],
        [INDEXES.SCOPE_KEY, "scopeKey"],
        [INDEXES.SCOPE_GENERATION, ["scopeKey", "generation"]],
        [INDEXES.SCOPE_GENERATION_TITLE, ["scopeKey", "generation", "titleKey"]],
        [INDEXES.SCOPE_GENERATION_LIBRARY, ["scopeKey", "generation", "libraryKey"]],
        [INDEXES.SCOPE_LIBRARY, ["scopeKey", "libraryKey"]]
      ]
    }
  });

  function sameKeyPath(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function ensureStore(database, transaction, name, definition) {
    const store = database.objectStoreNames.contains(name)
      ? transaction.objectStore(name)
      : database.createObjectStore(name, { keyPath: definition.keyPath });
    for (const [indexName, keyPath, options] of definition.indexes) {
      if (!store.indexNames.contains(indexName)) store.createIndex(indexName, keyPath, options || {});
    }
    return store;
  }

  function upgradeSchema(database, transaction) {
    for (const [name, definition] of Object.entries(STORE_DEFINITIONS)) {
      ensureStore(database, transaction, name, definition);
    }
  }

  function validateSchema(database) {
    try {
      const transaction = database.transaction(Object.values(STORES), "readonly");
      for (const [name, definition] of Object.entries(STORE_DEFINITIONS)) {
        if (!database.objectStoreNames.contains(name)) return false;
        const store = transaction.objectStore(name);
        if (!sameKeyPath(store.keyPath, definition.keyPath)) return false;
        for (const [indexName, keyPath, options] of definition.indexes) {
          if (!store.indexNames.contains(indexName)) return false;
          const index = store.index(indexName);
          if (!sameKeyPath(index.keyPath, keyPath)) return false;
          if (Boolean(index.multiEntry) !== Boolean(options?.multiEntry)) return false;
        }
      }
      return true;
    } catch (_error) {
      return false;
    }
  }

  return { DATABASE_NAME, INDEXES, SCHEMA_VERSION, STORES, STORE_DEFINITIONS, upgradeSchema, validateSchema };
});
