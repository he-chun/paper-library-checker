import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const localApi = require("../browser-extension/src/backends/local-api-backend.js");
const matcher = require("../browser-extension/src/backends/local-api-matcher.js");

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "3" },
    json: async () => payload
  };
}

function createHarness(route, options = {}) {
  const requests = [];
  let active = 0;
  let maximumActive = 0;
  const backend = localApi.createLocalApiBackend({
    timeoutMs: 50,
    ...options,
    fetch: async (url, requestOptions) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      requests.push(url);
      try {
        return await route(new URL(url), requestOptions);
      } finally {
        active -= 1;
      }
    }
  });
  return { backend, requests, maximumActive: () => maximumActive };
}

test("batch uses stable candidate deduplication and restores input order", async () => {
  const harness = createHarness(async (url) => {
    if (url.pathname.endsWith("/groups")) return response(200, []);
    const term = url.searchParams.get("q");
    if (term === "10.1000/repeated") {
      return response(200, [{ data: { itemType: "journalArticle", DOI: term } }]);
    }
    return response(200, [{ data: { itemType: "journalArticle", title: term } }]);
  });
  const repeated = { DOI: "https://doi.org/10.1000/REPEATED" };
  const result = await harness.backend.batchCheck([
    repeated,
    { title: "Second title" },
    { DOI: "10.1000/repeated" }
  ]);

  assert.deepEqual(result.results, [
    { status: "matched", matchType: "doi", confidence: 1 },
    { status: "matched", matchType: "title", confidence: 0.95 },
    { status: "matched", matchType: "doi", confidence: 1 }
  ]);
  assert.equal(harness.requests.filter((url) => url.includes("/items?")).length, 2);
});

test("different candidates with identical query settings share one in-flight query", async () => {
  const harness = createHarness(async (url) => {
    if (url.pathname.endsWith("/groups")) return response(200, []);
    return response(200, [{
      data: { itemType: "journalArticle", title: "Shared title", date: "2024" }
    }]);
  });
  const result = await harness.backend.batchCheck([
    { title: "Shared title", date: "2024" },
    { title: "Shared title", date: "2025" }
  ]);

  assert.deepEqual(result.results.map((entry) => entry.status), ["matched", "not_found"]);
  assert.equal(harness.requests.filter((url) => url.includes("/items?")).length, 1);
});

test("standard backend defaults to one active Local API request", async () => {
  let activeItems = 0;
  let maximumActiveItems = 0;
  const harness = createHarness(async (url, options) => {
    if (url.pathname.endsWith("/groups")) return response(200, []);
    activeItems += 1;
    maximumActiveItems = Math.max(maximumActiveItems, activeItems);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 5);
      options.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      });
    });
    activeItems -= 1;
    return response(200, []);
  });
  await harness.backend.batchCheck([{ title: "First" }, { title: "Second" }]);
  assert.equal(maximumActiveItems, 1);
});

test("personal and group libraries are searched, failed groups are isolated, and matches return early", async () => {
  const harness = createHarness(async (url) => {
    if (url.pathname.endsWith("/groups")) {
      return response(200, [{ id: 1 }, { data: { id: 2 } }, { id: 3 }, { id: 3 }, { id: "unsafe" }]);
    }
    if (url.pathname.includes("/groups/1/items")) return response(500, { error: "group failed" });
    if (url.pathname.includes("/groups/2/items")) {
      return response(200, [{ data: { itemType: "journalArticle", DOI: "10.1000/group" } }]);
    }
    return response(200, []);
  });
  assert.deepEqual(await harness.backend.check({ DOI: "10.1000/group" }), {
    status: "matched",
    matchType: "doi",
    confidence: 1
  });
  assert.equal(harness.requests.some((url) => url.includes("/users/0/items?")), true);
  assert.equal(harness.requests.some((url) => url.includes("/groups/1/items?")), true);
  assert.equal(harness.requests.some((url) => url.includes("/groups/2/items?")), true);
  assert.equal(harness.requests.some((url) => url.includes("/groups/3/items?")), false);
});

test("a failed library becomes an item error only when no other library matches", async () => {
  const harness = createHarness(async (url) => {
    if (url.pathname.endsWith("/groups")) return response(200, [{ id: 7 }]);
    if (url.pathname.includes("/groups/7/items")) return response(500, {});
    return response(200, []);
  });
  assert.deepEqual(await harness.backend.batchCheck([
    { title: "No match" },
    { title: "Also no match" }
  ]), {
    results: [
      { status: "error", matchType: null, confidence: 0, error: "local_api_unavailable" },
      { status: "error", matchType: null, confidence: 0, error: "local_api_unavailable" }
    ]
  });
});

