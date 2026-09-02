import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const options = require("../browser-extension/src/options.js");

test("options default to automatic backend selection", () => {
  assert.equal(options.DEFAULT_OPTIONS.connectionMode, "auto");
  assert.equal(options.DEFAULT_OPTIONS.developerMode, false);
  assert.equal(options.DEFAULT_OPTIONS.highlightSearchResultRows, true);
  assert.equal(options.DEFAULT_OPTIONS.enablePageGlow, false);
});

test("options render, normalize, and read visual preferences with a width output", async () => {
  const html = await readFile(new URL("../browser-extension/src/options.html", import.meta.url), "utf8");
  const oldDocument = globalThis.document;
  globalThis.document = new JSDOM(html).window.document;
  try {
    options.renderVisualPreferences({
      highlightSearchResultRows: false,
      enablePageGlow: true,
      pageEdgeStyle: "dotted",
      pageEdgeWidth: 14,
      pageEdgeMatchedColor: "#ABCDEF"
    });
    assert.equal(document.querySelector("#highlightSearchResultRows").checked, false);
    assert.equal(document.querySelector("#enablePageGlow").checked, true);
    assert.equal(document.querySelector("#pageEdgeStyle").value, "dotted");
    assert.equal(document.querySelector("#pageEdgeWidthOutput").textContent, "14 px");
    assert.equal(options.readVisualPreferences().pageEdgeMatchedColor, "#abcdef");
  } finally {
    globalThis.document = oldDocument;
  }
});

test("restoring visual defaults writes only visual settings", async () => {
  const html = await readFile(new URL("../browser-extension/src/options.html", import.meta.url), "utf8");
  const oldDocument = globalThis.document;
  const oldChrome = globalThis.chrome;
  const writes = [];
  globalThis.document = new JSDOM(html).window.document;
  globalThis.chrome = { storage: { sync: { set: async (value) => writes.push(value) } } };
  try {
    document.querySelector("#endpoint").value = "http://localhost:23119/zotero-checker";
    document.querySelector("#developerMode").checked = true;
    await options.resetVisualPreferences();
    assert.equal(writes.length, 1);
    assert.deepEqual(Object.keys(writes[0]).sort(), [
      "enablePageGlow",
      "highlightSearchResultRows",
      "pageEdgeErrorColor",
      "pageEdgeMatchedColor",
      "pageEdgeMissingColor",
      "pageEdgePossibleColor",
      "pageEdgeStyle",
      "pageEdgeUnknownColor",
      "pageEdgeWidth",
      "searchResultMatchedBackground",
      "searchResultPossibleBackground"
    ]);
    assert.equal(document.querySelector("#endpoint").value, "http://localhost:23119/zotero-checker");
    assert.equal(document.querySelector("#developerMode").checked, true);
    assert.equal(document.querySelector("#highlightSearchResultRows").checked, true);
    assert.equal(document.querySelector("#enablePageGlow").checked, false);
  } finally {
    globalThis.document = oldDocument;
    globalThis.chrome = oldChrome;
  }
});

test("stored visual settings load through normalization", async () => {
  const html = await readFile(new URL("../browser-extension/src/options.html", import.meta.url), "utf8");
  const oldDocument = globalThis.document;
  const oldChrome = globalThis.chrome;
  globalThis.document = new JSDOM(html).window.document;
  globalThis.chrome = {
    storage: {
      sync: {
        get: async (defaults) => Object.hasOwn(defaults, "endpoint")
          ? { ...defaults, pageEdgeStyle: "double", pageEdgeWidth: 16, pageEdgeMatchedColor: "#ABCDEF" }
          : defaults,
        remove: async () => {}
      },
      local: { get: async (defaults) => defaults, set: async () => {} }
    },
    runtime: { sendMessage: async () => ({ ok: true, status: { state: "ready" } }) }
  };
  try {
    await options.load();
    assert.equal(document.querySelector("#pageEdgeStyle").value, "double");
    assert.equal(document.querySelector("#pageEdgeWidth").value, "16");
    assert.equal(document.querySelector("#pageEdgeWidthOutput").textContent, "16 px");
    assert.equal(document.querySelector("#pageEdgeMatchedColor").value, "#abcdef");
  } finally {
    globalThis.document = oldDocument;
    globalThis.chrome = oldChrome;
  }
});

