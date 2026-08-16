import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const auth = require("../browser-extension/src/common/request-auth.js");

function randomBytes(length) {
  return Array.from({ length }, (_, index) => index & 0xff);
}

global.Components = {
  classes: {
    "@mozilla.org/security/random-generator;1": {
      getService: () => ({ generateRandomBytes: randomBytes })
    },
    "@mozilla.org/binaryinputstream;1": {
      createInstance: () => ({
        setInputStream(stream) { this.stream = stream; },
        readByteArray(length) { return this.stream.bytes.slice(0, length); }
      })
    }
  },
  interfaces: { nsIRandomGenerator: {}, nsIBinaryInputStream: {} }
};
const security = require("../zotero-plugin/src/security.js");
global.ZoteroCheck = { Security: security, Indexer: class { stop() {} } };
global.Zotero = { Server: { Endpoints: {} }, logError() {} };
const Server = require("../zotero-plugin/src/server.js");

const SECRET_A = "a".repeat(64);
const SECRET_B = "b".repeat(64);
const NOW = Math.floor(Date.now() / 1000);

function server(token = SECRET_A) {
  const instance = new Server({ token });
  instance.ready = true;
  instance.indexer = {
    revision: 1,
    match: () => ({ status: "matched", matchType: "doi", confidence: 1, matches: [{ itemID: 1, title: "Private" }] }),
    stop() {}
  };
  return instance;
}

function stream(body) {
  return { bytes: Array.from(new TextEncoder().encode(body)) };
}

async function signedRequest({ secret = SECRET_A, method = "POST", path = "/zotero-checker/check", body = "", timestamp = NOW, nonce = "01".repeat(16) } = {}) {
  const headers = await auth.createHeaders({ secret, method, path, body, timestamp, nonce });
  const lowerHeaders = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
  if (method !== "GET") lowerHeaders["content-length"] = String(new TextEncoder().encode(body).length);
  return { method, pathname: path, headers: lowerHeaders, bodyInputStream: method === "GET" ? null : stream(body) };
}

async function authenticate(options = {}) {
  const request = await signedRequest(options);
  return security.authenticateRequest({
    secret: options.serverSecret || options.secret || SECRET_A,
    request,
    method: request.method,
    path: request.pathname,
    replayCache: options.replayCache || new security.ReplayCache(),
    nowSeconds: options.nowSeconds == null ? NOW : options.nowSeconds
  });
}

test("generates a 256-bit token without Math.random", () => {
  const token = security.generateToken();
  assert.equal(token.length, 64);
  assert.equal(token, randomBytes(32).map((value) => value.toString(16).padStart(2, "0")).join(""));
});

test("accepts Gecko octet-string random output", () => {
  Components.classes["@mozilla.org/security/random-generator;1"].getService = () => ({
    generateRandomBytes: (length) => String.fromCharCode(...randomBytes(length))
  });
  assert.equal(security.generateToken().length, 64);
});

test("browser and plugin use the same HMAC canonical form", async () => {
  const fields = {
    method: "POST",
    path: "/zotero-checker/check",
    timestamp: 1786514400,
    nonce: "01".repeat(16),
    bodyHash: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
  };
  assert.equal(auth.canonicalize(fields), security.canonicalize(fields));
  assert.equal(await auth.hmacBase64Url(SECRET_A, auth.canonicalize(fields)), "i-drCLYTNV5KVWmjAWpIram7HgUVh8hAYQ-YbGwfRx4");
});