test("the same bibliographic item is deduplicated across libraries", async () => {
  const matchInputSizes = [];
  const wrappedMatcher = {
    ...matcher,
    matchCandidate(candidate, items) {
      matchInputSizes.push(items.length);
      return matcher.matchCandidate(candidate, items);
    }
  };
  const duplicate = { data: { itemType: "journalArticle", title: "Different title", DOI: "10.1000/other" } };
  const harness = createHarness(async (url) => {
    if (url.pathname.endsWith("/groups")) return response(200, [{ id: 1 }, { id: 2 }]);
    if (url.pathname.includes("/groups/2/items")) {
      return response(200, [{ data: { itemType: "journalArticle", title: "Target title" } }]);
    }
    return response(200, [duplicate]);
  }, { matcher: wrappedMatcher });
  assert.equal((await harness.backend.check({ title: "Target title" })).status, "matched");
  assert.deepEqual(matchInputSizes, [1, 0, 1]);
});

test("query and group caches are bounded by TTL and query entry count", async () => {
  let clock = 1000;
  const harness = createHarness(async (url) => {
    if (url.pathname.endsWith("/groups")) return response(200, []);
    return response(200, []);
  }, {
    now: () => clock,
    queryCacheTtlMs: 10,
    queryCacheMaxEntries: 2,
    groupCacheTtlMs: 10
  });

  await harness.backend.check({ title: "A" });
  await harness.backend.check({ title: "A" });
  assert.equal(harness.requests.filter((url) => url.includes("/groups?")).length, 1);
  assert.equal(harness.requests.filter((url) => new URL(url).searchParams.get("q") === "A").length, 1);

  await harness.backend.check({ title: "B" });
  await harness.backend.check({ title: "C" });
  await harness.backend.check({ title: "A" });
  assert.equal(harness.requests.filter((url) => new URL(url).searchParams.get("q") === "A").length, 2);

  clock += 11;
  await harness.backend.check({ title: "C" });
  assert.equal(harness.requests.filter((url) => url.includes("/groups?")).length, 2);
  assert.equal(harness.requests.filter((url) => new URL(url).searchParams.get("q") === "C").length, 2);
});

test("a new batch aborts or supersedes the previous batch", async () => {
  let holdOld = true;
  const harness = createHarness(async (url, options) => {
    if (url.pathname.endsWith("/groups")) return response(200, []);
    const term = url.searchParams.get("q");
    if (term === "Old" && holdOld) {
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
    }
    return response(200, [{ data: { itemType: "journalArticle", title: term } }]);
  });
  const oldBatch = harness.backend.batchCheck([{ title: "Old" }]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  holdOld = false;
  const newBatch = harness.backend.batchCheck([{ title: "New" }]);

  assert.deepEqual(await newBatch, {
    results: [{ status: "matched", matchType: "title", confidence: 0.95 }]
  });
  assert.deepEqual(await oldBatch, {
    results: [{ status: "error", matchType: null, confidence: 0, error: "batch_superseded" }]
  });
});

test("repeated identical batches reuse the active work instead of superseding it", async () => {
  let releaseItems;
  const harness = createHarness(async (url) => {
    if (url.pathname.endsWith("/groups")) return response(200, []);
    return new Promise((resolve) => {
      releaseItems = () => resolve(response(200, [{ data: { itemType: "journalArticle", title: "Same" } }]));
    });
  });

  const first = harness.backend.batchCheck([{ title: "Same" }], { scope: "tab-1" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const repeated = harness.backend.batchCheck([{ title: "Same" }], { scope: "tab-1" });
  releaseItems();

  assert.deepEqual(await first, {
    results: [{ status: "matched", matchType: "title", confidence: 0.95 }]
  });
  assert.deepEqual(await repeated, await first);
  assert.equal(harness.requests.filter((url) => url.includes("/items?")).length, 1);
});

test("batches from different tabs do not cancel each other", async () => {
  let releaseOld;
  const harness = createHarness(async (url, options) => {
    if (url.pathname.endsWith("/groups")) return response(200, []);
    const term = url.searchParams.get("q");
    if (term === "Old") {
      return new Promise((resolve, reject) => {
        releaseOld = () => resolve(response(200, [{ data: { itemType: "journalArticle", title: term } }]));
        options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
    }
    return response(200, [{ data: { itemType: "journalArticle", title: term } }]);
  }, { concurrency: 2 });

  const oldBatch = harness.backend.batchCheck([{ title: "Old" }], { scope: "tab-1" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const otherTab = harness.backend.batchCheck([{ title: "New" }], { scope: "tab-2" });
  assert.deepEqual(await otherTab, {
    results: [{ status: "matched", matchType: "title", confidence: 0.95 }]
  });
  releaseOld();
  assert.deepEqual(await oldBatch, {
    results: [{ status: "matched", matchType: "title", confidence: 0.95 }]
  });
});

test("page-side batch limit remains 80 candidates", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../browser-extension/src/content.js", import.meta.url), "utf8");
  assert.match(source, /const BATCH_LIMIT = 80;/);
  assert.match(source, /\.slice\(0, BATCH_LIMIT\)/);
});
