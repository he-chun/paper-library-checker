import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const localApi = require("../browser-extension/src/backends/local-api-backend.js");
const matcher = require("../browser-extension/src/backends/local-api-matcher.js");

function response({ status = 200, payload = [], apiVersion = "3", jsonError } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === "zotero-api-version" ? apiVersion : null },
    json: async () => {
      if (jsonError) throw jsonError;
      return payload;
    }
  };
}

function backendWithItems(items, options = {}) {
  const requests = [];
  const groups = options.groups || [];
  const groupItems = options.groupItems || {};
  const backend = localApi.createLocalApiBackend({
    ...options,
    fetch: async (url, requestOptions) => {
      requests.push({ url, options: requestOptions });
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/users/0/groups")) return response({ payload: groups });
      const groupMatch = parsed.pathname.match(/\/groups\/(\d+)\/items$/);
      return response({ payload: groupMatch ? groupItems[groupMatch[1]] || [] : items });
    }
  });
  return { backend, requests };
}

test("Local API endpoint validation permits only the two fixed loopback API roots", () => {
  assert.equal(localApi.validateLocalApiEndpoint("http://127.0.0.1:23119/api/"), "http://127.0.0.1:23119/api/");
  assert.equal(localApi.validateLocalApiEndpoint("http://localhost:23119/api/"), "http://localhost:23119/api/");
  for (const value of [
    "https://127.0.0.1:23119/api/",
    "http://127.0.0.1:23120/api/",
    "http://127.0.0.1:23119/api",
    "http://127.0.0.1:23119/zotero-checker",
    "http://example.test:23119/api/"
  ]) assert.throws(() => localApi.validateLocalApiEndpoint(value), /invalid_local_api_endpoint/);
});

test("probe detects an enabled compatible Local API with browser-safe v3 headers", async () => {
  const requests = [];
  const backend = localApi.createLocalApiBackend({
    fetch: async (url, options) => {
      requests.push({ url, options });
      return response();
    }
  });
  assert.deepEqual(await backend.probe(), { ok: true, version: "3", indexReady: true });
  assert.equal(requests[0].url, "http://127.0.0.1:23119/api/");
  assert.equal(requests[0].options.method, "GET");
  assert.deepEqual(requests[0].options.headers, {
    "Zotero-API-Version": "3",
    "Zotero-Allowed-Request": "true"
  });
});

test("probe distinguishes disabled, unavailable, and incompatible Local API states", async () => {
  for (const [fetchImpl, code] of [
    [async () => response({ status: 403 }), "local_api_disabled"],
    [async () => { throw new TypeError("fetch failed"); }, "local_api_unavailable"],
    [async () => response({ apiVersion: "2" }), "local_api_incompatible"]
  ]) {
    const backend = localApi.createLocalApiBackend({ fetch: fetchImpl });
    await assert.rejects(() => backend.probe(), (error) => error.code === code);
  }
});

test("empty personal library search returns a minimal not-found result", async () => {
  const { backend, requests } = backendWithItems([]);
  assert.deepEqual(await backend.check({ title: "Synthetic Article" }), {
    status: "not_found",
    matchType: null,
    confidence: 0
  });
  const url = new URL(requests.find((request) => request.url.includes("/items?" )).url);
  assert.equal(`${url.origin}${url.pathname}`, "http://127.0.0.1:23119/api/users/0/items");
  assert.equal(url.searchParams.get("q"), "Synthetic Article");
  assert.equal(url.searchParams.get("qmode"), "everything");
});

test("Local API search hits are only candidates and are independently reverified", async () => {
  const { backend } = backendWithItems([{
    data: {
      itemType: "journalArticle",
      title: "Different Article",
      DOI: "10.1000/different"
    }
  }]);
  assert.deepEqual(await backend.check({
    title: "Requested Article",
    DOI: "10.1000/requested"
  }), { status: "not_found", matchType: null, confidence: 0 });
});

test("DOI matching revalidates case and URL-prefix normalization without leaking raw item data", async () => {
  const raw = {
    key: "PRIVATEKEY",
    data: {
      itemType: "journalArticle",
      title: "Private library title",
      DOI: "10.1000/ABC",
      attachments: [{ path: "private.pdf" }]
    }
  };
  const { backend } = backendWithItems([raw]);
  const result = await backend.check({ DOI: "https://doi.org/10.1000/abc" });
  assert.deepEqual(result, { status: "matched", matchType: "doi", confidence: 1 });
  assert.equal(JSON.stringify(result).includes("PRIVATEKEY"), false);
  assert.equal(JSON.stringify(result).includes("private.pdf"), false);
});

