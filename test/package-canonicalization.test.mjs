import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PACKAGE_ENTRY_KIND,
  canonicalizePackageEntry,
  classifyPackageEntry,
  createPackageArtifacts
} from "../scripts/package-entries.mjs";
import { createUpdateManifest, serializeUpdateManifest } from "../scripts/generate-zotero-update-manifest.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const EXPECTED = {
  xpi: "91331ef1bcee06c34bbcadaaf956866b5c06125999da630f48f0f6837234ef59",
  extension: "ef69fec94e4ac8bb9de87b4b1c6ab42b226c50d895a6df893150da2f07dc9bd5",
  updates: "9f4bc8e052e7a8325b99a84375b9d81b2a2876b24fde1797a031f18c14573420"
};
const sha256 = (data) => createHash("sha256").update(data).digest("hex");

test("classifies and canonicalizes package entries without mutating input", () => {
  for (const name of ["a.js", "a.mjs", "a.json", "a.rdf", "a.manifest", "a.html", "a.css", "a.md", "a.txt", "LICENSE", "THIRD_PARTY_NOTICES.md", "NOTICE"]) {
    assert.equal(classifyPackageEntry(name), PACKAGE_ENTRY_KIND.TEXT, name);
  }
  assert.equal(classifyPackageEntry("image.png"), PACKAGE_ENTRY_KIND.BINARY);
  assert.equal(classifyPackageEntry("unknown.dat"), PACKAGE_ENTRY_KIND.REJECTED);

  const lf = Buffer.from("first\nsecond\n");
  const crlf = Buffer.from("first\r\nsecond\r\n");
  const bareCr = Buffer.from("first\rsecond\r");
  const original = Buffer.from(crlf);
  assert.deepEqual(canonicalizePackageEntry("a.js", lf), lf);
  assert.deepEqual(canonicalizePackageEntry("a.js", crlf), lf);
  assert.deepEqual(canonicalizePackageEntry("a.js", bareCr), lf);
  assert.deepEqual(crlf, original);
  assert.equal(canonicalizePackageEntry("a.txt", Buffer.from("no-newline")).toString(), "no-newline");
  assert.equal(canonicalizePackageEntry("a.txt", Buffer.from("one-newline\r\n")).toString(), "one-newline\n");

  const binary = Buffer.from([0, 13, 10, 255]);
  assert.deepEqual(canonicalizePackageEntry("image.png", binary), binary);
  assert.throws(() => canonicalizePackageEntry("unknown.dat", Buffer.alloc(0)), /Unclassified/);
  assert.throws(() => canonicalizePackageEntry("a.js", Buffer.from([0xef, 0xbb, 0xbf, 0x61])), /BOM/);
  assert.throws(() => canonicalizePackageEntry("a.js", Buffer.from([0xc3, 0x28])), /Invalid UTF-8/);
});

async function walkFiles(directory, relative = "") {
  const result = [];
  for (const item of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    const name = path.posix.join(relative.replaceAll("\\", "/"), item.name);
    if (item.isDirectory()) result.push(...await walkFiles(directory, name));
    else result.push(name);
  }
  return result.sort();
}

function withEol(text, mode) {
  const normalized = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  if (mode === "lf") return normalized;
  if (mode === "crlf") return normalized.replaceAll("\n", "\r\n");
  let line = 0;
  return normalized.replaceAll("\n", () => (++line % 2 ? "\r\n" : "\r"));
}

async function snapshot(parent, mode) {
  const directory = path.join(parent, mode);
  await cp(path.join(root, "zotero-plugin"), path.join(directory, "zotero-plugin"), { recursive: true });
  await cp(path.join(root, "browser-extension"), path.join(directory, "browser-extension"), { recursive: true });
  for (const name of ["package.json", "LICENSE", "THIRD_PARTY_NOTICES.md"]) {
    await cp(path.join(root, name), path.join(directory, name));
  }
  const files = [];
  for (const packageRoot of ["zotero-plugin", "browser-extension"]) {
    for (const name of await walkFiles(path.join(directory, packageRoot))) {
      files.push({ name, file: path.join(directory, packageRoot, name) });
    }
  }
  files.push({ name: "LICENSE", file: path.join(directory, "LICENSE") });
  files.push({ name: "THIRD_PARTY_NOTICES.md", file: path.join(directory, "THIRD_PARTY_NOTICES.md") });
  for (const { name, file } of files) {
    const data = await readFile(file);
    if (classifyPackageEntry(name) === PACKAGE_ENTRY_KIND.TEXT) await writeFile(file, withEol(new TextDecoder("utf8", { fatal: true }).decode(data), mode));
  }
  return directory;
}

test("LF, CRLF, and mixed-EOL snapshots produce identical canonical artifacts", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "plc-eol-snapshots-"));
  try {
    const results = [];
    for (const mode of ["lf", "crlf", "mixed"]) {
      const directory = await snapshot(parent, mode);
      const before = Object.fromEntries(await Promise.all((await walkFiles(directory)).map(async (name) => [name, sha256(await readFile(path.join(directory, name)))])));
      const built = await createPackageArtifacts(directory);
      const after = Object.fromEntries(await Promise.all((await walkFiles(directory)).map(async (name) => [name, sha256(await readFile(path.join(directory, name)))])));
      assert.deepEqual(after, before, `${mode} source snapshot was modified`);
      const [xpi, extension] = built.artifacts;
      const packageJson = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
      const manifest = JSON.parse(await readFile(path.join(directory, "zotero-plugin", "manifest.json"), "utf8"));
      const updates = serializeUpdateManifest(createUpdateManifest({ packageJson, manifest, xpiSha256: sha256(xpi.data) }));
      results.push({ xpi: xpi.data, extension: extension.data, checksums: built.checksums, updates });
    }
    for (const result of results.slice(1)) {
      assert.deepEqual(result.xpi, results[0].xpi);
      assert.deepEqual(result.extension, results[0].extension);
      assert.equal(result.checksums, results[0].checksums);
      assert.deepEqual(result.updates, results[0].updates);
    }
    assert.equal(sha256(results[0].xpi), EXPECTED.xpi);
    assert.equal(sha256(results[0].extension), EXPECTED.extension);
    assert.equal(sha256(results[0].updates), EXPECTED.updates);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
