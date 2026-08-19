import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectZip } from "./zip.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const candidate = process.argv.includes("--candidate");
const dist = process.env.PLC_DIST_DIR ? path.resolve(root, process.env.PLC_DIST_DIR) : path.join(root, "dist");
const updatesFile = process.env.PLC_UPDATES_FILE
  ? path.resolve(root, process.env.PLC_UPDATES_FILE)
  : candidate ? path.join(dist, "candidate-updates.json") : path.join(root, "updates.json");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const manifest = JSON.parse(await readFile(path.join(root, "zotero-plugin", "manifest.json"), "utf8"));
const updates = JSON.parse(await readFile(updatesFile, "utf8"));
const zotero = manifest.applications?.zotero;
const expectedUpdateURL = "https://raw.githubusercontent.com/he-chun/paper-library-checker/main/updates.json";
if (zotero?.update_url !== expectedUpdateURL) throw new Error("Production update_url is missing or unexpected");
if (!zotero.update_url.startsWith("https://") || /example\.(?:com|invalid)|localhost|[A-Za-z]:\\/.test(zotero.update_url)) {
  throw new Error("Production update_url is not an allowed HTTPS URL");
}
const update = updates.addons?.[zotero.id]?.updates;
if (!Array.isArray(update) || update.length !== 1) throw new Error("updates.json must contain one update for the production ID");
const item = update[0];
const xpiName = `paper-library-checker-zotero-${packageJson.version}.xpi`;
const expectedLink = candidate
  ? `https://candidate.invalid/${xpiName}`
  : `https://github.com/he-chun/paper-library-checker/releases/download/v${packageJson.version}/${xpiName}`;
if (item.version !== packageJson.version || manifest.version !== packageJson.version) throw new Error("Update version mismatch");
if (item.update_link !== expectedLink) throw new Error("Update link mismatch");
if (item.applications?.zotero?.strict_min_version !== zotero.strict_min_version || item.applications?.zotero?.strict_max_version !== zotero.strict_max_version) throw new Error("Update compatibility mismatch");
const xpi = await readFile(path.join(dist, xpiName));
const digest = createHash("sha256").update(xpi).digest("hex");
if (item.update_hash !== `sha256:${digest}`) throw new Error("Update hash does not match the local XPI");
const pluginInventory = inspectZip(xpi);
if (pluginInventory.entries.includes("updates.json")) throw new Error("updates.json must not be embedded in the XPI");
const browser = await readFile(path.join(dist, `paper-library-checker-extension-${packageJson.version}.zip`));
if (inspectZip(browser).entries.includes("updates.json")) throw new Error("updates.json must not be embedded in the browser ZIP");
console.log(`update manifest valid: version=${item.version} xpi_sha256=${digest}`);
