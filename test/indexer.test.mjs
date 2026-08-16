import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const matcher = require("../zotero-plugin/src/matcher.js");
const source = await readFile(new URL("../zotero-plugin/src/indexer.js", import.meta.url), "utf8");
const context = { ZoteroCheck: { Matcher: matcher, Utils: {} } };
vm.runInNewContext(source, context, { filename: "indexer.js" });
const Indexer = context.ZoteroCheck.Indexer;

function indexed(records, fuzzyMatching = true) {
  const indexer = new Indexer({ fuzzyMatching });
  for (const record of records) {
    const titleKey = matcher.normalizeTitle(record.title);
    const id = record.id;
    indexer.itemsByID.set(id, {
      titleRaw: record.title,
      titleKey,
      year: matcher.extractYear(record.year),
      creators: (record.creators || []).map(matcher.normalizePerson),
      identifiers: {},
      result: { id, library: record.library || 1 }
    });
    if (!indexer.titleIndex.has(titleKey)) indexer.titleIndex.set(titleKey, new Set());
    indexer.titleIndex.get(titleKey).add(id);
  }
  return indexer;
}

test("Indexer.match applies exact-title hints without conflict fallback", () => {
  const records = [
    { id: 1, title: "Shared title", year: "2025", creators: ["Ada Lovelace"] },
    { id: 2, title: "Shared title", year: "2024", creators: ["Other Author"], library: 2 }
  ];
  const indexer = indexed(records);

  const same = indexer.match({ title: "Shared title", year: "2025", creators: ["Ada Lovelace"] });
  assert.equal(same.status, "matched");
  assert.deepEqual(Array.from(same.matches, (entry) => entry.id), [1]);

  assert.equal(indexer.match({ title: "Shared title", year: "2030" }).status, "not_found");
  assert.equal(indexer.match({ title: "Shared title", creators: ["Grace Hopper"] }).status, "not_found");
  assert.equal(indexer.match({ title: "Shared title", year: "2030", creators: ["Grace Hopper"] }).status, "not_found");
});

test("Indexer.match treats missing record hints as unknown rather than conflicting", () => {
  assert.equal(indexed([{ id: 1, title: "Shared title", creators: ["Ada"] }]).match({
    title: "Shared title", year: "2025", creators: ["Ada"]
  }).status, "matched");
  assert.equal(indexed([{ id: 1, title: "Shared title", year: "2025" }]).match({
    title: "Shared title", year: "2025", creators: ["Ada"]
  }).status, "matched");
});

test("Indexer.match returns all non-conflicting duplicates and supports no-hint exact titles", () => {
  const indexer = indexed([
    { id: 1, title: "Shared title", year: "2025", creators: ["Ada"], library: 1 },
    { id: 2, title: "Shared title", year: "2025", creators: ["Ada"], library: 2 }
  ]);
  const result = indexer.match({ title: "Shared title" });
  assert.equal(result.status, "matched");
  assert.deepEqual(Array.from(result.matches, (entry) => entry.id), [1, 2]);
});

test("Indexer.match rejects conflicting CJK exact titles", () => {
  const indexer = indexed([{ id: 1, title: "合成测试题名", year: "2025", creators: ["张三"] }]);
  assert.equal(indexer.match({ title: "合成测试题名", year: "2024", creators: ["李四"] }).status, "not_found");
});
