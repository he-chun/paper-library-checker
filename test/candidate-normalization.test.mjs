import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const normalization = require("../browser-extension/src/common/candidate-normalization.js");
const security = require("../zotero-plugin/src/security.js");

test("creator normalization trims, removes empty values, and deduplicates equivalent forms", () => {
  const creators = [
    " Ada   Lovelace ",
    { name: "ADA LOVELACE;" },
    { firstName: "Ada", lastName: "Lovelace" },
    { firstName: " Grace ", lastName: " Hopper ", unknown: "discarded" },
    { name: "" },
    "   ",
    null
  ];
  const before = structuredClone(creators);

  assert.deepEqual(normalization.normalizeCreatorsForLocalAPI(creators), [
    "Ada   Lovelace",
    { firstName: "Grace", lastName: "Hopper" }
  ]);
  assert.deepEqual(creators, before, "normalization must not mutate the input");
});

test("creator normalization preserves first occurrence and caps at the first 20 unique values", () => {
  for (const count of [21, 30]) {
    const creators = Array.from({ length: count }, (_, index) => `Creator ${String(index + 1).padStart(2, "0")}`);
    const result = normalization.normalizeCreatorsForLocalAPI(creators);
    assert.equal(result.length, 20);
    assert.deepEqual(result, creators.slice(0, 20));
  }
  assert.equal(normalization.normalizeCreatorsForLocalAPI(["one"], 50).length, 1);
  assert.deepEqual(normalization.normalizeCreatorsForLocalAPI(["one"], 0), []);
});

test("creator normalization does not merge clearly different people or organizations", () => {
  const creators = [
    { firstName: "Ana", lastName: "Li" },
    { firstName: "Amy", lastName: "Li" },
    "王小明",
    "王晓明",
    "Synthetic Research Institute",
    "Synthetic Research Laboratory"
  ];
  assert.deepEqual(normalization.normalizeCreatorsForLocalAPI(creators), creators);
});

test("candidate normalization is source-independent and retains supported candidate fields", () => {
  const sources = [
    "embedded-metadata",
    "json-ld",
    "coins",
    "cnki-kcms",
    "cnki-list",
    "sciencedirect-google-scholar",
    "translation-server",
    "manual-selection"
  ];
  for (const source of sources) {
    const candidate = {
      title: "Synthetic candidate",
      source,
      creators: Array.from({ length: 21 }, (_, index) => ({ name: `Creator ${index + 1}` }))
    };
    const before = structuredClone(candidate);
    const normalized = normalization.normalizeCandidateForLocalAPI(candidate);
    assert.equal(normalized.creators.length, 20, source);
    assert.equal(normalized.title, candidate.title);
    assert.equal(normalized.source, source);
    assert.deepEqual(candidate, before, `${source} input must remain unchanged`);
  }
});

test("service sanitizer remains fail-closed above 20 creators", () => {
  const candidate = {
    title: "Synthetic candidate",
    creators: Array.from({ length: 21 }, (_, index) => `Creator ${index + 1}`)
  };
  assert.throws(
    () => security.sanitizeCandidate(candidate),
    (error) => error && error.code === "invalid_creators"
  );
  assert.doesNotThrow(() => security.sanitizeCandidate(
    normalization.normalizeCandidateForLocalAPI(candidate)
  ));
});
