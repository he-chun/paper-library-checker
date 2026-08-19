import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createBrowserSnippet, evaluateBrowserBatch, evaluateBrowserDetail } from "../tools/manual-verification/make-browser-marker-snippet.mjs";
import { createMarker, evaluateObservation, executeProbe, formatProbeOutput, parseArguments, validateEndpoint, writeProbeResult } from "../tools/manual-verification/plc-debug-probe.mjs";
import { scanFiles, scanLogText, validateProbeResult } from "../tools/manual-verification/scan-zotero-debug-log.mjs";
import { createRequestBodies, createSyntheticData } from "../tools/manual-verification/synthetic-data.mjs";
import { evaluateEdgeCleanProfile, evaluateExactArtifactReuse, validateRuntimeResultSchema } from "../tools/manual-verification/runtime-evidence-policy.mjs";
import { createCaptureSnippets, validateCaptureBinding } from "../tools/manual-verification/generate-zotero-core-capture-snippets.mjs";
import vm from "node:vm";

const require = createRequire(import.meta.url); const auth = require("../browser-extension/src/common/request-auth.js");
const SECRET = randomBytes(32).toString("hex"); const MARKER = "PLC-DEBUG-20990101000000-0011223344556677"; const NOW = 4070908800;
const START = "2099-01-01T00:00:00.000Z"; const END = "2099-01-01T00:00:02.000Z";
function response(status, error) { return { status, async json() { return error ? { error } : { ok: true }; } }; }
function mockEndpoint() {
  const seen = new Set(); const calls = [];
  return { calls, async fetch(url, init) {
    const pathname = new URL(url).pathname; const body = init.body || ""; const headers = init.headers; calls.push({ pathname, body, headers });
    const actualHash = await auth.sha256Hex(new TextEncoder().encode(body)); if (actualHash !== headers["X-PLC-Body-SHA256"]) return response(401, "body_hash_mismatch");
    const timestamp = Number(headers["X-PLC-Timestamp"]); if (Math.abs(NOW - timestamp) > 60) return response(401, "timestamp_expired");
    const nonce = headers["X-PLC-Nonce"]; if (seen.has(nonce)) return response(401, "nonce_replayed"); seen.add(nonce);
    const canonical = auth.canonicalize({ method: init.method, path: pathname, timestamp, nonce, bodyHash: actualHash });
    assert.equal(headers["X-PLC-Signature"], await auth.hmacBase64Url(SECRET, canonical)); return response(200);
  }};
}
async function resultRecord() {
  const probe = await executeProbe({ secret: SECRET, markerId: MARKER, nowSeconds: NOW, fetchImpl: mockEndpoint().fetch });
  return { schemaVersion: 2, markerId: MARKER, syntheticValues: { title: probe.synthetic.title, DOI: probe.synthetic.DOI, creator: probe.synthetic.creator, URL: probe.synthetic.URL }, secretFingerprint: createHash("sha256").update(SECRET).digest("hex"), startedAt: START, endedAt: END,
    reviewedCommitSha: "1".repeat(40), xpiSha256: "2".repeat(64), extensionZipSha256: "3".repeat(64), isolatedProfile: true,
    observations: Object.fromEntries(Object.entries(probe.observations).map(([name, value]) => [name, { status: value.status, code: value.code, passed: true }])), requestTraces: probe.requestTraces };
}
function coreLog(result) {
  const [health, check, batch] = ["health", "check", "batch"].map(name => result.requestTraces.find(trace => trace.caseName === name));
  return [START, "X-PLC-Protocol: 1", `GET ${health.path}`, `X-PLC-Timestamp: ${health.timestamp}`, `X-PLC-Nonce: ${health.nonce}`, `X-PLC-Body-SHA256: ${health.bodySha256}`,
    `POST ${check.path}`, `X-PLC-Timestamp: ${check.timestamp}`, `X-PLC-Nonce: ${check.nonce}`, `X-PLC-Body-SHA256: ${check.bodySha256}`, `POST ${batch.path}`].join("\n");
}
function coreTraceBlock(trace, requestPath = trace.path, overrides = {}) {
  return [
    `${trace.method} ${requestPath}`,
    `X-PLC-Timestamp: ${overrides.timestamp ?? trace.timestamp}`,
    `X-PLC-Nonce: ${overrides.nonce ?? trace.nonce}`,
    `X-PLC-Body-SHA256: ${overrides.bodySha256 ?? trace.bodySha256}`
  ].join("\n");
}
function coreLogWithoutISO(result, overrides = {}) {
  const trace = result.requestTraces.find(item => item.caseName === "health");
  return [
    "X-PLC-Protocol: 1",
    coreTraceBlock(trace, overrides.requestPath ?? trace.path, overrides),
    "GET /zotero-checker/health",
    "POST /zotero-checker/check",
    "POST /zotero-checker/batch-check"
  ].join("\n");
}

