import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const localApi = require("../browser-extension/src/backends/direct-local-api-backend.js");

function response({ status = 200, payload = [], headers = {}, jsonError } = {}) {
  const normalized = Object.fromEntries(Object.entries({ "Zotero-API-Version": "3", ...headers })
    .map(([key, value]) => [key.toLowerCase(), String(value)]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => normalized[String(name).toLowerCase()] || null },
    json: async () => {
      if (jsonError) throw jsonError;
      return payload;
    }
  };
}

test("index source reuses the fixed loopback transport for probe, groups, and top-level pages", async () => {
  const requests = [];
  const backend = localApi.createDirectLocalApiBackend({
    fetch: async (url, options) => {
      requests.push({ url, options });
      const parsed = new URL(url);
      if (parsed.pathname === "/api/") {
        return response({ headers: { "Zotero-Schema-Version": "38", "Zotero-Instance-ID": "INSTANCE-1234" } });
      }
      if (parsed.pathname.endsWith("/users/0/groups")) return response({ payload: [{ id: 7 }, { data: { id: 9 } }] });
      return response({
        payload: [{ key: "ITEM", data: { itemType: "book", title: "Title" } }],
        headers: { "Total-Results": "501", "Last-Modified-Version": "42" }
      });
    }
  });
  const source = backend.createIndexSource();

  assert.deepEqual(await source.probe(), {
    apiVersion: "3",
    schemaVersion: "38",
    instanceIdentifier: "INSTANCE-1234"
  });
  assert.deepEqual(await source.discoverGroupIDs(), ["7", "9"]);
  const page = await source.readLibraryPage("groups/7", { start: 250, limit: 250 });
  assert.equal(page.items.length, 1);
  assert.equal(page.totalItems, 501);
  assert.equal(page.sourceVersion, 42);

  const pageUrl = new URL(requests[2].url);
  assert.equal(pageUrl.origin, "http://127.0.0.1:23119");
  assert.equal(pageUrl.pathname, "/api/groups/7/items/top");
  assert.equal(pageUrl.searchParams.get("include"), "data");
  assert.equal(pageUrl.searchParams.get("itemType"), "-attachment");
  assert.equal(pageUrl.searchParams.get("start"), "250");
  assert.equal(pageUrl.searchParams.get("limit"), "250");
  for (const request of requests) {
    assert.equal(request.options.method, "GET");
    assert.deepEqual(request.options.headers, {
      "Zotero-API-Version": "3",
      "Zotero-Allowed-Request": "true"
    });
  }
});

test("index source preserves Local API timeout, disabled, and malformed JSON errors", async () => {
  const disabled = localApi.createDirectLocalApiBackend({ fetch: async () => response({ status: 403 }) });
  await assert.rejects(() => disabled.createIndexSource().probe(), (error) => error.code === "local_api_disabled");

  const malformed = localApi.createDirectLocalApiBackend({
    fetch: async () => response({ jsonError: new SyntaxError("bad json") })
  });
  await assert.rejects(
    () => malformed.createIndexSource().discoverGroupIDs(),
    (error) => error.code === "local_api_malformed_response"
  );

  const timedOut = localApi.createDirectLocalApiBackend({
    timeoutMs: 5,
    fetch: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    })
  });
  await assert.rejects(
    () => timedOut.createIndexSource().readLibraryPage("users/0"),
    (error) => error.code === "local_api_timeout"
  );
});

test("probe bypasses an active index page while page work remains single-lane", async () => {
  let releasePage;
  let probeCompleted = false;
  const backend = localApi.createDirectLocalApiBackend({
    concurrency: 1,
    fetch: async (url, options) => {
      if (new URL(url).pathname === "/api/") return response();
      return new Promise((resolve, reject) => {
        releasePage = () => resolve(response());
        options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
    }
  });
  const source = backend.createIndexSource();
  const page = source.readLibraryPage("users/0");
  await new Promise((resolve) => setTimeout(resolve, 0));
  const probe = source.probe().then(() => { probeCompleted = true; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(probeCompleted, true);
  releasePage();
  await Promise.all([page, probe]);
});

test("index source rejects arbitrary library paths and unbounded pages", async () => {
  const source = localApi.createDirectLocalApiBackend({ fetch: async () => response() }).createIndexSource();
  await assert.rejects(() => source.readLibraryPage("users/1"), /invalid_local_api_library/);
  await assert.rejects(() => source.readLibraryPage("groups/7/../../secret"), /invalid_local_api_library/);
  await assert.rejects(() => source.readLibraryPage("users/0", { limit: 1001 }), /invalid_local_api_page/);
  await assert.rejects(() => source.readLibraryPage("users/0", { limit: 0 }), /invalid_local_api_page/);
});

test("missing result-count headers remain unknown instead of truncating pagination", async () => {
  const source = localApi.createDirectLocalApiBackend({
    fetch: async () => response({ payload: [{ key: "ITEM" }] })
  }).createIndexSource();
  const page = await source.readLibraryPage("users/0", { start: 0, limit: 250 });
  assert.equal(page.totalItems, null);
  assert.equal(page.sourceVersion, null);
});
