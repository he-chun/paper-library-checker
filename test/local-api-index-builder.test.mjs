import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";

const require = createRequire(import.meta.url);
const matcher = require("../browser-extension/src/backends/local-api-matcher.js");
const { createIndexedDBIndexRepository } = require("../browser-extension/src/index/indexeddb-index-repository.js");
const { createIndexGenerationManager } = require("../browser-extension/src/index/index-generation-manager.js");
const { createLocalApiLibraryDiscovery, LEGACY_SCOPE_KEY } = require(
  "../browser-extension/src/index/local-api-library-discovery.js"
);
const { createIndexBuildProgress } = require("../browser-extension/src/index/index-build-progress.js");
const { createLocalApiIndexBuilder } = require("../browser-extension/src/index/local-api-index-builder.js");
const { createIndexBuildController } = require("../browser-extension/src/index/index-build-controller.js");

let sequence = 0;

function item(key, overrides = {}) {
  return {
    key,
    version: 1,
    data: {
      itemType: "journalArticle",
      title: `Title ${key}`,
      DOI: `10.1000/${key}`,
      date: "2024",
      creators: [{ firstName: "Jane", lastName: "Doe" }],
      abstractNote: "raw abstract must disappear",
      tags: [{ tag: "raw tag" }],
      url: "https://example.test/raw/url",
      ...overrides
    }
  };
}

function createSource(libraries = {}, options = {}) {
  const calls = [];
  const groupIDs = Object.keys(libraries).filter((key) => key.startsWith("groups/")).map((key) => key.slice(7));
  return {
    calls,
    async probe({ signal } = {}) {
      if (signal?.aborted) throw Object.assign(new Error("batch_superseded"), { code: "batch_superseded" });
      if (options.probeError) throw options.probeError;
      return { apiVersion: "3", schemaVersion: "38", instanceIdentifier: options.instanceIdentifier || "" };
    },
    async discoverGroupIDs({ signal } = {}) {
      if (signal?.aborted) throw Object.assign(new Error("batch_superseded"), { code: "batch_superseded" });
      if (options.groupError) throw options.groupError;
      return groupIDs;
    },
    async readLibraryPage(libraryPath, { start, limit, signal }) {
      calls.push({ libraryPath, start, limit });
      if (signal?.aborted) throw Object.assign(new Error("batch_superseded"), { code: "batch_superseded" });
      if (options.failLibrary === libraryPath) throw options.pageError || Object.assign(new Error("failed"), { code: "local_api_unavailable" });
      if (options.readPage) return options.readPage(libraryPath, { start, limit, signal, calls });
      const values = libraries[libraryPath] || [];
      return { items: values.slice(start, start + limit), totalItems: values.length, sourceVersion: 99 };
    }
  };
}

function createHarness(libraries, options = {}) {
  const source = createSource(libraries, options);
  const repository = createIndexedDBIndexRepository({
    indexedDB,
    IDBKeyRange,
    databaseName: `plc-builder-${++sequence}`,
    now: () => 1700000000000 + sequence
  });
  const generationManager = createIndexGenerationManager(repository);
  const discovery = createLocalApiLibraryDiscovery(source);
  const progress = createIndexBuildProgress({ now: () => 1700000000100 + sequence });
  const builder = createLocalApiIndexBuilder({
    source, discovery, repository, generationManager, progress,
    pageSize: options.pageSize || 250,
    now: () => 1700000000200 + sequence
  });
  return { builder, discovery, generationManager, progress, repository, source };
}

async function seedOld(repository, generationManager, scopeKey = LEGACY_SCOPE_KEY) {
  const generation = await generationManager.beginGeneration(scopeKey, { scopeConfidence: "legacy" });
  await generationManager.putRecords(scopeKey, generation, [{ ...item("OLD"), libraryKey: "users/0" }]);
  await generationManager.putLibraryMetadata(scopeKey, generation, {
    libraryKey: "users/0", itemCount: 1, sourceVersion: null, indexedAt: 1
  });
  await generationManager.commitGeneration(scopeKey, generation);
  return generation;
}

