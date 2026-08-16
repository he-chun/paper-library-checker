import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildVariants, manifestVariant } from "../tools/manual-verification/build-zotero-activation-variants.mjs";
import { inspectZip } from "../scripts/zip.mjs";
import { classifyActivationState } from "../tools/manual-verification/zotero-activation-state.mjs";
import { createResult, validateResult, writeResultAtomic, waitForResult } from "../tools/manual-verification/zotero-activation-result.mjs";
import { loadPublicExportManifest, resolveExportFiles, scanPublicDocument, trackedFiles } from "../scripts/create-public-export.mjs";

test("Zotero manifest compatibility covers the exact diagnostic runtimes", async () => {
  const manifest = JSON.parse(await readFile(new URL("../zotero-plugin/manifest.json", import.meta.url)));
  assert.equal(manifest.applications.zotero.id, "paper-library-checker@he-chun.github.io");
  assert.equal(manifest.version, "0.3.0");
  assert.equal(manifest.applications.zotero.update_url, "https://raw.githubusercontent.com/he-chun/paper-library-checker/main/updates.json");
  assert.equal(manifest.applications.zotero.strict_min_version, "9.0");
  assert.equal(manifest.applications.zotero.strict_max_version, "9.0.*");
  const rdf = await readFile(new URL("../zotero-plugin/install.rdf", import.meta.url), "utf8");
  assert.match(rdf, /<em:id>paper-library-checker@he-chun\.github\.io<\/em:id>/);
  assert.match(rdf, /<em:maxVersion>9\.0\.\*<\/em:maxVersion>/);
});

