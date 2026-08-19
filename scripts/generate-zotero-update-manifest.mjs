import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function createUpdateManifest({ packageJson, manifest, xpiSha256, candidate = false }) {
  const version = packageJson.version;
  const xpiName = `paper-library-checker-zotero-${version}.xpi`;
  const zotero = manifest.applications.zotero;
  return {
    addons: {
      [zotero.id]: {
        updates: [{
          version,
          update_link: candidate
            ? `https://candidate.invalid/${xpiName}`
            : `https://github.com/he-chun/paper-library-checker/releases/download/v${version}/${xpiName}`,
          update_hash: `sha256:${xpiSha256}`,
          applications: {
            zotero: {
              strict_min_version: zotero.strict_min_version,
              strict_max_version: zotero.strict_max_version
            }
          }
        }]
      }
    }
  };
}

export function serializeUpdateManifest(result) {
  return Buffer.from(`${JSON.stringify(result, null, 2)}\n`, "utf8");
}

async function main() {
  const candidate = process.argv.includes("--candidate");
  const defaultRoot = fileURLToPath(new URL("..", import.meta.url));
  const root = process.env.PLC_SOURCE_ROOT ? path.resolve(process.env.PLC_SOURCE_ROOT) : defaultRoot;
  const dist = process.env.PLC_DIST_DIR ? path.resolve(process.env.PLC_DIST_DIR) : path.join(root, "dist");
  const output = process.env.PLC_UPDATES_FILE
    ? path.resolve(process.env.PLC_UPDATES_FILE)
    : candidate ? path.join(dist, "candidate-updates.json") : path.join(root, "updates.json");
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const manifest = JSON.parse(await readFile(path.join(root, "zotero-plugin", "manifest.json"), "utf8"));
  const xpiName = `paper-library-checker-zotero-${packageJson.version}.xpi`;
  const xpi = await readFile(path.join(dist, xpiName));
  const result = createUpdateManifest({
    packageJson,
    manifest,
    xpiSha256: createHash("sha256").update(xpi).digest("hex"),
    candidate
  });
  await writeFile(output, serializeUpdateManifest(result));
  console.log(result.addons[manifest.applications.zotero.id].updates[0].update_hash);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) await main();
