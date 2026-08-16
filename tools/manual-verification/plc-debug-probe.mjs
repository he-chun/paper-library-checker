import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createRequestBodies, createSyntheticData } from "./synthetic-data.mjs";

const require = createRequire(import.meta.url);
const requestAuth = require("../../browser-extension/src/common/request-auth.js");
const root = fileURLToPath(new URL("../..", import.meta.url));
const DEFAULT_ENDPOINT = "http://127.0.0.1:23119/zotero-checker";
const RESULTS_DIRECTORY = path.join(root, "tools", "manual-verification", "results");
const DEFAULT_RESULT = path.join(RESULTS_DIRECTORY, "latest.local.json");
export const PROBE_SCHEMA_VERSION = 2;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function validateEndpoint(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || url.username || url.password || url.search || url.hash ||
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.pathname.replace(/\/$/, "") !== "/zotero-checker") {
    throw new Error("endpoint_must_be_http_loopback");
  }
  return url.href.replace(/\/$/, "");
}

export function createMarker(now = new Date(), random = randomBytes(8)) {
  const time = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `PLC-DEBUG-${time}-${Buffer.from(random).toString("hex").toUpperCase()}`;
}

export async function readSecretInteractive({ input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY) throw new Error("interactive_tty_required");
  if (typeof input.setRawMode === "function") {
    output.write("Pairing secret (input hidden): ");
    input.setRawMode(true);
    input.resume();
    let value = "";
    try {
      value = await new Promise((resolve, reject) => {
        function cleanup() {
          input.off("data", onData);
          input.setRawMode(false);
          input.pause();
          output.write("\n");
        }
        function onData(chunk) {
          for (const character of chunk.toString("utf8")) {
            if (character === "\u0003") {
              cleanup();
              reject(new Error("input_cancelled"));
              return;
            }
            if (character === "\r" || character === "\n") {
              cleanup();
              resolve(value.trim());
              return;
            }
            if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
            else value += character;
          }
        }
        input.on("data", onData);
      });
      return value;
    } finally {
      value = "";
      if (input.isRaw) input.setRawMode(false);
    }
  }
  const muted = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const reader = createInterface({ input, output: muted, terminal: true });
  output.write("Pairing secret (input hidden): ");
  try {
    const secret = (await reader.question("")).trim();
    output.write("\n");
    return secret;
  } finally {
    reader.close();
  }
}

async function signedFetch({ caseName, endpoint, pathSuffix, method, body, secret, timestamp, nonce, fetchImpl }) {
  const requestPath = `/zotero-checker${pathSuffix}`;
  const headers = await requestAuth.createHeaders({ secret, method, path: requestPath, body, timestamp, nonce });
  const response = await fetchImpl(`${endpoint}${pathSuffix}`, {
    method,
    headers,
    body: method === "GET" ? undefined : body
  });
  const payload = await response.json().catch(() => ({}));
  const candidateCode = typeof payload.error === "string" ? payload.error : "none";
  const code = /^[a-z][a-z0-9_]{0,63}$/.test(candidateCode) ? candidateCode : "invalid_error_code";
  return {
    status: response.status,
    code,
    trace: {
      caseName,
      method,
      path: requestPath,
      timestamp: Number(headers["X-PLC-Timestamp"]),
      nonce: headers["X-PLC-Nonce"],
      bodySha256: headers["X-PLC-Body-SHA256"],
      signatureSha256: sha256(headers["X-PLC-Signature"]),
      httpStatus: response.status,
      errorCode: code
    }
  };
}

export function evaluateObservation(name, observation) {
  const expectations = {
    health: { status: 200, code: "none" },
    check: { status: 200, code: "none" },
    batch: { status: 200, code: "none" },
    replay: { status: 401, code: "nonce_replayed" },
    expired: { status: 401, code: "timestamp_expired" },
    mutation: { status: 401, code: "body_hash_mismatch" }
  };
  const expected = expectations[name];
  return Boolean(expected && observation.status === expected.status && observation.code === expected.code);
}

export function formatProbeOutput(result) {
  const lines = [`MARKER ${result.markerId}`];
  let passed = true;
  for (const [name, observation] of Object.entries(result.observations)) {
    const ok = evaluateObservation(name, observation);
    passed &&= ok;
    lines.push(`${name.toUpperCase()} HTTP ${observation.status} CODE ${observation.code} ${ok ? "PASS" : "FAIL"}`);
  }
  lines.push(`OVERALL ${passed ? "PASS" : "FAIL"}`);
  return { passed, text: lines.join("\n") };
}

export async function executeProbe({ secret, endpoint = DEFAULT_ENDPOINT, markerId = createMarker(), fetchImpl = fetch, nowSeconds = Math.floor(Date.now() / 1000) }) {
  endpoint = validateEndpoint(endpoint);
  if (!requestAuth.isUsableSecret(secret)) throw new Error("invalid_pairing_secret");
  const synthetic = createSyntheticData(markerId);
  const { batchBody, checkBody, mutationBody } = createRequestBodies(synthetic);
  const replayNonce = requestAuth.randomNonce();
  const call = (caseName, pathSuffix, method, body, timestamp, nonce, customFetch = fetchImpl) => signedFetch({ caseName, endpoint, pathSuffix, method, body, secret, timestamp, nonce, fetchImpl: customFetch });
  const health = await call("health", "/health", "GET", "", nowSeconds);
  const check = await call("check", "/check", "POST", checkBody, nowSeconds, replayNonce);
  const observations = {
    health,
    check,
    batch: await call("batch", "/batch-check", "POST", batchBody, nowSeconds),
    replay: await call("replay", "/check", "POST", checkBody, nowSeconds, replayNonce),
    expired: await call("expired", "/check", "POST", checkBody, nowSeconds - 120),
    mutation: await call("mutation", "/check", "POST", mutationBody, nowSeconds, undefined, async (url, init) => {
      const signedBody = init.body;
      return fetchImpl(url, { ...init, body: signedBody.replace(" Mutated", " Changed") });
    })
  };
  for (const [name, observation] of Object.entries(observations)) observation.trace.casePassed = evaluateObservation(name, observation);
  return { markerId, synthetic, observations, requestTraces: Object.values(observations).map(({ trace }) => trace) };
}

