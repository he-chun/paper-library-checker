import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const source = async (name) => readFile(new URL(`../browser-extension/src/${name}`, import.meta.url), "utf8");
async function fixture(name, url) {
  const html = await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
  const dom = new JSDOM(html, { url, runScripts: "outside-only" });
  dom.window.eval(await source("common/normalization.js"));
  dom.window.eval(await source("extractors/cnki.js"));
  dom.window.eval(await source("extractors/generic.js"));
  dom.window.eval(await source("extractors/runner.js"));
  return dom;
}

for (const [name, url, expected] of [
  ["cnki-detail.html", "https://kns.cnki.net/kcms2/article/abstract?v=SYN", "10.1000/cnki.synthetic"],
  ["sciencedirect-detail.html", "https://www.sciencedirect.com/science/article/pii/SYN", "10.1000/sd.synthetic"],
  ["mdpi-detail.html", "https://www.mdpi.com/1/2/3", "10.1000/mdpi.synthetic"],
  ["coins.html", "https://journal.invalid/article", "10.1000/coins.synthetic"],
  ["jsonld.html", "https://journal.invalid/article", "10.1000/jsonld.synthetic"]
]) {
  test(`extracts ${name}`, async () => {
    const dom = await fixture(name, url);
    const result = dom.window.ZoteroCheck.detectAndExtract(dom.window.document, url);
    assert(result.candidates.some((candidate) => candidate.DOI === expected));
    dom.window.close();
  });
}

test("unknown and malformed DOM yields no candidate", async () => {
  const dom = await fixture("unknown.html", "https://example.invalid/news");
  const result = dom.window.ZoteroCheck.detectAndExtract(dom.window.document, dom.window.location.href);
  assert.equal(result.candidates.length, 0);
  dom.window.close();
});

test("ScienceDirect adapter collects a minimal reference candidate", async () => {
  const html = await readFile(new URL("./fixtures/sciencedirect-references.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { url: "https://www.sciencedirect.com/science/article/pii/HOST", runScripts: "outside-only" });
  dom.window.eval(await source("adapters/sciencedirect.js"));
  const targets = dom.window.ZoteroCheck.siteAdapters.sciencedirect.collectBatchTargets();
  assert.equal(targets.length, 1);
  assert.equal(targets[0].candidate.title, "Synthetic Reference Title");
  assert.equal(targets[0].candidate.pii, "S000000000000001");
  dom.window.close();
});

test("CNKI reference and citation blocks produce a batch message", async () => {
  const html = await readFile(new URL("./fixtures/cnki-references.html", import.meta.url), "utf8");
  const messages = [];
  const dom = new JSDOM(html, { url: "https://kns.cnki.net/kcms2/article/abstract?v=HOST", runScripts: "outside-only", pretendToBeVisual: true });
  dom.window.chrome = {
    i18n: { getMessage: () => "", getUILanguage: () => "en" },
    storage: { sync: { get: (_defaults, callback) => callback({ autoCheckReferenceLists: true, translationServerMode: "off" }) } },
    runtime: {
      id: "test-extension",
      getURL: (value) => `chrome-extension://test-extension/${value}`,
      onMessage: { addListener: () => {} },
      sendMessage: (message, callback) => { messages.push(message); callback?.({ ok: true, result: { results: [] } }); }
    }
  };
  for (const name of [
    "common/i18n.js",
    "common/ui-state.js",
    "common/page-controller.js",
    "common/sender-security.js",
    "common/normalization.js",
    "extractors/cnki.js",
    "extractors/generic.js",
    "extractors/runner.js",
    "adapters/sciencedirect.js",
    "content.js"
  ]) dom.window.eval(await source(name));
  await new Promise((resolve) => setTimeout(resolve, 700));
  const batch = messages.find((message) => Array.isArray(message.candidates) && message.candidates.some((candidate) => candidate.source === "cnki-list"));
  assert.equal(batch.candidates.length, 2);
  assert.equal(Array.from(batch.candidates, (candidate) => candidate.title).sort().join("|"), "Synthetic Citation Two|Synthetic Reference One");
  dom.window.close();
});
