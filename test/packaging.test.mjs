import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { createZip, inspectZip, validateEntryName } from "../scripts/zip.mjs";
import { assertNoManualVerificationContent } from "../scripts/artifact-policy.mjs";

function centralOffset(archive) {
  for (let offset = archive.length - 22; offset >= 0; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) return archive.readUInt32LE(offset + 16);
  }
  throw new Error("missing central directory");
}

let outputDirectory;

before(async () => {
  outputDirectory = await mkdtemp(path.join(tmpdir(), "plc-packaging-"));
  execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/package.mjs", import.meta.url))], {
    env: { ...process.env, PLC_DIST_DIR: outputDirectory },
    stdio: "pipe"
  });
});

after(async () => rm(outputDirectory, { recursive: true, force: true }));

test("manifests and package versions agree", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url)));
  const browser = JSON.parse(await readFile(new URL("../browser-extension/manifest.json", import.meta.url)));
  const plugin = JSON.parse(await readFile(new URL("../zotero-plugin/manifest.json", import.meta.url)));
  const rdf = await readFile(new URL("../zotero-plugin/install.rdf", import.meta.url), "utf8");
  const server = await readFile(new URL("../zotero-plugin/src/server.js", import.meta.url), "utf8");
  assert.equal(browser.version, packageJson.version);
  assert.equal(plugin.version, packageJson.version);
  assert.match(rdf, new RegExp(`<em:version>${packageJson.version.replaceAll(".", "\\.")}</em:version>`));
  assert.match(server, new RegExp(`this\\.pluginVersion = "${packageJson.version.replaceAll(".", "\\.")}"`));
});

test("builds and inspects release artifacts", () => {
  const output = execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/inspect-artifacts.mjs", import.meta.url))], {
    encoding: "utf8",
    env: { ...process.env, PLC_DIST_DIR: outputDirectory }
  });
  const inventory = JSON.parse(output);
  assert(inventory.plugin.entries.includes("manifest.json"));
  assert(inventory.extension.entries.includes("manifest.json"));
  assert(inventory.plugin.entries.includes("LICENSE"));
  assert(inventory.extension.entries.includes("LICENSE"));
  assert(inventory.plugin.entries.includes("THIRD_PARTY_NOTICES.md"));
  assert(inventory.extension.entries.includes("THIRD_PARTY_NOTICES.md"));
  for (const name of [
    "src/popup.html",
    "src/popup.js",
    "src/popup.css",
    "_locales/en/messages.json",
    "_locales/zh_CN/messages.json",
    "src/common/i18n.js",
    "src/common/ui-state.js",
    "src/common/page-controller.js",
    "src/common/sender-security.js"
  ]) assert(inventory.extension.entries.includes(name), name);
  assert(inventory.plugin.entries.includes("src/i18n.js"));
  assert.equal(inventory.plugin.dataDescriptorEntries, 0);
  assert.equal(inventory.extension.dataDescriptorEntries, 0);
  for (const artifact of Object.values(inventory)) {
    assert.equal(artifact.entries.some((entry) => entry.startsWith("tools/") || entry.includes(".local.")), false);
  }
});

test("artifact policy explicitly rejects manual verification tools and local output", () => {
  for (const entry of [
    "tools/manual-verification/plc-debug-probe.mjs",
    "tools\\manual-verification\\results\\probe.local.json",
    "docs/verification/zotero-debug-log-result-template.md",
    "results/probe.json",
    "probe.debug.log"
  ]) {
    assert.throws(() => assertNoManualVerificationContent([entry], "synthetic.zip"), /forbidden/);
  }
  assert.doesNotThrow(() => assertNoManualVerificationContent(["manifest.json", "src/background.js"]));
});

test("archives do not claim a missing data descriptor", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url)));
  for (const name of [
    `paper-library-checker-zotero-${packageJson.version}.xpi`,
    `paper-library-checker-extension-${packageJson.version}.zip`
  ]) {
    const archive = await readFile(path.join(outputDirectory, name));
    assert.equal(archive.readUInt32LE(0), 0x04034b50);
    const flags = archive.readUInt16LE(6);
    assert.equal(flags & 0x0008, 0, `${name} sets bit 3 without writing a data descriptor`);
  }
});

test("ZIP writer rejects unsafe and duplicate entry names", () => {
  for (const name of ["/absolute", "../escape", "safe/../escape", "C:/absolute", "back\\slash", "nul\0name", "a//b"]) {
    assert.throws(() => validateEntryName(name));
  }
  assert.throws(() => createZip([
    { name: "same.txt", data: "first" },
    { name: "same.txt", data: "second" }
  ]), /Duplicate ZIP entry/);
});

test("deep inspection rejects duplicate, symlink, descriptor, and compression-bomb metadata", () => {
  const duplicate = Buffer.from(createZip([
    { name: "a.txt", data: "a" },
    { name: "b.txt", data: "b" }
  ]));
  const firstCentral = centralOffset(duplicate);
  const firstLength = duplicate.readUInt16LE(firstCentral + 28);
  const secondCentral = firstCentral + 46 + firstLength
    + duplicate.readUInt16LE(firstCentral + 30) + duplicate.readUInt16LE(firstCentral + 32);
  duplicate.write("a.txt", secondCentral + 46, "utf8");
  assert.throws(() => inspectZip(duplicate, { requireManifest: false }), /Duplicate ZIP entry/);

  const symlink = Buffer.from(createZip([{ name: "link", data: "target" }]));
  const symlinkCentral = centralOffset(symlink);
  symlink.writeUInt16LE(3 << 8, symlinkCentral + 4);
  symlink.writeUInt32LE((0xa1ff << 16) >>> 0, symlinkCentral + 38);
  assert.throws(() => inspectZip(symlink, { requireManifest: false }), /symlink/);

  const descriptor = Buffer.from(createZip([{ name: "plain", data: "content" }]));
  const descriptorCentral = centralOffset(descriptor);
  descriptor.writeUInt16LE(descriptor.readUInt16LE(descriptorCentral + 8) | 0x0008, descriptorCentral + 8);
  assert.throws(() => inspectZip(descriptor, { requireManifest: false }), /Data-descriptor/);

  const compressed = Buffer.from(zipSync({ "zeros.bin": new Uint8Array(1024 * 1024) }, { level: 9 }));
  assert.throws(() => inspectZip(compressed, { requireManifest: false }), /compression ratio/);
});
