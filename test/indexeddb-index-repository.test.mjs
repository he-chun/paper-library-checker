import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";

const require = createRequire(import.meta.url);
const schema = require("../browser-extension/src/index/index-schema.js");
const indexState = require("../browser-extension/src/index/index-state.js");
const { createIndexedDBIndexRepository } = require(
  "../browser-extension/src/index/indexeddb-index-repository.js"
);
const { createIndexGenerationManager } = require(
  "../browser-extension/src/index/index-generation-manager.js"
);

let sequence = 0;

function databaseName(label) {
  sequence += 1;
  return `plc-index-test-${label}-${sequence}`;
}

function repository(name, clock = () => 1700000000000) {
  return createIndexedDBIndexRepository({ indexedDB, IDBKeyRange, databaseName: name, now: clock });
}

function rawRecord(itemKey, overrides = {}) {
  const data = {
    itemType: "journalArticle",
    title: `Title ${itemKey}`,
    DOI: `10.1000/${itemKey}`,
    date: "2024",
    creators: [{ firstName: "Jane", lastName: "Doe" }],
    ...(overrides.data || {})
  };
  return {
    libraryKey: "users/0",
    key: itemKey,
    version: 1,
    ...overrides,
    data
  };
}

function openRaw(name, version, upgrade) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => upgrade?.(request.result, request.transaction);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function build(repositoryInstance, scopeKey, records, libraryKey = "users/0") {
  const generation = await repositoryInstance.beginGeneration(scopeKey);
  await repositoryInstance.putRecords(scopeKey, generation, records);
  await repositoryInstance.putLibraryMetadata(scopeKey, generation, {
    libraryKey,
    itemCount: records.length,
    sourceVersion: null,
    indexedAt: 1700000000000
  });
  await repositoryInstance.commitGeneration(scopeKey, generation);
  return generation;
}

test("first and repeated opens create and validate the complete schema", async () => {
  const name = databaseName("open");
  const first = repository(name);
  const database = await first.open();
  assert.equal(database.version, schema.SCHEMA_VERSION);
  assert.deepEqual([...database.objectStoreNames].sort(), ["libraries", "meta", "records"]);
  const transaction = database.transaction("records", "readonly");
  assert.equal(transaction.objectStore("records").index("identifierKeys").multiEntry, true);
  first.close();

  const second = repository(name);
  assert.equal((await second.open()).version, schema.SCHEMA_VERSION);
  assert.deepEqual(await second.getMeta("empty"), {
    scopeKey: "empty",
    schemaVersion: schema.SCHEMA_VERSION,
    activeGeneration: null,
    pendingGeneration: null,
    scopeConfidence: null,
    state: "not_built",
    lastSuccessfulBuildAt: null,
    lastAttemptAt: null,
    errorCode: ""
  });
  second.close();
});

test("schema upgrades add stores and a structurally corrupt current schema is rebuilt", async () => {
  const upgradeName = databaseName("upgrade");
  const legacy = await openRaw(upgradeName, 1, (database) => {
    database.createObjectStore("meta", { keyPath: "scopeKey" });
  });
  legacy.close();
  const upgraded = repository(upgradeName);
  assert.equal(schema.validateSchema(await upgraded.open()), true);
  upgraded.close();

  const corruptName = databaseName("corrupt");
  const corrupt = await openRaw(corruptName, schema.SCHEMA_VERSION, (database) => {
    database.createObjectStore("wrong", { keyPath: "id" });
  });
  corrupt.close();
  const recovered = repository(corruptName);
  const rebuilt = await recovered.open();
  assert.equal(schema.validateSchema(rebuilt), true);
  assert.equal(rebuilt.objectStoreNames.contains("wrong"), false);
  recovered.close();
});

test("successful generations switch atomically and survive close and reopen", async () => {
  const name = databaseName("persist");
  const first = repository(name);
  const generation = await build(first, "scope", [rawRecord("PERSIST")]);
  assert.equal(generation, 1);
  assert.equal(await first.getActiveGeneration("scope"), 1);
  first.close();

  const reopened = repository(name);
  assert.equal(await reopened.getActiveGeneration("scope"), 1);
  assert.equal((await reopened.queryByIdentifier("scope", "doi:10.1000/persist"))[0].itemKey, "PERSIST");
  reopened.close();
});

