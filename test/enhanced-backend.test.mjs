import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const auth = require("../browser-extension/src/common/request-auth.js");
const enhancedApi = require("../browser-extension/src/backends/enhanced-backend.js");

const token = "a".repeat(64);

function createHarness(responseFor = () => ({ ok: true, status: 200, payload: {} })) {
  const requests = [];
  const signatures = [];
  const requestAuth = {
    ...auth,
    async createHeaders(input) {
      signatures.push(input);
      return auth.createHeaders({
        ...input,
        timestamp: 1786514400,
        nonce: "01".repeat(16)
      });
    }
  };
  const backend = enhancedApi.createEnhancedBackend({
    storage: {
      sync: { get: async () => ({ endpoint: enhancedApi.DEFAULT_ENDPOINT }) },
      local: { get: async () => ({ token }) }
    },
    requestAuth,
    fetch: async (url, options) => {
      requests.push({ url, options });
      const response = responseFor(url, options);
      return {
        ok: response.ok,
        status: response.status,
        json: async () => response.payload
      };
    }
  });
  return { backend, requests, signatures };
}

test("enhanced backend probes the existing authenticated health path", async () => {
  const harness = createHarness(() => ({
    ok: true,
    status: 200,
    payload: { ok: true, version: "0.4.1", indexReady: true }
  }));

  const result = await harness.backend.probe();
  assert.deepEqual(result, { ok: true, version: "0.4.1", indexReady: true });
  assert.equal(harness.requests[0].url, `${enhancedApi.DEFAULT_ENDPOINT}/health`);
  assert.equal(harness.requests[0].options.method, "GET");
  assert.equal(harness.requests[0].options.body, undefined);
  assert.deepEqual(harness.signatures[0], {
    secret: token,
    method: "GET",
    path: "/zotero-checker/health",
    body: ""
  });
});

test("enhanced backend preserves check and batch paths, methods, bodies, and result shapes", async () => {
  const results = [
    { status: "matched", matchType: "doi", confidence: 1 },
    { results: [{ status: "not_found", matchType: "none", confidence: 0 }] }
  ];
  const harness = createHarness(() => ({ ok: true, status: 200, payload: results.shift() }));
  const candidate = { title: "Synthetic", creators: [{ name: " Example " }] };

  assert.deepEqual(await harness.backend.check(candidate), {
    status: "matched",
    matchType: "doi",
    confidence: 1
  });
  assert.deepEqual(await harness.backend.batchCheck([candidate]), {
    results: [{ status: "not_found", matchType: "none", confidence: 0 }]
  });

  assert.deepEqual(harness.requests.map(({ url, options }) => [url, options.method]), [
    [`${enhancedApi.DEFAULT_ENDPOINT}/check`, "POST"],
    [`${enhancedApi.DEFAULT_ENDPOINT}/batch-check`, "POST"]
  ]);
  assert.deepEqual(JSON.parse(harness.requests[0].options.body), {
    item: { title: "Synthetic", creators: [{ name: "Example" }] }
  });
  assert.deepEqual(JSON.parse(harness.requests[1].options.body), {
    items: [{ title: "Synthetic", creators: [{ name: "Example" }] }]
  });
  assert.deepEqual(harness.signatures.map(({ method, path, body }) => ({ method, path, body })), [
    { method: "POST", path: "/zotero-checker/check", body: harness.requests[0].options.body },
    { method: "POST", path: "/zotero-checker/batch-check", body: harness.requests[1].options.body }
  ]);
  assert.equal(harness.requests.every(({ options }) => options.headers["Content-Type"] === auth.CONTENT_TYPE), true);
});

test("enhanced backend preserves existing local API errors", async () => {
  const harness = createHarness(() => ({
    ok: false,
    status: 401,
    payload: { error: "invalid_signature" }
  }));

  await assert.rejects(() => harness.backend.check({ title: "Synthetic" }), (error) => {
    assert.equal(error.message, "invalid_signature");
    assert.equal(error.code, "invalid_signature");
    assert.equal(error.status, 401);
    return true;
  });
});

test("enhanced backend advertises the shared backend interface", () => {
  const { backend } = createHarness();
  assert.equal(typeof backend.probe, "function");
  assert.equal(typeof backend.check, "function");
  assert.equal(typeof backend.batchCheck, "function");
  assert.deepEqual(backend.getCapabilities(), {
    mode: "enhanced",
    probe: true,
    check: true,
    batchCheck: true,
    authenticated: true
  });
});
