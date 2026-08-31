import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const contract = require("../browser-extension/src/common/backend-contract.js");
const directApi = require("../browser-extension/src/backends/direct-local-api-backend.js");
const enhancedApi = require("../browser-extension/src/backends/enhanced-backend.js");
const indexedApi = require("../browser-extension/src/backends/indexed-local-api-backend.js");
const matcher = require("../browser-extension/src/backends/local-api-matcher.js");
const outerApi = require("../browser-extension/src/backends/backend-resolver.js");
const standardApi = require("../browser-extension/src/backends/standard-backend-resolver.js");
const browserAuth = require("../browser-extension/src/common/request-auth.js");
const xpiAuth = require("../zotero-plugin/src/security.js");

test("all engines expose the canonical capability schema and compatibility aliases", () => {
  for (const capabilities of [directApi.CAPABILITIES, indexedApi.CAPABILITIES, enhancedApi.CAPABILITIES]) {
    for (const key of contract.CAPABILITY_SCHEMA_KEYS) assert.equal(key in capabilities, true, key);
    assert.equal(capabilities.exactIdentifiers, capabilities.exactIdentifierVerification);
    assert.equal(capabilities.exactTitle, capabilities.exactTitleVerification);
    assert.equal(capabilities.completeNegativeResults, capabilities.complete);
  }

  assert.equal(indexedApi.CAPABILITIES.possibleMatch, false);
  assert.equal(enhancedApi.CAPABILITIES.possibleMatch, true);
  assert.equal(directApi.CAPABILITIES.complete, false);
  assert.equal(indexedApi.CAPABILITIES.complete, true);
  assert.equal(enhancedApi.CAPABILITIES.complete, true);
});

test("complete and incomplete not-found results remain distinguishable at the browser boundary", async () => {
  const directMiss = directApi.withDirectResultMetadata({ status: "not_found", matchType: null, confidence: 0 });
  assert.equal(directMiss.complete, false);
  assert.equal(contract.isIncompleteNotFound(directMiss), true);

  const indexedMiss = indexedApi.matchPreparedCandidate(matcher.prepareCandidate({ DOI: "10.1/missing" }), {
    identifiers: { "doi:10.1/missing": [] },
    titles: {},
    context: { state: "ready", freshness: "fresh" }
  });
  assert.equal(indexedMiss.status, "not_found");
  assert.equal(indexedMiss.complete, true);

  let enhancedPayload = { status: "not_found", matchType: null, confidence: 0 };
  const enhanced = enhancedApi.createEnhancedBackend({
    storage: {
      sync: { get: async () => ({ endpoint: enhancedApi.DEFAULT_ENDPOINT }) },
      local: { get: async () => ({ token: "a".repeat(64) }) }
    },
    requestAuth: { ...browserAuth, createHeaders: async () => ({}) },
    fetch: async () => ({ ok: true, status: 200, json: async () => enhancedPayload })
  });
  const enhancedMiss = await enhanced.check({ title: "Missing" });
  assert.equal(enhancedMiss.status, "not_found");
  assert.equal(enhancedMiss.complete, undefined);
  assert.equal(enhanced.getCapabilities().complete, true);
  assert.equal(contract.isIncompleteNotFound(enhancedMiss), false);

  enhancedPayload = { status: "possible_match", matchType: "fuzzy", confidence: 0.85 };
  assert.deepEqual(await enhanced.check({ title: "Near match" }), enhancedPayload);
});

function tracedBackend(name, probeResult, trace) {
  return {
    async probe() {
      trace.push(`${name}:probe`);
      if (probeResult instanceof Error) throw probeResult;
      return probeResult;
    },
    async check() { trace.push(`${name}:check`); return { status: "not_found", engine: name }; },
    async batchCheck(candidates) { return { results: candidates.map(() => ({ status: "not_found", engine: name })) }; },
    getCapabilities() { return { engine: name, batch: true }; }
  };
}

test("auto resolves XPI then Indexed then Direct while explicit modes remain isolated", async () => {
  const makeOuter = (mode, enhanced, standard) => outerApi.createBackendResolver({
    storage: { sync: { get: async () => ({ connectionMode: mode }) } },
    enhancedBackend: enhanced,
    standardBackend: standard,
    getExtensionVersion: () => "0.4.1"
  });

  {
    const trace = [];
    const enhanced = tracedBackend("xpi", { ok: true, version: "0.4.1", indexReady: true }, trace);
    const standard = tracedBackend("standard", { ok: true }, trace);
    assert.equal((await makeOuter("auto", enhanced, standard).resolve()).selectedMode, "enhanced");
    assert.deepEqual(trace, ["xpi:probe"]);
  }

  for (const [state, expectedEngine] of [["ready", "indexed"], ["not_built", "direct"]]) {
    const trace = [];
    const enhanced = tracedBackend("xpi", Object.assign(new Error("offline"), { code: "enhanced_backend_unavailable" }), trace);
    const direct = tracedBackend("direct", { ok: true, version: "3", indexReady: true }, trace);
    const indexed = tracedBackend("indexed", { ok: true, version: "3", indexReady: true }, trace);
    const standard = standardApi.createStandardBackendResolver({
      directBackend: direct,
      getIndexedBackend: () => indexed,
      getIndexStatus: async () => ({
        state,
        scopeKey: "scope",
        activeGeneration: state === "ready" ? 1 : null
      }),
      startIndexBuild: () => {}
    });
    const resolved = await makeOuter("auto", enhanced, standard).resolve();
    await resolved.backend.check({ title: "Candidate" });
    assert.equal(resolved.selectedMode, "standard");
    assert.equal(standard.getCapabilities().engine, expectedEngine);
    assert.equal(trace.includes(`${expectedEngine}:check`), true);
    assert.equal(trace.includes(`${expectedEngine === "indexed" ? "direct" : "indexed"}:check`), false);
  }

  {
    const trace = [];
    const enhanced = tracedBackend("xpi", new Error("offline"), trace);
    const standard = tracedBackend("standard", { ok: true }, trace);
    await makeOuter("standard", enhanced, standard).resolve();
    assert.deepEqual(trace, []);
    await makeOuter("enhanced", enhanced, standard).resolve();
    assert.deepEqual(trace, []);
  }
});

test("page extraction and rendering remain shared and backend-agnostic", async () => {
  const manifest = JSON.parse(await readFile(new URL("../browser-extension/manifest.json", import.meta.url), "utf8"));
  const scripts = manifest.content_scripts.flatMap((entry) => entry.js || []);
  for (const required of [
    "src/extractors/cnki.js", "src/extractors/generic.js", "src/extractors/runner.js",
    "src/adapters/sciencedirect.js", "src/content.js"
  ]) assert.equal(scripts.filter((value) => value === required).length, 1, required);

  for (const name of [
    "extractors/cnki.js", "extractors/generic.js", "extractors/runner.js",
    "adapters/sciencedirect.js", "content.js"
  ]) {
    const source = await readFile(new URL(`../browser-extension/src/${name}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /EnhancedBackend|IndexedLocalApiBackend|DirectLocalApiBackend|\/zotero-checker|127\.0\.0\.1:23119\/api/);
  }

  const popupSource = await readFile(new URL("../browser-extension/src/popup.js", import.meta.url), "utf8");
  assert.doesNotMatch(popupSource, /completeNegativeResults/);
});

test("the authenticated XPI protocol remains version 1", () => {
  assert.equal(browserAuth.PROTOCOL_VERSION, "1");
  assert.equal(xpiAuth.PROTOCOL_VERSION, "1");
  assert.equal(browserAuth.CONTENT_TYPE, "application/vnd.paper-library-checker+json");
});
