import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const resolverApi = require("../browser-extension/src/backends/backend-resolver.js");

function backend(name) {
  return { name, probe() {}, check() {}, batchCheck() {}, getCapabilities() {} };
}

test("backend resolver maps auto and enhanced to the enhanced backend", () => {
  const enhancedBackend = backend("enhanced");
  const resolver = resolverApi.createBackendResolver({
    storage: { sync: { get: async () => ({ connectionMode: "auto" }) } },
    enhancedBackend
  });

  assert.deepEqual(resolver.resolveMode("auto"), { mode: "auto", backend: enhancedBackend });
  assert.deepEqual(resolver.resolveMode("enhanced"), { mode: "enhanced", backend: enhancedBackend });
});

test("missing persisted mode uses the auto default", async () => {
  const enhancedBackend = backend("enhanced");
  const resolver = resolverApi.createBackendResolver({
    storage: { sync: { get: async (defaults) => defaults } },
    enhancedBackend
  });

  assert.deepEqual(await resolver.resolve(), { mode: "auto", backend: enhancedBackend });
});

test("invalid persisted modes fall back to auto and resolve to enhanced", async () => {
  const enhancedBackend = backend("enhanced");
  const resolver = resolverApi.createBackendResolver({
    storage: { sync: { get: async () => ({ connectionMode: "future-mode" }) } },
    enhancedBackend
  });

  assert.equal(resolverApi.normalizeConnectionMode("future-mode"), "auto");
  assert.deepEqual(await resolver.resolve(), { mode: "auto", backend: enhancedBackend });
});

test("standard mode returns a stable unavailable backend until it is implemented", async () => {
  const resolver = resolverApi.createBackendResolver({
    storage: { sync: { get: async () => ({ connectionMode: "standard" }) } },
    enhancedBackend: backend("enhanced")
  });
  const resolved = await resolver.resolve();

  assert.equal(resolved.mode, "standard");
  assert.deepEqual(resolved.backend.getCapabilities(), {
    mode: "standard",
    available: false,
    probe: false,
    check: false,
    batchCheck: false
  });
  for (const operation of [
    () => resolved.backend.probe(),
    () => resolved.backend.check({}),
    () => resolved.backend.batchCheck([])
  ]) {
    await assert.rejects(operation, (error) => {
      assert.equal(error.message, "standard_backend_unavailable");
      assert.equal(error.code, "standard_backend_unavailable");
      assert.equal(error.status, 503);
      return true;
    });
  }
});
