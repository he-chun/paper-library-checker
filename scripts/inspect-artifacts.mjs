import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectZip } from "./zip.mjs";
import { assertNoManualVerificationContent } from "./artifact-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = process.env.PLC_DIST_DIR
  ? path.resolve(root, process.env.PLC_DIST_DIR)
  : path.join(root, "dist");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const names = {
  plugin: `paper-library-checker-zotero-${packageJson.version}.xpi`,
  extension: `paper-library-checker-extension-${packageJson.version}.zip`
};
const result = {};
for (const [kind, name] of Object.entries(names)) {
  result[kind] = inspectZip(await readFile(path.join(dist, name)));
  assertNoManualVerificationContent(result[kind].entries, name);
}
const serialized = `${JSON.stringify(result, null, 2)}\n`;
if (process.env.PLC_INVENTORY_FILE) await writeFile(path.resolve(process.env.PLC_INVENTORY_FILE), serialized);
console.log(serialized.trimEnd());
