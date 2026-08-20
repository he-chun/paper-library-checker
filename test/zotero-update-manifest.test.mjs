import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectZip } from "../scripts/zip.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

test("published manifest points to v0.4.0 while preserving v0.3.0 qualification evidence", async () => {
  const published = await readFile(path.join(root, "updates.json"));
  const qualification = JSON.parse(await readFile(path.join(root, "docs", "verification", "release-qualification-0.3.0.json"), "utf8"));
  const updates = JSON.parse(published);
  const item = updates.addons["paper-library-checker@he-chun.github.io"].updates[0];
  assert.equal(item.version, "0.4.0");
  assert.equal(item.update_link, "https://github.com/he-chun/paper-library-checker/releases/download/v0.4.0/paper-library-checker-zotero-0.4.0.xpi");
  assert.equal(item.update_hash, "sha256:85cc29a5129092a759528e2ca63a6700877c3cedb1b5fe58872f52d3e1c765e7");
  assert.equal(createHash("sha256").update(published).digest("hex"), "57700df0e04a08b6494e96ed1644859803076c97247bacce43d5e5fd7c63693f");
  assert.equal(qualification.artifactSha256.xpi, "91331ef1bcee06c34bbcadaaf956866b5c06125999da630f48f0f6837234ef59");
  assert.equal(qualification.artifactSha256.extensionZip, "ef69fec94e4ac8bb9de87b4b1c6ab42b226c50d895a6df893150da2f07dc9bd5");
});

test("development candidate manifest closes over the current built XPI without changing the published channel", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "plc-updates-"));
  const updatesFile = path.join(directory, "updates.json");
  try {
    const env = { ...process.env, PLC_DIST_DIR: directory, PLC_UPDATES_FILE: updatesFile };
    execFileSync(process.execPath, [path.join(root, "scripts", "package.mjs")], { env });
    const publishedBefore = await readFile(path.join(root, "updates.json"));
    execFileSync(process.execPath, [path.join(root, "scripts", "generate-zotero-update-manifest.mjs"), "--candidate"], { env });
    execFileSync(process.execPath, [path.join(root, "scripts", "validate-zotero-update-manifest.mjs"), "--candidate"], { env });
    const manifest = JSON.parse(await readFile(path.join(root, "zotero-plugin", "manifest.json"), "utf8"));
    const updates = JSON.parse(await readFile(updatesFile, "utf8"));
    const item = updates.addons[manifest.applications.zotero.id].updates[0];
    assert.equal(manifest.version, "0.4.0");
    assert.equal(manifest.applications.zotero.strict_min_version, "9.0");
    assert.equal(manifest.applications.zotero.strict_max_version, "9.0.*");
    assert.equal(manifest.applications.zotero.update_url, "https://raw.githubusercontent.com/he-chun/paper-library-checker/main/updates.json");
    assert.match(item.update_hash, /^sha256:[0-9a-f]{64}$/);
    assert.equal(item.version, manifest.version);
    assert.equal(item.update_link, "https://candidate.invalid/paper-library-checker-zotero-0.4.0.xpi");
    assert.deepEqual(await readFile(path.join(root, "updates.json")), publishedBefore);
    for (const name of [
      "paper-library-checker-zotero-0.4.0.xpi",
      "paper-library-checker-extension-0.4.0.zip"
    ]) {
      assert.equal(inspectZip(await readFile(path.join(directory, name))).entries.includes("updates.json"), false);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("candidate update generation is deterministic for unchanged artifacts", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "plc-updates-deterministic-"));
  const updatesFile = path.join(directory, "updates.json");
  try {
    const env = { ...process.env, PLC_DIST_DIR: directory, PLC_UPDATES_FILE: updatesFile };
    execFileSync(process.execPath, [path.join(root, "scripts", "package.mjs")], { env });
    execFileSync(process.execPath, [path.join(root, "scripts", "generate-zotero-update-manifest.mjs"), "--candidate"], { env });
    const first = await readFile(updatesFile);
    execFileSync(process.execPath, [path.join(root, "scripts", "generate-zotero-update-manifest.mjs"), "--candidate"], { env });
    assert.deepEqual(await readFile(updatesFile), first);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
