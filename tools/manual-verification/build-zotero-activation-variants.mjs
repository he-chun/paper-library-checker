import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createZip } from "../../scripts/zip.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pluginRoot = path.join(root, "zotero-plugin");
const outputRoot = path.join(root, "tools/manual-verification/results/activation-variants");
const diagnosticId = "paper-library-checker-activation-variant@he-chun.github.io";

async function filesUnder(directory, relative = "") {
  const result = [];
  for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    const name = path.posix.join(relative.replaceAll("\\", "/"), entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(directory, name));
    else result.push({ name, data: await readFile(path.join(directory, name)) });
  }
  return result;
}

export function manifestVariant(base, name, compatibility = {}) {
  return {
    ...base,
    name: `${base.name} Activation ${name}`,
    applications: { zotero: { ...base.applications.zotero, id: diagnosticId, ...compatibility } }
  };
}

function markerBootstrap(stage) {
  return Buffer.from(`/* local diagnostic variant; no user data access */\nfunction install() {}\nasync function startup() { await Zotero.initializationPromise; Zotero.debug("PLC_ACTIVATION_STAGE ${stage}"); }\nfunction shutdown() { Zotero.debug("PLC_ACTIVATION_STAGE SHUTDOWN"); }\nfunction uninstall() {}\n`);
}

export async function buildVariants(destination = outputRoot) {
  const manifest = JSON.parse(await readFile(path.join(pluginRoot, "manifest.json"), "utf8"));
  const all = await filesUnder(pluginRoot);
  const licenses = ["LICENSE", "THIRD_PARTY_NOTICES.md"].map(async name => ({ name, data: await readFile(path.join(root, name)) }));
  const distributions = await Promise.all(licenses);
  const modernNames = new Set(["manifest.json", "bootstrap.js", "prefs.js"]);
  const modern = all.filter(entry => modernNames.has(entry.name) || entry.name.startsWith("src/"));
  const definitions = [
    ["A-current-complete", all],
    ["B-modern-only", modern],
    ["C-current-range", modern, {}],
    ["C-min-7", modern, { strict_min_version: "7.0" }],
    ["C-max-8", modern, { strict_max_version: "8.*" }],
    ["C-7-only", modern, { strict_min_version: "7.0", strict_max_version: "7.*" }],
    ["C-8-only", modern, { strict_min_version: "8.0", strict_max_version: "8.*" }],
    ["D-minimal-bootstrap", modern, null, "BOOTSTRAP_ENTERED"],
    ["E-bootstrap-shell", modern, null, "GLOBALS_VALIDATED"]
  ];
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const inventory = [];
  for (const [name, source, compatibility, stage] of definitions) {
    let entries = source.filter(entry => entry.name !== "manifest.json" && (!stage || entry.name !== "bootstrap.js"));
    entries = [...entries, ...distributions, {
      name: "manifest.json",
      data: Buffer.from(`${JSON.stringify(manifestVariant(manifest, name, compatibility || {}), null, 2)}\n`)
    }];
    if (stage) entries.push({ name: "bootstrap.js", data: markerBootstrap(stage) });
    const file = `${name}.xpi`;
    const archive = createZip(entries);
    await writeFile(path.join(destination, file), archive);
    inventory.push({ name, file, entryCount: entries.length });
  }
  await writeFile(path.join(destination, "inventory.local.json"), `${JSON.stringify(inventory, null, 2)}\n`);
  return inventory;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await buildVariants(), null, 2));
}
