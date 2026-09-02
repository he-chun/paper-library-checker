import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const source = async (name) => readFile(
  new URL(`../browser-extension/src/${name}`, import.meta.url),
  "utf8"
);
const fixture = async () => readFile(
  new URL("./fixtures/cnki-search-results.html", import.meta.url),
  "utf8"
);
const detailFixture = async () => readFile(
  new URL("./fixtures/cnki-detail.html", import.meta.url),
  "utf8"
);
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function createAdapterDOM() {
  const dom = new JSDOM(await fixture(), {
    url: "https://kns.cnki.net/kns8s/defaultresult/index?kw=synthetic",
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  dom.window.chrome = {
    i18n: { getMessage: () => "", getUILanguage: () => "en" }
  };
  dom.window.eval(await source("common/i18n.js"));
  dom.window.eval(await source("adapters/cnki.js"));
  return dom;
}

test("CNKI adapter extracts stable KNS8 search-result candidates", async () => {
  const dom = await createAdapterDOM();
  try {
    const adapter = dom.window.ZoteroCheck.siteAdapters.cnki;
    assert.equal(adapter.detect(), true);
    assert.equal(adapter.isSearchResultsPage(), true);
    assert.equal(adapter.supportsBatchCheck, true);

    const signatureBefore = adapter.getBatchSignature();
    const targets = adapter.collectBatchTargets();
    assert.equal(targets.length, 2);
    assert.equal(targets[0].row.classList.contains("zotero-check-search-result-row"), true);
    assert.match(targets[0].sourceId, /^zcr-cnki-search-/);
    assert.notEqual(targets[0].sourceId, targets[1].sourceId);

    const first = JSON.parse(JSON.stringify(targets[0].candidate));
    assert.deepEqual(first, {
      itemType: "journalArticle",
      title: "Synthetic Result Alpha",
      creators: [
        { name: "Synthetic Author Alpha" },
        { name: "Synthetic Author Beta" }
      ],
      date: "2026-01-15",
      publicationTitle: "Synthetic Journal",
      url: "https://kns.cnki.net/kcms2/article/abstract?v=DYNAMIC-TOKEN-ALPHA&FileName=SYNTHETIC-JOURNAL-001",
      source: "cnki-search-results",
      cnkiFileID: "SYNTHETIC-JOURNAL-001"
    });
    assert.equal(first.creators.some((creator) => creator.name.includes("Hidden")), false);

    const second = JSON.parse(JSON.stringify(targets[1].candidate));
    assert.equal(second.itemType, "thesis");
    assert.equal(second.title, "Synthetic Thesis Beta");
    assert.equal(Object.hasOwn(second, "cnkiFileID"), false);

    const links = dom.window.document.querySelectorAll("td.name > a.fz14");
    links[0].setAttribute(
      "href",
      "/kcms2/article/abstract?v=ROTATED-TOKEN-ONE&FileName=SYNTHETIC-JOURNAL-001"
    );
    links[1].setAttribute("href", "/kcms2/article/abstract?v=ROTATED-TOKEN-TWO");
    assert.equal(adapter.getBatchSignature(), signatureBefore);
  } finally {
    dom.window.close();
  }
});

test("CNKI adapter keeps detail pages separate and owns its list watcher selectors", async () => {
  const containerSelectors = [
    "#literature-recommend",
    "#kcms-data-similar",
    "#kcms-data-reader-recommend",
    "#kcms-related-fund-literature",
    "#kcms-study-period-results",
    "#div-literatureRef",
    "#quoted-references",
    "#quoted-citations",
    "#quoted-coreferences",
    "#quoted-cocitations",
    "#quoted-secondreferences",
    "#quoted-secondcitations",
    "#refpartdiv",
    ".essayBox"
  ];
  const containers = containerSelectors.map((selector, index) => {
    const attribute = selector.startsWith("#")
      ? `id="${selector.slice(1)}"`
      : `class="${selector.slice(1)}"`;
    return `<div ${attribute}><a href="/kcms2/article/abstract?FileName=REF-${index}">Synthetic Reference ${index}</a></div>`;
  }).join("");
  const dom = new JSDOM(`<!doctype html><body>
    ${containers}
    <table class="result-table-list"><tbody><tr><td class="name">
      <a href="/kcms2/article/abstract?FileName=SEARCH-ONLY">Synthetic Search Row</a>
    </td></tr></tbody></table>
    <div class="pages"><button id="next-page">下一页</button><button id="page-two">2</button></div>
    <button id="ordinary-action">打开</button>
  </body>`, {
    url: "https://kns.cnki.net/kcms2/article/abstract?FileName=HOST-ARTICLE",
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  try {
    dom.window.eval(await source("adapters/cnki.js"));
    const adapter = dom.window.ZoteroCheck.siteAdapters.cnki;
    assert.equal(adapter.detect(), true);
    assert.equal(adapter.isSearchResultsPage(), false);
    assert.equal(adapter.collectBatchTargets().length, containerSelectors.length);
    assert.equal(adapter.getBatchMutationContainers().length, containerSelectors.length + 1);
    assert.equal(
      adapter.isBatchNavigationEvent({ target: dom.window.document.querySelector("#next-page") }),
      true
    );
    assert.equal(
      adapter.isBatchNavigationEvent({ target: dom.window.document.querySelector("#page-two") }),
      true
    );
    assert.equal(
      adapter.isBatchNavigationEvent({ target: dom.window.document.querySelector("#ordinary-action") }),
      false
    );
  } finally {
    dom.window.close();
  }
});

test("CNKI adapter caps search batches at 80 rows without marking overflow rows", async () => {
  const rowsHTML = Array.from({ length: 85 }, (_value, index) => `
    <tr>
      <td class="name"><a href="/kcms2/article/abstract?FileName=LIMIT-${index}">Synthetic Limit ${index}</a></td>
      <td class="author"><a>Synthetic Author ${index}</a></td>
      <td class="source"><a>Synthetic Journal</a></td>
      <td class="date">2026</td>
      <td class="data">期刊</td>
    </tr>
  `).join("");
  const dom = new JSDOM(`<!doctype html><body>
    <table class="result-table-list"><tbody>${rowsHTML}</tbody></table>
  </body>`, {
    url: "https://kns.cnki.net/kns8s/defaultresult/index?kw=limit",
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  try {
    dom.window.eval(await source("adapters/cnki.js"));
    const rows = dom.window.document.querySelectorAll("table.result-table-list tbody tr");
    const targets = dom.window.ZoteroCheck.siteAdapters.cnki.collectBatchTargets();
    assert.equal(targets.length, 80);
    assert.equal(new Set(targets.map((target) => target.sourceId)).size, 80);
    assert.match(rows[79].dataset.zoteroCheckId, /^zcr-cnki-search-/);
    assert.equal(rows[80].dataset.zoteroCheckId, undefined);
    assert.equal(rows[80].dataset.zoteroCheckState, undefined);
  } finally {
    dom.window.close();
  }
});

test("CNKI detail pages with related result tables still run detail detection", async () => {
  const dom = new JSDOM(await detailFixture(), {
    url: "https://kns.cnki.net/kcms2/article/abstract?FileName=HOST-ARTICLE",
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  dom.window.document.body.insertAdjacentHTML("beforeend", `
    <table class="result-table-list"><tbody><tr><td class="name">
      <a href="/kcms2/article/abstract?FileName=RELATED-ARTICLE">Synthetic Related Article</a>
    </td></tr></tbody></table>
    <div class="pages"><button>下一页</button></div>
  `);
  const messages = [];
  dom.window.chrome = {
    i18n: { getMessage: () => "", getUILanguage: () => "en" },
    storage: {
      sync: {
        get: (_defaults, callback) => callback({
          autoCheckReferenceLists: false,
          translationServerMode: "off"
        })
      }
    },
    runtime: {
      id: "test-extension",
      getURL: (value) => `chrome-extension://test-extension/${value}`,
      onMessage: { addListener: () => {} },
      sendMessage: (message, callback) => {
        messages.push(message);
        callback?.({
          ok: true,
          result: { status: "matched", matchType: "title", confidence: 0.95, complete: true }
        });
      }
    }
  };

  for (const name of [
    "common/i18n.js",
    "common/visual-preferences.js",
    "common/backend-contract.js",
    "common/ui-state.js",
    "common/page-controller.js",
    "common/sender-security.js",
    "common/normalization.js",
    "extractors/cnki.js",
    "extractors/generic.js",
    "extractors/runner.js",
    "adapters/cnki.js",
    "adapters/sciencedirect.js",
    "content.js"
  ]) dom.window.eval(await source(name));

  try {
    await wait(1000);
    assert.equal(messages.filter((message) => message.workload === "detail").length, 1);
    assert.equal(messages.some((message) => message.workload === "references"), false);
    assert.equal(dom.window.document.querySelector(".zotero-check-search-status"), null);
  } finally {
    dom.window.close();
  }
});

test("CNKI adapter renders only positive search-result badges and preserves uncertainty", async () => {
  const dom = await createAdapterDOM();
  try {
    const adapter = dom.window.ZoteroCheck.siteAdapters.cnki;
    const targets = adapter.collectBatchTargets();
    adapter.applyBatchResults([
      { sourceId: targets[0].sourceId, status: "matched", matchType: "title", confidence: 0.95 },
      {
        sourceId: targets[1].sourceId,
        status: "not_found",
        complete: false,
        freshness: "unavailable"
      }
    ]);

    const rows = dom.window.document.querySelectorAll("table.result-table-list tbody tr");
    assert.equal(rows[0].dataset.zoteroCheckState, "matched");
    assert.equal(rows[0].dataset.zoteroCheckResultState, "matched");
    assert.equal(rows[0].querySelector(".zotero-check-search-status").textContent, "Saved");
    assert.equal(rows[1].dataset.zoteroCheckState, "unknown");
    assert.equal(rows[1].dataset.zoteroCheckResultState, "incomplete");
    assert.equal(rows[1].querySelector(".zotero-check-search-status"), null);

    adapter.applyBatchResults([
      { sourceId: targets[1].sourceId, status: "possible_match", matchType: "fuzzy", confidence: 0.8 }
    ]);
    assert.equal(rows[1].querySelector(".zotero-check-search-status").textContent, "Possible match");

    adapter.applyBatchResults([
      {
        sourceId: targets[0].sourceId,
        status: "matched",
        complete: false,
        freshness: "stale"
      }
    ]);
    assert.equal(rows[0].dataset.zoteroCheckState, "possible");
    assert.equal(rows[0].dataset.zoteroCheckResultState, "stale_matched");
    assert.equal(rows[0].querySelector(".zotero-check-search-status"), null);
  } finally {
    dom.window.close();
  }
});

test("CNKI KNS8 search pages auto-check after asynchronous option loading", async () => {
  const dom = new JSDOM(await fixture(), {
    url: "https://kns.cnki.net/kns8s/defaultresult/index?kw=synthetic",
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  const originalRowsHTML = dom.window.document.querySelector("table.result-table-list tbody").innerHTML;
  const originalFirstRowHTML = dom.window.document.querySelector("table.result-table-list tbody tr").innerHTML;
  const messages = [];
  let messageListener;
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
      onMessage: { addListener: (listener) => { messageListener = listener; } },
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
    "common/visual-preferences.js",
    "common/backend-contract.js",
    "common/ui-state.js",
    "common/page-controller.js",
    "common/sender-security.js",
    "common/normalization.js",
    "extractors/cnki.js",
    "extractors/generic.js",
    "extractors/runner.js",
    "adapters/cnki.js",
    "adapters/sciencedirect.js",
    "content.js"
  ]) dom.window.eval(await source(name));

  try {
    await wait(1000);
    const batches = () => messages.filter((message) => message.workload === "references");
    assert.equal(batches().length, 1);
    assert.equal(batches()[0].candidates.length, 2);
    assert.equal(messages.some((message) => message.workload === "detail"), false);
    assert.equal(dom.window.document.querySelector("#zotero-check-badge-host"), null);
    assert.equal(
      dom.window.document.querySelector(".zotero-check-search-status").textContent,
      "Saved"
    );

    assert.equal(typeof messageListener, "function");
    const sender = {
      id: "test-extension",
      url: "chrome-extension://test-extension/src/popup.html"
    };
    messageListener({ type: "zotero-check:manual-page-check" }, sender, () => {});
    await wait(800);
    assert.equal(batches().length, 2);
    assert.equal(messages.some((message) => message.workload === "detail"), false);

    const body = dom.window.document.querySelector("table.result-table-list tbody");
    body.innerHTML = originalRowsHTML.replaceAll("DYNAMIC-TOKEN-", "ROTATED-TOKEN-");
    await wait(1200);
    assert.equal(batches().length, 2);
    assert.equal(body.querySelector(".zotero-check-search-status").textContent, "Saved");

    const retainedFirstRow = body.querySelector("tr");
    retainedFirstRow.innerHTML = originalFirstRowHTML.replaceAll(
      "DYNAMIC-TOKEN-",
      "CELL-ROTATED-TOKEN-"
    );
    await wait(600);
    assert.equal(batches().length, 2);
    assert.equal(retainedFirstRow.querySelector(".zotero-check-search-status").textContent, "Saved");

    const secondRow = dom.window.document.querySelectorAll("table.result-table-list tbody tr")[1];
    const secondLink = secondRow.querySelector("td.name > a.fz14");
    secondLink.setAttribute("title", "Synthetic Thesis Gamma");
    secondLink.textContent = "Synthetic Thesis Gamma";
    secondRow.querySelector("td.date").textContent = "2024";
    await wait(1200);
    assert.equal(batches().length, 3);
    assert.equal(batches()[2].candidates[1].title, "Synthetic Thesis Gamma");
  } finally {
    dom.window.close();
  }
});
