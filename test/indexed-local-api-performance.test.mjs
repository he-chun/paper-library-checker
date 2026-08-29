import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createIndexedLocalApiBackend } = require("../browser-extension/src/backends/indexed-local-api-backend.js");

function indexedRecord(index) {
  return {
    scopeKey: "scope",
    generation: 1,
    libraryKey: "users/0",
    itemKey: `ITEM${index}`,
    itemVersion: 1,
    identifierKeys: [`doi:10.5000/${index}`],
    titleKey: `title${index}`,
    year: "2024",
    creatorKeys: ["author"],
    itemType: "journalarticle"
  };
}

for (const recordCount of [1000, 10000, 50000]) {
  test(`indexed benchmark uses bounded lookups with ${recordCount} records`, async (context) => {
    const identifiers = new Map();
    const titles = new Map();
    for (let index = 0; index < recordCount; index += 1) {
      const record = indexedRecord(index);
      identifiers.set(record.identifierKeys[0], [record]);
      titles.set(record.titleKey, [record]);
    }

    for (const candidateCount of [1, 20, 50, 80]) {
      for (const hitRate of [0, 0.25, 1]) {
        let transactionCount = 0;
        let lookupCount = 0;
        let httpItemSearches = 0;
        const repository = {
          async queryMany(_scopeKey, keys) {
            transactionCount += 1;
            lookupCount += keys.identifierKeys.length + keys.titleKeys.length;
            return {
              activeGeneration: 1,
              identifiers: Object.fromEntries(keys.identifierKeys.map((key) => [key, identifiers.get(key) || []])),
              titles: Object.fromEntries(keys.titleKeys.map((key) => [key, titles.get(key) || []]))
            };
          }
        };
        const backend = createIndexedLocalApiBackend({
          repository,
          getIndexContext: async () => ({ state: "ready", scopeKey: "scope", activeGeneration: 1 })
        });
        const hitCount = Math.floor(candidateCount * hitRate);
        const candidates = Array.from({ length: candidateCount }, (_, index) => index < hitCount
          ? { DOI: `10.5000/${index}` }
          : { DOI: `10.9000/missing-${index}` });
        const startedAt = performance.now();
        const response = await backend.batchCheck(candidates);
        const elapsedMs = performance.now() - startedAt;
        assert.equal(response.results.length, candidateCount);
        assert.equal(response.results.filter((value) => value.status === "matched").length, hitCount);
        assert.equal(transactionCount, 1);
        assert.equal(httpItemSearches, 0);
        assert(lookupCount <= candidateCount);
        assert(lookupCount < recordCount || candidateCount === recordCount);
        context.diagnostic(JSON.stringify({
          recordCount,
          candidateCount,
          hitRate,
          elapsedMs: Number(elapsedMs.toFixed(3)),
          transactionCount,
          lookupCount,
          httpItemSearches
        }));
      }
    }
  });
}