test("saving writes normalized visual preferences through sync storage", async () => {
  const html = await readFile(new URL("../browser-extension/src/options.html", import.meta.url), "utf8");
  const oldDocument = globalThis.document;
  const oldChrome = globalThis.chrome;
  const writes = [];
  globalThis.document = new JSDOM(html).window.document;
  document.querySelector('input[name="connectionMode"][value="standard"]').checked = true;
  options.renderVisualPreferences({
    highlightSearchResultRows: false,
    enablePageGlow: true,
    pageEdgeStyle: "solid",
    pageEdgeWidth: 1,
    pageEdgeErrorColor: "#ABCDEF"
  });
  globalThis.chrome = {
    storage: {
      sync: { set: async (value) => writes.push(value), remove: async () => {} },
      local: { set: async () => {} }
    }
  };
  try {
    await options.save();
    assert.equal(writes[0].highlightSearchResultRows, false);
    assert.equal(writes[0].enablePageGlow, true);
    assert.equal(writes[0].pageEdgeStyle, "solid");
    assert.equal(writes[0].pageEdgeWidth, 1);
    assert.equal(writes[0].pageEdgeErrorColor, "#abcdef");
  } finally {
    globalThis.document = oldDocument;
    globalThis.chrome = oldChrome;
  }
});

test("developer mode is opt-in and reveals a local log panel", async () => {
  const html = await readFile(new URL("../browser-extension/src/options.html", import.meta.url), "utf8");
  const oldDocument = globalThis.document;
  globalThis.document = new JSDOM(html).window.document;
  try {
    assert.equal(document.querySelector("#developerMode").checked, false);
    options.updateDeveloperPanel(true);
    assert.equal(document.querySelector("#developerPanel").hidden, false);
    options.updateDeveloperPanel(false);
    assert.equal(document.querySelector("#developerPanel").hidden, true);
  } finally {
    globalThis.document = oldDocument;
  }
});

test("developer log rendering is text-only structured data", () => {
  assert.equal(options.formatDeveloperEntry({ event: "operation_completed", durationMs: 123 }),
    '{"event":"operation_completed","durationMs":123}');
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

test("standard index management is rendered from service-worker status only", async () => {
  const html = await readFile(new URL("../browser-extension/src/options.html", import.meta.url), "utf8");
  const oldDocument = globalThis.document;
  const oldChrome = globalThis.chrome;
  const messages = [];
  globalThis.document = new JSDOM(html).window.document;
  globalThis.chrome = {
    runtime: {
      sendMessage: async (message) => {
        messages.push(message);
        if (message.type === "get-index-status") {
          return { ok: true, status: {
            state: "refreshing", itemCount: 120, libraryCount: 3,
            lastSuccessfulBuildAt: 1700000000000, processedItems: 25, totalItems: 100
          } };
        }
        return { ok: true, accepted: true };
      }
    }
  };
  try {
    await options.refreshIndexStatus();
    assert.equal(document.querySelector("#optionIndexState").textContent, "Refreshing");
    assert.equal(document.querySelector("#optionIndexItems").textContent, "120");
    assert.equal(document.querySelector("#optionIndexLibraries").textContent, "3");
    assert.equal(document.querySelector("#cancelIndex").disabled, false);
    await options.runIndexAction("clear-index");
    assert.deepEqual(messages[1], { type: "clear-index" });
    const source = await readFile(new URL("../browser-extension/src/options.js", import.meta.url), "utf8");
    assert.doesNotMatch(source, /indexedDB|127\.0\.0\.1:23119\/api/);
  } finally {
    options.renderIndexStatus({ state: "ready" });
    globalThis.document = oldDocument;
    globalThis.chrome = oldChrome;
  }
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
