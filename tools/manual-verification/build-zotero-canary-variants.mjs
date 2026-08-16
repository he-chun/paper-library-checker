import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createZip, inspectZip } from "../../scripts/zip.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = path.join(root, "tools", "manual-verification", "zotero-canary");
const output = process.env.PLC_CANARY_VARIANT_OUTPUT
  ? path.resolve(process.env.PLC_CANARY_VARIANT_OUTPUT)
  : path.join(root, "tools", "manual-verification", "results", "canary-variants");
const baselinePath = process.env.PLC_CANARY_BASELINE_XPI;
if (!baselinePath) throw new Error("PLC_CANARY_BASELINE_XPI is required");

const originalManifest = JSON.parse(await readFile(path.join(source, "manifest.json"), "utf8"));
const bootstrap = await readFile(path.join(source, "bootstrap.js"));
const license = await readFile(path.join(root, "LICENSE"));

const variants = [
  {
    name: "variant-b-max-version-only",
    manifest: {
      ...originalManifest,
      version: "1.0.1",
      applications: {
        ...originalManifest.applications,
        zotero: {
          ...originalManifest.applications.zotero,
          strict_max_version: "9.*"
        }
      }
    }
  }
];

const minimalManifest = {
  manifest_version: 2,
  name: "Paper Library Checker Canary",
  version: "1.0.2",
  description: "Local activation canary for an isolated Zotero test profile.",
  applications: {
    zotero: {
      id: "paper-library-checker-canary@he-chun.github.io",
      strict_min_version: "9.0",
      strict_max_version: "9.*"
    }
  }
};

await mkdir(output, { recursive: true });
const baselineArchive = await readFile(baselinePath);
const baselineManifest = Buffer.from(JSON.stringify(originalManifest, null, 2) + "\n");
const baselineName = "variant-a-original-1.0.0.xpi";
await writeFile(path.join(output, baselineName), baselineArchive);
const inventory = [{
  variant: "variant-a-original",
  fileName: baselineName,
  version: originalManifest.version,
  strictMinVersion: originalManifest.applications.zotero.strict_min_version,
  strictMaxVersion: originalManifest.applications.zotero.strict_max_version,
  sha256: createHash("sha256").update(baselineArchive).digest("hex"),
  manifestSha256: createHash("sha256").update(baselineManifest).digest("hex"),
  ...inspectZip(baselineArchive)
}];
for (const variant of variants) {
  const manifest = Buffer.from(`${JSON.stringify(variant.manifest, null, 2)}\n`);
  const archive = createZip([
    { name: "manifest.json", data: manifest },
    { name: "bootstrap.js", data: bootstrap },
    { name: "LICENSE", data: license }
  ]);
  const fileName = `${variant.name}-${variant.manifest.version}.xpi`;
  await writeFile(path.join(output, fileName), archive);
  inventory.push({
    variant: variant.name,
    fileName,
    version: variant.manifest.version,
    strictMinVersion: variant.manifest.applications.zotero.strict_min_version,
    strictMaxVersion: variant.manifest.applications.zotero.strict_max_version,
    sha256: createHash("sha256").update(archive).digest("hex"),
    manifestSha256: createHash("sha256").update(manifest).digest("hex"),
    ...inspectZip(archive)
  });
}

const minimalManifestBytes = Buffer.from(`${JSON.stringify(minimalManifest, null, 2)}\n`);
const minimalEntries = [
  { name: "manifest.json", data: minimalManifestBytes },
  { name: "bootstrap.js", data: bootstrap },
  { name: "LICENSE", data: license }
];
const projectArchive = createZip(minimalEntries);
const projectName = "variant-c-current-packager-1.0.2.xpi";
await writeFile(path.join(output, projectName), projectArchive);
inventory.push({
  variant: "variant-c-current-packager",
  fileName: projectName,
  version: minimalManifest.version,
  strictMinVersion: minimalManifest.applications.zotero.strict_min_version,
  strictMaxVersion: minimalManifest.applications.zotero.strict_max_version,
  sha256: createHash("sha256").update(projectArchive).digest("hex"),
  manifestSha256: createHash("sha256").update(minimalManifestBytes).digest("hex"),
  ...inspectZip(projectArchive)
});

const updateURLManifest = {
  ...minimalManifest,
  applications: {
    ...minimalManifest.applications,
    zotero: {
      ...minimalManifest.applications.zotero,
      update_url: "https://example.invalid/paper-library-checker-canary-updates.json"
    }
  }
};
const updateURLManifestBytes = Buffer.from(`${JSON.stringify(updateURLManifest, null, 2)}\n`);
const updateURLArchive = createZip([
  { name: "manifest.json", data: updateURLManifestBytes },
  { name: "bootstrap.js", data: bootstrap },
  { name: "LICENSE", data: license }
]);
const updateURLName = "variant-e-update-url-only-1.0.2.xpi";
await writeFile(path.join(output, updateURLName), updateURLArchive);
inventory.push({
  variant: "variant-e-update-url-only",
  changedField: "applications.zotero.update_url",
  fileName: updateURLName,
  version: updateURLManifest.version,
  strictMinVersion: updateURLManifest.applications.zotero.strict_min_version,
  strictMaxVersion: updateURLManifest.applications.zotero.strict_max_version,
  sha256: createHash("sha256").update(updateURLArchive).digest("hex"),
  manifestSha256: createHash("sha256").update(updateURLManifestBytes).digest("hex"),
  ...inspectZip(updateURLArchive)
});

const pythonDirectory = await mkdtemp(path.join(tmpdir(), "plc-canary-python-"));
try {
  await writeFile(path.join(pythonDirectory, "manifest.json"), minimalManifestBytes);
  await writeFile(path.join(pythonDirectory, "bootstrap.js"), bootstrap);
  await writeFile(path.join(pythonDirectory, "LICENSE"), license);
  const pythonName = "variant-c-python-packager-1.0.2.xpi";
  const pythonPath = path.join(output, pythonName);
  const pythonScript = [
    "import sys, zipfile",
    "from pathlib import Path",
    "source, target = Path(sys.argv[1]), Path(sys.argv[2])",
    "with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as z:",
    "    for name in ('manifest.json', 'bootstrap.js', 'LICENSE'):",
    "        z.write(source / name, name)"
  ].join("\n");
  execFileSync("python", ["-c", pythonScript, pythonDirectory, pythonPath]);
  const pythonArchive = await readFile(pythonPath);
  inventory.push({
    variant: "variant-c-python-packager",
    fileName: pythonName,
    version: minimalManifest.version,
    strictMinVersion: minimalManifest.applications.zotero.strict_min_version,
    strictMaxVersion: minimalManifest.applications.zotero.strict_max_version,
    sha256: createHash("sha256").update(pythonArchive).digest("hex"),
    manifestSha256: createHash("sha256").update(minimalManifestBytes).digest("hex"),
    ...inspectZip(pythonArchive)
  });
} finally {
  await rm(pythonDirectory, { recursive: true, force: true });
}

await writeFile(
  path.join(output, "inventory.local.json"),
  `${JSON.stringify({
    schemaVersion: 1,
    variants: inventory,
    variantC: "BUILT_AFTER_RUNTIME_PARSE_REJECTION",
    variantDPackagerComparison: "BUILT_IDENTICAL_CONTENT",
    containsPrivatePath: false
  }, null, 2)}\n`
);
console.log(JSON.stringify(inventory, null, 2));
