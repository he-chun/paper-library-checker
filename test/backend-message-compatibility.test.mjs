import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let connectionMode = "auto";
let fetchPayload = { status: "matched", matchType: "doi", confidence: 1 };
let localStatus = 200;
let localItems = [];
let token = "a".repeat(64);
let developerMode = false;

global.chrome = {
  runtime: {
    id: "extension-id",
    getURL: (value) => `chrome-extension://extension-id/${value}`,
    getManifest: () => ({ version: "0.4.1" }),
    onMessage: { addListener() {} }
  },
  storage: {
    sync: {
      get: async (defaults) => ({
        ...defaults,
        endpoint: "http://127.0.0.1:23119/zotero-checker",
        connectionMode,
        developerMode
      })
    },
    local: { get: async () => ({ token }) }
  }
};
global.fetch = async (url) => {
  if (url === "http://127.0.0.1:23119/api/") {
    return {
      ok: localStatus === 200,
      status: localStatus,
      headers: { get: () => "3" },
      json: async () => ({})
    };
  }
  if (url.startsWith("http://127.0.0.1:23119/api/users/0/items?")) {
    return { ok: localStatus === 200, status: localStatus, json: async () => localItems };
  }
  if (url.startsWith("http://127.0.0.1:23119/api/users/0/groups?")) {
    return { ok: localStatus === 200, status: localStatus, json: async () => [] };
  }
  return { ok: true, status: 200, json: async () => fetchPayload };
};

const background = require("../browser-extension/src/background.js");
const contentSender = { id: "extension-id", tab: { id: 42, url: "https://journal.example/article" } };
const popupSender = { id: "extension-id", url: "chrome-extension://extension-id/src/popup.html" };

function send(message, sender) {
  return new Promise((resolve, reject) => {
    const keepChannelOpen = background.handleRuntimeMessage(message, sender, resolve);
    if (keepChannelOpen !== true) reject(new Error("message channel was not kept open"));
  });
}

test("content-script single and batch match responses keep their existing shapes", async () => {
  connectionMode = "enhanced";
  token = "a".repeat(64);
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

test("same-tab detail and reference batches receive independent bounded scopes", () => {
  assert.equal(background.batchScopeForMessage({ workload: "detail" }, contentSender), "tab:42:detail");
  assert.equal(background.batchScopeForMessage({ workload: "references" }, contentSender), "tab:42:references");
  assert.equal(background.batchScopeForMessage({}, contentSender), "tab:42:default");
  assert.equal(background.isTrustedMessage({
    type: "zotero-check:match",
    workload: "unbounded-value",
    candidates: [{ title: "Synthetic" }]
  }, contentSender), false);
});

test("popup health keeps connected and indexReady compatibility fields", async () => {
  connectionMode = "enhanced";
  fetchPayload = { ok: true, version: "0.4.1", indexReady: true, token: "not-projected" };
  const health = await send({ type: "zotero-check:popup-health" }, popupSender);
  assert.equal(health.connected, true);
  assert.equal(health.indexReady, true);
  assert.equal(health.mode, "enhanced");
  assert.equal(health.capabilities.possibleMatch, true);
});

test("auto fallback returns a degraded reason without exposing raw Zotero items", async () => {
  connectionMode = "auto";
  token = "";
  localStatus = 200;
  localItems = [{
    key: "PRIVATEKEY",
    data: { itemType: "journalArticle", title: "Synthetic", DOI: "10.1000/example" }
  }];
  assert.deepEqual(await send({
    type: "zotero-check:match",
    candidate: { DOI: "10.1000/example" }
  }, contentSender), {
    ok: true,
    result: {
      status: "matched",
      matchType: "doi",
      confidence: 1,
      degradedReason: "enhanced_backend_unavailable"
    }
  });
  const health = await send({ type: "zotero-check:popup-health" }, popupSender);
  assert.equal(health.connected, true);
  assert.equal(health.indexReady, true);
  assert.equal(health.mode, "standard");
  assert.equal(health.degradedReason, "enhanced_backend_unavailable");
  assert.equal(health.capabilities.possibleMatch, false);
});

test("standard mode preserves the existing batch response envelope", async () => {
  connectionMode = "standard";
  localStatus = 200;
  localItems = [
    { data: { itemType: "journalArticle", DOI: "10.1000/batch" } },
    { data: { itemType: "journalArticle", title: "Batch title" } }
  ];
  assert.deepEqual(await send({
    type: "zotero-check:match",
    candidates: [
      { DOI: "10.1000/batch" },
      { title: "Batch title" },
      { DOI: "10.1000/batch" }
    ]
  }, contentSender), {
    ok: true,
    result: {
      results: [
        { status: "matched", matchType: "doi", confidence: 1 },
        { status: "matched", matchType: "title", confidence: 0.95 },
        { status: "matched", matchType: "doi", confidence: 1 }
      ]
    }
  });
});

test("standard mode returns the stable disabled error without changing message envelopes", async () => {
  connectionMode = "standard";
  localStatus = 403;
  assert.deepEqual(await send({
    type: "zotero-check:match",
    candidate: { title: "Synthetic" }
  }, contentSender), {
    ok: false,
    error: "local_api_disabled"
  });
  assert.deepEqual(await send({ type: "zotero-check:popup-health" }, popupSender), {
    connected: false,
    indexReady: false,
    error: "local_api_disabled"
  });
});

test("options probe uses the same service-worker backend projection", async () => {
  connectionMode = "standard";
  localStatus = 200;
  const health = await send({ type: "zotero-check:probe" }, {
    id: "extension-id",
    url: "chrome-extension://extension-id/src/options.html"
  });
  assert.equal(health.connected, true);
  assert.equal(health.mode, "standard");
  assert.equal(health.capabilities.batch, true);
});

test("developer mode exposes bounded service-worker timings only to extension pages", async () => {
  developerMode = true;
  connectionMode = "standard";
  localStatus = 200;
  localItems = [];
  const privateTitle = "Private diagnostic title";
  await send({ type: "zotero-check:match", candidate: { title: privateTitle } }, contentSender);
  await send({
    type: "zotero-check:match",
    workload: "references",
    candidates: [{ title: privateTitle }]
  }, contentSender);

  const log = await send({ type: "zotero-check:developer-log" }, {
    id: "extension-id",
    url: "chrome-extension://extension-id/src/options.html"
  });
  assert.equal(log.enabled, true);
  assert.equal(log.entries.some((entry) => entry.event === "operation_completed"), true);
  assert.equal(log.entries.some((entry) => entry.phase === "item_query" && Number.isFinite(entry.durationMs)), true);
  assert.equal(log.entries.some((entry) => entry.event === "batch_started" && entry.workload === "references"), true);
  assert.equal(JSON.stringify(log).includes(privateTitle), false);

  const cleared = await send({ type: "zotero-check:clear-developer-log" }, {
    id: "extension-id",
    url: "chrome-extension://extension-id/src/options.html"
  });
  assert.deepEqual(cleared, { ok: true });
  developerMode = false;
});
