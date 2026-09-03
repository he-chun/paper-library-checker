import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const visual = require("../browser-extension/src/common/visual-preferences.js");

test("visual preferences expose the exact safe defaults", () => {
  assert.deepEqual(visual.DEFAULT_VISUAL_PREFERENCES, {
    highlightSearchResultRows: true,
    searchResultMatchedBackground: "#ffe7e7",
    searchResultPossibleBackground: "#fff1d6",
    enablePageGlow: false,
    pageEdgeStyle: "glow",
    pageEdgeWidth: 6,
    pageEdgeMatchedColor: "#ff2d2d",
    pageEdgePossibleColor: "#f59e0b",
    pageEdgeMissingColor: "#2563eb",
    pageEdgeUnknownColor: "#eab308",
    pageEdgeErrorColor: "#9333ea"
  });
});

test("visual preferences normalize colors, widths, booleans, and edge styles", () => {
  const normalized = visual.normalizeVisualPreferences({
    highlightSearchResultRows: false,
    enablePageGlow: true,
    searchResultMatchedBackground: "#ABCDEF",
    searchResultPossibleBackground: "red",
    pageEdgeStyle: "dashed",
    pageEdgeWidth: 99,
    pageEdgeMatchedColor: "#010203"
  });
  assert.equal(normalized.highlightSearchResultRows, false);
  assert.equal(normalized.enablePageGlow, true);
  assert.equal(normalized.searchResultMatchedBackground, "#abcdef");
  assert.equal(normalized.searchResultPossibleBackground, "#fff1d6");
  assert.equal(normalized.pageEdgeStyle, "dashed");
  assert.equal(normalized.pageEdgeWidth, 16);
  assert.equal(normalized.pageEdgeMatchedColor, "#010203");
  assert.equal(visual.normalizeVisualPreferences({ pageEdgeWidth: -4 }).pageEdgeWidth, 1);
  assert.equal(visual.normalizeVisualPreferences({ pageEdgeWidth: "7.6" }).pageEdgeWidth, 8);
  assert.equal(visual.normalizeVisualPreferences({ pageEdgeWidth: "bad" }).pageEdgeWidth, 6);
  assert.equal(visual.normalizeVisualPreferences({ pageEdgeStyle: "ridge" }).pageEdgeStyle, "glow");
  assert.equal(visual.normalizeVisualPreferences({ enablePageGlow: "true" }).enablePageGlow, false);
  for (const style of ["glow", "solid", "dashed", "dotted", "double"]) {
    assert.equal(visual.normalizeVisualPreferences({ pageEdgeStyle: style }).pageEdgeStyle, style);
  }
});

test("document and Shadow DOM visual preferences apply without changing result state", () => {
  const dom = new JSDOM("<!doctype html><html><body><div id=host></div></body></html>");
  const host = dom.window.document.querySelector("#host");
  const shadow = host.attachShadow({ mode: "open" });
  const edge = dom.window.document.createElement("div");
  edge.className = "zotero-check-edge-glow";
  edge.dataset.state = "matched";
  shadow.append(edge);

  visual.applyDocumentVisualPreferences(dom.window.document, {
    highlightSearchResultRows: false,
    searchResultMatchedBackground: "#AABBCC",
    searchResultPossibleBackground: "#DDEEFF"
  });
  assert.equal(dom.window.document.documentElement.dataset.zoteroCheckHighlightSearchResults, "false");
  assert.equal(dom.window.document.documentElement.style.getPropertyValue("--plc-search-result-matched-background"), "#aabbcc");

  visual.applyEdgeVisualPreferences(host, {
    enablePageGlow: true,
    pageEdgeStyle: "double",
    pageEdgeWidth: 12,
    pageEdgeMatchedColor: "#102030"
  }, "matched");
  assert.equal(edge.hidden, false);
  assert.equal(edge.dataset.state, "matched");
  assert.equal(edge.dataset.style, "double");
  assert.equal(host.style.getPropertyValue("--plc-page-edge-width"), "12px");
  assert.equal(edge.style.getPropertyValue("--plc-page-edge-active-color"), "#102030");

  visual.applyEdgeVisualPreferences(host, { enablePageGlow: false }, "matched");
  assert.equal(edge.hidden, true);
  assert.equal(edge.dataset.state, "disabled");
  dom.window.close();
});

test("route cleanup removes only extension search-result visual markers", () => {
  const dom = new JSDOM('<table><tr class="site-row zotero-check-search-result-row" data-site-row="keep" data-zotero-check-id="keep-id" data-zotero-check-kind="search" data-zotero-check-state="matched" data-zotero-check-result-state="matched"></tr></table>');
  const row = dom.window.document.querySelector("tr");
  visual.clearSearchResultVisualState(dom.window.document);
  assert.equal(row.classList.contains("site-row"), true);
  assert.equal(row.classList.contains("zotero-check-search-result-row"), false);
  assert.equal(row.dataset.siteRow, "keep");
  assert.equal(row.dataset.zoteroCheckId, "keep-id");
  assert.equal(row.dataset.zoteroCheckKind, "search");
  assert.equal(row.hasAttribute("data-zotero-check-state"), false);
  assert.equal(row.hasAttribute("data-zotero-check-result-state"), false);
  dom.window.close();
});

