import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const freshnessApi = require("../browser-extension/src/index/index-freshness.js");
const { createIndexBuildProgress } = require("../browser-extension/src/index/index-build-progress.js");
const { createIndexBuildController } = require("../browser-extension/src/index/index-build-controller.js");
const { createIndexedLocalApiBackend } = require("../browser-extension/src/backends/indexed-local-api-backend.js");

test("freshness uses the named thirty-minute maximum age", () => {
  assert.equal(freshnessApi.INDEX_MAX_AGE_MS, 30 * 60 * 1000);
  const now = 2_000_000;
  const current = { state: "ready", activeGeneration: 4, lastSuccessfulBuildAt: now - 1000 };
  assert.deepEqual(freshnessApi.evaluateIndexFreshness(current, now), {
    state: "ready", freshness: "fresh", stale: false
  });
  assert.deepEqual(freshnessApi.evaluateIndexFreshness({
    ...current,
    lastSuccessfulBuildAt: now - freshnessApi.INDEX_MAX_AGE_MS - 1
  }, now), { state: "stale", freshness: "stale", stale: true });
  assert.equal(freshnessApi.evaluateIndexFreshness({ state: "error", activeGeneration: 4 }, now).freshness, "stale");
  assert.equal(freshnessApi.evaluateIndexFreshness(null, now).freshness, "unavailable");
});

test("cold startup serves an old generation while automatic full refresh runs", async () => {
  let resolveBuild;
  let clears = 0;
  const progress = createIndexBuildProgress({ now: () => 4_000_000 });
  const meta = {
    scopeKey: "legacy:local-api-v3",
    scopeConfidence: "legacy",
    state: "ready",
    activeGeneration: 7,
    lastSuccessfulBuildAt: 1,
    lastAttemptAt: 1,
    itemCount: 120,
    libraryCount: 3,
    errorCode: ""
  };
  const repository = {
    async open() {},
    async getLatestMeta() { return { ...meta }; },
    async setState(_scope, state) { meta.state = state; return { ...meta }; },
    async clearAll() { clears += 1; }
  };
  const builder = {
    async build({ signal, refreshing }) {
      assert.equal(refreshing, true);
      progress.begin({ refreshing, activeGeneration: 7 });
      await new Promise((resolve, reject) => {
        resolveBuild = resolve;
        signal.addEventListener("abort", () => reject(Object.assign(new Error("cancelled"), { code: "index_build_cancelled" })));
      });
      progress.ready({ activeGeneration: 8, itemCount: 125, libraryCount: 2, totalItems: 125 });
      return { ok: true, generation: 8 };
    }
  };
  const controller = createIndexBuildController({ builder, progress, repository, freshness: freshnessApi });
  const startup = await controller.initialize();
  assert.equal(startup.activeGeneration, 7);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal((await controller.getStatus()).state, "refreshing");
  assert.equal((await controller.getStatus()).activeGeneration, 7);
  assert.equal((await controller.getStatus()).scopeKey, "legacy:local-api-v3");
  resolveBuild();
  const ready = await controller.waitForIdle();
  assert.equal(ready.state, "ready");
  assert.equal(ready.activeGeneration, 8);
  assert.equal(ready.itemCount, 125);
  assert.equal(ready.libraryCount, 2);
  assert.equal(clears, 0);
});

test("clear and clear-and-rebuild are controller-owned lifecycle operations", async () => {
  let builds = 0;
  let clears = 0;
  const progress = createIndexBuildProgress();
  const repository = {
    async open() {},
    async getLatestMeta() { return null; },
    async clearAll() { clears += 1; }
  };
  const builder = {
    async build() {
      builds += 1;
      progress.begin();
      progress.ready({ activeGeneration: builds, itemCount: 1, libraryCount: 1 });
      return { ok: true };
    }
  };
  const controller = createIndexBuildController({ builder, progress, repository, freshness: freshnessApi });
  await controller.clear();
  assert.equal((await controller.getStatus()).state, "not_built");
  await controller.clearAndRebuild();
  await controller.waitForIdle();
  assert.equal(clears, 2);
  assert.equal(builds, 1);
  assert.equal((await controller.getStatus()).state, "ready");
});

test("stale indexed hits and misses are minimized and never claim completeness", async () => {
  const record = {
    scopeKey: "scope", generation: 2, libraryKey: "users/0", itemKey: "PRIVATE",
    itemVersion: 1, identifierKeys: ["doi:10.1000/stale"], titleKey: "", year: "",
    creatorKeys: [], itemType: "journalarticle"
  };
  const backend = createIndexedLocalApiBackend({
    repository: {
      async queryMany(_scope, keys) {
        return {
          identifiers: Object.fromEntries(keys.identifierKeys.map((key) => [key, key.endsWith("stale") ? [record] : []])),
          titles: {}
        };
      }
    },
    getIndexContext: async () => ({
      state: "refreshing", freshness: "stale", scopeKey: "scope", activeGeneration: 2
    })
  });
  const hit = await backend.check({ DOI: "10.1000/stale" });
  const miss = await backend.check({ DOI: "10.1000/missing" });
  assert.equal(hit.status, "matched");
  assert.equal(hit.complete, false);
  assert.equal(hit.indexState, "stale");
  assert.equal(miss.status, "not_found");
  assert.equal(miss.complete, false);
  assert.equal(miss.reason, "stale_index_no_match");
  assert.equal(JSON.stringify([hit, miss]).includes("PRIVATE"), false);
});