test("probe records safe same-run request trace evidence", async () => {
  const endpoint = mockEndpoint(); const result = await executeProbe({ secret: SECRET, markerId: MARKER, nowSeconds: NOW, fetchImpl: endpoint.fetch });
  assert.deepEqual(endpoint.calls.map(call => call.pathname), ["/zotero-checker/health", "/zotero-checker/check", "/zotero-checker/batch-check", "/zotero-checker/check", "/zotero-checker/check", "/zotero-checker/check"]);
  assert.equal(result.requestTraces.length, 6); assert(result.requestTraces.every(trace => /^[a-f0-9]{64}$/.test(trace.signatureSha256) && trace.casePassed));
  assert.equal(JSON.stringify(result).includes(SECRET), false); assert.match(formatProbeOutput(result).text, /OVERALL PASS/);
});

test("probe output sanitizes server text and result contains no long-term secret or full signature", async () => {
  const endpoint = mockEndpoint(); const original = endpoint.fetch; endpoint.fetch = async (url, init) => new URL(url).pathname.endsWith("/health") ? response(500, `unsafe ${SECRET}`) : original(url, init);
  const probe = await executeProbe({ secret: SECRET, markerId: MARKER, nowSeconds: NOW, fetchImpl: endpoint.fetch }); assert.equal(formatProbeOutput(probe).text.includes(SECRET), false);
  const directory = await mkdtemp(path.join(tmpdir(), "plc-probe-"));
  try { const file = path.join(directory, "probe.local.json"); await writeProbeResult(file, { ...await resultRecord(), synthetic: createSyntheticData(MARKER) }); const text = await readFile(file, "utf8"); assert.equal(text.includes(SECRET), false); assert.equal(text.includes("X-PLC-Signature"), false); } finally { await rm(directory, { recursive: true, force: true }); }
});

test("scanner blocks empty, whitespace, unrelated, stale, partial, and health-only logs", async () => {
  const result = await resultRecord();
  for (const log of ["", "   \r\n", "unrelated log", "2098-01-01T00:00:00.000Z GET /zotero-checker/health", `${START}\nX-PLC-Protocol: 1`, `${START}\nX-PLC-Protocol: 1\nGET /zotero-checker/health`]) assert.equal(scanLogText(log, result).overallStatus, "BLOCKED");
});

test("invalid, stale, mismatched, or incomplete probe results are BLOCKED", async () => {
  const valid = await resultRecord();
  for (const mutation of [r => { r.schemaVersion = 1; }, r => { r.markerId = "PLC-DEBUG-20990101000000-FFFFFFFFFFFFFFFF"; }, r => { delete r.observations.batch; }, r => { r.startedAt = END; r.endedAt = START; }, r => { r.reviewedCommitSha = "bad"; }, r => { r.requestTraces[0].bodySha256 = "0".repeat(64); }]) {
    const result = structuredClone(valid); mutation(result); assert.equal(scanLogText(coreLog(valid), result).overallStatus, "BLOCKED");
  }
  assert.equal(validateProbeResult(valid).valid, true);
});

test("forbidden value wins over missing coverage", async () => {
  const result = await resultRecord(); const report = scanLogText(`unrelated ${result.syntheticValues.title}`, result); assert.equal(report.leakageStatus, "FAIL"); assert.equal(report.coverageStatus, "BLOCKED"); assert.equal(report.overallStatus, "FAIL");
});