test("activation variants are isolated, rooted correctly, and local-only", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "plc-variants-"));
  try {
    const inventory = await buildVariants(directory);
    assert.equal(inventory.length, 9);
    for (const file of (await readdir(directory)).filter(name => name.endsWith(".xpi"))) {
      const result = inspectZip(await readFile(path.join(directory, file)));
      assert(result.entries.includes("manifest.json"));
      assert(result.entries.includes("LICENSE"));
      assert(result.entries.includes("THIRD_PARTY_NOTICES.md"));
      assert.equal(result.entries.some(name => name.startsWith("tools/")), false);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("variant compatibility changes do not mutate the product ID", () => {
  const base = { name: "Product", applications: { zotero: { id: "product", strict_min_version: "6.999", strict_max_version: "8.0.*" } } };
  const variant = manifestVariant(base, "test", { strict_min_version: "7.0" });
  assert.notEqual(variant.applications.zotero.id, base.applications.zotero.id);
  assert.equal(base.applications.zotero.strict_min_version, "6.999");
});

test("activation probe does not block on a running startup marker", async () => {
  const source = await readFile(new URL("../tools/manual-verification/run-zotero-activation-probe.ps1", import.meta.url), "utf8");
  assert.doesNotMatch(source, /ISOLATED_PROFILE_STARTUP_INCOMPLETE/);
  assert.match(source, /STARTUP_MARKER_EXPECTED_WHILE_RUNNING/);
  assert.doesNotMatch(source, /Get-Content[^\n]*extensions\.json/i);
  assert.doesNotMatch(source, /sourceURI|addon path|profile path/i);
  assert.doesNotMatch(source, /Stop-Process|taskkill/i);
});

test("diagnostic canary targets Zotero 9 without changing the product manifest", async () => {
  const canary = JSON.parse(await readFile(new URL("../tools/manual-verification/zotero-canary/manifest.json", import.meta.url)));
  const product = JSON.parse(await readFile(new URL("../zotero-plugin/manifest.json", import.meta.url)));
  assert.equal(canary.applications.zotero.strict_min_version, "9.0");
  assert.equal(canary.applications.zotero.strict_max_version, "9.0.*");
  assert.equal(canary.applications.zotero.update_url, "https://example.invalid/paper-library-checker-canary-updates.json");
  assert.equal(product.applications.zotero.strict_max_version, "9.0.*");
  const bootstrap = await readFile(new URL("../tools/manual-verification/zotero-canary/bootstrap.js", import.meta.url), "utf8");
  assert.match(bootstrap, /IOUtils\.writeJSON[\s\S]*tmpPath[\s\S]*flush:\s*true/);
  assert.match(bootstrap, /containsPrivatePath:\s*false/);
  assert.doesNotMatch(bootstrap, /\b(?:alert|confirm|prompt)\s*\(|Services\.prompt|openDialog|nsIPromptService/i);
});

test("startup marker while running is expected rather than blocked", () => {
  assert.equal(classifyActivationState({ profileLocalDirResolved: true, running: true, startupMarkerExists: true }).startupMarkerStatus,
    "STARTUP_MARKER_EXPECTED_WHILE_RUNNING");
});

test("cleanup anomaly is independent from canary status", () => {
  const result = classifyActivationState({ profileLocalDirResolved: true, running: false, startupMarkerExists: true, canary: { installed: true, active: true, startupCalled: true, restartPassed: true, disableEnablePassed: true, uninstallPassed: true } });
  assert.equal(result.startupMarkerStatus, "STARTUP_CANARY_CLEANUP_ANOMALY");
  assert.equal(result.canaryStatus, "CANARY_STARTUP_PASS");
  assert.equal(result.productTestAllowed, true);
});

test("canary failure reports the exact Add-on Manager boundary", () => {
  assert.equal(classifyActivationState({ profileLocalDirResolved: true, canary: { installed: false } }).canaryStatus, "CANARY_INSTALL_REJECTED");
  assert.equal(classifyActivationState({ profileLocalDirResolved: true, canary: { installed: true, active: false } }).canaryStatus, "CANARY_INSTALLED_INACTIVE");
  assert.equal(classifyActivationState({ profileLocalDirResolved: true, canary: { installed: true, active: true, startupCalled: false } }).canaryStatus, "CANARY_STARTUP_NOT_CALLED");
});

test("marker-only evidence cannot block the harness", () => {
  const result = classifyActivationState({ profileLocalDirResolved: true, running: false, startupMarkerExists: true });
  assert.equal(result.harnessStatus, "PRODUCT_TEST_NOT_STARTED");
});

test("unresolved ProfLD has a dedicated state", () => {
  assert.equal(classifyActivationState({ profileLocalDirResolved: false }).harnessStatus, "PROFILE_LOCAL_DIR_UNRESOLVED");
});

test("public export documents pass the unified privacy scanner", async () => {
  const repository = fileURLToPath(new URL("..", import.meta.url));
  const manifest = await loadPublicExportManifest(repository);
  const files = resolveExportFiles(manifest, await trackedFiles(repository));
  for (const name of files.filter((entry) => /\.(?:md|json)$/i.test(entry))) {
    scanPublicDocument(name, await readFile(new URL(`../${name}`, import.meta.url)));
  }
  const syntheticGitHubToken = ["ghp", "_", "1".repeat(30)].join("");
  for (const value of ["C:\\private\\profile", "file:///private/profile", "user@example.invalid", syntheticGitHubToken]) {
    assert.throws(() => scanPublicDocument("synthetic.md", value), /Private content/);
  }
});

test("manual verification harnesses contain no modal APIs", async () => {
  const roots = [new URL("../tools/manual-verification/", import.meta.url)];
  for (const root of roots) {
    for (const name of await readdir(root)) {
      if (!/\.(?:js|mjs|ps1|py)$/.test(name) || name.endsWith(".local.js")) continue;
      const source = await readFile(new URL(name, root), "utf8");
      assert.doesNotMatch(source, /\b(?:alert|confirm|prompt)\s*\(|Services\.prompt|openDialog|nsIPromptService|MessageBox/i, name);
    }
  }
});

test("Zotero XPI installer binds the reviewed hash and records only local-safe output", async () => {
  const source = await readFile(new URL("../tools/manual-verification/install-zotero-plugin.py", import.meta.url), "utf8");
  assert.match(source, /hashlib\.sha256/);
  assert.match(source, /XPI_SHA256_MISMATCH/);
  assert.match(source, /FILE_NAME_CONTROL_ID\s*=\s*1148/);
  assert.match(source, /OPEN_CONTROL_ID\s*=\s*1/);
  assert.match(source, /--accept-install/);
  assert.match(source, /os\.replace\(/);
  assert.match(source, /containsPrivatePath["']:\s*False/);
  assert.doesNotMatch(source, /taskkill|Stop-Process|TerminateProcess|process\.kill/i);
});

test("offline Zotero profile installer binds the XPI and never force-kills Zotero", async () => {
  const source = await readFile(new URL("../tools/manual-verification/install-zotero-plugin-profile.py", import.meta.url), "utf8");
  assert.match(source, /XPI_SHA256_MISMATCH/);
  assert.match(source, /ZOTERO_GRACEFUL_EXIT_TIMEOUT/);
  assert.match(source, /PostMessage\(handle, win32con\.WM_CLOSE/);
  assert.match(source, /wait_for_health\(expected_status/);
  assert.match(source, /"containsPrivatePath": False/);
  assert.doesNotMatch(source, /(?:taskkill|Stop-Process|\.kill\(|terminate\()/i);
});

test("canary install inspector is non-modal and records only allowlisted state", async () => {
  const source = await readFile(new URL("../tools/manual-verification/zotero-canary-install-inspector.js", import.meta.url), "utf8");
  assert.match(source, /AddonManager\.addInstallListener/);
  assert.match(source, /IOUtils\.writeJSON[\s\S]*tmpPath[\s\S]*flush:\s*true/);
  assert.match(source, /containsPrivatePath:\s*false/);
  assert.doesNotMatch(source, /sourceURI|profilePath|stack|rawBody|signature|nonce/i);
  assert.doesNotMatch(source, /\b(?:alert|confirm|prompt)\s*\(|Services\.prompt|openDialog|MessageBox/i);
});

test("canary variant builder keeps diagnostic artifacts local-only", async () => {
  const source = await readFile(new URL("../tools/manual-verification/build-zotero-canary-variants.mjs", import.meta.url), "utf8");
  assert.match(source, /tools["'],\s*["']manual-verification["'],\s*["']results/);
  assert.match(source, /variant-a-original/);
  assert.match(source, /strict_max_version:\s*"9\.\*"/);
  assert.doesNotMatch(source, /zotero-plugin|browser-extension/);
});

test("activation result writer is atomic, non-modal, and rejects private data", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "plc-result-"));
  const file = path.join(directory, "probe.local.json");
  try {
    const result = createResult({ testRunId: "PLC-ACTIVATION-001", zoteroVersion: "9.0.6", phase: "canary", status: "PASS", observations: { installed: true } });
    await writeResultAtomic(file, result);
    assert.deepEqual(validateResult(JSON.parse(await readFile(file, "utf8"))), result);
    assert.equal((await readdir(directory)).some(name => name.endsWith(".tmp")), false);
    for (const value of ["C:\\private", "file:///private", "pairingSecret", "nonce", "signature", "rawBody", "sourceURI", "profilePath"]) {
      assert.throws(() => validateResult({ ...result, observations: { value } }));
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("result watcher times out without process-control APIs", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "plc-watch-"));
  try {
    await assert.rejects(() => waitForResult(path.join(directory, "missing.local.json"), { timeoutMs: 20, pollMs: 5 }), /RESULT_FILE_TIMEOUT/);
    const source = await readFile(new URL("../tools/manual-verification/watch-zotero-activation-result.mjs", import.meta.url), "utf8");
    assert.doesNotMatch(source, /kill\s*\(|taskkill|Stop-Process|process\.kill|child_process/i);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("product classification is gated on canary PASS", () => {
  assert.equal(classifyActivationState({ profileLocalDirResolved: true, canary: { installed: false } }).productTestAllowed, false);
  assert.equal(classifyActivationState({ profileLocalDirResolved: true, canary: { installed: true, active: true, startupCalled: true, restartPassed: true, disableEnablePassed: true, uninstallPassed: true } }).productTestAllowed, true);
});

test("product appDisabled is classified as compatibility rejection", () => {
  const result = classifyActivationState({ profileLocalDirResolved: true, canary: { installed: true, active: true, startupCalled: true, restartPassed: true, disableEnablePassed: true, uninstallPassed: true }, product: { installed: true, appDisabled: true, compatibilityReason: "strict_max_version" } });
  assert.equal(result.productStatus, "PRODUCT_COMPATIBILITY_RANGE_REJECTION");
});
