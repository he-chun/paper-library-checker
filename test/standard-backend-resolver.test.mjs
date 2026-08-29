import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const standardApi = require("../browser-extension/src/backends/standard-backend-resolver.js");
const outerApi = require("../browser-extension/src/backends/backend-resolver.js");

function backend(name) {
  const calls = [];
  return {
    calls,
    async probe() { calls.push("probe"); return { ok: true, version: name === "indexed" ? "3" : "direct", indexReady: true }; },
    async check(candidate) { calls.push(["check", candidate]); return { status: "not_found", engine: name }; },
    async batchCheck(candidates) { calls.push(["batch", candidates.length]); return { results: candidates.map(() => ({ status: "not_found", engine: name })) }; },
    getCapabilities() { return { engine: name, batch: true }; }
  };
}

function standardHarness(state, options = {}) {
  const direct = backend("direct");
  const indexed = backend("indexed");
  let starts = 0;
  const standard = standardApi.createStandardBackendResolver({
    directBackend: direct,
    getIndexedBackend: () => indexed,
    getIndexStatus: async () => ({
      state,
      scopeKey: "scope",
      activeGeneration: ["ready", "stale", "refreshing", "error"].includes(state) ? 1 : null
    }),
    startIndexBuild: () => { starts += 1; }
  });
  return { direct, indexed, standard, get starts() { return starts; }, ...options };
}

test("ready indexes handle probe, detail, and batch without Direct quicksearch", async () => {
  const h = standardHarness("ready");
  await h.standard.probe();
  assert.equal((await h.standard.check({ DOI: "10.1/a" })).engine, "indexed");
  assert.equal((await h.standard.batchCheck(Array.from({ length: 80 }, () => ({})))).results[0].engine, "indexed");
  assert.deepEqual(h.direct.calls, []);
  assert.equal(h.standard.getCapabilities().engine, "indexed");
});

test("missing indexes allow detail and small-batch Direct fallback", async () => {
  for (const state of ["not_built", "building"]) {
    const h = standardHarness(state);
    assert.equal((await h.standard.check({ title: "Detail" })).engine, "direct");
    assert.equal((await h.standard.batchCheck(Array.from({ length: 10 }, () => ({})))).results[0].engine, "direct");
    assert.equal(h.direct.calls.some((entry) => Array.isArray(entry) && entry[0] === "check"), true);
    assert.equal(h.direct.calls.some((entry) => Array.isArray(entry) && entry[0] === "batch"), true);
    assert.deepEqual(h.indexed.calls, []);
  }
});

test("a successful first Direct probe suggests the initial full index build", async () => {
  const h = standardHarness("not_built");
  await h.standard.probe();
  assert.equal(h.starts, 1);
  assert.deepEqual(h.indexed.calls, []);
});

test("stale, refreshing, and failed refresh states keep the old indexed generation active", async () => {
  for (const state of ["stale", "refreshing", "error"]) {
    const h = standardHarness(state);
    assert.equal((await h.standard.check({ title: "Detail" })).engine, "indexed");
    assert.equal((await h.standard.batchCheck(Array.from({ length: 80 }, () => ({})))).results[0].engine, "indexed");
    assert.deepEqual(h.direct.calls, []);
  }
});

test("large Direct fallback batches return a stable gate and trigger at most a build suggestion", async () => {
  const missing = standardHarness("not_built");
  const response = await missing.standard.batchCheck(Array.from({ length: 11 }, () => ({})));
  assert.equal(response.results.length, 11);
  assert.equal(response.results.every((value) => value.error === "index_required"), true);
  assert.equal(missing.starts, 1);
  assert.deepEqual(missing.direct.calls, []);

  const building = standardHarness("building");
  const inProgress = await building.standard.batchCheck(Array.from({ length: 80 }, () => ({})));
  assert.equal(inProgress.results.every((value) => value.error === "index_building"), true);
  assert.equal(building.starts, 0);
  assert.deepEqual(building.direct.calls, []);
});

test("outer auto, standard, and enhanced mode semantics remain unchanged", async () => {
  const standard = standardHarness("ready").standard;
  const enhanced = backend("enhanced");
  enhanced.probe = async () => ({ ok: true, version: "0.4.1", indexReady: true });
  const outer = outerApi.createBackendResolver({
    storage: { sync: { get: async () => ({ connectionMode: "auto" }) } },
    enhancedBackend: enhanced,
    standardBackend: standard,
    getExtensionVersion: () => "0.4.1"
  });
  assert.equal((await outer.resolveMode("auto")).selectedMode, "enhanced");
  assert.equal((await outer.resolveMode("standard")).backend, standard);
  assert.equal((await outer.resolveMode("enhanced")).backend, enhanced);
});

test("outer auto falls through a failed enhanced probe to the indexed standard engine", async () => {
  const h = standardHarness("ready");
  const enhanced = backend("enhanced");
  enhanced.probe = async () => { throw Object.assign(new Error("offline"), { code: "enhanced_backend_unavailable" }); };
  const outer = outerApi.createBackendResolver({
    storage: { sync: { get: async () => ({ connectionMode: "auto" }) } },
    enhancedBackend: enhanced,
    standardBackend: h.standard,
    getExtensionVersion: () => "0.4.1"
  });
  const resolved = await outer.resolveMode("auto");
  assert.equal(resolved.selectedMode, "standard");
  assert.equal(resolved.degradedReason, "enhanced_backend_unavailable");
  assert.equal((await resolved.backend.check({ title: "Indexed" })).engine, "indexed");
  assert.deepEqual(h.direct.calls, []);
});

test("Direct batch fallback limit is stable", () => {
  assert.equal(standardApi.DIRECT_BATCH_FALLBACK_LIMIT, 10);
});
