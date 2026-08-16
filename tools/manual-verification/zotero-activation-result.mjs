import { open, readFile, rename } from "node:fs/promises";

const forbiddenKey = /(?:secret|nonce|signature|raw.?body|source.?uri|profile.?path|user.?name)/i;
const forbiddenValue = /(?:[A-Za-z]:\\|file:\/\/\/|\/Users\/|\\Users\\|AppData[\\/]|pairing.?secret|\bnonce\b|\bsignature\b|raw.?body|source.?uri|profile.?path)/i;
const allowedStatus = new Set(["PASS", "FAIL", "BLOCKED", "NOT_RUN"]);
const allowedPhase = new Set(["startup-marker", "canary", "product-baseline"]);

export function createResult({ testRunId, zoteroVersion, phase, status, observations = {}, startedAt, completedAt }) {
  const result = {
    schemaVersion: 1,
    testRunId,
    zoteroVersion,
    phase,
    startedAt: startedAt || new Date().toISOString(),
    completedAt: completedAt || new Date().toISOString(),
    status,
    observations,
    containsPrivatePath: false
  };
  return validateResult(result);
}

export function validateResult(result) {
  if (!result || result.schemaVersion !== 1 || !/^PLC-ACTIVATION-[A-Za-z0-9-]+$/.test(result.testRunId || "")) throw new Error("RESULT_SCHEMA_INVALID");
  if (!/^\d+\.\d+\.\d+$/.test(result.zoteroVersion || "") || !allowedPhase.has(result.phase) || !allowedStatus.has(result.status)) throw new Error("RESULT_SCHEMA_INVALID");
  if (result.containsPrivatePath !== false) throw new Error("RESULT_PRIVATE_PATH_FLAG");
  const visit = (value, key = "") => {
    if (forbiddenKey.test(key)) throw new Error("RESULT_FORBIDDEN_FIELD");
    if (typeof value === "string" && forbiddenValue.test(value)) throw new Error("RESULT_PRIVATE_PATH");
    if (Array.isArray(value)) value.forEach(item => visit(item));
    else if (value && typeof value === "object") Object.entries(value).forEach(([name, item]) => visit(item, name));
  };
  visit(result);
  return result;
}

export async function writeResultAtomic(file, result) {
  validateResult(result);
  const temporary = `${file}.${process.pid}.tmp`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(result, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, file);
  } catch (error) {
    await handle?.close().catch(() => {});
    const wrapped = new Error("RESULT_ATOMIC_WRITE_FAILED");
    wrapped.cause = error;
    throw wrapped;
  }
}

export async function waitForResult(file, { timeoutMs = 30_000, pollMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { return validateResult(JSON.parse(await readFile(file, "utf8"))); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
  throw new Error("RESULT_FILE_TIMEOUT");
}
