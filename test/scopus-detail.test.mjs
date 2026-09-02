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

async function loadExtractionDOM(url = "https://www.scopus.com/pages/publications/85199995555?origin=resultslist") {
  const dom = new JSDOM(await fixture("scopus-detail.html"), {
    url,
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  dom.window.eval(await source("common/normalization.js"));
  dom.window.eval(await source("extractors/scopus.js"));
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
  let messageListener;
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
      onMessage: { addListener: (listener) => { messageListener = listener; } },
      sendMessage
    }
  };
  for (const name of contentScripts) dom.window.eval(await source(name));
  return { dom, getMessageListener: () => messageListener };
}

function visibleDetailRoot(document) {
  return Array.from(document.querySelectorAll('[data-testid="publication-page-header"]'))
    .find((node) => !node.hidden);
}

function replaceBody(dom, html) {
  const parsed = new dom.window.DOMParser().parseFromString(html, "text/html");
  dom.window.document.body.replaceWith(dom.window.document.importNode(parsed.body, true));
}

test("Scopus detail extractor uses the verified route and stable detail fields", async () => {
  const dom = await loadExtractionDOM();
  try {
    const api = dom.window.ZoteroCheck;
    const extractor = api.extractors.find((value) => value.id === "scopus-publication-details");
    const result = api.detectAndExtract(dom.window.document, dom.window.location.href);

    assert.equal(extractor.preferLocal, true);
    assert.deepEqual(Array.from(result.detected, (value) => value.id), ["scopus-publication-details"]);
    assert.equal(result.preferLocal, true);
    assert.deepEqual(JSON.parse(JSON.stringify(result.candidates)), [{
      itemType: "journalArticle",
      title: "Synthetic Scopus Detail Study",
      creators: [
        { name: "Example, Ada" },
        { name: "Sample, Benoit" }
      ],
      date: "2026",
      publicationTitle: "Journal of Synthetic Details",
      url: "https://www.scopus.com/pages/publications/85199995555?origin=resultslist",
      source: "scopus-publication-details",
      matchPolicy: "scopus-tiered",
      metadataSource: "extractor"
    }]);

    for (const [name, content] of [
      ["og:title", "Wrong Generic Scopus Page Title"],
      ["citation_doi", "10.5555/wrong.generic"]
    ]) {
      const meta = dom.window.document.createElement("meta");
      meta.setAttribute("name", name);
      meta.setAttribute("content", content);
      dom.window.document.head.appendChild(meta);
    }
    const conflicting = api.detectAndExtract(dom.window.document, dom.window.location.href);
    assert.deepEqual(
      Array.from(conflicting.detected, (value) => value.id),
      ["scopus-publication-details", "generic-metadata"]
    );
    assert.equal(conflicting.candidates.length, 1);
    assert.equal(conflicting.candidates[0].DOI, undefined);
    assert.equal(conflicting.candidates[0].matchPolicy, "scopus-tiered");

    for (const url of [
      "https://www.scopus.com/pages/search/publications?searchId=SYNTHETIC",
      "https://www.scopus.com/pages/home",
      "https://www.scopus.com/pages/references/85199995555",
      "https://example.invalid/pages/publications/85199995555"
    ]) {
      assert.equal(extractor.detect(dom.window.document, url), false, url);
      assert.equal(extractor.extract(dom.window.document, url).length, 0, url);
    }
  } finally {
    dom.window.close();
  }
});

test("Scopus detail extraction ignores hidden stale DOM and tolerates missing optional fields", async () => {
  const dom = await loadExtractionDOM();
  try {
    const extractor = dom.window.ZoteroCheck.extractors.find(
      (value) => value.id === "scopus-publication-details"
    );
    const root = visibleDetailRoot(dom.window.document);
    for (const selector of [
      '[data-testid="publication-doi"]',
      '[data-testid="publication-year"]',
      '[id="source-preview-flyout"]',
      '[data-testid="authors-list"]'
    ]) root.querySelector(selector)?.remove();

    const [candidate] = extractor.extract(dom.window.document, dom.window.location.href);
    assert.equal(candidate.title, "Synthetic Scopus Detail Study");
    assert.equal(candidate.DOI, undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(candidate.creators)), []);
    assert.equal(candidate.date, "");
    assert.equal(candidate.publicationTitle, "");
    assert.equal(candidate.itemType, "journalArticle");
    assert.equal(candidate.title.includes("Stale Hidden"), false);
    assert.equal(candidate.title.includes("Injected status noise"), false);
  } finally {
    dom.window.close();
  }
});