test("builds personal-only, empty, and multi-page library snapshots", async () => {
  const personalItems = Array.from({ length: 601 }, (_, index) => item(`P${index}`));
  const harness = createHarness({ "users/0": personalItems });
  const result = await harness.builder.build();
  assert.equal(result.scopeKey, LEGACY_SCOPE_KEY);
  assert.equal(result.scopeConfidence, "legacy");
  assert.equal(result.processedItems, 601);
  assert.equal(result.indexedItems, 601);
  assert.deepEqual(harness.source.calls.map((call) => call.start), [0, 250, 500]);
  assert.equal((await harness.repository.queryByIdentifier(LEGACY_SCOPE_KEY, "doi:10.1000/p600")).length, 1);
  const meta = await harness.repository.getMeta(LEGACY_SCOPE_KEY);
  assert.equal(meta.scopeConfidence, "legacy");
  assert.equal(meta.state, "ready");
  assert.equal(harness.progress.snapshot().totalItems, 601);
  harness.repository.close();

  const empty = createHarness({ "users/0": [] });
  assert.equal((await empty.builder.build()).indexedItems, 0);
  assert.equal(empty.progress.snapshot().state, "ready");
  empty.repository.close();

  const unknownTotalItems = Array.from({ length: 300 }, (_, index) => item(`U${index}`));
  const unknownTotal = createHarness({ "users/0": unknownTotalItems }, {
    readPage: async (_library, { start, limit }) => ({
      items: unknownTotalItems.slice(start, start + limit),
      totalItems: null
    })
  });
  assert.equal((await unknownTotal.builder.build()).processedItems, 300);
  assert.deepEqual(unknownTotal.source.calls.map((call) => call.start), [0, 250]);
  unknownTotal.repository.close();
});

test("discovers multiple groups and keeps cross-library duplicate item keys isolated", async () => {
  const duplicate = item("DUPLICATE");
  const harness = createHarness({
    "users/0": [duplicate],
    "groups/7": [duplicate, item("GROUP7")],
    "groups/9": [item("GROUP9")]
  }, { instanceIdentifier: "PROFILE-123456" });
  const result = await harness.builder.build();
  assert.equal(result.scopeKey, "instance:profile-123456");
  assert.equal(result.scopeConfidence, "stable");
  assert.equal(result.processedLibraries, 3);
  const duplicates = await harness.repository.queryByIdentifier(result.scopeKey, "doi:10.1000/duplicate");
  assert.deepEqual(duplicates.map((record) => record.libraryKey).sort(), ["groups/7", "users/0"]);
  assert.equal(harness.progress.snapshot().processedLibraries, 3);
  harness.repository.close();
});

test("filters deleted, child, attachment, note, and annotation entries before persistence", async () => {
  const harness = createHarness({
    "users/0": [
      item("KEEP"),
      item("DELETED", { deleted: true }),
      item("CHILD", { parentItem: "PARENT" }),
      item("ATTACHMENT", { itemType: "attachment" }),
      item("NOTE", { itemType: "note" }),
      item("ANNOTATION", { itemType: "annotation" })
    ]
  });
  const result = await harness.builder.build();
  assert.equal(result.processedItems, 6);
  assert.equal(result.indexedItems, 1);
  const stored = (await harness.repository.queryByIdentifier(LEGACY_SCOPE_KEY, "doi:10.1000/keep"))[0];
  assert.equal(JSON.stringify(stored).includes("raw abstract"), false);
  assert.equal(JSON.stringify(stored).includes("raw tag"), false);
  assert.equal(JSON.stringify(stored).includes("example.test"), false);
  harness.repository.close();
});