test("edge CSS keeps animation glow-only and honors reduced motion", async () => {
  const source = await readFile(new URL("../browser-extension/src/content.js", import.meta.url), "utf8");
  assert.match(source, /data-style=\"glow\"/);
  assert.match(source, /data-style=\"dashed\"/);
  assert.match(source, /data-style=\"dotted\"/);
  assert.match(source, /data-style=\"double\"/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /animation: none !important/);
});

test("visual preference scripts are loaded in order and remain browser-package only", async () => {
  const manifest = JSON.parse(await readFile(new URL("../browser-extension/manifest.json", import.meta.url), "utf8"));
  const scripts = manifest.content_scripts[0].js;
  const visualIndex = scripts.indexOf("src/common/visual-preferences.js");
  assert(visualIndex > scripts.indexOf("src/common/i18n.js"));
  assert(visualIndex < scripts.indexOf("src/adapters/cnki.js"));
  assert(visualIndex < scripts.indexOf("src/content.js"));
  const optionsHTML = await readFile(new URL("../browser-extension/src/options.html", import.meta.url), "utf8");
  assert(optionsHTML.indexOf("common/visual-preferences.js") < optionsHTML.indexOf("options.js"));
});

test("sync visual changes update an existing page edge without rechecking", async () => {
  const dom = new JSDOM(`<!doctype html><html><head>
    <meta name="citation_title" content="Visual preference fixture">
    <meta name="citation_date" content="2026">
  </head><body><h1>Visual preference fixture</h1></body></html>`, {
    url: "https://doi.org/10.5555/visual-fixture",
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  let storageListener;
  let matchRequests = 0;
  dom.window.requestIdleCallback = (callback) => dom.window.setTimeout(callback, 0);
  dom.window.chrome = {
    i18n: { getMessage: () => "", getUILanguage: () => "en" },
    storage: {
      sync: { get: (defaults, callback) => callback(defaults) },
      onChanged: { addListener: (listener) => { storageListener = listener; } }
    },
    runtime: {
      id: "test-extension",
      getURL: (value) => `chrome-extension://test-extension/${value}`,
      onMessage: { addListener: () => {} },
      sendMessage: (message, callback) => {
        if (message.type === "zotero-check:match") matchRequests += 1;
        callback?.({ ok: true, result: { status: "matched", matchType: "title", confidence: 1, complete: true } });
      }
    }
  };
  const scripts = [
    "common/i18n.js",
    "common/visual-preferences.js",
    "common/backend-contract.js",
    "common/ui-state.js",
    "common/page-controller.js",
    "common/sender-security.js",
    "common/normalization.js",
    "extractors/cnki.js",
    "extractors/scopus.js",
    "extractors/web-of-science.js",
    "extractors/generic.js",
    "extractors/runner.js",
    "adapters/cnki.js",
    "adapters/scopus.js",
    "adapters/web-of-science.js",
    "adapters/sciencedirect.js",
    "content.js"
  ];
  for (const name of scripts) {
    dom.window.eval(await readFile(new URL(`../browser-extension/src/${name}`, import.meta.url), "utf8"));
  }
  const deadline = Date.now() + 2000;
  while (!dom.window.document.querySelector("#zotero-check-badge-host") && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const host = dom.window.document.querySelector("#zotero-check-badge-host");
  assert(host);
  const before = matchRequests;
  storageListener({
    enablePageGlow: { oldValue: false, newValue: true },
    pageEdgeStyle: { oldValue: "glow", newValue: "dashed" },
    pageEdgeWidth: { oldValue: 6, newValue: 9 },
    pageEdgeMatchedColor: { oldValue: "#ff2d2d", newValue: "#112233" },
    searchResultMatchedBackground: { oldValue: "#ffe7e7", newValue: "#abcdef" }
  }, "sync");
  const edge = host.shadowRoot.querySelector(".zotero-check-edge-glow");
  assert.equal(edge.hidden, false);
  assert.equal(edge.dataset.style, "dashed");
  assert.equal(edge.dataset.state, "matched");
  assert.equal(host.style.getPropertyValue("--plc-page-edge-width"), "9px");
  assert.equal(edge.style.getPropertyValue("--plc-page-edge-active-color"), "#112233");
  assert.equal(dom.window.document.documentElement.style.getPropertyValue("--plc-search-result-matched-background"), "#abcdef");
  assert.equal(matchRequests, before);
  dom.window.close();
});
