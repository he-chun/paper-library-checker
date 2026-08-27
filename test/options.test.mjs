import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const options = require("../browser-extension/src/options.js");

test("options default to automatic backend selection", () => {
  assert.equal(options.DEFAULT_OPTIONS.connectionMode, "auto");
});

test("illegal stored connection modes fall back to automatic", () => {
  assert.equal(options.normalizeConnectionMode("invalid"), "auto");
  assert.equal(options.normalizeConnectionMode("standard"), "standard");
});

test("standard mode leaves enhanced credentials untouched so migration is reversible", () => {
  const oldEndpoint = "http://localhost:23119/zotero-checker";
  const oldToken = "a".repeat(64);
  assert.deepEqual(options.connectionStorageUpdate({
    connectionMode: "standard",
    endpoint: "not-an-endpoint",
    token: "short"
  }), { sync: { connectionMode: "standard" }, local: {} });
  assert.deepEqual(options.connectionStorageUpdate({
    connectionMode: "enhanced",
    endpoint: oldEndpoint,
    token: oldToken
  }), {
    sync: { connectionMode: "enhanced", endpoint: oldEndpoint },
    local: { token: oldToken }
  });
});

test("enhanced mode still requires a 64-character pairing token", () => {
  assert.throws(() => options.connectionStorageUpdate({
    connectionMode: "enhanced",
    endpoint: "http://127.0.0.1:23119/zotero-checker",
    token: "short"
  }), /64-character/);
});

test("standard mode hides enhanced settings and enhanced mode expands them", async () => {
  const html = await readFile(new URL("../browser-extension/src/options.html", import.meta.url), "utf8");
  const oldDocument = globalThis.document;
  globalThis.document = new JSDOM(html).window.document;
  try {
    options.updateConnectionFields("standard");
    assert.equal(document.querySelector("#enhancedSettings").hidden, true);
    options.updateConnectionFields("enhanced");
    assert.equal(document.querySelector("#enhancedSettings").hidden, false);
    assert.equal(document.querySelector("#enhancedSettings").open, true);
  } finally {
    globalThis.document = oldDocument;
  }
});

test("Test connection saves the selected mode and asks the service worker to probe", async () => {
  const html = await readFile(new URL("../browser-extension/src/options.html", import.meta.url), "utf8");
  const oldDocument = globalThis.document;
  const oldChrome = globalThis.chrome;
  const writes = [];
  let message;
  globalThis.document = new JSDOM(html).window.document;
  document.querySelector('input[name="connectionMode"][value="standard"]').checked = true;
  globalThis.chrome = {
    storage: {
      sync: {
        set: async (value) => writes.push(value),
        remove: async () => {}
      },
      local: { set: async () => { throw new Error("standard mode must not write the token"); } }
    },
    runtime: {
      sendMessage: async (value) => {
        message = value;
        return { connected: true, indexReady: true, mode: "standard" };
      }
    }
  };
  try {
    await options.testConnection();
    assert.equal(writes[0].connectionMode, "standard");
    assert.deepEqual(message, { type: "zotero-check:probe" });
    assert.match(document.querySelector("#status").textContent, /Connected using Standard mode/);
  } finally {
    globalThis.document = oldDocument;
    globalThis.chrome = oldChrome;
  }
});

test("options page does not duplicate backend network or HMAC protocol code", async () => {
  const source = await readFile(new URL("../browser-extension/src/options.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /createHeaders|X-PLC-Signature|\/health/);
  assert.match(source, /zotero-check:probe/);
});

test("options endpoint validation matches granted loopback permissions", () => {
  assert.equal(options.validateEndpoint("http://127.0.0.1:23119/zotero-checker"), "http://127.0.0.1:23119/zotero-checker");
  assert.equal(options.validateEndpoint("http://localhost:23119/zotero-checker/"), "http://localhost:23119/zotero-checker");
  assert.throws(() => options.validateEndpoint("http://[::1]:23119/zotero-checker"));
  assert.throws(() => options.validateEndpoint("https://127.0.0.1:23119/zotero-checker"));
  assert.throws(() => options.validateEndpoint("http://example.test/zotero-checker"));
});

test("connection errors distinguish authentication, rate, service, and protocol states", () => {
  assert.match(options.connectionMessage(401, {}), /Pairing failed/);
  assert.match(options.connectionMessage(401, { error: "protocol_incompatible" }), /Protocol incompatible/);
  assert.match(options.connectionMessage(429, {}), /Too many requests/);
  assert.match(options.connectionMessage(503, { error: "pairing_not_configured" }), /not paired/);
  assert.match(options.connectionMessage(503, {}), /temporarily unavailable/);
});

test("add-on compatibility requires the exact browser extension version", () => {
  assert.equal(options.isCompatibleAddonVersion("0.4.1", "0.4.1"), true);
  assert.equal(options.isCompatibleAddonVersion("0.4.0", "0.4.1"), false);
  assert.equal(options.isCompatibleAddonVersion("0.3.9", "0.4.1"), false);
  assert.equal(options.isCompatibleAddonVersion(undefined, "0.4.1"), false);
});