export async function writeProbeResult(filePath, { markerId, synthetic, secretFingerprint, startedAt, endedAt, observations = {}, requestTraces = [], reviewedCommitSha, xpiSha256, extensionZipSha256, isolatedProfile = false, captureRunId = null }) {
  const result = {
    schemaVersion: PROBE_SCHEMA_VERSION,
    markerId,
    syntheticValues: { title: synthetic.title, DOI: synthetic.DOI, creator: synthetic.creator, URL: synthetic.URL },
    secretFingerprint,
    startedAt,
    endedAt,
    reviewedCommitSha,
    xpiSha256,
    extensionZipSha256,
    isolatedProfile,
    captureRunId,
    observations: Object.fromEntries(Object.entries(observations).map(([name, value]) => [name, { status: value.status, code: value.code, passed: evaluateObservation(name, value) }])),
    requestTraces
  };
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

export function parseArguments(argv) {
  let endpoint = DEFAULT_ENDPOINT;
  let resultPath = DEFAULT_RESULT;
  const metadata = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--endpoint" && argv[index + 1]) endpoint = argv[++index];
    else if (argv[index] === "--result" && argv[index + 1]) resultPath = path.resolve(argv[++index]);
    else if (argv[index] === "--reviewed-commit" && argv[index + 1]) metadata.reviewedCommitSha = argv[++index].toLowerCase();
    else if (argv[index] === "--xpi-sha256" && argv[index + 1]) metadata.xpiSha256 = argv[++index].toLowerCase();
    else if (argv[index] === "--extension-sha256" && argv[index + 1]) metadata.extensionZipSha256 = argv[++index].toLowerCase();
    else if (argv[index] === "--capture-run-id" && argv[index + 1]) metadata.captureRunId = argv[++index];
    else if (argv[index] === "--isolated-profile") metadata.isolatedProfile = true;
    else throw new Error("usage: plc-debug-probe.mjs [--endpoint URL] [--result FILE.local.json] [--reviewed-commit SHA] [--xpi-sha256 SHA256] [--extension-sha256 SHA256] [--capture-run-id PLC-CORE-ID] [--isolated-profile]");
  }
  if (!resultPath.endsWith(".local.json")) throw new Error("result_path_must_end_in_local_json");
  const relative = path.relative(RESULTS_DIRECTORY, resultPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("result_path_must_be_in_ignored_results_directory");
  if (metadata.captureRunId && !/^PLC-CORE-[A-F0-9]{32}$/.test(metadata.captureRunId)) throw new Error("invalid_capture_run_id");
  return { endpoint, resultPath, metadata };
}

export async function resolveEvidenceMetadata(overrides = {}) {
  const result = { ...overrides };
  if (!result.reviewedCommitSha) {
    try { result.reviewedCommitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim().toLowerCase(); } catch {}
  }
  if (!result.xpiSha256 || !result.extensionZipSha256) {
    try {
      for (const line of (await readFile(path.join(root, "dist", "SHA256SUMS.txt"), "utf8")).split(/\r?\n/)) {
        const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i); if (!match) continue;
        if (/\.xpi$/i.test(match[2])) result.xpiSha256 ||= match[1].toLowerCase();
        else if (/\.zip$/i.test(match[2])) result.extensionZipSha256 ||= match[1].toLowerCase();
      }
    } catch {}
  }
  if (!/^[a-f0-9]{40}$/.test(result.reviewedCommitSha || "")) throw new Error("missing_or_invalid_reviewed_commit");
  if (!/^[a-f0-9]{64}$/.test(result.xpiSha256 || "")) throw new Error("missing_or_invalid_xpi_checksum");
  if (!/^[a-f0-9]{64}$/.test(result.extensionZipSha256 || "")) throw new Error("missing_or_invalid_extension_checksum");
  return result;
}

async function main() {
  const { endpoint, resultPath, metadata: overrides } = parseArguments(process.argv.slice(2));
  const metadata = await resolveEvidenceMetadata(overrides);
  const startedAt = new Date().toISOString();
  let secret = await readSecretInteractive();
  try {
    const secretFingerprint = createHash("sha256").update(secret.toLowerCase(), "utf8").digest("hex");
    const result = await executeProbe({ secret, endpoint });
    const endedAt = new Date().toISOString();
    await writeProbeResult(resultPath, { ...result, ...metadata, secretFingerprint, startedAt, endedAt });
    const { passed, text } = formatProbeOutput(result);
    console.log(text);
    if (!passed) process.exitCode = 1;
  } finally {
    secret = null;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) main().catch((error) => {
  console.error(`PROBE ERROR ${error.message}`);
  process.exitCode = 1;
});
