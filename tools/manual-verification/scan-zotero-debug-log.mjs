import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequestBodies, createSyntheticData } from "./synthetic-data.mjs";

const MAX_LOG_BYTES = 64 * 1024 * 1024;
const BOUNDARIES = new Set(["zotero-core", "project", "browser-console"]);
const CASES = ["health", "check", "batch", "replay", "expired", "mutation"];
const EXPECTED = { health: [200, "none"], check: [200, "none"], batch: [200, "none"], replay: [401, "nonce_replayed"], expired: [401, "timestamp_expired"], mutation: [401, "body_hash_mismatch"] };

const normalized = (value) => String(value).replace(/\\r\\n|\\n|\\r/g, "\n").toLowerCase();
function includesValue(log, value) {
  const haystack = normalized(log); const plain = normalized(value); const escaped = normalized(JSON.stringify(value).slice(1, -1));
  return haystack.includes(plain) || haystack.includes(escaped);
}
const validHex = (value, length) => new RegExp(`^[a-f0-9]{${length}}$`).test(value || "");
const validTime = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const ISO_UTC_SOURCE = "([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\\.([0-9]{1,3}))?Z";
const LEVEL_SOURCE = "TRACE|DEBUG|INFO|WARN|ERROR";

function parseUtcTimestamp(value) {
  const match = String(value).match(new RegExp(`^${ISO_UTC_SOURCE}$`));
  if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction = "0"] = match;
  const parts = [year, month, day, hour, minute, second].map(Number);
  const milliseconds = Number(fraction.padEnd(3, "0"));
  const date = new Date(0);
  date.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
  date.setUTCHours(parts[3], parts[4], parts[5], milliseconds);
  if (date.getUTCFullYear() !== parts[0] || date.getUTCMonth() !== parts[1] - 1 || date.getUTCDate() !== parts[2] ||
      date.getUTCHours() !== parts[3] || date.getUTCMinutes() !== parts[4] || date.getUTCSeconds() !== parts[5] ||
      date.getUTCMilliseconds() !== milliseconds) return null;
  return date.getTime();
}

export function parseProjectLogTimestamps(log, result, toleranceMs = 5000) {
  const pattern = new RegExp(`^\\s*(?:\\[(${ISO_UTC_SOURCE})\\]|(${ISO_UTC_SOURCE}))\\s+\\[(?:${LEVEL_SOURCE})\\](?:\\s|$)`, "gim");
  const timestamps = [];
  for (const match of String(log).matchAll(pattern)) {
    const value = match[1] || match[9];
    const timestamp = parseUtcTimestamp(value);
    if (timestamp !== null) timestamps.push(timestamp);
  }
  const start = Date.parse(result.startedAt) - toleranceMs;
  const end = Date.parse(result.endedAt) + toleranceMs;
  const timestampsInWindow = timestamps.filter(value => value >= start && value <= end).length;
  return { timestampsParsed: timestamps.length, timestampsInWindow };
}

