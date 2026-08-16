import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectZip } from "../scripts/zip.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

test("production manifest and generated update channel close over the built XPI", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "plc-updates-"));
  const updatesFile = path.join(directory, "updates.json");
  try {
    const env = { ...process.env, PLC_DIST_DIR: directory, PLC_UPDATES_FILE: updatesFile };
    execFileSync(process.execPath, [path.join(root, "scripts", "package.mjs")], { env });
    execFileSync(process.execPath, [path.join(root, "scripts", "generate-zotero-update-manifest.mjs")], { env });
    execFileSync(process.execPath, [path.join(root, "scripts", "validate-zotero-update-manifest.mjs")], { env });
    const manifest = JSON.parse(await readFile(path.join(root, "zotero-plugin", "manifest.json"), "utf8"));
    const updates = JSON.parse(await readFile(updatesFile, "utf8"));
    const item = updates.addons[manifest.applications.zotero.id].updates[0];
    assert.equal(manifest.version, "0.3.0");
    assert.equal(manifest.applications.zotero.strict_min_version, "9.0");
    assert.equal(manifest.applications.zotero.strict_max_version, "9.0.*");
    assert.equal(manifest.applications.zotero.update_url, "https://raw.githubusercontent.com/he-chun/paper-library-checker/main/updates.json");
    assert.match(item.update_hash, /^sha256:[0-9a-f]{64}$/);
    assert.equal(item.version, manifest.version);
    for (const name of [
      "paper-library-checker-zotero-0.3.0.xpi",
      "paper-library-checker-extension-0.3.0.zip"
    ]) {
      assert.equal(inspectZip(await readFile(path.join(directory, name))).entries.includes("updates.json"), false);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("update generation is deterministic for unchanged artifacts", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "plc-updates-deterministic-"));
  const updatesFile = path.join(directory, "updates.json");
  try {
    const env = { ...process.env, PLC_DIST_DIR: directory, PLC_UPDATES_FILE: updatesFile };
    execFileSync(process.execPath, [path.join(root, "scripts", "package.mjs")], { env });
    execFileSync(process.execPath, [path.join(root, "scripts", "generate-zotero-update-manifest.mjs")], { env });
    const first = await readFile(updatesFile);
    execFileSync(process.execPath, [path.join(root, "scripts", "generate-zotero-update-manifest.mjs")], { env });
    assert.deepEqual(await readFile(updatesFile), first);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
