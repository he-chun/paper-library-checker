(function (root, factory) {
  const api = factory();
  root.PLCIndexGenerationManager = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createIndexGenerationManager(repository) {
    if (!repository) throw new Error("index_repository_required");
    return Object.freeze({
      abortGeneration(scopeKey, generation, errorCode) {
        return repository.abortGeneration(scopeKey, generation, errorCode);
      },
      beginGeneration(scopeKey, details) {
        return repository.beginGeneration(scopeKey, details);
      },
      async commitGeneration(scopeKey, generation) {
        const meta = await repository.commitGeneration(scopeKey, generation);
        try {
          await repository.pruneOldGenerations(scopeKey);
        } catch (_error) {
          // The active-generation switch already committed; stale generations
          // can be pruned safely by a later maintenance pass.
        }
        return meta;
      },
      putLibraryMetadata(scopeKey, generation, metadata) {
        return repository.putLibraryMetadata(scopeKey, generation, metadata);
      },
      putRecords(scopeKey, generation, records) {
        return repository.putRecords(scopeKey, generation, records);
      },
      recoverIncompleteGenerations(scopeKey) {
        return repository.recoverIncompleteGenerations(scopeKey);
      }
    });
  }

  return { createIndexGenerationManager };
});