test("a group failure, timeout, or malformed page aborts the new generation and preserves the old one", async () => {
  for (const [label, options, expected] of [
    ["group", { failLibrary: "groups/7" }, "local_api_unavailable"],
    ["timeout", { failLibrary: "users/0", pageError: Object.assign(new Error("timeout"), { code: "local_api_timeout" }) }, "local_api_timeout"],
    ["malformed", { readPage: async () => ({ items: {}, totalItems: null }) }, "local_api_malformed_response"]
  ]) {
    const libraries = label === "group"
      ? { "users/0": [item("NEW")], "groups/7": [item("GROUP")] }
      : { "users/0": [item("NEW")] };
    const harness = createHarness(libraries, options);
    await seedOld(harness.repository, harness.generationManager);
    await assert.rejects(() => harness.builder.build(), (error) => error.code === expected);
    assert.equal(await harness.repository.getActiveGeneration(LEGACY_SCOPE_KEY), 1);
    assert.equal((await harness.repository.queryByIdentifier(LEGACY_SCOPE_KEY, "doi:10.1000/old")).length, 1);
    assert.equal((await harness.repository.queryByIdentifier(LEGACY_SCOPE_KEY, "doi:10.1000/new")).length, 0);
    assert.equal(harness.progress.snapshot().state, "error");
    harness.repository.close();
  }
});

test("a complete refresh atomically replaces and prunes the old generation", async () => {
  const harness = createHarness({ "users/0": [item("NEW")] });
  await seedOld(harness.repository, harness.generationManager);
  const result = await harness.builder.build();
  assert.equal(result.generation, 2);
  assert.equal(await harness.repository.getActiveGeneration(LEGACY_SCOPE_KEY), 2);
  assert.equal((await harness.repository.queryByIdentifier(LEGACY_SCOPE_KEY, "doi:10.1000/new")).length, 1);
  assert.equal((await harness.repository.queryByIdentifier(LEGACY_SCOPE_KEY, "doi:10.1000/old")).length, 0);
  const meta = await harness.repository.getMeta(LEGACY_SCOPE_KEY);
  assert.equal(meta.itemCount, 1);
  assert.equal(meta.libraryCount, 1);
  assert.equal(Number.isSafeInteger(meta.lastSuccessfulBuildAt), true);
  harness.repository.close();
});

test("controller cancellation and superseding builds never overlap", async () => {
  let readAttempt = 0;
  let activeReads = 0;
  let maximumActiveReads = 0;
  let notifyFirstRead;
  const firstReadStarted = new Promise((resolve) => { notifyFirstRead = resolve; });
  const harness = createHarness({ "users/0": [] }, {
    readPage: (_library, { signal }) => {
      readAttempt += 1;
      if (readAttempt === 1) notifyFirstRead();
      activeReads += 1;
      maximumActiveReads = Math.max(maximumActiveReads, activeReads);
      if (readAttempt > 1) {
        activeReads -= 1;
        return Promise.resolve({ items: [], totalItems: 0 });
      }
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          activeReads -= 1;
          reject(Object.assign(new Error("superseded"), { code: "batch_superseded" }));
        }, { once: true });
      });
    }
  });
  const controller = createIndexBuildController({
    builder: harness.builder,
    progress: harness.progress,
    repository: harness.repository
  });
  const first = controller.start();
  await firstReadStarted;
  const second = controller.start();
  assert.notEqual(first.taskId, second.taskId);
  const finalStatus = await controller.waitForIdle();
  assert.equal(finalStatus.state, "ready");
  assert.equal(maximumActiveReads, 1);
  assert.equal(readAttempt, 2);

  let notifyBlockingRead;
  const blockingReadStarted = new Promise((resolve) => { notifyBlockingRead = resolve; });
  const blocking = createHarness({ "users/0": [] }, {
    readPage: (_library, { signal }) => new Promise((_resolve, reject) => {
      notifyBlockingRead();
      signal.addEventListener("abort", () => reject(Object.assign(new Error("cancelled"), { code: "batch_superseded" })), { once: true });
    })
  });
  const cancelController = createIndexBuildController({
    builder: blocking.builder,
    progress: blocking.progress,
    repository: blocking.repository
  });
  cancelController.start();
  await blockingReadStarted;
  const cancelled = await cancelController.cancel();
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.status.state, "not_built");
  harness.repository.close();
  blocking.repository.close();
});

