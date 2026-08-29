import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const matcher = require("../browser-extension/src/backends/local-api-matcher.js");
const indexedApi = require("../browser-extension/src/backends/indexed-local-api-backend.js");

function record(itemKey, values = {}) {
  return {
    scopeKey: "scope",
    generation: 1,
    libraryKey: values.libraryKey || "users/0",
    itemKey,
    itemVersion: 1,
    identifierKeys: values.identifierKeys || [],
    titleKey: values.titleKey || "",
    year: values.year || "",
    creatorKeys: values.creatorKeys || [],
    itemType: "journalarticle"
  };
}

function harness(records, options = {}) {
  let queryCount = 0;
  const repository = {
    async queryMany(scopeKey, keys) {
      queryCount += 1;
      if (options.queryError) throw options.queryError;
      assert.equal(scopeKey, "scope");
      return {
        activeGeneration: 1,
        identifiers: Object.fromEntries(keys.identifierKeys.map((key) => [
          key,
          records.filter((value) => value.identifierKeys.includes(key))
        ])),
        titles: Object.fromEntries(keys.titleKeys.map((key) => [
          key,
          records.filter((value) => value.titleKey === key)
        ]))
      };
    }
  };
  const backend = indexedApi.createIndexedLocalApiBackend({
    repository,
    getIndexContext: async () => options.context || {
      state: "ready", scopeKey: "scope", scopeConfidence: "stable", activeGeneration: 1
    }
  });
  return { backend, get queryCount() { return queryCount; } };
}

test("matches DOI, PMID, ISBN, and CNKI in priority order", async () => {
  const values = [
    record("DOI", { identifierKeys: ["doi:10.1000/example"] }),
    record("PMID", { identifierKeys: ["pmid:123456"] }),
    record("ISBN", { identifierKeys: ["isbn:9781402894626"] }),
    record("CNKI", { identifierKeys: ["cnki:filename001"] })
  ];
  const { backend } = harness(values);
  for (const [candidate, matchType] of [
    [{ DOI: "https://doi.org/10.1000/EXAMPLE" }, "doi"],
    [{ PMID: "123-456" }, "pmid"],
    [{ ISBN: "978-1-4028-9462-6" }, "isbn"],
    [{ cnki: "FILENAME001" }, "cnki"]
  ]) {
    assert.deepEqual(await backend.check(candidate), {
      status: "matched",
      matchType,
      confidence: 1,
      complete: true,
      mode: "standard",
      engine: "indexed",
      indexState: "ready"
    });
  }
  assert.equal((await backend.check({ DOI: "10.1000/example", PMID: "123456" })).matchType, "doi");
});

test("matches normalized English and Chinese titles with year and author conflict exclusion", async () => {
  const records = [
    record("EN", {
      titleKey: matcher.normalizeTitle("An English: Title"),
      year: "2024",
      creatorKeys: [matcher.normalizePerson("DoeJane")]
    }),
    record("ZH", {
      titleKey: matcher.normalizeTitle("中文：精确标题"),
      year: "2023",
      creatorKeys: [matcher.normalizePerson("张三")]
    })
  ];
  const { backend } = harness(records);
  assert.equal((await backend.check({
    title: "An English Title",
    year: "2024",
    creators: [{ firstName: "Jane", lastName: "Doe" }]
  })).matchType, "title");
  assert.equal((await backend.check({ title: "中文: 精确标题", year: "2023", creators: ["张三"] })).matchType, "title");
  assert.equal((await backend.check({ title: "An English Title", year: "2022" })).status, "not_found");
  assert.equal((await backend.check({ title: "An English Title", creators: ["Other Author"] })).status, "not_found");
});

