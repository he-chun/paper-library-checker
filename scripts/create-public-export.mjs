import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, lstat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { canonicalizePackageEntry, classifyPackageEntry, PACKAGE_ENTRY_KIND } from "./package-entries.mjs";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_TEXT_EXTENSIONS = new Set([".yml", ".yaml", ".ps1", ".py"]);
const PUBLIC_TEXT_NAMES = new Set([".gitattributes", ".editorconfig", ".gitignore"]);
const DOCUMENT_EXTENSIONS = new Set([".md", ".json"]);
const FORBIDDEN_PUBLIC_CONTENT = [
  /\b[A-Za-z]:[\\/]/,
  /file:\/\/\//i,
  /(?:^|[\\/])Users[\\/]/i,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/
];

export function validateExportPath(value) {
  if (typeof value !== "string" || !value || value.includes("\\") || value.includes("\0")
    || value.startsWith("/") || /^[A-Za-z]:/.test(value)) throw new Error(`Unsafe public export path: ${value}`);
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) throw new Error(`Unsafe public export path: ${value}`);
  return value;
}

export function scanPublicDocument(name, input) {
  const text = (Buffer.isBuffer(input) ? input.toString("utf8") : String(input))
    .replace(/"id"\s*:\s*"[^"\r\n]+@[^"\r\n]+"/g, "\"id\":\"<public-addon-id>\"")
    .replace(/"[^"\r\n]+@he-chun\.github\.io"\s*:/g, "\"<public-addon-id>\":");
  for (const pattern of FORBIDDEN_PUBLIC_CONTENT) {
    if (pattern.test(text)) throw new Error(`Private content in public document: ${name}`);
  }
}

function canonicalizeExportEntry(name, input) {
  const kind = classifyPackageEntry(name);
  if (kind !== PACKAGE_ENTRY_KIND.REJECTED) return canonicalizePackageEntry(name, input);
  const base = path.posix.basename(name);
  if (PUBLIC_TEXT_NAMES.has(base) || PUBLIC_TEXT_EXTENSIONS.has(path.posix.extname(base).toLowerCase())) {
    return canonicalizePackageEntry(`${base}.txt`, input);
  }
  throw new Error(`Unclassified public export entry: ${name}`);
}

export async function loadPublicExportManifest(sourceRoot = root) {
  const manifest = JSON.parse(await readFile(path.join(sourceRoot, "scripts", "public-export-manifest.json"), "utf8"));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files) || !Array.isArray(manifest.directories)) {
    throw new Error("Invalid public export manifest");
  }
  return manifest;
}

export async function trackedFiles(sourceRoot = root) {
  try {
    const { stdout: topLevel } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd: sourceRoot });
    if (path.resolve(topLevel.trim()) === path.resolve(sourceRoot)) {
      const { stdout } = await execFileAsync("git", ["ls-files", "-z"], { cwd: sourceRoot, encoding: "buffer" });
      const names = stdout.toString("utf8").split("\0").filter(Boolean).map((name) => name.replaceAll("\\", "/"));
      if (names.length) return new Set(names);
    }
  } catch {
    // A fresh public export intentionally has no source repository history.
  }
  const inventory = JSON.parse(await readFile(path.join(sourceRoot, "public-export-inventory.json"), "utf8"));
  if (inventory.schemaVersion !== 1 || !Array.isArray(inventory.files)) throw new Error("Invalid public export inventory");
  return new Set(inventory.files.map((entry) => validateExportPath(entry.path)));
}

export function resolveExportFiles(manifest, tracked) {
  const selected = new Set();
  for (const name of manifest.files) {
    const safe = validateExportPath(name);
    if (!tracked.has(safe)) throw new Error(`Missing tracked public export source: ${safe}`);
    if (selected.has(safe)) throw new Error(`Duplicate public export destination: ${safe}`);
    selected.add(safe);
  }
  for (const directory of manifest.directories) {
    const safe = validateExportPath(directory);
    const prefix = `${safe}/`;
    const matches = [...tracked].filter((name) => name.startsWith(prefix)).sort();
    if (!matches.length) throw new Error(`Empty public export directory: ${safe}`);
    for (const name of matches) {
      if (selected.has(name)) throw new Error(`Duplicate public export destination: ${name}`);
      selected.add(name);
    }
  }
  return [...selected].sort();
}

export async function createPublicExport({ sourceRoot = root, destination }) {
  if (!destination) throw new Error("Public export destination is required");
  const destinationPath = path.resolve(destination);
  const sourcePath = path.resolve(sourceRoot);
  if (destinationPath === sourcePath || destinationPath.startsWith(`${sourcePath}${path.sep}`)) {
    throw new Error("Public export destination must be outside the source repository");
  }
  const manifest = await loadPublicExportManifest(sourcePath);
  const files = resolveExportFiles(manifest, await trackedFiles(sourcePath));
  const inventory = [];
  await mkdir(destinationPath, { recursive: false });
  for (const name of files) {
    const source = path.join(sourcePath, ...name.split("/"));
    const info = await lstat(source);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Public export source must be a regular file: ${name}`);
    const data = canonicalizeExportEntry(name, await readFile(source));
    if (DOCUMENT_EXTENSIONS.has(path.posix.extname(name).toLowerCase())) scanPublicDocument(name, data);
    const target = path.join(destinationPath, ...name.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
    inventory.push({ path: name, bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") });
  }
  const contentTreeSha256 = createHash("sha256").update(inventory.map((entry) => `${entry.path}\0${entry.bytes}\0${entry.sha256}\n`).join("")).digest("hex");
  const report = { schemaVersion: 1, fileCount: inventory.length, contentTreeSha256, files: inventory };
  await writeFile(path.join(destinationPath, "public-export-inventory.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== "--output") throw new Error("Usage: node scripts/create-public-export.mjs --output <directory>");
  return argv[1];
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const report = await createPublicExport({ destination: parseArguments(process.argv.slice(2)) });
  console.log(`public export: files=${report.fileCount} contentTreeSha256=${report.contentTreeSha256}`);
}
