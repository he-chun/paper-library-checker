import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const source = async (name) => readFile(
  new URL(`../browser-extension/src/${name}`, import.meta.url),
  "utf8"
);

async function extractSyntheticMdpiCandidate() {
  const html = await readFile(new URL("./fixtures/mdpi-detail.html", import.meta.url), "utf8");
  const url = "https://www.mdpi.com/1/2/3";
  const dom = new JSDOM(html, { url, runScripts: "outside-only" });
  for (const name of [
    "common/normalization.js",
    "extractors/generic.js",
    "extractors/runner.js"
  ]) {
    dom.window.eval(await source(name));
  }
  const result = dom.window.ZoteroCheck.detectAndExtract(dom.window.document, url);
  const candidate = result.candidates.find((entry) => entry.source === "embedded-metadata");
  dom.window.close();
  return candidate;
}

test("MDPI-like metadata is bounded before the production local API request", async () => {
  const candidate = await extractSyntheticMdpiCandidate();
  assert(candidate);
  assert(candidate.creators.length > 20, "fixture must reproduce the unbounded extractor output");

  const token = "a".repeat(64);
  global.chrome = {
    runtime: { id: "extension-id", onMessage: { addListener() {} } },
    storage: {
      sync: { get: async () => ({ endpoint: "http://127.0.0.1:23119/zotero-checker" }) },
      local: { get: async () => ({ token }) }
    }
  };

  const security = require("../zotero-plugin/src/security.js");
  let requestPayload;
  global.fetch = async (_url, options) => {
    requestPayload = JSON.parse(options.body);
    try {
      if (requestPayload.items) {
        security.sanitizeBatch(requestPayload.items);
        return { ok: true, status: 200, json: async () => ({ results: [{ status: "not_found" }] }) };
      }
      security.sanitizeCandidate(requestPayload.item);
      return { ok: true, status: 200, json: async () => ({ status: "not_found" }) };
    } catch (error) {
      return { ok: false, status: error.status || 422, json: async () => ({ error: error.code }) };
    }
  };

  const background = require("../browser-extension/src/background.js");
  await assert.doesNotReject(() => background.callZotero("/check", candidate));
  assert.equal(requestPayload.item.creators.length <= 20, true);
  await assert.doesNotReject(() => background.callZotero("/batch-check", { items: [candidate] }));
  assert.equal(requestPayload.items[0].creators.length <= 20, true);
});
