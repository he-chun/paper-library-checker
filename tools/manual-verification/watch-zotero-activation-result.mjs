import { waitForResult } from "./zotero-activation-result.mjs";

const [file, timeoutText] = process.argv.slice(2);
if (!file) {
  console.error("usage: node watch-zotero-activation-result.mjs <result.local.json> [timeout-ms]");
  process.exitCode = 2;
} else {
  try {
    const result = await waitForResult(file, { timeoutMs: Number(timeoutText || 30_000) });
    console.log(`${result.status} ${result.phase}`);
    process.exitCode = result.status === "PASS" ? 0 : 2;
  } catch (error) {
    console.error(error.message === "RESULT_FILE_TIMEOUT" ? "RESULT_FILE_TIMEOUT" : "RESULT_FILE_INVALID");
    process.exitCode = 2;
  }
}
