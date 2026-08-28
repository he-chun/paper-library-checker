import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const diagnostics = require("../browser-extension/src/common/developer-diagnostics.js");
const localApi = require("../browser-extension/src/backends/direct-local-api-backend.js");

test("developer diagnostics are disabled by default and bounded in memory", () => {
  const log = diagnostics.createDeveloperDiagnostics({ maxEntries: 2, now: () => 1000 });
  log.record("operation_completed", { operation: "check", durationMs: 12 });
  assert.deepEqual(log.getEntries(), []);

  log.setEnabled(true);
  log.record("operation_completed", { operation: "check", durationMs: 12 });
  log.record("operation_completed", { operation: "check", durationMs: 13 });
  log.record("operation_completed", { operation: "check", durationMs: 14 });
  assert.deepEqual(log.getEntries().map((entry) => entry.durationMs), [13, 14]);
});

test("developer diagnostics use an allowlist and discard paper and connection data", () => {
  const secret = "a".repeat(64);
  const log = diagnostics.createDeveloperDiagnostics({ enabled: true, now: () => 1000 });
  log.record("backend_request_completed", {
    backend: "standard",
    phase: "item_query",
    workload: "references",
    durationMs: 1250.4,
    cooldownMs: 60000,
    httpStatus: 200,
    title: "Private paper title",
    doi: "10.1000/private",
    url: "http://127.0.0.1:23119/api/users/0/items?q=private",
    token: secret,
    item: { data: { creators: [{ lastName: "Private" }] } }
  });

  const serialized = JSON.stringify(log.getEntries());
  assert.match(serialized, /backend_request_completed/);
  assert.match(serialized, /item_query/);
  assert.match(serialized, /references/);
  assert.match(serialized, /1250/);
  assert.match(serialized, /60000/);
  for (const privateValue of ["Private paper title", "10.1000/private", "127.0.0.1", secret, "creators"]) {
    assert.equal(serialized.includes(privateValue), false);
  }
});

test("developer diagnostics expose only cloned entries and stable error codes", () => {
  const log = diagnostics.createDeveloperDiagnostics({ enabled: true, now: () => 1000 });
  log.record("operation_failed", {
    operation: "batch",
    error: "local_api_timeout",
    message: "private failure detail"
  });
  const entries = log.getEntries();
  entries[0].error = "changed";
  assert.equal(log.getEntries()[0].error, "local_api_timeout");
  assert.equal(JSON.stringify(log.getEntries()).includes("private failure detail"), false);
});

test("standard backend reports probe, group, item, cache, and batch timings", async () => {
  const events = [];
  const fetch = async (url) => {
    if (url === localApi.DEFAULT_ENDPOINT) {
      return { ok: true, status: 200, headers: { get: () => "3" } };
    }
    if (url.includes("/groups?")) return { ok: true, status: 200, json: async () => [] };
    return {
      ok: true,
      status: 200,
      json: async () => [{ data: { itemType: "journalArticle", DOI: "10.1000/example" } }]
    };
  };
  const backend = localApi.createDirectLocalApiBackend({ fetch, onDiagnostic: (event, details) => events.push({ event, ...details }) });

  await backend.probe();
  await backend.batchCheck([
    { DOI: "10.1000/example" },
    { DOI: "https://doi.org/10.1000/example" }
  ]);
  await backend.check({ DOI: "10.1000/example" });

  assert.equal(events.some((entry) => entry.event === "backend_request_completed" && entry.phase === "probe"), true);
  assert.equal(events.some((entry) => entry.event === "backend_request_completed" && entry.phase === "group_list"), true);
  assert.equal(events.some((entry) => entry.event === "backend_request_completed" && entry.phase === "item_query"), true);
  assert.equal(events.some((entry) => entry.event === "cache_used" && entry.phase === "item_query"), true);
  assert.equal(events.some((entry) => entry.event === "batch_completed" && entry.inputCount === 2 && entry.uniqueCount === 1), true);
  const batchStart = events.find((entry) => entry.event === "batch_started");
  assert.equal(Number.isFinite(batchStart.batchId), true);
  assert.equal(events.some((entry) => entry.phase === "item_query" && entry.batchId === batchStart.batchId), true);
  assert.equal(events.some((entry) => entry.event === "batch_completed" && entry.batchId === batchStart.batchId && entry.outcome === "ok"), true);
  assert.equal(JSON.stringify(events).includes("10.1000/example"), false);
});

test("failed standard batches are correlated and do not report an ok outcome", async () => {
  const events = [];
  const backend = localApi.createDirectLocalApiBackend({
    fetch: async (url) => url.includes("/groups?")
      ? { ok: true, status: 200, json: async () => [] }
      : { ok: false, status: 500, json: async () => ({}) },
    onDiagnostic: (event, details) => events.push({ event, ...details })
  });
  const result = await backend.batchCheck([{ title: "Private title" }], { batchId: 42 });
  assert.equal(result.results[0].status, "error");
  assert.equal(events.some((entry) =>
    entry.event === "batch_completed" && entry.batchId === 42 && entry.outcome === "error" && entry.errorCount === 1
  ), true);
});
