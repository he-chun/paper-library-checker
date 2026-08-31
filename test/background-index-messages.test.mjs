import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";

const require = createRequire(import.meta.url);
global.indexedDB = indexedDB;
global.IDBKeyRange = IDBKeyRange;
global.chrome = {
  runtime: {
    id: "extension-id",
    getURL: (value) => `chrome-extension://extension-id/${value}`,
    getManifest: () => ({ version: "0.4.1" }),
    onMessage: { addListener() {} }
  },
  storage: {
    sync: { get: async (defaults) => ({ ...defaults, connectionMode: "standard" }) },
    local: { get: async () => ({}) }
  }
};
let quicksearchCount = 0;
global.fetch = async (url) => {
  const pathname = new URL(url).pathname;
  if (pathname.endsWith("/items")) quicksearchCount += 1;
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        if (String(name).toLowerCase() === "zotero-api-version") return "3";
        if (String(name).toLowerCase() === "total-results") return "0";
        return null;
      }
    },
    json: async () => pathname.endsWith("/groups") ? [] : []
  };
};

const background = require("../browser-extension/src/background.js");
const popupSender = { id: "extension-id", url: "chrome-extension://extension-id/src/popup.html" };
const contentSender = { id: "extension-id", tab: { id: 4, url: "https://journal.example/article" } };

function sendAsync(message, sender) {
  return new Promise((resolve, reject) => {
    const keepOpen = background.handleRuntimeMessage(message, sender, resolve);
    if (!keepOpen) reject(new Error("message_channel_closed"));
  });
}

test("only extension pages can manage or inspect an index build", async () => {
  for (const type of [
    "start-index-build", "cancel-index-build", "get-index-status", "clear-index", "clear-and-rebuild-index"
  ]) {
    assert.equal(background.isTrustedExtensionMessage({ type }, popupSender), true);
    assert.equal(background.isTrustedExtensionMessage({ type }, contentSender), false);
    let response;
    assert.equal(background.handleRuntimeMessage({ type }, contentSender, (value) => { response = value; }), false);
    assert.equal(response, undefined);
  }

  const startResponsePromise = new Promise((resolve) => {
    assert.equal(background.handleRuntimeMessage({ type: "start-index-build" }, popupSender, resolve), true);
  });
  const startResponse = await startResponsePromise;
  assert.equal(startResponse.ok, true);
  assert.equal(startResponse.accepted, true);
  await background.getIndexBuildController().waitForIdle();

  const status = await sendAsync({ type: "get-index-status" }, popupSender);
  assert.equal(status.ok, true);
  assert.equal(status.status.state, "ready");
  assert.equal(status.status.processedLibraries, 1);

  const cancellation = await sendAsync({ type: "cancel-index-build" }, popupSender);
  assert.deepEqual(cancellation.cancelled, false);
});

test("ready indexed standard mode preserves popup fields and avoids quicksearch", async () => {
  const match = await sendAsync({
    type: "zotero-check:match",
    candidate: { DOI: "10.1000/not-in-empty-index" }
  }, contentSender);
  assert.equal(match.ok, true);
  assert.equal(match.result.status, "not_found");
  assert.equal(match.result.complete, true);
  assert.equal(match.result.engine, "indexed");
  assert.equal(quicksearchCount, 0);

  const health = await sendAsync({ type: "zotero-check:popup-health" }, popupSender);
  assert.equal(health.connected, true);
  assert.equal(health.indexReady, true);
  assert.equal(health.mode, "standard");
  assert.equal(health.capabilities.engine, "indexed");
  assert.equal(health.capabilities.completeNegativeResults, true);
});
