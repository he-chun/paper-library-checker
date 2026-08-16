import { readFile } from "node:fs/promises";

const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url)));
const packages = Object.entries(lock.packages || {}).filter(([name]) => name.startsWith("node_modules/"));
for (const [name, metadata] of packages.sort(([a], [b]) => a.localeCompare(b))) {
  if (!metadata.license) throw new Error(`Missing declared license: ${name}`);
  console.log(`${name.slice(13)}\t${metadata.version}\t${metadata.license}`);
}
