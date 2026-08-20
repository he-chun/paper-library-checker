import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
global.chrome = {
  runtime: {
    id: "extension-id",
    getURL: (value) => `chrome-extension://extension-id/${value}`,
    onMessage: { addListener() {} }
  },
  storage: { sync: { get: async () => ({}) }, local: { get: async () => ({}) } }
};
const background = require("../browser-extension/src/background.js");
const auth = require("../browser-extension/src/common/request-auth.js");

test("accepts only messages tied to the sender tab", () => {
  const sender = { id: "extension-id", tab: { url: "https://journal.example/article" } };
  assert.equal(background.isTrustedMessage({ type: "zotero-check:translate-url", url: sender.tab.url }, sender), true);
  assert.equal(background.isTrustedMessage({ type: "zotero-check:translate-url", url: "https://other.example/article" }, sender), false);
  assert.equal(background.isTrustedMessage({ type: "zotero-check:match", candidate: {} }, { ...sender, id: "other" }), false);
});

test("popup-only health messages require the extension origin", () => {
  const message = { type: "zotero-check:popup-health" };
  assert.equal(background.isTrustedExtensionMessage(message, {
    id: "extension-id",
    url: "chrome-extension://extension-id/src/popup.html"
  }), true);
  assert.equal(background.isTrustedExtensionMessage(message, {
    id: "extension-id",
    url: "https://evil.example/"
  }), false);
  assert.equal(background.isTrustedExtensionMessage(message, {
    id: "extension-id",
    tab: { url: "https://journal.example/article" }
  }), false);
});

test("popup health response exposes only connection and index readiness", async () => {
  const originalFetch = global.fetch;
  global.chrome.storage.sync.get = async () => ({ endpoint: "http://127.0.0.1:23119/zotero-checker" });
  global.chrome.storage.local.get = async () => ({ token: "a".repeat(64) });
  global.fetch = async () => ({ ok: true, json: async () => ({ indexReady: true, version: "0.4.0", token: "secret" }) });
  try {
    assert.deepEqual(await background.getPopupHealth(), { connected: true, indexReady: true });
  } finally {
    global.fetch = originalFetch;
  }
});

test("allows only the fixed loopback Zotero endpoint shape", () => {
  assert.equal(background.validateLoopbackEndpoint("http://127.0.0.1:23119/zotero-checker"), "http://127.0.0.1:23119/zotero-checker");
  assert.throws(() => background.validateLoopbackEndpoint("https://127.0.0.1:23119/zotero-checker"));
  assert.throws(() => background.validateLoopbackEndpoint("http://example.test/zotero-checker"));
  assert.throws(() => background.validateLoopbackEndpoint("http://localhost:23119/other"));
  assert.throws(() => background.validateLoopbackEndpoint("http://[::1]:23119/zotero-checker"));
});

test("blocks private translation targets and URL mismatches", () => {
  assert.equal(background.validateTranslationTarget("https://journal.example/article", "https://journal.example/article"), "https://journal.example/article");
  assert.throws(() => background.validateTranslationTarget("http://127.0.0.1/private", "http://127.0.0.1/private"));
  assert.throws(() => background.validateTranslationTarget("https://journal.example/other", "https://journal.example/article"));
});

test("signed request headers never contain the long-term pairing secret", async () => {
  const secret = "a".repeat(64);
  const headers = await auth.createHeaders({
    secret,
    method: "POST",
    path: "/zotero-checker/check",
    body: '{"item":{}}',
    timestamp: 1786514400,
    nonce: "01".repeat(16)
  });
  assert.equal(JSON.stringify(headers).includes(secret), false);
  assert.equal(headers["Content-Type"], auth.CONTENT_TYPE);
  assert.equal(typeof headers["X-PLC-Signature"], "string");
});
