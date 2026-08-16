import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const resultsDirectory = path.join(root, "tools", "manual-verification", "results");
const sourcePath = fileURLToPath(new URL("./zotero-core-debug-capture.js", import.meta.url));

const validHex = (value, length) => new RegExp(`^[a-f0-9]{${length}}$`, "i").test(value || "");
const validTime = value => typeof value === "string" && Number.isFinite(Date.parse(value));

export function validateCaptureBinding(capture, probe, expected) {
  const reasons = [];
  if (capture?.schemaVersion !== 1) reasons.push("CAPTURE_SCHEMA_MISMATCH");
  if (!/^PLC-CORE-[A-F0-9]{32}$/.test(capture?.captureRunId || "")) reasons.push("CAPTURE_RUN_ID_INVALID");
  if (probe?.captureRunId !== capture?.captureRunId) reasons.push("CAPTURE_RUN_ID_MISMATCH");
  if (capture?.zoteroVersion !== expected.zoteroVersion) reasons.push("ZOTERO_VERSION_MISMATCH");
  if (capture?.reviewedCommitSha !== expected.reviewedCommitSha.toLowerCase() ||
      capture?.xpiSha256 !== expected.xpiSha256.toLowerCase() ||
      capture?.extensionZipSha256 !== expected.extensionZipSha256.toLowerCase()) {
    reasons.push("ARTIFACT_MISMATCH");
  }
  if (!validTime(capture?.startedAt) || !validTime(capture?.completedAt) ||
      !validTime(probe?.startedAt) || !validTime(probe?.endedAt) ||
      Date.parse(capture.startedAt) > Date.parse(probe.startedAt) ||
      Date.parse(capture.completedAt) < Date.parse(probe.endedAt)) {
    reasons.push("STALE_CAPTURE");
  }
  return { valid: reasons.length === 0, status: reasons.length ? "BLOCKED" : "PASS", reasons };
}

export function createCaptureSnippets(source, { outputPath, reviewedCommitSha, xpiSha256, extensionZipSha256 }) {
  if (!validHex(reviewedCommitSha, 40) || !validHex(xpiSha256, 64) || !validHex(extensionZipSha256, 64)) {
    throw new Error("invalid_artifact_binding");
  }
  const options = { outputPath, reviewedCommitSha, xpiSha256, extensionZipSha256 };
  return {
    start: `${source.trim()}\nawait globalThis.PLCZoteroCoreDebugCapture.start(${JSON.stringify(options)});\n`,
    stop: "await globalThis.PLCZoteroCoreDebugCapture.stop();\n"
  };
}

function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!key?.startsWith("--") || args[index + 1] === undefined) throw new Error("invalid_arguments");
    values[key.slice(2)] = args[index + 1];
  }
  return values;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const outputPath = path.join(resultsDirectory, "zotero-core-capture.raw.local.json");
  const snippets = createCaptureSnippets(await readFile(sourcePath, "utf8"), {
    outputPath,
    reviewedCommitSha: args.commit,
    xpiSha256: args.xpi,
    extensionZipSha256: args.extension
  });
  await mkdir(resultsDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(resultsDirectory, "zotero-core-capture-start.local.js"), snippets.start, { encoding: "utf8", mode: 0o600 }),
    writeFile(path.join(resultsDirectory, "zotero-core-capture-stop.local.js"), snippets.stop, { encoding: "utf8", mode: 0o600 })
  ]);
  console.log("CAPTURE_SNIPPETS_READY");
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) main().catch(error => {
  console.error(`CAPTURE_HELPER_ERROR ${error.message}`);
  process.exitCode = 1;
});
