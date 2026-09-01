import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const matcher = require("../zotero-plugin/src/matcher.js");

test("normalizes DOI, PMID, ISBN, and CNKI identifiers", () => {
  assert.equal(matcher.normalizeDOI("https://doi.org/10.1000/ABC"), "10.1000/abc");
  assert.equal(matcher.normalizeIdentifier("123-45", "pmid"), "12345");
  assert.equal(matcher.normalizeIdentifier("978-1-23", "isbn"), "978123");
  assert.equal(matcher.normalizeCNKI(" SYN 001 "), "syn001");
});

test("normalizes CJK titles and compares English tokens", () => {
  assert.equal(matcher.normalizeTitle("中文：题目！"), matcher.normalizeTitle("中文题目"));
  assert.equal(matcher.titleSimilarity("alpha beta gamma", "gamma alpha beta"), 1);
});

test("matches exact title and identifier with year and creator hints", () => {
  const records = [
    { DOI: "10.1000/one", title: "Shared title", date: "2025", creators: ["Ada Lovelace"] },
    { DOI: "10.1000/two", title: "Shared title", date: "2024", creators: ["Other Author"] }
  ];
  assert.equal(matcher.matchRecords({ DOI: "10.1000/ONE" }, records).matchType, "doi");
  const exact = matcher.matchRecords({ title: "Shared title", date: "2025", creators: ["Ada Lovelace"] }, records);
  assert.equal(exact.status, "matched");
  assert.equal(exact.matches.length, 1);
  const conflict = matcher.matchRecords({ title: "Shared title", date: "2030", creators: ["Grace Hopper"] }, records);
  assert.equal(conflict.status, "not_found");
  assert.equal(conflict.reason, "title_hint_conflict");
});

test("enhanced Scopus matching distinguishes four-field and title-year evidence", () => {
  const title = "Development of slag-based filling cementitious materials";
  const alternateTitle = "矿渣基充填胶凝材料的开发";
  const journal = "Construction and Building Materials";
  const records = [{
    title: alternateTitle,
    date: "2024-11-22",
    publicationTitle: journal,
    creators: [{ firstName: "Zhuo", lastName: "Xu" }]
  }];
  const candidate = {
    title,
    alternateTitles: [alternateTitle],
    date: "2024",
    publicationTitle: journal,
    creators: [{ name: "Xu Z." }],
    matchPolicy: "scopus-tiered"
  };

  assert.equal(matcher.matchRecords(candidate, records).status, "matched");
  assert.equal(matcher.matchRecords({ ...candidate, publicationTitle: "Other Journal" }, records).status, "possible_match");
  assert.equal(matcher.matchRecords({ ...candidate, date: "2023" }, records).status, "not_found");
});

test("applies fuzzy threshold and handles duplicate and malformed input", () => {
  const records = [{ title: "Effects of synthetic testing", date: "2025", creators: ["Ada"] }];
  assert.equal(matcher.matchRecords({ title: "Effects of synthetic testing methods", date: "2025", creators: ["Ada"] }, records).status, "possible_match");
  assert.equal(matcher.matchRecords({}, records).status, "not_found");
  assert.doesNotThrow(() => matcher.normalizeCandidate({ creators: [null, 1, {}] }));
});