test("complete misses and multi-library duplicates return only minimized fields", async () => {
  const duplicate = [
    record("A", { identifierKeys: ["doi:10.1000/duplicate"], libraryKey: "users/0" }),
    record("B", { identifierKeys: ["doi:10.1000/duplicate"], libraryKey: "groups/7" })
  ];
  const { backend } = harness(duplicate);
  const matched = await backend.check({ DOI: "10.1000/duplicate" });
  const missing = await backend.check({ DOI: "10.1000/missing" });
  assert.equal(matched.status, "matched");
  assert.deepEqual(missing, {
    status: "not_found",
    matchType: null,
    confidence: 0,
    complete: true,
    mode: "standard",
    engine: "indexed",
    indexState: "ready"
  });
  for (const value of [matched, missing]) {
    assert.deepEqual(Object.keys(value).sort(), [
      "complete", "confidence", "engine", "indexState", "matchType", "mode", "status"
    ]);
    assert.equal(JSON.stringify(value).includes("itemKey"), false);
    assert.equal(JSON.stringify(value).includes("libraryKey"), false);
  }
});

test("80-item batches deduplicate candidates, preserve order, and use one repository query", async () => {
  const values = [record("HIT", { identifierKeys: ["doi:10.1000/hit"] })];
  const h = harness(values);
  const candidates = Array.from({ length: 80 }, (_, index) => index % 4 === 0
    ? { DOI: "10.1000/hit" }
    : { DOI: `10.1000/miss-${index % 3}` });
  const progress = [];
  const response = await h.backend.batchCheck(candidates, {
    onProgress: (entry) => progress.push(entry)
  });
  assert.equal(response.results.length, 80);
  assert.equal(response.results.filter((value) => value.status === "matched").length, 20);
  assert.equal(response.results.filter((value) => value.status === "not_found").length, 60);
  assert.equal(response.results[0].status, "matched");
  assert.equal(response.results[1].status, "not_found");
  assert.equal(progress.length, 80);
  assert.equal(h.queryCount, 1);
});

test("IndexedDB query failure is isolated as one stable error per batch entry", async () => {
  const h = harness([], { queryError: Object.assign(new Error("failed"), { code: "indexeddb_query_failed" }) });
  const response = await h.backend.batchCheck([{ DOI: "10.1/a" }, { DOI: "10.1/b" }]);
  assert.deepEqual(response.results.map((value) => value.error), ["indexeddb_query_failed", "indexeddb_query_failed"]);
  assert.equal(response.results.every((value) => value.status === "error" && value.complete === false), true);
  await assert.rejects(() => h.backend.check({ DOI: "10.1/a" }), /indexeddb_query_failed/);
});

test("one malformed stored record does not fail unrelated batch candidates", async () => {
  const malformed = record("BROKEN", { identifierKeys: ["doi:10.1000/broken"] });
  malformed.identifierKeys = null;
  const valid = record("VALID", { identifierKeys: ["doi:10.1000/valid"] });
  let queryCount = 0;
  const backend = indexedApi.createIndexedLocalApiBackend({
    repository: {
      async queryMany() {
        queryCount += 1;
        return {
          activeGeneration: 1,
          identifiers: {
            "doi:10.1000/broken": [malformed],
            "doi:10.1000/valid": [valid]
          },
          titles: {}
        };
      }
    },
    getIndexContext: async () => ({ state: "ready", scopeKey: "scope", activeGeneration: 1 })
  });
  const response = await backend.batchCheck([
    { DOI: "10.1000/broken" },
    { DOI: "10.1000/valid" }
  ]);
  assert.equal(response.results[0].status, "error");
  assert.equal(response.results[0].error, "indexed_record_invalid");
  assert.equal(response.results[1].status, "matched");
  assert.equal(queryCount, 1);
});

test("indexed capabilities preserve legacy fields and add completeness semantics", async () => {
  const { backend } = harness([]);
  assert.deepEqual(backend.getCapabilities(), indexedApi.CAPABILITIES);
  assert.equal(backend.getCapabilities().exactIdentifiers, true);
  assert.equal(backend.getCapabilities().exactTitle, true);
  assert.equal(backend.getCapabilities().possibleMatch, false);
  assert.equal((await backend.probe()).indexReady, true);
});