test("zotero-core passes only with matching time, path, protocol, nonce, body hash, and all primary paths", async () => {
  const result = await resultRecord(); const report = scanLogText(coreLog(result), result); assert.equal(report.leakageStatus, "PASS"); assert.equal(report.coverageStatus, "PASS"); assert.equal(report.overallStatus, "PASS");
});

test("zotero-core accepts an exact trace tuple without an ISO line prefix", async () => {
  const result = await resultRecord();
  const report = scanLogText(coreLogWithoutISO(result), result);
  assert.equal(report.coverageStatus, "PASS");
  assert.equal(report.overallStatus, "PASS");
});

test("zotero-core binds timestamp, nonce, body hash, and path to one request", async () => {
  const result = await resultRecord();
  const trace = result.requestTraces.find(item => item.caseName === "health");
  const wrongPath = [START, "X-PLC-Protocol: 1", coreTraceBlock(trace, "/zotero-checker/not-the-trace-path"),
    "GET /zotero-checker/health", "POST /zotero-checker/check", "POST /zotero-checker/batch-check"].join("\n");
  assert.equal(scanLogText(wrongPath, result).coverageStatus, "BLOCKED");
  assert.equal(scanLogText(coreLogWithoutISO(result, { nonce: "f".repeat(32) }), result).coverageStatus, "BLOCKED");
  assert.equal(scanLogText(coreLogWithoutISO(result, { timestamp: trace.timestamp - 600 }), result).coverageStatus, "BLOCKED");
  assert.equal(scanLogText(`${START}\nX-PLC-Protocol: 1\nGET /zotero-checker/health\nPOST /zotero-checker/check\nPOST /zotero-checker/batch-check`, result).coverageStatus, "BLOCKED");
});

test("forbidden value overrides exact core trace coverage", async () => {
  const result = await resultRecord();
  const report = scanLogText(`${coreLogWithoutISO(result)}\n${result.syntheticValues.title}`, result);
  assert.equal(report.coverageStatus, "PASS");
  assert.equal(report.leakageStatus, "FAIL");
  assert.equal(report.overallStatus, "FAIL");
});

test("browser console requires exact marker plus detail and batch PASS", async () => {
  const result = await resultRecord();
  assert.equal(scanLogText(`PLC_BROWSER_MARKER ${MARKER} DETAIL PASS BATCH PASS`, result, "browser-console").overallStatus, "PASS");
  assert.equal(scanLogText(`PLC_BROWSER_MARKER ${MARKER} DETAIL FAIL BATCH PASS`, result, "browser-console").overallStatus, "FAIL");
  for (const log of [`PLC_BROWSER_MARKER ${MARKER} DETAIL PASS`, `PLC_BROWSER_MARKER PLC-DEBUG-20990101000000-FFFFFFFFFFFFFFFF DETAIL PASS BATCH PASS`]) assert.equal(scanLogText(log, result, "browser-console").overallStatus, "BLOCKED");
});

test("browser snippet validates production callback envelopes, result statuses, and batch count", async () => {
  const snippet = createBrowserSnippet(await resultRecord()); assert.match(snippet, /PLC_BROWSER_MARKER/); assert.match(snippet, /setTimeout/); assert.match(snippet, /batch\?\.result\?\.results/); assert.match(snippet, /batchResults\.length === 2/); assert.match(snippet, /possible_match/); assert.equal(snippet.includes(SECRET), false); assert.equal(snippet.includes("fetch("), false);
  assert.equal(evaluateBrowserDetail({ ok: true, result: { status: "error" } }), false);
  assert.equal(evaluateBrowserDetail({ ok: true, result: { status: "matched" } }), true);
  assert.equal(evaluateBrowserBatch({ ok: true, results: [{ status: "matched" }, { status: "possible_match" }] }, 2), false);
  assert.equal(evaluateBrowserBatch({ ok: true, result: { results: [{ status: "not_found" }] } }, 2), false);
  assert.equal(evaluateBrowserBatch({ ok: true, result: { results: [{ status: "matched" }, { status: "possible_match" }] } }, 2), true);
});

