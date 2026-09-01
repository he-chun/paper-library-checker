import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const matcher = require("../browser-extension/src/backends/local-api-matcher.js");

const source = async (name) => readFile(
  new URL(`../browser-extension/src/${name}`, import.meta.url),
  "utf8"
);
const fixture = async () => readFile(
  new URL("./fixtures/scopus-search-results.html", import.meta.url),
  "utf8"
);
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function createAdapterDOM(view = "table", url = "https://www.scopus.com/pages/search/publications?searchId=SYNTHETIC") {
  const dom = new JSDOM(await fixture(), {
    url,
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  dom.window.chrome = {
    i18n: { getMessage: () => "", getUILanguage: () => "en" }
  };
  dom.window.document.querySelector("#table-results-fixture").hidden = view !== "table";
  dom.window.document.querySelector("#list-results-fixture").hidden = view !== "list";
  dom.window.eval(await source("common/i18n.js"));
  dom.window.eval(await source("adapters/scopus.js"));
  return dom;
}

test("Scopus adapter extracts stable Table and List search-result candidates", async () => {
  const tableDOM = await createAdapterDOM("table");
  try {
    const adapter = tableDOM.window.ZoteroCheck.siteAdapters.scopus;
    assert.equal(adapter.detect(), true);
    assert.equal(adapter.isSearchResultsPage(), true);
    assert.equal(adapter.supportsBatchCheck, true);

    const signature = adapter.getBatchSignature();
    const targets = adapter.collectBatchTargets();
    assert.match(signature, /^table\|/);
    assert.equal(targets.length, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(targets[0].candidate)), {
      itemType: "journalArticle",
      title: "Synthetic Scopus Table Alpha",
      creators: [
        { name: "Ada Example" },
        { name: "Benoit Sample" }
      ],
      date: "2026",
      publicationTitle: "Journal of Synthetic Results",
      url: "https://www.scopus.com/pages/publications/85199990001?origin=resultslist",
      source: "scopus-search-results",
      matchPolicy: "scopus-tiered"
    });
    assert.equal(targets[1].candidate.itemType, "conferencePaper");
    assert.equal(targets[0].candidate.creators.some((creator) => creator.name.includes("Hidden")), false);

    const duplicate = targets[0].anchor.closest("tr").cloneNode(true);
    targets[0].anchor.closest("tbody").appendChild(duplicate);
    assert.equal(adapter.collectBatchTargets().length, 2);
  } finally {
    tableDOM.window.close();
  }

  const listDOM = await createAdapterDOM("list");
  try {
    const adapter = listDOM.window.ZoteroCheck.siteAdapters.scopus;
    const signature = adapter.getBatchSignature();
    const targets = adapter.collectBatchTargets();
    assert.match(signature, /^list\|/);
    assert.equal(targets.length, 2);
    assert.equal(targets[0].candidate.itemType, "journalArticle");
    assert.equal(targets[0].candidate.date, "2024");
    assert.equal(targets[0].candidate.publicationTitle, "Synthetic Review Letters");
    assert.equal(targets[0].candidate.matchPolicy, "scopus-tiered");
    assert.deepEqual(
      JSON.parse(JSON.stringify(targets[0].candidate.creators)),
      [{ name: "Dana Demonstration" }, { name: "Eli Example" }]
    );
    assert.equal(targets[1].candidate.itemType, "bookSection");
    assert.equal(targets[1].candidate.date, "2023");
  } finally {
    listDOM.window.close();
  }
});

test("Scopus bilingual titles match either language with the four-field confidence tiers", async () => {
  const dom = await createAdapterDOM("table");
  try {
    const titleLink = dom.window.document.querySelector(
      '#table-results-fixture a[href*="/pages/publications/"]'
    );
    titleLink.textContent =
      "Simulation study on settling dewatering of fine tailings in a lab-scale thickener | " +
      "浓密机内细尾砂沉降脱水规律模拟研究";
    dom.window.document.querySelector('#table-results-fixture [data-testid="author-list"] button')
      .textContent = "Example A.";

    const [target] = dom.window.ZoteroCheck.siteAdapters.scopus.collectBatchTargets();
    assert.equal(
      target.candidate.title,
      "Simulation study on settling dewatering of fine tailings in a lab-scale thickener"
    );
    assert.deepEqual(
      JSON.parse(JSON.stringify(target.candidate.alternateTitles)),
      ["浓密机内细尾砂沉降脱水规律模拟研究"]
    );

    const savedChineseItem = {
      data: {
        itemType: "journalArticle",
        title: "浓密机内细尾砂沉降脱水规律模拟研究",
        date: "2026",
        publicationTitle: "Journal of Synthetic Results",
        creators: [{ firstName: "Ada", lastName: "Example" }]
      }
    };
    assert.equal(matcher.matchCandidate(target.candidate, [savedChineseItem]).status, "matched");
    assert.equal(matcher.matchCandidate({
      ...target.candidate,
      publicationTitle: "Other Journal"
    }, [savedChineseItem]).status, "possible_match");
  } finally {
    dom.window.close();
  }
});

test("Scopus adapter rejects non-search routes and signatures follow result identity", async () => {
  const dom = await createAdapterDOM("table");
  try {
    const adapter = dom.window.ZoteroCheck.siteAdapters.scopus;
    const before = adapter.getBatchSignature();
    const firstLink = dom.window.document.querySelector(
      '#table-results-fixture a[href*="/pages/publications/"]'
    );
    firstLink.href = "/pages/publications/85199990999?origin=resultslist";
    assert.notEqual(adapter.getBatchSignature(), before);

    dom.window.history.replaceState({}, "", "/pages/references/85199990999");
    assert.equal(adapter.isSearchResultsPage(), false);
    assert.equal(adapter.getBatchSignature(), "");
    assert.equal(adapter.collectBatchTargets().length, 0);
  } finally {
    dom.window.close();
  }
});

test("Scopus adapter renders only fresh positive matches with localized chips", async () => {
  const dom = await createAdapterDOM("table");
  try {
    const adapter = dom.window.ZoteroCheck.siteAdapters.scopus;
    const targets = adapter.collectBatchTargets();
    adapter.applyBatchResults([
      { sourceId: targets[0].sourceId, status: "matched", matchType: "title", confidence: 0.95 },
      { sourceId: targets[1].sourceId, status: "not_found", complete: false }
    ]);

    const first = targets[0].element;
    const second = targets[1].element;
    assert.equal(first.dataset.zoteroCheckState, "matched");
    assert.equal(first.querySelector(".zotero-check-search-status").textContent, "Saved");
    assert.equal(second.dataset.zoteroCheckState, "unknown");
    assert.equal(second.dataset.zoteroCheckResultState, "incomplete");
    assert.equal(second.querySelector(".zotero-check-search-status"), null);

    adapter.applyBatchResults([
      { sourceId: targets[1].sourceId, status: "possible_match", matchType: "fuzzy", confidence: 0.8 }
    ]);
    assert.equal(second.querySelector(".zotero-check-search-status").textContent, "Possibly saved");

    adapter.applyBatchResults([
      {
        sourceId: targets[0].sourceId,
        status: "matched",
        complete: false,
        freshness: "stale"
      },
      { sourceId: targets[1].sourceId, status: "error", error: "synthetic_error" }
    ]);
    assert.equal(first.dataset.zoteroCheckState, "possible");
    assert.equal(first.dataset.zoteroCheckResultState, "stale_matched");
    assert.equal(first.querySelector(".zotero-check-search-status"), null);
    assert.equal(second.dataset.zoteroCheckState, "error");
    assert.equal(second.querySelector(".zotero-check-search-status"), null);
  } finally {
    dom.window.close();
  }
});

test("Scopus SPA navigation from home activates one automatic result batch", async () => {
  const fixtureHTML = await fixture();
  const dom = new JSDOM("<!doctype html><html><body><main>Scopus home</main></body></html>", {
    url: "https://www.scopus.com/pages/home?display=basic",
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  const messages = [];
  dom.window.requestIdleCallback = (callback) => dom.window.setTimeout(callback, 0);
  dom.window.chrome = {
    i18n: { getMessage: () => "", getUILanguage: () => "en" },
    storage: {
      sync: {
        get: (_defaults, callback) => dom.window.setTimeout(() => callback({
          autoCheckReferenceLists: false,
          translationServerMode: "off"
        }), 25)
      }
    },
    runtime: {
      id: "test-extension",
      getURL: (value) => `chrome-extension://test-extension/${value}`,
      onMessage: { addListener: () => {} },
      sendMessage: (message, callback) => {
        messages.push(message);
        if (message.workload === "references") {
          callback?.({
            ok: true,
            result: {
              results: message.candidates.map((_candidate, index) => index === 0
                ? { status: "matched", matchType: "title", confidence: 0.95, complete: true }
                : { status: "not_found", matchType: null, confidence: 0, complete: true })
            }
          });
        } else {
          callback?.({ ok: true, result: { status: "not_found", complete: true } });
        }
      }
    }
  };

  for (const name of [
    "common/i18n.js",
    "common/backend-contract.js",
    "common/ui-state.js",
    "common/page-controller.js",
    "common/sender-security.js",
    "common/normalization.js",
    "extractors/cnki.js",
    "extractors/scopus.js",
    "extractors/generic.js",
    "extractors/runner.js",
    "adapters/cnki.js",
    "adapters/scopus.js",
    "adapters/sciencedirect.js",
    "content.js"
  ]) dom.window.eval(await source(name));

  const batches = () => messages.filter((message) => message.workload === "references");
  try {
    await wait(300);
    assert.equal(batches().length, 0);

    dom.window.history.pushState(
      {},
      "",
      "/pages/search/publications?searchId=SYNTHETIC-SPA"
    );
    const parsed = new dom.window.DOMParser().parseFromString(fixtureHTML, "text/html");
    const tableFixture = parsed.querySelector("#table-results-fixture");
    dom.window.document.body.appendChild(dom.window.document.importNode(tableFixture, true));

    await wait(1200);
    assert.equal(batches().length, 1);
    assert.equal(batches()[0].candidates.length, 2);
    assert.equal(messages.some((message) => message.workload === "detail"), false);
    assert.equal(
      dom.window.document.querySelector(".zotero-check-search-status").textContent,
      "Saved"
    );

    const firstLink = dom.window.document.querySelector(
      '#table-results-fixture a[href*="/pages/publications/"]'
    );
    firstLink.href = "/pages/publications/85199990999?origin=resultslist";
    firstLink.textContent = "Synthetic Scopus SPA Replacement";
    await wait(1200);
    assert.equal(batches().length, 2);
    assert.equal(batches()[1].candidates[0].title, "Synthetic Scopus SPA Replacement");
  } finally {
    dom.window.close();
  }
});