test("Scopus detail extractor preserves both displayed title variants", async () => {
  const dom = await loadExtractionDOM();
  try {
    const root = visibleDetailRoot(dom.window.document);
    root.querySelector('[data-testid="publication-titles"] span').textContent =
      "Simulation study on settling dewatering of fine tailings | " +
      "浓密机内细尾砂沉降脱水规律模拟研究";
    const [candidate] = dom.window.ZoteroCheck.extractors.find(
      (value) => value.id === "scopus-publication-details"
    ).extract(dom.window.document, dom.window.location.href);

    assert.equal(candidate.title, "Simulation study on settling dewatering of fine tailings");
    assert.deepEqual(
      JSON.parse(JSON.stringify(candidate.alternateTitles)),
      ["浓密机内细尾砂沉降脱水规律模拟研究"]
    );
  } finally {
    dom.window.close();
  }
});

test("Scopus detail startup sends one local detail check and renders the shared badge", async () => {
  const html = await fixture("scopus-detail.html");
  const messages = [];
  let detailCallback;
  const harness = await loadContentDOM(
    html,
    "https://www.scopus.com/pages/publications/85199995555?origin=resultslist",
    (message, callback) => {
      messages.push(message);
      if (message.type === "zotero-check:match" && message.workload === "detail") {
        detailCallback = callback;
        return;
      }
      callback?.({ ok: false, error: "unexpected_message" });
    }
  );
  const { dom } = harness;
  try {
    await waitFor(() => typeof detailCallback === "function");
    await wait(800);
    const detailMessages = messages.filter((message) => message.workload === "detail");
    assert.equal(detailMessages.length, 1);
    assert.equal(messages.some((message) => message.workload === "references"), false);
    assert.equal(messages.some((message) => message.type === "zotero-check:translate-url"), false);
    assert.equal(detailMessages[0].candidates[0].DOI, undefined);
    assert.equal(detailMessages[0].candidates[0].matchPolicy, "scopus-tiered");

    detailCallback({
      ok: true,
      result: { status: "matched", matchType: "doi", confidence: 1, complete: true }
    });
    await waitFor(() => {
      const host = dom.window.document.querySelector("#zotero-check-badge-host");
      return host?.shadowRoot?.querySelector(".zotero-check-label")?.textContent === "Library: saved";
    });

    const host = dom.window.document.querySelector("#zotero-check-badge-host");
    const badge = host.shadowRoot.querySelector(".zotero-check-badge");
    assert.equal(badge.dataset.state, "matched");
    assert.equal(badge.querySelector(".zotero-check-label").textContent, "Library: saved");
    assert.equal(host.closest('[data-testid="publication-page-header"]'), visibleDetailRoot(dom.window.document));
    assert(host.previousElementSibling?.matches('[data-testid="publication-titles"]'));

    let stateResponse;
    harness.getMessageListener()(
      { type: "zotero-check:get-page-state" },
      { id: "test-extension", url: "chrome-extension://test-extension/src/popup.html" },
      (response) => { stateResponse = response; }
    );
    assert.equal(stateResponse.pageState.state, "saved");

    const root = visibleDetailRoot(dom.window.document);
    root.querySelector('[data-testid="publication-year"]').textContent = "2027";
    const addedAuthor = dom.window.document.createElement("li");
    addedAuthor.dataset.testid = "authorItem-button";
    addedAuthor.innerHTML = "<button type=\"button\">Later, Metadata</button>";
    root.querySelector('[data-testid="authors-list"]').appendChild(addedAuthor);
    await waitFor(() => messages.filter((message) => message.workload === "detail").length === 2);
    const enrichedMessage = messages.filter((message) => message.workload === "detail")[1];
    assert.equal(enrichedMessage.candidates[0].date, "2027");
    assert.equal(enrichedMessage.candidates[0].creators.at(-1).name, "Later, Metadata");
    detailCallback({
      ok: true,
      result: { status: "possible_match", matchType: "title", confidence: 0.82, complete: true }
    });
    await waitFor(() => {
      const currentHost = dom.window.document.querySelector("#zotero-check-badge-host");
      return currentHost?.shadowRoot?.querySelector(".zotero-check-label")?.textContent ===
        "Library: possibly saved";
    });
  } finally {
    dom.window.close();
  }
});