test("service-worker-style interruption is recovered without activating the partial generation", async () => {
  const harness = createHarness({ "users/0": [] });
  await seedOld(harness.repository, harness.generationManager);
  const pending = await harness.generationManager.beginGeneration(LEGACY_SCOPE_KEY, { scopeConfidence: "legacy" });
  await harness.generationManager.putRecords(LEGACY_SCOPE_KEY, pending, [{ ...item("PARTIAL"), libraryKey: "users/0" }]);
  harness.repository.close();

  const reopened = createIndexedDBIndexRepository({
    indexedDB,
    IDBKeyRange,
    databaseName: `plc-builder-${sequence}`
  });
  assert.equal(await reopened.getActiveGeneration(LEGACY_SCOPE_KEY), 1);
  assert.equal((await reopened.queryByIdentifier(LEGACY_SCOPE_KEY, "doi:10.1000/old")).length, 1);
  assert.equal((await reopened.queryByIdentifier(LEGACY_SCOPE_KEY, "doi:10.1000/partial")).length, 0);
  assert.equal((await reopened.getMeta(LEGACY_SCOPE_KEY)).errorCode, "index_build_interrupted");
  reopened.close();
});

test("a new controller hydrates safe status from persisted metadata", async () => {
  const harness = createHarness({ "users/0": [item("PERSISTED")] });
  await harness.builder.build();
  const progress = createIndexBuildProgress();
  const controller = createIndexBuildController({
    builder: { async build() {} },
    progress,
    repository: harness.repository
  });
  const status = await controller.getStatus();
  assert.equal(status.state, "ready");
  assert.equal(status.scopeKey, LEGACY_SCOPE_KEY);
  assert.equal(status.scopeConfidence, "legacy");
  assert.equal(status.activeGeneration, 1);
  assert.equal(Object.hasOwn(status, "records"), false);
  harness.repository.close();
});

test("50,000 simulated items are normalized and written in bounded page chunks", async () => {
  const batches = [];
  const metadata = [];
  let activeGeneration = null;
  const repository = {
    async getActiveGeneration() { return activeGeneration; },
    async getLatestMeta() { return null; }
  };
  const generationManager = {
    async beginGeneration() { return 1; },
    async putRecords(_scope, _generation, records) {
      batches.push(records);
      assert(records.length <= 250);
      for (const record of records) {
        assert.equal(Object.hasOwn(record, "data"), false);
        assert.equal(JSON.stringify(record).includes("raw abstract"), false);
      }
    },
    async putLibraryMetadata(_scope, _generation, value) { metadata.push(value); },
    async commitGeneration() { activeGeneration = 1; return { activeGeneration: 1 }; },
    async abortGeneration() {}
  };
  const source = {
    async probe() { return { apiVersion: "3", instanceIdentifier: "" }; },
    async discoverGroupIDs() { return []; },
    async readLibraryPage(_library, { start, limit }) {
      const remaining = Math.max(0, 50000 - start);
      return {
        items: Array.from({ length: Math.min(limit, remaining) }, (_, offset) => item(`BIG${start + offset}`)),
        totalItems: 50000
      };
    }
  };
  const discovery = createLocalApiLibraryDiscovery(source);
  const progress = createIndexBuildProgress();
  const builder = createLocalApiIndexBuilder({ source, discovery, repository, generationManager, progress });
  const result = await builder.build();
  assert.equal(result.processedItems, 50000);
  assert.equal(result.indexedItems, 50000);
  assert.equal(batches.length, 200);
  assert.equal(Math.max(...batches.map((batch) => batch.length)), 250);
  assert.equal(metadata[0].itemCount, 50000);
  assert.equal(progress.snapshot().state, "ready");
});

test("scope derivation never presents Zotero 9 legacy identity as stable", async () => {
  const legacy = createHarness({ "users/0": [] });
  const discovered = await legacy.discovery.discover();
  assert.deepEqual({ scopeKey: discovered.scopeKey, scopeConfidence: discovered.scopeConfidence }, {
    scopeKey: LEGACY_SCOPE_KEY,
    scopeConfidence: "legacy"
  });
  assert.equal(discovered.apiVersion, "3");
  legacy.repository.close();
  assert.equal(matcher.normalizeTitle("Title"), "title");
});