export function validateProbeResult(result) {
  const reasons = [];
  if (result?.schemaVersion !== 2) reasons.push("unsupported_schema_version");
  let synthetic;
  try { synthetic = createSyntheticData(result?.markerId); } catch { reasons.push("invalid_marker_id"); }
  if (synthetic && JSON.stringify(result.syntheticValues) !== JSON.stringify({ title: synthetic.title, DOI: synthetic.DOI, creator: synthetic.creator, URL: synthetic.URL })) reasons.push("synthetic_values_mismatch");
  if (!validHex(result?.secretFingerprint, 64)) reasons.push("invalid_secret_fingerprint");
  if (!validTime(result?.startedAt) || !validTime(result?.endedAt) || Date.parse(result.startedAt) > Date.parse(result.endedAt)) reasons.push("invalid_time_window");
  if (!validHex(result?.reviewedCommitSha, 40)) reasons.push("invalid_reviewed_commit");
  if (!validHex(result?.xpiSha256, 64) || !validHex(result?.extensionZipSha256, 64)) reasons.push("invalid_artifact_checksum");
  if (!result?.isolatedProfile) reasons.push("isolated_profile_unconfirmed");
  for (const name of CASES) {
    const observation = result?.observations?.[name]; const expected = EXPECTED[name];
    if (!observation || observation.status !== expected[0] || observation.code !== expected[1] || observation.passed !== true) reasons.push(`invalid_observation_${name}`);
  }
  if (!Array.isArray(result?.requestTraces) || result.requestTraces.length !== CASES.length) reasons.push("invalid_request_traces");
  else {
    const bodies = synthetic ? createRequestBodies(synthetic) : {};
    const expectedTrace = {
      health: ["GET", "/zotero-checker/health", createHash("sha256").update("").digest("hex")],
      check: ["POST", "/zotero-checker/check", createHash("sha256").update(bodies.checkBody || "").digest("hex")],
      batch: ["POST", "/zotero-checker/batch-check", createHash("sha256").update(bodies.batchBody || "").digest("hex")],
      replay: ["POST", "/zotero-checker/check", createHash("sha256").update(bodies.checkBody || "").digest("hex")],
      expired: ["POST", "/zotero-checker/check", createHash("sha256").update(bodies.checkBody || "").digest("hex")],
      mutation: ["POST", "/zotero-checker/check", createHash("sha256").update(bodies.mutationBody || "").digest("hex")]
    };
    for (const name of CASES) {
    const trace = result.requestTraces.find((item) => item.caseName === name);
    const expectedEvidence = expectedTrace[name];
    if (!trace || !["GET", "POST"].includes(trace.method) || !/^\/zotero-checker\/(?:health|check|batch-check)$/.test(trace.path || "") ||
        !Number.isInteger(trace.timestamp) || !validHex(trace.nonce, 32) || !validHex(trace.bodySha256, 64) || !validHex(trace.signatureSha256, 64) ||
        trace.httpStatus !== EXPECTED[name][0] || trace.errorCode !== EXPECTED[name][1] || trace.casePassed !== true ||
        trace.method !== expectedEvidence[0] || trace.path !== expectedEvidence[1] || trace.bodySha256 !== expectedEvidence[2]) reasons.push(`invalid_trace_${name}`);
    }
    const check = result.requestTraces.find((item) => item.caseName === "check"); const replay = result.requestTraces.find((item) => item.caseName === "replay");
    if (check && replay && check.nonce !== replay.nonce) reasons.push("replay_trace_nonce_mismatch");
  }
  return { valid: reasons.length === 0, reasons, synthetic };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pathOccurrences(log) {
  const pattern = /\/zotero-checker\/(?:health|check|batch-check)(?=[\s?#]|$)/gi;
  return Array.from(String(log).matchAll(pattern), match => ({ path: match[0].toLowerCase(), index: match.index }));
}

function traceTimestampInWindow(trace, result, toleranceMs = 5000) {
  const value = trace.timestamp * 1000;
  return value >= Date.parse(result.startedAt) - toleranceMs && value <= Date.parse(result.endedAt) + toleranceMs;
}

function matchingCoreTraces(log, result) {
  const occurrences = pathOccurrences(log);
  const traces = [];
  for (const trace of result.requestTraces || []) {
    if (!traceTimestampInWindow(trace, result)) continue;
    const nonceFingerprint = createHash("sha256").update(trace.nonce).digest("hex");
    for (let index = 0; index < occurrences.length; index += 1) {
      const occurrence = occurrences[index];
      if (occurrence.path !== trace.path.toLowerCase()) continue;
      const end = occurrences[index + 1]?.index ?? log.length;
      const block = log.slice(occurrence.index, end);
      if (block.includes(String(trace.timestamp)) &&
          (includesValue(block, trace.nonce) || includesValue(block, nonceFingerprint)) &&
          includesValue(block, trace.bodySha256)) {
        traces.push(trace.caseName);
        break;
      }
    }
  }
  return traces;
}

function coverageFor(log, result, boundary) {
  if (!log.trim()) return { status: "BLOCKED", reasons: ["empty_log"] };
  if (boundary === "browser-console") {
    const escaped = result.markerId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = log.match(new RegExp(`(?:^|\\n)PLC_BROWSER_MARKER\\s+${escaped}\\s+DETAIL\\s+(PASS|FAIL)\\s+BATCH\\s+(PASS|FAIL)(?:\\s|$)`, "i"));
    if (!match) return { status: "BLOCKED", reasons: ["missing_exact_browser_marker_pass"] };
    if (match[1].toUpperCase() !== "PASS" || match[2].toUpperCase() !== "PASS") return { status: "BLOCKED", reasons: ["browser_case_failed"], functionalFailure: true };
    return { status: "PASS", reasons: [], evidence: {} };
  }
  if (boundary === "project") {
    const evidence = parseProjectLogTimestamps(log, result);
    const reasons = [];
    if (!evidence.timestampsParsed) reasons.push("invalid_project_log_format");
    else if (!evidence.timestampsInWindow) reasons.push("project_log_outside_test_interval");
    return { status: reasons.length ? "BLOCKED" : "PASS", reasons, evidence };
  }
  const reasons = [];
  if (!/\/zotero-checker\//i.test(log)) reasons.push("missing_zotero_checker_path");
  if (!/x-plc-protocol/i.test(log)) reasons.push("missing_protocol_header");
  const matchedTraces = matchingCoreTraces(log, result);
  if (!matchedTraces.length) reasons.push("missing_bound_request_trace");
  for (const suffix of ["health", "check", "batch-check"]) if (!new RegExp(`/zotero-checker/${escapeRegExp(suffix)}(?=[\\s?#]|$)`, "i").test(log)) reasons.push(`missing_path_${suffix.replace("-check", "")}`);
  const auxiliaryIsoTimestamps = (log.match(new RegExp(ISO_UTC_SOURCE, "g")) || []).map(parseUtcTimestamp).filter(value => value !== null).length;
  return { status: reasons.length ? "BLOCKED" : "PASS", reasons, evidence: { matchedTraceCount: matchedTraces.length, auxiliaryIsoTimestamps } };
}

export function scanLogText(log, result, boundary = "zotero-core") {
  if (!BOUNDARIES.has(boundary)) throw new Error("invalid_log_boundary");
  const validation = validateProbeResult(result);
  if (!validation.valid) return { boundary, findings: {}, leakageStatus: "PASS", coverageStatus: "BLOCKED", overallStatus: "BLOCKED", reasons: validation.reasons };
  const synthetic = validation.synthetic; const bodies = Object.values(createRequestBodies(synthetic));
  const tokenCandidates = log.match(/(?<![A-Fa-f0-9])[A-Fa-f0-9]{64}(?![A-Fa-f0-9])/g) || [];
  const findings = {
    syntheticTitle: includesValue(log, synthetic.title), syntheticDOI: includesValue(log, synthetic.DOI), syntheticCreator: includesValue(log, synthetic.creator), syntheticURL: includesValue(log, synthetic.URL),
    syntheticMarker: boundary !== "browser-console" && includesValue(log, result.markerId), rawRequestBody: bodies.some((body) => includesValue(log, body)),
    legacyBearerHeader: /x-paper-library-checker-token/i.test(log), pairingSecret: tokenCandidates.some((candidate) => createHash("sha256").update(candidate.toLowerCase()).digest("hex") === result.secretFingerprint)
  };
  const leakageStatus = Object.values(findings).some(Boolean) ? "FAIL" : "PASS";
  const coverage = coverageFor(log, result, boundary);
  return { boundary, findings, leakageStatus, coverageStatus: coverage.status, overallStatus: leakageStatus === "FAIL" || coverage.functionalFailure ? "FAIL" : coverage.status, reasons: coverage.reasons, evidence: coverage.evidence || {} };
}

export async function scanFiles(debugLogPath, resultPath, boundary = "zotero-core") {
  const info = await stat(debugLogPath); if (!info.isFile() || info.size > MAX_LOG_BYTES) throw new Error("debug_log_missing_or_too_large");
  const [log, resultText] = await Promise.all([readFile(debugLogPath, "utf8"), readFile(resultPath, "utf8")]);
  try { return scanLogText(log, JSON.parse(resultText), boundary); } catch { return { boundary, findings: {}, leakageStatus: "PASS", coverageStatus: "BLOCKED", overallStatus: "BLOCKED", reasons: ["invalid_result_json"] }; }
}

function printReport(report, markerId) {
  console.log(`BOUNDARY ${report.boundary}`); console.log(`MARKER ${markerId || "INVALID"}`);
  for (const [name, found] of Object.entries(report.findings)) console.log(`FORBIDDEN ${name} ${found ? "FOUND" : "NOT_FOUND"}`);
  for (const reason of report.reasons) console.log(`EVIDENCE ${reason}`);
  console.log(`LEAKAGE ${report.leakageStatus}`); console.log(`COVERAGE ${report.coverageStatus}`); console.log(`OVERALL ${report.overallStatus}`);
}

async function main() {
  const args = process.argv.slice(2); const boundaryIndex = args.indexOf("--boundary"); let boundary = "zotero-core";
  if (boundaryIndex >= 0) boundary = args.splice(boundaryIndex, 2)[1];
  if (args.length !== 2) throw new Error("usage: scan-zotero-debug-log.mjs <debug-log-path> <probe-result-path> [--boundary zotero-core|project|browser-console]");
  let markerId; try { markerId = JSON.parse(await readFile(path.resolve(args[1]), "utf8")).markerId; } catch {}
  const report = await scanFiles(path.resolve(args[0]), path.resolve(args[1]), boundary); printReport(report, markerId); if (report.overallStatus !== "PASS") process.exitCode = 1;
}
const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) main().catch((error) => { console.error(`SCAN ERROR ${error.message}`); process.exitCode = 1; });