test("project log requires isolated-profile result, valid format, and in-window line", async () => {
  const result = await resultRecord(); assert.equal(scanLogText(`${START} [INFO] synthetic verification session`, result, "project").overallStatus, "PASS"); assert.equal(scanLogText("2098-01-01T00:00:00.000Z [INFO] old", result, "project").overallStatus, "BLOCKED");
});

test("project log accepts normalized bracketed and unbracketed UTC timestamps", async () => {
  const result = await resultRecord();
  for (const log of [`[${START}] [INFO] bracketed`, `${START} [WARN] unbracketed`]) {
    const report = scanLogText(log, result, "project");
    assert.equal(report.coverageStatus, "PASS");
    assert.equal(report.evidence.timestampsParsed, 1);
    assert.equal(report.evidence.timestampsInWindow, 1);
  }
});

test("project log rejects stale, malformed, level-less, and empty evidence", async () => {
  const result = await resultRecord();
  for (const log of ["[2098-01-01T00:00:00.000Z] [INFO] stale", `[${START} [INFO] malformed`, `[${START}] message without level`, ""]) {
    assert.equal(scanLogText(log, result, "project").coverageStatus, "BLOCKED");
  }
});

test("forbidden value overrides valid bracketed project evidence", async () => {
  const result = await resultRecord();
  const report = scanLogText(`[${START}] [ERROR] ${result.syntheticValues.DOI}`, result, "project");
  assert.equal(report.coverageStatus, "PASS");
  assert.equal(report.overallStatus, "FAIL");
});

test("scanner catches case/JSON escaped values, raw body, bearer header, secret, and marker where forbidden", async () => {
  const result = await resultRecord(); const { checkBody } = createRequestBodies(createSyntheticData(MARKER));
  const log = [result.syntheticValues.title.toUpperCase(), JSON.stringify(result.syntheticValues.DOI).slice(1, -1), result.syntheticValues.creator, result.syntheticValues.URL, checkBody, "X-Paper-Library-Checker-Token", SECRET.toUpperCase(), MARKER].join("\n");
  const report = scanLogText(log, result, "project"); assert.equal(report.overallStatus, "FAIL"); assert(Object.values(report.findings).every(Boolean));
  assert.equal(scanLogText(`PLC_BROWSER_MARKER ${MARKER} DETAIL PASS BATCH PASS`, result, "browser-console").findings.syntheticMarker, false);
});

test("scanFiles blocks malformed result JSON and CLI helpers remain constrained", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "plc-scan-"));
  try { const log = path.join(directory, "log"); const result = path.join(directory, "result"); await Promise.all([writeFile(log, "anything"), writeFile(result, "{")]); assert.equal((await scanFiles(log, result)).overallStatus, "BLOCKED"); } finally { await rm(directory, { recursive: true, force: true }); }
  assert.equal(validateEndpoint("http://127.0.0.1:23119/zotero-checker"), "http://127.0.0.1:23119/zotero-checker"); assert.throws(() => validateEndpoint("http://example.test/zotero-checker")); assert.notEqual(createMarker(), createMarker()); assert.throws(() => parseArguments(["--secret", SECRET]), /usage/);
  assert.equal(parseArguments(["--isolated-profile"]).metadata.isolatedProfile, true);
});