test("PMID and ISBN exact matches are extracted from Zotero fields and extra", () => {
  assert.deepEqual(matcher.matchCandidate({ PMID: "123-45" }, [{
    data: { itemType: "journalArticle", extra: "PMID: 12345" }
  }]), { status: "matched", matchType: "pmid", confidence: 1 });
  assert.deepEqual(matcher.matchCandidate({ ISBN: "978-1-4028-9462-6" }, [{
    data: { itemType: "book", ISBN: "978 1 4028 9462 6" }
  }]), { status: "matched", matchType: "isbn", confidence: 1 });
});

test("CNKI exact matches are extracted from extra and CNKI URLs", () => {
  assert.deepEqual(matcher.matchCandidate({ cnkiFileID: "CJFD-ABC" }, [{
    data: { itemType: "journalArticle", extra: "CNKI ID: cjfd-abc" }
  }]), { status: "matched", matchType: "cnki", confidence: 1 });
  assert.deepEqual(matcher.matchCandidate({
    url: "https://kns.cnki.net/kcms2/article/abstract?v=x&FileName=CJFD123"
  }, [{
    data: {
      itemType: "journalArticle",
      url: "https://kns.cnki.net/kcms/detail/detail.aspx?filename=cjfd123"
    }
  }]), { status: "matched", matchType: "cnki", confidence: 1 });
});

test("normalized English and Chinese titles match with current exact-title confidence", () => {
  assert.deepEqual(matcher.matchCandidate({ title: "An Example: Study!" }, [{
    data: { itemType: "journalArticle", title: "An example study" }
  }]), { status: "matched", matchType: "title", confidence: 0.95 });
  assert.deepEqual(matcher.matchCandidate({ title: "中文　论文：测试" }, [{
    data: { itemType: "journalArticle", title: "中文论文测试" }
  }]), { status: "matched", matchType: "title", confidence: 0.95 });
});

test("year and author conflicts exclude otherwise exact title matches", () => {
  const item = {
    data: {
      itemType: "journalArticle",
      title: "Same Title",
      date: "2025-02-01",
      creators: [{ firstName: "Jane", lastName: "Doe" }]
    }
  };
  assert.deepEqual(matcher.matchCandidate({ title: "Same Title", date: "2024" }, [item]), {
    status: "not_found", matchType: null, confidence: 0
  });
  assert.deepEqual(matcher.matchCandidate({
    title: "Same Title",
    date: "2025",
    creators: [{ firstName: "John", lastName: "Smith" }]
  }, [item]), { status: "not_found", matchType: null, confidence: 0 });
});

test("attachments, notes, and annotations never count as bibliographic matches", () => {
  const items = ["attachment", "note", "annotation"].map((itemType) => ({
    data: { itemType, title: "Same Title", DOI: "10.1000/same" }
  }));
  assert.deepEqual(matcher.matchCandidate({ title: "Same Title", DOI: "10.1000/same" }, items), {
    status: "not_found", matchType: null, confidence: 0
  });
});

test("malformed JSON and request timeout return stable errors", async () => {
  const malformed = localApi.createLocalApiBackend({
    fetch: async () => response({ jsonError: new SyntaxError("bad json") })
  });
  await assert.rejects(() => malformed.check({ title: "Synthetic" }), (error) =>
    error.code === "local_api_malformed_response");

  const timeout = localApi.createLocalApiBackend({
    timeoutMs: 5,
    fetch: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    })
  });
  await assert.rejects(() => timeout.probe(), (error) => error.code === "local_api_timeout");
});

test("standard capabilities enable batch but disable fuzzy, possible, realtime, and authenticated protocol", async () => {
  const { backend } = backendWithItems([]);
  assert.deepEqual(backend.getCapabilities(), {
    exactIdentifiers: true,
    exactTitle: true,
    fuzzyTitle: false,
    possibleMatch: false,
    batch: true,
    realtimeIndex: false,
    authenticatedProtocol: false
  });
  assert.deepEqual(await backend.batchCheck([]), { results: [] });
});

test("Local API code is service-worker-only and contains no storage or logging sink", async () => {
  const manifest = JSON.parse(await readFile(new URL("../browser-extension/manifest.json", import.meta.url)));
  const contentScripts = manifest.content_scripts.flatMap((entry) => entry.js || []);
  assert.equal(contentScripts.some((entry) => entry.includes("backends/local-api")), false);

  for (const name of ["local-api-backend.js", "local-api-matcher.js"]) {
    const source = await readFile(new URL(`../browser-extension/src/backends/${name}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /chrome\.storage|console\.|translation-server|https:\/\//i);
  }
});
