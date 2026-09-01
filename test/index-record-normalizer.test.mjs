import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const matcher = require("../browser-extension/src/backends/local-api-matcher.js");
const normalizer = require("../browser-extension/src/index/index-record-normalizer.js");

test("index records reuse the existing identifier and bibliographic normalizers", () => {
  const record = normalizer.normalizeIndexRecord("zotero-local", 3, {
    libraryKey: "users/0",
    key: "ITEM1",
    version: 17,
    data: {
      itemType: "journalArticle",
      title: "  中文：Title &amp; Test  ",
      DOI: "https://doi.org/10.1000/ABC",
      PMID: " 12-345 ",
      ISBN: "978-1-4028-9462-6",
      extra: "CNKI File ID: TEST_001",
      date: "2024-05-02",
      publicationTitle: "Journal of Tests",
      creators: [{ firstName: "Jane", lastName: "Doe" }]
    }
  });

  assert.deepEqual(record, {
    scopeKey: "zotero-local",
    generation: 3,
    libraryKey: "users/0",
    itemKey: "ITEM1",
    itemVersion: 17,
    identifierKeys: [
      "doi:10.1000/abc",
      "pmid:12345",
      "isbn:9781402894626",
      "cnki:test_001"
    ],
    titleKey: matcher.normalizeTitle("  中文：Title &amp; Test  "),
    publicationTitleKey: matcher.normalizeTitle("Journal of Tests"),
    year: "2024",
    creatorKeys: [matcher.normalizePerson("DoeJane")],
    itemType: "journalarticle"
  });
});

test("index records persist only the minimal allowlist", () => {
  const record = normalizer.normalizeIndexRecord("scope", 1, {
    libraryKey: "users/0",
    key: "ITEM2",
    data: {
      itemType: "book",
      title: "Allowed title",
      DOI: "10.1000/minimal",
      url: "https://example.test/private/path",
      abstractNote: "must not persist",
      note: "must not persist",
      tags: [{ tag: "must not persist" }],
      collections: ["COLLECTION"],
      relations: { related: "ITEM3" },
      attachments: [{ path: "private.pdf" }]
    },
    debugLog: "must not persist",
    originalQuery: "must not persist"
  });

  assert.deepEqual(Object.keys(record).sort(), [
    "creatorKeys",
    "generation",
    "identifierKeys",
    "itemKey",
    "itemType",
    "itemVersion",
    "libraryKey",
    "publicationTitleKey",
    "scopeKey",
    "titleKey",
    "year"
  ]);
  assert.equal(JSON.stringify(record).includes("must not persist"), false);
  assert.equal(JSON.stringify(record).includes("example.test"), false);
});

test("non-bibliographic records and invalid generations are rejected", () => {
  for (const itemType of ["attachment", "note", "annotation"]) {
    assert.throws(() => normalizer.normalizeIndexRecord("scope", 1, {
      libraryKey: "users/0",
      key: itemType,
      data: { itemType, title: "Ignored" }
    }), /non_bibliographic_index_record/);
  }
  assert.throws(() => normalizer.normalizeIndexRecord("scope", 0, {
    libraryKey: "users/0",
    key: "ITEM",
    data: { itemType: "book", title: "Title" }
  }), /invalid_index_generation/);
});

test("already-normalized fields are canonicalized with the shared rules", () => {
  const record = normalizer.normalizeIndexRecord("scope", 2, {
    libraryKey: "groups/7",
    itemKey: "ITEM",
    itemType: "journalArticle",
    identifierKeys: ["doi:DOI: 10.20/ABC", "isbn:978-1", "unknown:value"],
    titleKey: "AlreadyNormalized",
    year: "Spring 2022",
    creatorKeys: ["Doe, Jane", "Doe, Jane"]
  });
  assert.deepEqual(record.identifierKeys, ["doi:10.20/abc", "isbn:9781"]);
  assert.equal(record.titleKey, "AlreadyNormalized");
  assert.equal(record.year, "2022");
  assert.deepEqual(record.creatorKeys, ["doejane"]);
});