test("an incomplete generation never replaces the old generation and is recovered on startup", async () => {
  const name = databaseName("interrupted");
  const first = repository(name);
  await build(first, "scope", [rawRecord("OLD")]);
  const pending = await first.beginGeneration("scope");
  await first.putRecords("scope", pending, [rawRecord("NEW")]);
  assert.equal((await first.queryByIdentifier("scope", "doi:10.1000/old")).length, 1);
  assert.equal((await first.queryByIdentifier("scope", "doi:10.1000/new")).length, 0);
  first.close();

  const reopened = repository(name);
  const meta = await reopened.getMeta("scope");
  assert.equal(meta.activeGeneration, 1);
  assert.equal(meta.pendingGeneration, null);
  assert.equal(meta.state, indexState.INDEX_STATES.READY);
  assert.equal(meta.errorCode, "index_build_interrupted");
  assert.equal((await reopened.queryByIdentifier("scope", "doi:10.1000/old")).length, 1);
  assert.equal((await reopened.queryByIdentifier("scope", "doi:10.1000/new")).length, 0);
  reopened.close();
});

test("aborting a failed generation preserves the active generation", async () => {
  const repo = repository(databaseName("abort"));
  await build(repo, "scope", [rawRecord("OLD")]);
  const pending = await repo.beginGeneration("scope");
  await assert.rejects(repo.putRecords("scope", pending, [{ data: { itemType: "book" } }]), /invalid_index_record/);
  assert.equal(await repo.abortGeneration("scope", pending, "index_record_invalid"), true);
  assert.equal(await repo.getActiveGeneration("scope"), 1);
  assert.equal((await repo.queryByIdentifier("scope", "doi:10.1000/old")).length, 1);
  repo.close();
});

test("identifier multiEntry and title queries are limited to the active scope and generation", async () => {
  const repo = repository(databaseName("queries"));
  const title = "中英文 Exact Title";
  await build(repo, "scope-a", [rawRecord("A", {
    data: { title, DOI: "10.1000/shared", PMID: "123-456", ISBN: "978-1-2" }
  })]);
  await build(repo, "scope-b", [rawRecord("B", {
    data: { title, DOI: "10.1000/shared", PMID: "123-456" }
  })]);
  const pending = await repo.beginGeneration("scope-a");
  await repo.putRecords("scope-a", pending, [rawRecord("PENDING", {
    data: { title, DOI: "10.1000/pending", PMID: "999" }
  })]);

  assert.equal((await repo.queryByIdentifier("scope-a", "doi:10.1000/shared"))[0].itemKey, "A");
  assert.equal((await repo.queryByIdentifier("scope-a", "pmid:123456"))[0].itemKey, "A");
  assert.equal((await repo.queryByIdentifier("scope-a", "isbn:97812"))[0].itemKey, "A");
  assert.equal((await repo.queryByIdentifier("scope-a", "doi:10.1000/pending")).length, 0);
  assert.equal((await repo.queryByIdentifier("scope-b", "doi:10.1000/shared"))[0].itemKey, "B");
  const normalizedTitle = require("../browser-extension/src/backends/local-api-matcher.js").normalizeTitle(title);
  assert.equal((await repo.queryByTitle("scope-a", normalizedTitle))[0].itemKey, "A");
  await repo.abortGeneration("scope-a", pending);
  repo.close();
});

test("queryMany reads all identifier and title keys in one active-generation snapshot", async () => {
  const repo = repository(databaseName("query-many"));
  await build(repo, "scope", [
    rawRecord("A", { data: { title: "Exact A", DOI: "10.1000/a", PMID: "123" } }),
    rawRecord("B", { data: { title: "精确标题", ISBN: "978-1" } })
  ]);
  const result = await repo.queryMany("scope", {
    identifierKeys: ["doi:10.1000/a", "pmid:123", "isbn:9781"],
    titleKeys: ["exacta", "精确标题"]
  });
  assert.equal(result.activeGeneration, 1);
  assert.equal(result.identifiers["doi:10.1000/a"][0].itemKey, "A");
  assert.equal(result.identifiers["pmid:123"][0].itemKey, "A");
  assert.equal(result.identifiers["isbn:9781"][0].itemKey, "B");
  assert.equal(result.titles.exacta[0].itemKey, "A");
  assert.equal(result.titles["精确标题"][0].itemKey, "B");
  repo.close();
});

test("queryMany rejects scopes without a ready active generation", async () => {
  const repo = repository(databaseName("query-many-not-ready"));
  await assert.rejects(() => repo.queryMany("scope", { identifierKeys: ["doi:10.1000/a"] }), /index_not_ready/);
  repo.close();
});

