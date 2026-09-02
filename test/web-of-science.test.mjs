import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const source = async (name) => readFile(
  new URL(`../browser-extension/src/${name}`, import.meta.url),
  "utf8"
);
const fixture = async (name) => readFile(
  new URL(`./fixtures/${name}`, import.meta.url),
  "utf8"
);
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(predicate, timeout = 2500) {
  const deadline = Date.now() + timeout;
  while (!predicate() && Date.now() < deadline) await wait(25);
  assert.equal(Boolean(predicate()), true, "condition was not met before timeout");
}

async function loadAdapterDOM(url = "https://webofscience.clarivate.cn/wos/woscc/summary/SYNTHETIC/relevance/1") {
  const dom = new JSDOM(await fixture("web-of-science-search-results.html"), {
    url,
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  dom.window.chrome = {
    i18n: { getMessage: () => "", getUILanguage: () => "en" }
  };
  dom.window.eval(await source("common/i18n.js"));
  dom.window.eval(await source("adapters/web-of-science.js"));
  return dom;
}

async function loadExtractorDOM(url = "https://webofscience.clarivate.cn/wos/woscc/full-record/WOS:000000000000001") {
  const dom = new JSDOM(await fixture("web-of-science-detail.html"), {
    url,
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  dom.window.eval(await source("common/normalization.js"));
  dom.window.eval(await source("extractors/web-of-science.js"));
  dom.window.eval(await source("extractors/generic.js"));
  dom.window.eval(await source("extractors/runner.js"));
  return dom;
}

const contentScripts = [
  "common/i18n.js",
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

async function loadContentDOM(html, url, sendMessage) {
  const dom = new JSDOM(html, {
    url,
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  dom.window.requestIdleCallback = (callback) => dom.window.setTimeout(callback, 0);
  dom.window.chrome = {
    i18n: { getMessage: () => "", getUILanguage: () => "en" },
    storage: {
      sync: {
        get: (_defaults, callback) => dom.window.setTimeout(() => callback({
          autoCheckReferenceLists: false,
          translationServerMode: "off"
        }), 0)
      }
    },
    runtime: {
      id: "test-extension",
      getURL: (value) => `chrome-extension://test-extension/${value}`,
      onMessage: { addListener: () => {} },
      sendMessage
    }
  };
  for (const name of contentScripts) dom.window.eval(await source(name));
  return dom;
}

function replaceBody(dom, html) {
  const parsed = new dom.window.DOMParser().parseFromString(html, "text/html");
  dom.window.document.body.replaceWith(dom.window.document.importNode(parsed.body, true));
}

test("Web of Science search adapter extracts live-DOM fields and OpenURL metadata", async () => {
  const dom = await loadAdapterDOM();
  try {
    const adapter = dom.window.ZoteroCheck.siteAdapters.webOfScience;
    assert.equal(adapter.detect(), true);
    assert.equal(adapter.isSearchResultsPage(), true);
    assert.match(adapter.getBatchSignature(), /^wos-search:/);

    const targets = adapter.collectBatchTargets();
    assert.equal(targets.length, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(targets[0].candidate)), {
      itemType: "journalArticle",
      title: "Synthetic Web of Science Article",
      creators: [
        { name: "Example, Ada" },
        { name: "Example, A" },
        { name: "Sample, B" }
      ],
      date: "2026",
      publicationTitle: "JOURNAL OF SYNTHETIC RESULTS",
      url: "https://webofscience.clarivate.cn/wos/woscc/full-record/WOS:000000000000001",
      source: "web-of-science-search-results",
      DOI: "10.5555/wos.alpha"
    });
    assert.equal(targets[1].candidate.itemType, "conferencePaper");
    assert.equal(targets[1].candidate.date, "2025");
    assert.equal(targets[1].candidate.creators[0].name, "Fixture, Cora");
    assert.equal(targets[0].candidate.creators.some((creator) => creator.name.includes("Hidden")), false);
  } finally {
    dom.window.close();
  }
});

test("Web of Science adapter rejects non-summary routes and renders only positive matches", async () => {
  const dom = await loadAdapterDOM();
  try {
    const adapter = dom.window.ZoteroCheck.siteAdapters.webOfScience;
    const targets = adapter.collectBatchTargets();
    adapter.applyBatchResults([
      { sourceId: targets[0].sourceId, status: "matched", matchType: "doi", confidence: 1 },
      { sourceId: targets[1].sourceId, status: "not_found", complete: true }
    ]);
    assert.equal(targets[0].element.querySelector(".zotero-check-search-status").textContent, "Saved");
    assert.equal(targets[1].element.querySelector(".zotero-check-search-status"), null);

    adapter.applyBatchResults([
      { sourceId: targets[1].sourceId, status: "possible_match", matchType: "fuzzy", confidence: 0.82 }
    ]);
    assert.equal(
      targets[1].element.querySelector(".zotero-check-search-status").textContent,
      "Possibly saved"
    );

    dom.window.history.replaceState({}, "", "/wos/woscc/full-record/WOS:000000000000001");
    assert.equal(adapter.isSearchResultsPage(), false);
    assert.equal(adapter.getBatchSignature(), "");
    assert.equal(adapter.collectBatchTargets().length, 0);
  } finally {
    dom.window.close();
  }
});

test("Web of Science full-record extractor prefers stable visible fields", async () => {
  const dom = await loadExtractorDOM();
  try {
    const api = dom.window.ZoteroCheck;
    const extractor = api.extractors.find((value) => value.id === "web-of-science-full-record");
    const result = api.detectAndExtract(dom.window.document, dom.window.location.href);

    assert.equal(extractor.preferLocal, true);
    assert.deepEqual(Array.from(result.detected, (value) => value.id), ["web-of-science-full-record"]);
    assert.deepEqual(JSON.parse(JSON.stringify(result.candidates)), [{
      itemType: "journalArticle",
      title: "Synthetic Web of Science Full Record",
      creators: [
        { name: "Example, Ada" },
        { name: "Sample, Benoit" }
      ],
      date: "FEB 2026",
      publicationTitle: "JOURNAL OF SYNTHETIC DETAILS",
      url: "https://webofscience.clarivate.cn/wos/woscc/full-record/WOS:000000000000001",
      source: "web-of-science-full-record",
      DOI: "10.5555/WOS.DETAIL",
      metadataSource: "extractor"
    }]);
    assert.equal(result.candidates[0].title.includes("Hidden stale"), false);
    assert.equal(result.candidates[0].title.includes("Injected status noise"), false);

    for (const url of [
      "https://webofscience.clarivate.cn/wos/woscc/summary/SYNTHETIC/relevance/1",
      "https://example.invalid/wos/woscc/full-record/WOS:000000000000001"
    ]) {
      assert.equal(extractor.detect(dom.window.document, url), false, url);
      assert.equal(extractor.extract(dom.window.document, url).length, 0, url);
    }
  } finally {
    dom.window.close();
  }
});

test("Web of Science SPA transitions isolate search and detail workloads", async () => {
  const searchHTML = await fixture("web-of-science-search-results.html");
  const detailHTML = await fixture("web-of-science-detail.html");
  const referenceRequests = [];
  const detailRequests = [];
  const dom = await loadContentDOM(
    searchHTML,
    "https://webofscience.clarivate.cn/wos/woscc/summary/SYNTHETIC/relevance/1",
    (message, callback) => {
      if (message.type === "zotero-check:match" && message.workload === "references") {
        referenceRequests.push({ message, callback });
        return;
      }
      if (message.type === "zotero-check:match" && message.workload === "detail") {
        detailRequests.push({ message, callback });
        return;
      }
      callback?.({ ok: false, error: "unexpected_message" });
    }
  );
  try {
    await waitFor(() => referenceRequests.length === 1);
    assert.equal(referenceRequests[0].message.candidates.length, 2);

    dom.window.history.pushState({}, "", "/wos/woscc/full-record/WOS:000000000000001");
    replaceBody(dom, detailHTML);
    await waitFor(() => detailRequests.length === 1);
    assert.equal(detailRequests[0].message.candidates[0].DOI, "10.5555/WOS.DETAIL");

    detailRequests[0].callback?.({
      ok: true,
      result: { status: "matched", matchType: "doi", confidence: 1, complete: true }
    });
    await waitFor(() => dom.window.document.querySelector("#zotero-check-badge-host")?.shadowRoot
      ?.querySelector(".zotero-check-label")?.textContent === "Library: saved");

    referenceRequests[0].callback?.({
      ok: true,
      result: {
        results: referenceRequests[0].message.candidates.map(() => ({
          status: "matched",
          matchType: "title",
          confidence: 0.95,
          complete: true
        }))
      }
    });
    await wait(150);
    assert.equal(dom.window.document.querySelector(".zotero-check-search-status"), null);
    assert.equal(
      dom.window.document.querySelector("#zotero-check-badge-host").shadowRoot
        .querySelector(".zotero-check-label").textContent,
      "Library: saved"
    );
  } finally {
    dom.window.close();
  }
});
