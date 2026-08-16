import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadPublicExportManifest,
  resolveExportFiles,
  scanPublicDocument,
  validateExportPath
} from "../scripts/create-public-export.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const EXCLUDED_REPORTS = [
  "docs/open-source-release-checklist.md",
  "docs/readiness-review-final-v4.md",
  "docs/verification/zotero9-runtime-remediation.json",
  "docs/verification/zotero-activation-diagnosis.md",
  "docs/verification/zotero-activation-diagnosis.json"
];

test("public export paths are relative, unique, tracked allowlist entries", () => {
  for (const unsafe of ["/absolute", "C:/absolute", "../parent", "a/../b", "a\\b", "a//b", ""]) {
    assert.throws(() => validateExportPath(unsafe), /Unsafe/);
  }
  const tracked = new Set(["README.md", "scripts/a.mjs", "scripts/b.json"]);
  assert.deepEqual(resolveExportFiles({ files: ["README.md"], directories: ["scripts"] }, tracked), ["README.md", "scripts/a.mjs", "scripts/b.json"]);
  assert.throws(() => resolveExportFiles({ files: ["missing.md"], directories: [] }, tracked), /Missing tracked/);
  assert.throws(() => resolveExportFiles({ files: ["scripts/a.mjs"], directories: ["scripts"] }, tracked), /Duplicate/);
});

test("public export manifest excludes superseded engineering reports", async () => {
  const manifest = await loadPublicExportManifest(root);
  const serialized = JSON.stringify(manifest);
  for (const name of EXCLUDED_REPORTS) assert.equal(serialized.includes(name), false, name);
  for (const required of [".gitattributes", ".editorconfig", "README.md", "LICENSE", "updates.json"]) {
    assert(manifest.files.includes(required), required);
  }
  assert.equal(manifest.directories.includes("scripts"), false);
  assert.deepEqual(
    manifest.files.filter(name => name.startsWith("docs/verification/")).sort(),
    [
      "docs/verification/public-export-boundary.md",
      "docs/verification/release-qualification-0.3.0.json",
      "docs/verification/release-qualification-0.3.0.md",
      "docs/verification/reproducible-artifact-policy.md"
    ]
  );
});

test("public privacy scanner rejects synthetic private content", () => {
  assert.doesNotThrow(() => scanPublicDocument("safe.md", "Synthetic public-safe report"));
  assert.doesNotThrow(() => scanPublicDocument("updates.json", '{"addons":{"paper-library-checker@he-chun.github.io":{}}}'));
  const syntheticGitHubToken = ["github", "_pat_", "1".repeat(30)].join("");
  for (const value of ["C:\\private\\profile", "file:///private/profile", "user@example.invalid", syntheticGitHubToken]) {
    assert.throws(() => scanPublicDocument("synthetic.md", value), /Private content/);
  }
});

async function sourceFiles(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) result.push(...await sourceFiles(file));
    else if (/\.(?:js|mjs)$/.test(item.name)) result.push(file);
  }
  return result;
}

test("tests and scripts do not read excluded historical reports", async () => {
  for (const directory of [path.join(root, "test"), path.join(root, "scripts")]) {
    for (const file of await sourceFiles(directory)) {
      if (file === fileURLToPath(import.meta.url)) continue;
      const source = await readFile(file, "utf8");
      for (const name of EXCLUDED_REPORTS) {
        assert.equal(source.includes(name), false, `${path.relative(root, file)} directly depends on ${name}`);
      }
    }
  }
});