test("generation manager switches then prunes old records", async () => {
  const repo = repository(databaseName("manager"));
  const manager = createIndexGenerationManager(repo);
  await build(repo, "scope", [rawRecord("OLD")]);
  const generation = await manager.beginGeneration("scope");
  await manager.putRecords("scope", generation, [rawRecord("NEW")]);
  await manager.putLibraryMetadata("scope", generation, {
    libraryKey: "users/0", itemCount: 1, indexedAt: 1700000000000
  });
  await manager.commitGeneration("scope", generation);
  assert.equal((await repo.queryByIdentifier("scope", "doi:10.1000/old")).length, 0);
  assert.equal((await repo.queryByIdentifier("scope", "doi:10.1000/new")).length, 1);
  repo.close();
});

test("generation commit remains successful when best-effort pruning fails afterward", async () => {
  const manager = createIndexGenerationManager({
    async commitGeneration() { return { activeGeneration: 8, state: "ready" }; },
    async pruneOldGenerations() { throw new Error("synthetic_prune_failure"); }
  });
  assert.deepEqual(await manager.commitGeneration("scope", 8), {
    activeGeneration: 8,
    state: "ready"
  });
});

test("large record sets can be written in chunks and duplicate keys upsert", async () => {
  const repo = repository(databaseName("chunks"));
  const generation = await repo.beginGeneration("scope");
  const records = Array.from({ length: 1200 }, (_, index) => rawRecord(`ITEM${index}`));
  for (let offset = 0; offset < records.length; offset += 173) {
    await repo.putRecords("scope", generation, records.slice(offset, offset + 173));
  }
  await repo.putRecords("scope", generation, [rawRecord("ITEM0", {
    version: 2,
    data: { title: "Updated title", DOI: "10.1000/updated" }
  })]);
  await repo.putLibraryMetadata("scope", generation, {
    libraryKey: "users/0", itemCount: 1200, indexedAt: 1700000000000
  });
  await repo.commitGeneration("scope", generation);
  assert.equal((await repo.queryByIdentifier("scope", "doi:10.1000/item1199")).length, 1);
  assert.equal((await repo.queryByIdentifier("scope", "doi:10.1000/item0")).length, 0);
  const updated = await repo.queryByIdentifier("scope", "doi:10.1000/updated");
  assert.equal(updated.length, 1);
  assert.equal(updated[0].itemVersion, 2);
  repo.close();
});

test("library, scope, and global clear operations have bounded effects", async () => {
  const repo = repository(databaseName("clear"));
  await build(repo, "scope-a", [rawRecord("USER")]);
  const second = await repo.beginGeneration("scope-b");
  await repo.putRecords("scope-b", second, [
    rawRecord("GROUP", { libraryKey: "groups/7" }),
    rawRecord("USER2")
  ]);
  await repo.putLibraryMetadata("scope-b", second, [
    { libraryKey: "groups/7", itemCount: 1, indexedAt: 1 },
    { libraryKey: "users/0", itemCount: 1, indexedAt: 1 }
  ]);
  await repo.commitGeneration("scope-b", second);

  await repo.clearLibrary("scope-b", "groups/7");
  assert.equal((await repo.queryByIdentifier("scope-b", "doi:10.1000/group")).length, 0);
  assert.equal((await repo.queryByIdentifier("scope-b", "doi:10.1000/user2")).length, 1);
  assert.equal((await repo.queryByIdentifier("scope-a", "doi:10.1000/user")).length, 1);

  await repo.clearScope("scope-a");
  assert.equal(await repo.getActiveGeneration("scope-a"), null);
  assert.equal((await repo.queryByIdentifier("scope-b", "doi:10.1000/user2")).length, 1);

  await repo.clearAll();
  assert.equal(await repo.getActiveGeneration("scope-b"), null);
  assert.equal((await repo.queryByIdentifier("scope-b", "doi:10.1000/user2")).length, 0);
  repo.close();
});

test("persisted records never contain forbidden raw Zotero fields", async () => {
  const repo = repository(databaseName("privacy"));
  await build(repo, "scope", [rawRecord("PRIVATE", {
    data: {
      url: "https://example.test/full/private/url",
      abstractNote: "secret abstract",
      extra: "DOI: 10.1000/private\nPrivate note text",
      tags: [{ tag: "private tag" }],
      collections: ["PRIVATE_COLLECTION"],
      relations: { related: "OTHER" },
      attachments: [{ path: "C:/secret.pdf" }]
    }
  })]);
  const stored = (await repo.queryByIdentifier("scope", "doi:10.1000/private"))[0];
  assert.deepEqual(Object.keys(stored).sort(), [
    "creatorKeys", "generation", "identifierKeys", "itemKey", "itemType", "itemVersion",
    "libraryKey", "scopeKey", "titleKey", "year"
  ]);
  const serialized = JSON.stringify(stored);
  for (const forbidden of ["secret abstract", "Private note", "private tag", "PRIVATE_COLLECTION", "secret.pdf", "example.test"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  repo.close();
});
