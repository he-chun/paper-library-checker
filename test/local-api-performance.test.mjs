import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const localApi = require("../browser-extension/src/backends/direct-local-api-backend.js");

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "3" },
    json: async () => payload
  };
}

function delayed(value, milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(value), milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    }, { once: true });
  });
}

function performanceBackend(route, { timeoutMs = 100 } = {}) {
  let active = 0;
  let maximumActive = 0;
  let requestCount = 0;
  const backend = localApi.createDirectLocalApiBackend({
    concurrency: 6,
    timeoutMs,
    fetch: async (url, options) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      requestCount += 1;
      try {
        return await route(new URL(url), options);
      } finally {
        active -= 1;
      }
    }
  });
  return {
    backend,
    maximumActive: () => maximumActive,
    requestCount: () => requestCount
  };
}

for (const size of [1, 20, 50, 80]) {
  test(`simulated title-only batch performance: ${size} candidates`, async (t) => {
    const harness = performanceBackend(async (url, options) => {
      if (url.pathname.endsWith("/groups")) return delayed(response(200, []), 1, options.signal);
      const title = url.searchParams.get("q");
      return delayed(response(200, [{ data: { itemType: "journalArticle", title } }]), 2, options.signal);
    });
    const candidates = Array.from({ length: size }, (_, index) => ({ title: `Synthetic title ${index}` }));
    const started = performance.now();
    const result = await harness.backend.batchCheck(candidates);
    const elapsedMs = Number((performance.now() - started).toFixed(2));

    assert.equal(result.results.length, size);
    assert.equal(result.results.every((entry) => entry.status === "matched" && entry.matchType === "title"), true);
    assert.equal(harness.maximumActive() <= 4, true);
    assert.equal(harness.requestCount(), size + 1);
    t.diagnostic(JSON.stringify({ size, elapsedMs, requests: harness.requestCount(), maxConcurrency: harness.maximumActive() }));
  });
}

test("simulated 80-item duplicate DOI batch performs one item query", async (t) => {
  const harness = performanceBackend(async (url, options) => {
    if (url.pathname.endsWith("/groups")) return delayed(response(200, []), 1, options.signal);
    return delayed(response(200, [{ data: { itemType: "journalArticle", DOI: "10.1000/repeated" } }]), 2, options.signal);
  });
  const candidates = Array.from({ length: 80 }, () => ({ DOI: "https://doi.org/10.1000/REPEATED" }));
  const started = performance.now();
  const result = await harness.backend.batchCheck(candidates);
  const elapsedMs = Number((performance.now() - started).toFixed(2));

  assert.equal(result.results.length, 80);
  assert.equal(result.results.every((entry) => entry.status === "matched"), true);
  assert.equal(harness.requestCount(), 2);
  t.diagnostic(JSON.stringify({ size: 80, duplicateDOI: true, elapsedMs, requests: 2 }));
});

test("simulated multi-group batch remains within four active requests", async (t) => {
  const groups = Array.from({ length: 12 }, (_, index) => ({ id: index + 1 }));
  const harness = performanceBackend(async (url, options) => {
    if (url.pathname.endsWith("/groups")) return delayed(response(200, groups), 1, options.signal);
    const term = url.searchParams.get("q");
    const isLastGroup = url.pathname.includes("/groups/12/items");
    return delayed(response(200, isLastGroup
      ? [{ data: { itemType: "journalArticle", DOI: term } }]
      : []), 1, options.signal);
  });
  const candidates = Array.from({ length: 20 }, (_, index) => ({ DOI: `10.1000/group-${index}` }));
  const started = performance.now();
  const result = await harness.backend.batchCheck(candidates);
  const elapsedMs = Number((performance.now() - started).toFixed(2));

  assert.equal(result.results.every((entry) => entry.status === "matched"), true);
  assert.equal(harness.maximumActive() <= 4, true);
  t.diagnostic(JSON.stringify({ candidates: 20, groups: 12, elapsedMs, requests: harness.requestCount(), maxConcurrency: harness.maximumActive() }));
});

test("simulated timeout and partial request failure are isolated in order", async (t) => {
  const harness = performanceBackend(async (url, options) => {
    if (url.pathname.endsWith("/groups")) return response(200, []);
    const term = url.searchParams.get("q");
    if (term === "Timeout") return delayed(response(200, []), 100, options.signal);
    if (term === "Failure") return response(500, {});
    return response(200, [{ data: { itemType: "journalArticle", title: term } }]);
  }, { timeoutMs: 5 });
  const started = performance.now();
  const result = await harness.backend.batchCheck([
    { title: "First" },
    { title: "Timeout" },
    { title: "Failure" },
    { title: "Last" }
  ]);
  const elapsedMs = Number((performance.now() - started).toFixed(2));

  assert.deepEqual(result.results.map((entry) => entry.status), ["matched", "error", "error", "matched"]);
  assert.equal(result.results[1].error, "local_api_timeout");
  assert.equal(result.results[2].error, "local_api_unavailable");
  assert.equal(harness.maximumActive() <= 4, true);
  t.diagnostic(JSON.stringify({ partialFailure: true, elapsedMs, maxConcurrency: harness.maximumActive() }));
});
