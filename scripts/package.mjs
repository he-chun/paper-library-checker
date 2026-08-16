import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPackageArtifacts } from "./package-entries.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = process.env.PLC_SOURCE_ROOT ? path.resolve(process.env.PLC_SOURCE_ROOT) : defaultRoot;
const dist = process.env.PLC_DIST_DIR
  ? path.resolve(process.env.PLC_DIST_DIR)
  : path.join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
const { artifacts, checksums } = await createPackageArtifacts(root);
for (const { name, data } of artifacts) await writeFile(path.join(dist, name), data);
await writeFile(path.join(dist, "SHA256SUMS.txt"), checksums);
console.log(artifacts.map(({ name }) => name).concat("SHA256SUMS.txt").join("\n"));
