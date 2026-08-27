import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let connectionMode = "auto";
let fetchPayload = { status: "matched", matchType: "doi", confidence: 1 };

global.chrome = {
  runtime: {
    id: "extension-id",
    getURL: (value) => `chrome-extension://extension-id/${value}`,
    onMessage: { addListener() {} }
  },
  storage: {
    sync: {
      get: async (defaults) => ({
        ...defaults,
        endpoint: "http://127.0.0.1:23119/zotero-checker",
        connectionMode
      })
    },
    local: { get: async () => ({ token: "a".repeat(64) }) }
  }
};
global.fetch = async () => ({ ok: true, status: 200, json: async () => fetchPayload });

const background = require("../browser-extension/src/background.js");
const contentSender = { id: "extension-id", tab: { url: "https://journal.example/article" } };
const popupSender = { id: "extension-id", url: "chrome-extension://extension-id/src/popup.html" };

function send(message, sender) {
  return new Promise((resolve, reject) => {
    const keepChannelOpen = background.handleRuntimeMessage(message, sender, resolve);
    if (keepChannelOpen !== true) reject(new Error("message channel was not kept open"));
  });
}

test("content-script single and batch match responses keep their existing shapes", async () => {
  connectionMode = "auto";
  fetchPayload = { status: "matched", matchType: "doi", confidence: 1 };
  assert.deepEqual(await send({
    type: "zotero-check:match",
    candidate: { title: "Synthetic" }
  }, contentSender), {
    ok: true,
    result: { status: "matched", matchType: "doi", confidence: 1 }
  });

  fetchPayload = { results: [{ status: "not_found", matchType: "none", confidence: 0 }] };
  assert.deepEqual(await send({
    type: "zotero-check:match",
    candidates: [{ title: "Synthetic" }]
  }, contentSender), {
    ok: true,
    result: { results: [{ status: "not_found", matchType: "none", confidence: 0 }] }
  });
});

test("content-script batch limit remains 200 candidates", () => {
  let response;
  const keepChannelOpen = background.handleRuntimeMessage({
    type: "zotero-check:match",
    candidates: Array.from({ length: 201 }, () => ({}))
  }, contentSender, (value) => { response = value; });

  assert.equal(keepChannelOpen, false);
  assert.deepEqual(response, { ok: false, error: "Batch exceeds 200 candidates" });
});

test("popup health keeps connected and indexReady compatibility fields", async () => {
  connectionMode = "enhanced";
  fetchPayload = { ok: true, version: "0.4.1", indexReady: true, token: "not-projected" };
  assert.deepEqual(await send({ type: "zotero-check:popup-health" }, popupSender), {
    connected: true,
    indexReady: true
  });
});

test("standard mode returns stable errors without changing message envelopes", async () => {
  connectionMode = "standard";
  assert.deepEqual(await send({
    type: "zotero-check:match",
    candidate: { title: "Synthetic" }
  }, contentSender), {
    ok: false,
    error: "standard_backend_unavailable"
  });
  assert.deepEqual(await send({ type: "zotero-check:popup-health" }, popupSender), {
    connected: false,
    indexReady: false
  });
});