test("Scopus SPA route changes isolate late detail responses and switch cleanly to search", async () => {
  const searchHTML = await fixture("scopus-search-results.html");
  const detailHTML = await fixture("scopus-detail.html");
  const detailRequests = [];
  const referenceRequests = [];
  const harness = await loadContentDOM(
    searchHTML,
    "https://www.scopus.com/pages/search/publications?searchId=SYNTHETIC",
    (message, callback) => {
      if (message.type === "zotero-check:match" && message.workload === "references") {
        referenceRequests.push(message);
        callback?.({
          ok: true,
          result: {
            results: message.candidates.map(() => ({
              status: "matched",
              matchType: "title",
              confidence: 0.95,
              complete: true
            }))
          }
        });
        return;
      }
      if (message.type === "zotero-check:match" && message.workload === "detail") {
        detailRequests.push({ message, callback });
        return;
      }
      callback?.({ ok: false, error: "unexpected_message" });
    }
  );
  const { dom } = harness;
  try {
    await waitFor(() => referenceRequests.length === 1);

    dom.window.history.pushState({}, "", "/pages/publications/85199995555?origin=resultslist");
    replaceBody(dom, detailHTML);
    await waitFor(() => detailRequests.length === 1);
    assert.equal(detailRequests[0].message.candidates[0].title, "Synthetic Scopus Detail Study");

    const parsedB = new dom.window.DOMParser().parseFromString(detailHTML, "text/html");
    const rootB = visibleDetailRoot(parsedB);
    rootB.querySelector('[data-testid="publication-titles"] span').textContent =
      "Synthetic Scopus Detail Study B";
    rootB.querySelector('[data-testid="publication-doi"] span').textContent =
      "DOI: 10.5555/SYNTHETIC.DETAIL.B";
    dom.window.history.pushState({}, "", "/pages/publications/85199995556?origin=resultslist");
    dom.window.document.body.replaceWith(dom.window.document.importNode(parsedB.body, true));
    await waitFor(() => detailRequests.length === 2);

    detailRequests[1].callback?.({
      ok: true,
      result: { status: "not_found", matchType: null, confidence: 0, complete: true }
    });
    await waitFor(() => {
      const host = dom.window.document.querySelector("#zotero-check-badge-host");
      return host?.shadowRoot?.querySelector(".zotero-check-label")?.textContent === "Library: not saved";
    });

    detailRequests[0].callback?.({
      ok: true,
      result: { status: "matched", matchType: "doi", confidence: 1, complete: true }
    });
    await wait(150);
    assert.equal(
      dom.window.document.querySelector("#zotero-check-badge-host").shadowRoot
        .querySelector(".zotero-check-label").textContent,
      "Library: not saved"
    );

    dom.window.document.body.appendChild(dom.window.document.createElement("aside"));
    await wait(800);
    assert.equal(detailRequests.length, 2);

    const currentRoot = visibleDetailRoot(dom.window.document);
    currentRoot.querySelector('[data-testid="publication-titles"] span').textContent =
      "Synthetic Scopus Detail Study B Revised";
    currentRoot.querySelector('[data-testid="publication-doi"] span').textContent =
      "DOI: 10.5555/SYNTHETIC.DETAIL.B2";
    await waitFor(() => detailRequests.length === 3);
    detailRequests[2].callback?.({
      ok: true,
      result: { status: "possible_match", matchType: "title", confidence: 0.82, complete: true }
    });
    await waitFor(() => {
      const host = dom.window.document.querySelector("#zotero-check-badge-host");
      return host?.shadowRoot?.querySelector(".zotero-check-label")?.textContent ===
        "Library: possibly saved";
    });

    dom.window.history.pushState({}, "", "/pages/search/publications?searchId=RETURNED");
    dom.window.document.body.appendChild(dom.window.document.createElement("nav"));
    await waitFor(() => dom.window.document.querySelector("#zotero-check-badge-host") === null);
    replaceBody(dom, searchHTML);
    await waitFor(() => referenceRequests.length === 2);
    assert.equal(dom.window.document.querySelector("#zotero-check-badge-host"), null);
    assert.equal(detailRequests.length, 3);
    assert(dom.window.document.querySelector(".zotero-check-search-status"));
  } finally {
    dom.window.close();
  }
});

test("Scopus route reset cannot let an old same-signature batch clear the new request", async () => {
  const searchHTML = await fixture("scopus-search-results.html");
  const requests = [];
  const harness = await loadContentDOM(
    searchHTML,
    "https://www.scopus.com/pages/search/publications?searchId=BATCH-A",
    (message, callback) => {
      if (message.type === "zotero-check:match" && message.workload === "references") {
        requests.push({ message, callback });
        return;
      }
      callback?.({ ok: false, error: "unexpected_message" });
    }
  );
  const { dom } = harness;
  const batchResponse = (message) => ({
    ok: true,
    result: {
      results: message.candidates.map(() => ({
        status: "matched",
        matchType: "title",
        confidence: 0.95,
        complete: true
      }))
    }
  });
  try {
    await waitFor(() => requests.length === 1);
    dom.window.history.pushState({}, "", "/pages/search/publications?searchId=BATCH-B");
    dom.window.document.body.appendChild(dom.window.document.createElement("aside"));
    await waitFor(() => requests.length === 2);

    requests[0].callback?.(batchResponse(requests[0].message));
    await wait(100);
    dom.window.document.body.appendChild(dom.window.document.createElement("footer"));
    await wait(900);
    assert.equal(requests.length, 2);

    requests[1].callback?.(batchResponse(requests[1].message));
    await waitFor(() => Boolean(dom.window.document.querySelector(".zotero-check-search-status")));
  } finally {
    dom.window.close();
  }
});
