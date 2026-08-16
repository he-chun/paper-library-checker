import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createCandidate, createSyntheticData } from "./synthetic-data.mjs";

const ALLOWED_STATUSES = new Set(["matched", "possible_match", "not_found"]);
export function evaluateBrowserDetail(response) {
  return response?.ok === true && Boolean(response.result) && ALLOWED_STATUSES.has(response.result.status);
}
export function evaluateBrowserBatch(response, expectedCount) {
  const results = response?.result?.results;
  return response?.ok === true && Array.isArray(results) && results.length === expectedCount && results.every((item) => ALLOWED_STATUSES.has(item?.status));
}

export function createBrowserSnippet(result) {
  const synthetic = createSyntheticData(result.markerId);
  const first = createCandidate(synthetic);
  const second = createCandidate(synthetic, " Second");
  return `// Run only in the Paper Library Checker content-script DevTools context.\n` +
    `(() => {\n` +
    `  const marker = ${JSON.stringify(result.markerId)};\n` +
    `  const allowed = new Set(["matched", "possible_match", "not_found"]);\n` +
    `  const send = message => new Promise(resolve => { let done = false; const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, 10000); chrome.runtime.sendMessage(message, response => { if (!done) { done = true; clearTimeout(timer); resolve(response); } }); });\n` +
    `  Promise.all([send(${JSON.stringify({ type: "zotero-check:match", candidate: first })}), send(${JSON.stringify({ type: "zotero-check:match", candidates: [first, second] })})]).then(([detail, batch]) => {\n` +
    `    const detailPass = detail?.ok === true && detail.result && allowed.has(detail.result.status);\n` +
    `    const batchResults = batch?.result?.results;\n` +
    `    const batchPass = batch?.ok === true && Array.isArray(batchResults) && batchResults.length === 2 && batchResults.every(item => allowed.has(item?.status));\n` +
    `    console.info("PLC_BROWSER_MARKER", marker, "DETAIL", detailPass ? "PASS" : "FAIL", "BATCH", batchPass ? "PASS" : "FAIL");\n` +
    `  });\n` +
    `})();\n`;
}

async function main() {
  if (process.argv.length !== 3) throw new Error("usage: make-browser-marker-snippet.mjs <probe-result-path>");
  const result = JSON.parse(await readFile(path.resolve(process.argv[2]), "utf8"));
  const output = path.resolve("tools/manual-verification/results/browser-marker-snippet.local.js");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, createBrowserSnippet(result), { encoding: "utf8", mode: 0o600 });
  console.log("Browser marker snippet created in the gitignored results directory");
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) main().catch((error) => {
  console.error(`HELPER ERROR ${error.message}`);
  process.exitCode = 1;
});