test("scanner implementation is local-only", async () => { const source = await readFile(new URL("../tools/manual-verification/scan-zotero-debug-log.mjs", import.meta.url), "utf8"); assert.doesNotMatch(source, /\bfetch\s*\(/); assert.doesNotMatch(source, /https?:\/\//); });

async function coreCaptureHarness({ version = "9.0.6", level = 5, removeListener = true } = {}) {
  const source = await readFile(new URL("../tools/manual-verification/zotero-core-debug-capture.js", import.meta.url), "utf8");
  const listeners = new Set(); const files = new Map();
  const context = vm.createContext({
    Date, Uint8Array, JSON, String, Number, Array, Object, Error,
    crypto: { getRandomValues(bytes) { bytes.fill(7); return bytes; } },
    Zotero: { version, Prefs: { get: () => level }, Debug: {
      addListener(listener) { listeners.add(listener); },
      ...(removeListener ? { removeListener(listener) { listeners.delete(listener); } } : {})
    } },
    IOUtils: {
      async writeUTF8(file, value) { files.set(file, value); },
      async move(from, to) { files.set(to, files.get(from)); files.delete(from); },
      async remove(file) { files.delete(file); }
    }
  });
  vm.runInContext(source, context);
  return { context, files, listeners, emit(...args) { for (const listener of listeners) listener(...args); } };
}

const captureOptions = {
  outputPath: "capture.local.json",
  reviewedCommitSha: "1".repeat(40),
  xpiSha256: "2".repeat(64),
  extensionZipSha256: "3".repeat(64)
};

test("interactive core capture uses bounded addListener/removeListener without modal APIs", async () => {
  const source = await readFile(new URL("../tools/manual-verification/zotero-core-debug-capture.js", import.meta.url), "utf8");
  assert.match(source, /Debug\.addListener/); assert.match(source, /Debug\.removeListener/);
  assert.doesNotMatch(source, /\b(?:alert|confirm|prompt|openDialog|Services\.prompt|MessageBox)\s*\(/);
  const harness = await coreCaptureHarness();
  const started = await harness.context.PLCZoteroCoreDebugCapture.start(captureOptions);
  assert.equal(started.code, "CAPTURE_STARTED"); assert.equal(harness.listeners.size, 1);
  harness.emit("before stop");
  const stopped = await harness.context.PLCZoteroCoreDebugCapture.stop();
  assert.equal(stopped.code, "CAPTURE_STOPPED"); assert.equal(harness.listeners.size, 0);
  harness.emit("after stop");
  const raw = JSON.parse(harness.files.get(captureOptions.outputPath));
  assert.equal(raw.messageCount, 1); assert.equal(raw.messages[0].message, "before stop");
  assert.equal(JSON.stringify(raw).includes(captureOptions.outputPath), false);
  assert.match(raw.captureRunId, /^PLC-CORE-[A-F0-9]{32}$/);
});

test("interactive core capture blocks unsupported runtime prerequisites", async () => {
  for (const [options, code] of [[{ version: "9.0.7" }, "WRONG_ZOTERO_VERSION"], [{ level: 4 }, "DEBUG_LEVEL_BELOW_5"], [{ removeListener: false }, "DEBUG_LISTENER_UNAVAILABLE"]]) {
    const harness = await coreCaptureHarness(options);
    assert.equal((await harness.context.PLCZoteroCoreDebugCapture.start(captureOptions)).code, code);
    assert.equal(harness.listeners.size, 0);
  }
});

test("core capture snippets and binding reject stale, mismatched, and drifted evidence", async () => {
  const source = await readFile(new URL("../tools/manual-verification/zotero-core-debug-capture.js", import.meta.url), "utf8");
  const snippets = createCaptureSnippets(source, captureOptions);
  assert.match(snippets.start, /PLCZoteroCoreDebugCapture\.start/); assert.match(snippets.stop, /PLCZoteroCoreDebugCapture\.stop/);
  const expected = { zoteroVersion: "9.0.6", reviewedCommitSha: "1".repeat(40), xpiSha256: "2".repeat(64), extensionZipSha256: "3".repeat(64) };
  const capture = { schemaVersion: 1, captureRunId: `PLC-CORE-${"A".repeat(32)}`, zoteroVersion: "9.0.6", reviewedCommitSha: expected.reviewedCommitSha, xpiSha256: expected.xpiSha256, extensionZipSha256: expected.extensionZipSha256, startedAt: START, completedAt: END };
  const probe = { captureRunId: capture.captureRunId, startedAt: START, endedAt: END };
  assert.equal(validateCaptureBinding(capture, probe, expected).status, "PASS");
  assert.equal(validateCaptureBinding(capture, { ...probe, captureRunId: `PLC-CORE-${"B".repeat(32)}` }, expected).status, "BLOCKED");
  assert.equal(validateCaptureBinding({ ...capture, xpiSha256: "4".repeat(64) }, probe, expected).status, "BLOCKED");
  assert.throws(() => parseArguments(["--capture-run-id", "wrong"]), /invalid_capture_run_id/);
  assert.equal(parseArguments(["--capture-run-id", capture.captureRunId]).metadata.captureRunId, capture.captureRunId);
});

const PACKAGE_INVENTORY = ["LICENSE", "THIRD_PARTY_NOTICES.md", "bootstrap.js", "manifest.json"];
function reuseRecords() {
  const candidate = {
    xpiSha256: "a".repeat(64), pluginVersion: "0.4.0", zoteroVersion: "9.0.6",
    packageInventory: PACKAGE_INVENTORY, productionCodeChanged: false, packagingCodeChanged: false
  };
  const evidence = {
    xpiSha256: candidate.xpiSha256, pluginVersion: candidate.pluginVersion, zoteroVersion: candidate.zoteroVersion,
    packageInventory: [...PACKAGE_INVENTORY], pluginsUiInstall: "PASS", startup: "PASS", authenticatedHealth: "PASS",
    restart: "PASS", disableEnable: "PASS", uninstallReinstall: "PASS", invalidated: false
  };
  return { candidate, evidence };
}

test("exact artifact evidence reuse accepts only the complete unchanged lifecycle", () => {
  const { candidate, evidence } = reuseRecords();
  assert.deepEqual(evaluateExactArtifactReuse(candidate, evidence), {
    accepted: true, classification: "PASS_REUSED_EXACT_ARTIFACT_EVIDENCE", reasons: []
  });
});

test("exact artifact evidence reuse rejects artifact, runtime, inventory, code, and lifecycle drift", () => {
  const mutations = [
    ({ evidence }) => { evidence.xpiSha256 = "b".repeat(64); },
    ({ evidence }) => { evidence.pluginVersion = "0.4.1"; },
    ({ evidence }) => { evidence.zoteroVersion = "9.0.7"; },
    ({ evidence }) => { evidence.packageInventory.push("unexpected.js"); },
    ({ candidate }) => { candidate.productionCodeChanged = true; },
    ({ candidate }) => { candidate.packagingCodeChanged = true; },
    ({ evidence }) => { evidence.pluginsUiInstall = "BLOCKED"; },
    ({ evidence }) => { evidence.restart = "FAIL"; },
    ({ evidence }) => { evidence.invalidated = true; }
  ];
  for (const mutate of mutations) {
    const records = reuseRecords(); mutate(records);
    const result = evaluateExactArtifactReuse(records.candidate, records.evidence);
    assert.equal(result.accepted, false); assert.equal(result.classification, "BLOCKED"); assert(result.reasons.length > 0);
  }
});

function edgeAssertions() {
  return {
    profileCreatedForThisTest: true, browserSignedIn: true, syncEnabled: false,
    importedHistory: false, importedPasswords: false, importedFavorites: false,
    otherExtensionsInstalled: false, targetExtensionLoaded: true, developerMode: true,
    profileDeletedOrSanitizedAfterTest: true, guestProfile: false, dailyProfile: false
  };
}

test("signed-in Edge profile is clean when sync and imports are disabled", () => {
  assert.deepEqual(evaluateEdgeCleanProfile(edgeAssertions()), { accepted: true, reasons: [] });
});

test("Edge clean-profile policy rejects sync, imports, guest, and daily profiles", () => {
  for (const key of ["syncEnabled", "importedHistory", "importedPasswords", "importedFavorites", "guestProfile", "dailyProfile"]) {
    const assertions = edgeAssertions(); assertions[key] = true;
    assert.equal(evaluateEdgeCleanProfile(assertions).accepted, false);
  }
});

test("schema 1 remains readable but cannot establish a new PASS", () => {
  assert.deepEqual(validateRuntimeResultSchema({ schemaVersion: 1 }, { forNewPass: true }), {
    readable: true, canProduceNewPass: false, valid: false, reasons: ["SCHEMA_1_CANNOT_ESTABLISH_NEW_PASS"]
  });
});

test("schema 2 separates product, test snapshot, and containing result commit roles", () => {
  const record = {
    schemaVersion: 2, sourceProductSha: "1".repeat(40), testSnapshotSha: "2".repeat(40), resultCommitSha: null,
    artifactSha256: { xpi: "a".repeat(64) }, evidenceSources: [], evidenceReuse: {}, runtimeStatus: {}
  };
  assert.equal(validateRuntimeResultSchema(record, { forNewPass: true }).valid, true);
  record.testSnapshotSha = record.sourceProductSha;
  assert.equal(validateRuntimeResultSchema(record, { forNewPass: true }).valid, false);
  record.testSnapshotSha = "2".repeat(40); record.resultCommitSha = record.sourceProductSha;
  assert.equal(validateRuntimeResultSchema(record, { forNewPass: true }).valid, false);
});

test("synthetic remediation reuses only exact XPI lifecycle evidence and leaves other boundaries blocked", () => {
  const remediation = {
    schemaVersion: 2,
    sourceProductSha: "1".repeat(40),
    testSnapshotSha: "2".repeat(40),
    resultCommitSha: null,
    artifactSha256: { xpi: "a".repeat(64) },
    evidenceSources: ["SYNTHETIC_TEST_FIXTURE"],
    evidenceReuse: {
      packageInventory: [...PACKAGE_INVENTORY],
      productionCodeChanged: false,
      packagingCodeChanged: false,
      pluginsUiInstall: "PASS",
      lifecycle: {
        startup: "PASS",
        authenticatedHealth: "PASS",
        restart: "PASS",
        disableEnable: "PASS",
        uninstallReinstall: "PASS"
      },
      invalidated: false
    },
    runtimeStatus: {
      edgeEndToEnd: "BLOCKED",
      matchingCorrectness: "BLOCKED",
      debugLog: { zoteroCore: "BLOCKED", project: "BLOCKED", edgeConsole: "BLOCKED" },
      coreSiteMatrix: "BLOCKED",
      realRuntimeGate: "BLOCKED"
    }
  };
  assert.equal(validateRuntimeResultSchema(remediation, { forNewPass: true }).valid, true);
  const candidate = {
    xpiSha256: remediation.artifactSha256.xpi,
    pluginVersion: "0.4.0",
    zoteroVersion: "9.0.6",
    packageInventory: remediation.evidenceReuse.packageInventory,
    productionCodeChanged: remediation.evidenceReuse.productionCodeChanged,
    packagingCodeChanged: remediation.evidenceReuse.packagingCodeChanged
  };
  const evidence = {
    xpiSha256: remediation.artifactSha256.xpi,
    pluginVersion: "0.4.0",
    zoteroVersion: "9.0.6",
    packageInventory: remediation.evidenceReuse.packageInventory,
    pluginsUiInstall: remediation.evidenceReuse.pluginsUiInstall,
    startup: remediation.evidenceReuse.lifecycle.startup,
    authenticatedHealth: remediation.evidenceReuse.lifecycle.authenticatedHealth,
    restart: remediation.evidenceReuse.lifecycle.restart,
    disableEnable: remediation.evidenceReuse.lifecycle.disableEnable,
    uninstallReinstall: remediation.evidenceReuse.lifecycle.uninstallReinstall,
    invalidated: remediation.evidenceReuse.invalidated
  };
  assert.equal(evaluateExactArtifactReuse(candidate, evidence).accepted, true);
  assert.equal(remediation.runtimeStatus.edgeEndToEnd, "BLOCKED");
  assert.equal(remediation.runtimeStatus.matchingCorrectness, "BLOCKED");
  assert.deepEqual(new Set(Object.values(remediation.runtimeStatus.debugLog)), new Set(["BLOCKED"]));
  assert.equal(remediation.runtimeStatus.coreSiteMatrix, "BLOCKED");
  assert.equal(remediation.runtimeStatus.realRuntimeGate, "BLOCKED");
  assert.equal(/(?:[A-Z]:\\|Users\\|profile path|username)/i.test(JSON.stringify(remediation)), false);
});
