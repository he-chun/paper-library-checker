import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const resolverApi = require("../browser-extension/src/backends/backend-resolver.js");

function backend(name, { probeResult, probeError } = {}) {
  const calls = [];
  return {
    name,
    calls,
    async probe() {
      calls.push("probe");
      if (probeError) throw probeError;
      return probeResult;
    },
    check() {},
    batchCheck() {},
    getCapabilities() {}
  };
}

function createResolver(connectionMode, enhancedBackend, standardBackend) {
  return resolverApi.createBackendResolver({
    storage: { sync: { get: async (defaults) => connectionMode == null ? defaults : { connectionMode } } },
    enhancedBackend,
    standardBackend,
    getExtensionVersion: () => "0.4.1"
  });
}

test("auto prefers a healthy compatible enhanced backend", async () => {
  const enhancedBackend = backend("enhanced", {
    probeResult: { ok: true, version: "0.4.1", indexReady: true }
  });
  const standardBackend = backend("standard", {
    probeResult: { ok: true, version: "3", indexReady: true }
  });
  const resolved = await createResolver("auto", enhancedBackend, standardBackend).resolve();

  assert.equal(resolved.mode, "auto");
  assert.equal(resolved.selectedMode, "enhanced");
  assert.equal(resolved.backend, enhancedBackend);
  assert.deepEqual(enhancedBackend.calls, ["probe"]);
  assert.deepEqual(standardBackend.calls, []);
  assert.equal(resolved.degradedReason, undefined);
});

test("auto falls back to standard and reports why enhanced degraded", async () => {
  const enhancedError = Object.assign(new Error("invalid_signature"), { code: "invalid_signature" });
  const enhancedBackend = backend("enhanced", { probeError: enhancedError });
  const standardBackend = backend("standard", {
    probeResult: { ok: true, version: "3", indexReady: true }
  });
  const resolved = await createResolver("auto", enhancedBackend, standardBackend).resolve();

  assert.equal(resolved.selectedMode, "standard");
  assert.equal(resolved.backend, standardBackend);
  assert.equal(resolved.degradedReason, "invalid_signature");
  assert.deepEqual(enhancedBackend.calls, ["probe"]);
  assert.deepEqual(standardBackend.calls, ["probe"]);
});

test("auto rejects incompatible or unready enhanced health before fallback", async () => {
  for (const [probeResult, reason] of [
    [{ ok: true, version: "0.4.0", indexReady: true }, "enhanced_backend_incompatible"],
    [{ ok: true, version: "0.4.1", indexReady: false }, "enhanced_index_unavailable"]
  ]) {
    const enhancedBackend = backend("enhanced", { probeResult });
    const standardBackend = backend("standard", {
      probeResult: { ok: true, version: "3", indexReady: true }
    });
    const resolved = await createResolver("auto", enhancedBackend, standardBackend).resolve();
    assert.equal(resolved.selectedMode, "standard");
    assert.equal(resolved.degradedReason, reason);
  }
});

test("explicit enhanced mode never probes or falls back to standard", async () => {
  const enhancedBackend = backend("enhanced", { probeError: new Error("offline") });
  const standardBackend = backend("standard", {
    probeResult: { ok: true, version: "3", indexReady: true }
  });
  const resolved = await createResolver("enhanced", enhancedBackend, standardBackend).resolve();

  assert.equal(resolved.backend, enhancedBackend);
  assert.equal(resolved.selectedMode, "enhanced");
  assert.deepEqual(enhancedBackend.calls, []);
  assert.deepEqual(standardBackend.calls, []);
});

test("explicit standard mode never probes enhanced", async () => {
  const enhancedBackend = backend("enhanced", {
    probeResult: { ok: true, version: "0.4.1", indexReady: true }
  });
  const standardBackend = backend("standard");
  const resolved = await createResolver("standard", enhancedBackend, standardBackend).resolve();

  assert.equal(resolved.backend, standardBackend);
  assert.equal(resolved.selectedMode, "standard");
  assert.deepEqual(enhancedBackend.calls, []);
  assert.deepEqual(standardBackend.calls, []);
});

test("missing and invalid persisted modes normalize to auto", async () => {
  for (const mode of [undefined, "future-mode"]) {
    const enhancedBackend = backend("enhanced", {
      probeResult: { ok: true, version: "0.4.1", indexReady: true }
    });
    const resolved = await createResolver(mode, enhancedBackend, backend("standard")).resolve();
    assert.equal(resolved.mode, "auto");
    assert.equal(resolved.selectedMode, "enhanced");
  }
  assert.equal(resolverApi.normalizeConnectionMode("future-mode"), "auto");
});
