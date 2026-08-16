import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const options = require("../browser-extension/src/options.js");

test("options endpoint validation matches granted loopback permissions", () => {
  assert.equal(options.validateEndpoint("http://127.0.0.1:23119/zotero-checker"), "http://127.0.0.1:23119/zotero-checker");
  assert.equal(options.validateEndpoint("http://localhost:23119/zotero-checker/"), "http://localhost:23119/zotero-checker");
  assert.throws(() => options.validateEndpoint("http://[::1]:23119/zotero-checker"));
  assert.throws(() => options.validateEndpoint("https://127.0.0.1:23119/zotero-checker"));
  assert.throws(() => options.validateEndpoint("http://example.test/zotero-checker"));
});

test("connection errors distinguish authentication, rate, service, and protocol states", () => {
  assert.match(options.connectionMessage(401, {}), /Pairing failed/);
  assert.match(options.connectionMessage(401, { error: "protocol_incompatible" }), /Protocol incompatible/);
  assert.match(options.connectionMessage(429, {}), /Too many requests/);
  assert.match(options.connectionMessage(503, { error: "pairing_not_configured" }), /not paired/);
  assert.match(options.connectionMessage(503, {}), /temporarily unavailable/);
});