test("authentication normalizes request header names at the endpoint boundary", async () => {
  const request = await signedRequest({ body: '{"item":{}}' });
  request.headers = Object.fromEntries(Object.entries(request.headers)
    .map(([name, value]) => [name.replace(/(^|-)([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`), value]));
  const accepted = await security.authenticateRequest({
    secret: SECRET_A,
    request,
    method: request.method,
    path: request.pathname,
    replayCache: new security.ReplayCache(),
    nowSeconds: NOW
  });
  assert.equal(accepted.bodyText, '{"item":{}}');
});

test("authenticates exact raw bytes and rejects body mutation", async () => {
  const request = await signedRequest({ body: '{"item":{"title":"Synthetic"}}' });
  const accepted = await security.authenticateRequest({
    secret: SECRET_A, request, method: request.method, path: request.pathname,
    replayCache: new security.ReplayCache(), nowSeconds: NOW
  });
  assert.equal(accepted.bodyText, '{"item":{"title":"Synthetic"}}');
  request.bodyInputStream = stream('{"item":{"title":"Mutated"}}');
  request.headers["content-length"] = String(request.bodyInputStream.bytes.length);
  await assert.rejects(() => security.authenticateRequest({
    secret: SECRET_A, request, method: request.method, path: request.pathname,
    replayCache: new security.ReplayCache(), nowSeconds: NOW
  }), (error) => error.code === "body_hash_mismatch");
});

test("rejects expired timestamps, replayed nonces, and wrong method or path", async () => {
  await assert.rejects(() => authenticate({ nowSeconds: NOW + 61 }), (error) => error.code === "timestamp_expired");
  const replayCache = new security.ReplayCache();
  await authenticate({ replayCache });
  await assert.rejects(() => authenticate({ replayCache }), (error) => error.code === "nonce_replayed");
  const request = await signedRequest();
  await assert.rejects(() => security.authenticateRequest({
    secret: SECRET_A, request, method: "PUT", path: request.pathname,
    replayCache: new security.ReplayCache(), nowSeconds: NOW
  }), (error) => error.code === "invalid_signature");
  await assert.rejects(() => security.authenticateRequest({
    secret: SECRET_A, request, method: request.method, path: "/zotero-checker/batch-check",
    replayCache: new security.ReplayCache(), nowSeconds: NOW
  }), (error) => error.code === "invalid_signature");
});

test("rejects legacy JSON content type before reading bibliographic data", async () => {
  const request = await signedRequest({ body: '{"item":{"title":"Synthetic"}}' });
  request.headers["content-type"] = "application/json";
  await assert.rejects(() => security.authenticateRequest({
    secret: SECRET_A, request, method: request.method, path: request.pathname,
    replayCache: new security.ReplayCache(), nowSeconds: NOW
  }), (error) => error.code === "protocol_incompatible");
});

test("fails closed for missing, wrong, legacy bearer, rotated, and revoked secrets", async () => {
  const request = await signedRequest({ body: '{"item":{}}' });
  await assert.rejects(() => security.authenticateRequest({
    secret: "", request, method: request.method, path: request.pathname,
    replayCache: new security.ReplayCache(), nowSeconds: NOW
  }), (error) => error.code === "pairing_not_configured");
  await assert.rejects(() => authenticate({ serverSecret: SECRET_B }), (error) => error.code === "invalid_signature");
  request.headers[security.LEGACY_AUTH_HEADER] = SECRET_A;
  await assert.rejects(() => security.authenticateRequest({
    secret: SECRET_A, request, method: request.method, path: request.pathname,
    replayCache: new security.ReplayCache(), nowSeconds: NOW
  }), (error) => error.code === "legacy_auth_rejected");

  const rotated = server(SECRET_A);
  rotated.setToken(SECRET_B);
  assert.equal((await rotated.handleCheck(await signedRequest({ secret: SECRET_A, body: '{"item":{}}' }))).status, 401);
  rotated.setToken("");
  assert.equal((await rotated.handleCheck(await signedRequest({ secret: SECRET_B, body: '{"item":{}}', nonce: "02".repeat(16) }))).status, 503);
});

test("authenticates health and minimizes health and match responses", async () => {
  const instance = server();
  const health = await instance.handleHealth(await signedRequest({ method: "GET", path: "/zotero-checker/health", nonce: "02".repeat(16) }));
  assert.deepEqual(Object.keys(health.payload).sort(), ["indexReady", "ok", "version"]);
  const match = await instance.handleCheck(await signedRequest({ body: '{"item":{"DOI":"10.1000/synthetic"}}', nonce: "03".repeat(16) }));
  assert.deepEqual(match.payload, { status: "matched", matchType: "doi", confidence: 1 });
  assert.equal("itemID" in match.payload, false);
});

test("rejects a signed check request with a pairing token embedded in JSON", async () => {
  const instance = server();
  const response = await instance.handleCheck(await signedRequest({
    body: JSON.stringify({
      token: SECRET_A,
      item: { DOI: "10.5555/synthetic" }
    }),
    nonce: "06".repeat(16)
  }));
  assert.equal(response.status, 401);
  assert.deepEqual(response.payload, {
    status: "error",
    matchType: null,
    confidence: 0,
    error: "legacy_auth_rejected"
  });
});

test("rejects normalized credential keys at every JSON depth", async (context) => {
  const cases = [
    ["token", { token: "wrong", item: {} }, "/zotero-checker/check"],
    ["TOKEN", { TOKEN: "wrong", item: {} }, "/zotero-checker/check"],
    ["pairing_token", { pairing_token: "wrong", item: {} }, "/zotero-checker/check"],
    ["pairing-token", { "pairing-token": "wrong", item: {} }, "/zotero-checker/check"],
    ["authToken", { authToken: "wrong", item: {} }, "/zotero-checker/check"],
    ["secret", { secret: "wrong", item: {} }, "/zotero-checker/check"],
    ["pairingSecret", { pairingSecret: "wrong", item: {} }, "/zotero-checker/check"],
    ["authorization", { authorization: "wrong", item: {} }, "/zotero-checker/check"],
    ["item.token", { item: { token: "wrong" } }, "/zotero-checker/check"],
    ["item.pairingToken", { item: { pairingToken: "wrong" } }, "/zotero-checker/check"],
    ["creator.secret", { item: { creators: [{ secret: "wrong" }] } }, "/zotero-checker/check"],
    ["batch first token", { items: [{ token: "wrong" }, {}] }, "/zotero-checker/batch-check"],
    ["batch later authorization", { items: [{}, { authorization: "wrong" }] }, "/zotero-checker/batch-check"],
    ["array credential priority", [{ token: "wrong" }], "/zotero-checker/check"]
  ];
  for (const [index, [name, body, path]] of cases.entries()) {
    await context.test(name, async () => {
      const response = path.endsWith("batch-check")
        ? await server().handleBatchCheck(await signedRequest({ path, body: JSON.stringify(body), nonce: (index + 16).toString(16).padStart(2, "0").repeat(16) }))
        : await server().handleCheck(await signedRequest({ path, body: JSON.stringify(body), nonce: (index + 16).toString(16).padStart(2, "0").repeat(16) }));
      assert.equal(response.status, 401);
      assert.equal(response.payload.error, "legacy_auth_rejected");
      assert.equal(JSON.stringify(response).includes("wrong"), false);
    });
  }
});

test("rejects the pairing secret as a JSON value under arbitrary keys", async (context) => {
  const cases = [
    { item: { unexpectedField: SECRET_A } },
    { item: { nested: ["ordinary", SECRET_A] } },
    { item: { unexpectedField: SECRET_A.toUpperCase() } }
  ];
  for (const [index, body] of cases.entries()) {
    await context.test(`secret value ${index + 1}`, async () => {
      const response = await server().handleCheck(await signedRequest({
        body: JSON.stringify(body),
        nonce: (index + 48).toString(16).padStart(2, "0").repeat(16)
      }));
      assert.equal(response.status, 401);
      assert.equal(response.payload.error, "legacy_auth_rejected");
      assert.equal(JSON.stringify(response).toLowerCase().includes(SECRET_A), false);
    });
  }
});

test("checks authentication before embedded credentials or envelope details", async () => {
  const response = await server(SECRET_B).handleCheck(await signedRequest({
    secret: SECRET_A,
    body: JSON.stringify({ token: SECRET_A, item: {} }),
    nonce: "3f".repeat(16)
  }));
  assert.equal(response.status, 401);
  assert.equal(response.payload.error, "invalid_signature");
});

test("bounds iterative embedded-credential traversal", () => {
  const nested = { value: "safe" };
  let cursor = nested;
  for (let depth = 0; depth <= security.MAX_JSON_DEPTH; depth += 1) {
    cursor.next = { value: "safe" };
    cursor = cursor.next;
  }
  assert.throws(
    () => security.assertNoEmbeddedCredentials(nested, SECRET_A),
    (error) => error.code === "json_nesting_too_deep" && error.status === 422
  );
  assert.throws(
    () => security.assertNoEmbeddedCredentials(["one", "two"], SECRET_A, { maximumNodes: 2 }),
    (error) => error.code === "json_structure_too_large" && error.status === 422
  );
});

test("does not mistake ordinary token-related metadata for credentials", async () => {
  const instance = server();
  const response = await instance.handleCheck(await signedRequest({
    body: JSON.stringify({
      item: {
        title: "Token and authorization terminology",
        DOI: "10.5555/token-sequence",
        metadataSource: "token",
        tokenizationMethod: "wordpiece"
      }
    }),
    nonce: "40".repeat(16)
  }));
  assert.equal(response.status, 200);
  assert.equal(response.payload.status, "matched");
});

test("accepts only strict check and batch envelopes", async (context) => {
  const acceptedCheck = await server().handleCheck(await signedRequest({ body: '{"item":{}}', nonce: "41".repeat(16) }));
  assert.equal(acceptedCheck.status, 200);
  const acceptedBatch = await server().handleBatchCheck(await signedRequest({
    path: "/zotero-checker/batch-check",
    body: '{"items":[{},{}]}',
    nonce: "42".repeat(16)
  }));
  assert.equal(acceptedBatch.status, 200);
  assert.equal(acceptedBatch.payload.results.length, 2);

  const invalidChecks = [
    ["bare candidate", { DOI: "10.5555/synthetic" }],
    ["candidate alias", { candidate: {} }],
    ["extra check key", { item: {}, context: "extra" }],
    ["null", null],
    ["array", []],
    ["non-object item", { item: [] }]
  ];
  for (const [index, [name, body]] of invalidChecks.entries()) {
    await context.test(name, async () => {
      const response = await server().handleCheck(await signedRequest({
        body: JSON.stringify(body),
        nonce: (index + 67).toString(16).padStart(2, "0").repeat(16)
      }));
      assert.equal(response.status, 422);
      assert.equal(response.payload.error, "invalid_check_envelope");
    });
  }

  const invalidBatches = [
    ["extra batch key", { items: [], context: "extra" }],
    ["non-array items", { items: {} }],
    ["bare batch array", []]
  ];
  for (const [index, [name, body]] of invalidBatches.entries()) {
    await context.test(name, async () => {
      const response = await server().handleBatchCheck(await signedRequest({
        path: "/zotero-checker/batch-check",
        body: JSON.stringify(body),
        nonce: (index + 83).toString(16).padStart(2, "0").repeat(16)
      }));
      assert.equal(response.status, 422);
      assert.equal(response.payload.error, "invalid_batch_envelope");
    });
  }
});

test("rejects malformed and oversized raw bodies before JSON parsing", async () => {
  const instance = server();
  assert.equal((await instance.handleCheck(await signedRequest({ body: "not-json", nonce: "04".repeat(16) }))).status, 400);
  const oversized = await signedRequest({ body: "{}", nonce: "05".repeat(16) });
  oversized.headers["content-length"] = String(security.MAX_BODY_BYTES + 1);
  assert.equal((await instance.handleCheck(oversized)).status, 413);
});

test("bounds caches and rate bursts", () => {
  const instance = server();
  instance.requestCacheMaxEntries = 2;
  instance.setCached(instance.requestCache, "one", { result: 1 }, 2);
  instance.setCached(instance.requestCache, "two", { result: 2 }, 2);
  instance.setCached(instance.requestCache, "three", { result: 3 }, 2);
  assert.deepEqual([...instance.requestCache.keys()], ["two", "three"]);
  const limiter = new security.RateLimiter({ maximum: 2, windowMs: 100 });
  assert.equal(limiter.allow(1), true);
  assert.equal(limiter.allow(2), true);
  assert.equal(limiter.allow(3), false);
  assert.equal(limiter.allow(102), true);
});

test("redacts legacy credentials from project logs", () => {
  const value = security.redact(`X-Paper-Library-Checker-Token: ${SECRET_A}`);
  assert.equal(value.includes(SECRET_A), false);
});
