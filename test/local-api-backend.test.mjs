import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const localApi = require("../browser-extension/src/backends/direct-local-api-backend.js");
const compatibilityLocalApi = require("../browser-extension/src/backends/local-api-backend.js");
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
  assert.deepEqual(await backend.probe(), {
    ok: true,
    version: "3",
    indexReady: true,
    engine: "direct",
    indexState: "unavailable"
  });
  assert.equal(requests[0].url, "http://127.0.0.1:23119/api/");
  assert.equal(requests[0].options.method, "GET");
  assert.deepEqual(requests[0].options.headers, {
    "Zotero-API-Version": "3",
    "Zotero-Allowed-Request": "true"
  });
});

test("probe is not blocked behind an active item query", async () => {
  let releaseItem;
  let probeCompleted = false;
  const backend = localApi.createLocalApiBackend({
    concurrency: 1,
    fetch: async (url, options) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/groups")) return response({ payload: [] });
      if (parsed.pathname === "/api/") return response();
      return new Promise((resolve, reject) => {
        releaseItem = () => resolve(response({ payload: [] }));
        options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
    }
  });

  const itemQuery = backend.check({ title: "Queued article" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const probe = backend.probe().then((result) => {
    probeCompleted = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const completedBeforeRelease = probeCompleted;
  releaseItem();

  await Promise.all([itemQuery, probe]);
  assert.equal(completedBeforeRelease, true);
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
    confidence: 0,
    engine: "direct",
    indexState: "unavailable",
    complete: false,
    reason: "direct_search_no_candidate"
  });
  const url = new URL(requests.find((request) => request.url.includes("/items?" )).url);
  assert.equal(`${url.origin}${url.pathname}`, "http://127.0.0.1:23119/api/users/0/items");
  assert.equal(url.searchParams.get("q"), "Synthetic Article");
  assert.equal(url.searchParams.get("qmode"), "titleCreatorYear");
});

test("a candidate with title and DOI uses the lightweight title query first and still returns an exact DOI match", async () => {
  const requests = [];
  const backend = localApi.createLocalApiBackend({
    fetch: async (url) => {
      const parsed = new URL(url);
      requests.push(parsed);
      if (parsed.pathname.endsWith("/groups")) return response({ payload: [] });
      return response({ payload: parsed.searchParams.get("qmode") === "titleCreatorYear"
        ? [{ data: { itemType: "journalArticle", title: "Exact title", DOI: "10.1000/exact" } }]
        : [] });
    }
  });

  assert.deepEqual(await backend.check({ title: "Exact title", DOI: "10.1000/exact" }), {
    status: "matched",
    matchType: "doi",
    confidence: 1,
    engine: "direct",
    indexState: "unavailable"
  });
  const itemRequests = requests.filter((url) => url.pathname.endsWith("/items"));
  assert.equal(itemRequests.length, 1);
  assert.equal(itemRequests[0].searchParams.get("q"), "Exact title");
  assert.equal(itemRequests[0].searchParams.get("qmode"), "titleCreatorYear");
});

test("title-bearing candidates do not fall through to expensive everything searches", async () => {
  const requests = [];
  const backend = localApi.createLocalApiBackend({
    fetch: async (url) => {
      const parsed = new URL(url);
      requests.push(parsed);
      if (parsed.pathname.endsWith("/groups")) return response({ payload: [] });
      if (parsed.searchParams.get("qmode") === "everything") {
        throw new Error("unexpected expensive identifier fallback");
      }
      return response({ payload: [{
        data: {
          itemType: "journalArticle",
          title: "Different Article",
          DOI: "10.1000/different"
        }
      }] });
    }
  });

  assert.deepEqual(await backend.check({
    title: "Requested Article",
    DOI: "10.1000/requested",
    cnkiFileID: "requested-cnki"
  }), {
    status: "not_found",
    matchType: null,
    confidence: 0,
    engine: "direct",
    indexState: "unavailable",
    complete: false,
    reason: "direct_search_no_candidate"
  });
  const itemRequests = requests.filter((url) => url.pathname.endsWith("/items"));
  assert.equal(itemRequests.length, 1);
  assert.equal(itemRequests[0].searchParams.get("qmode"), "titleCreatorYear");
});

test("identifier-only candidates retain the exact everything-search fallback", async () => {
  const { backend, requests } = backendWithItems([{
    data: { itemType: "journalArticle", DOI: "10.1000/identifier-only" }
  }]);
  assert.equal((await backend.check({ DOI: "10.1000/identifier-only" })).matchType, "doi");
  const url = new URL(requests.find((request) => request.url.includes("/items?")).url);
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
  }), {
    status: "not_found",
    matchType: null,
    confidence: 0,
    engine: "direct",
    indexState: "unavailable",
    complete: false,
    reason: "direct_search_no_candidate"
  });
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
  assert.deepEqual(result, {
    status: "matched",
    matchType: "doi",
    confidence: 1,
    engine: "direct",
    indexState: "unavailable"
  });
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

test("an item-query timeout opens a cooldown without changing the stable error code", async () => {
  let clock = 1000;
  let itemRequests = 0;
  let hang = true;
  const events = [];
  const backend = localApi.createLocalApiBackend({
    now: () => clock,
    timeoutMs: 5,
    timeoutCooldownMs: 100,
    onDiagnostic: (event, details) => events.push({ event, ...details }),
    fetch: async (url, options) => {
      if (new URL(url).pathname.endsWith("/groups")) return response({ payload: [] });
      itemRequests += 1;
      if (!hang) return response({ payload: [] });
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
    }
  });

  await assert.rejects(() => backend.check({ title: "First" }), (error) => error.code === "local_api_timeout");
  await assert.rejects(() => backend.check({ title: "Second" }), (error) => error.code === "local_api_timeout");
  assert.equal(itemRequests, 1);
  assert.equal(events.some((entry) => entry.event === "backend_request_skipped" && entry.error === "local_api_timeout"), true);

  clock += 101;
  hang = false;
  assert.equal((await backend.check({ title: "Third" })).status, "not_found");
  assert.equal(itemRequests, 2);
});

test("Direct capabilities distinguish exact verification from complete recall", async () => {
  const { backend } = backendWithItems([]);
  assert.deepEqual(backend.getCapabilities(), {
    engine: "direct",
    indexState: "unavailable",
    exactIdentifiers: true,
    exactTitle: true,
    fuzzyTitle: false,
    possibleMatch: false,
    batch: true,
    realtimeIndex: false,
    authenticatedProtocol: false,
    exactIdentifierVerification: true,
    completeIdentifierRecall: false,
    exactTitleVerification: true,
    completeNegativeResults: false
  });
  assert.deepEqual(await backend.batchCheck([]), { results: [] });
});

test("legacy Local API module remains a thin CommonJS compatibility entry point", () => {
  assert.equal(compatibilityLocalApi.createLocalApiBackend, localApi.createDirectLocalApiBackend);
  assert.equal(compatibilityLocalApi.CAPABILITIES.engine, "direct");
});

test("Local API code is service-worker-only and contains no storage or logging sink", async () => {
  const manifest = JSON.parse(await readFile(new URL("../browser-extension/manifest.json", import.meta.url)));
  const contentScripts = manifest.content_scripts.flatMap((entry) => entry.js || []);
  assert.equal(contentScripts.some((entry) => entry.includes("backends/local-api")), false);

  for (const name of ["direct-local-api-backend.js", "local-api-backend.js", "local-api-matcher.js"]) {
    const source = await readFile(new URL(`../browser-extension/src/backends/${name}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /chrome\.storage|console\.|translation-server|https:\/\//i);
  }
});
