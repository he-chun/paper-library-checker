import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createZip } from "./zip.mjs";

export const PACKAGE_ENTRY_KIND = Object.freeze({
  TEXT: "CANONICAL_UTF8_TEXT",
  BINARY: "BINARY_PASSTHROUGH",
  REJECTED: "UNCLASSIFIED_REJECTED"
});

const TEXT_NAMES = new Set(["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"]);
const TEXT_EXTENSIONS = new Set([".js", ".mjs", ".json", ".rdf", ".manifest", ".html", ".css", ".md", ".txt"]);
const BINARY_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2"]);
const FORBIDDEN = /(^|\/)(?:\.git|\.claude|\.codex|node_modules|tests?|fixtures?|dist)(?:\/|$)|\.(?:log|sqlite3?|db|jsonl|pem|key|p12|pfx|zip|xpi)$/i;

export function classifyPackageEntry(name) {
  const normalized = String(name).replaceAll("\\", "/");
  const base = path.posix.basename(normalized);
  const extension = path.posix.extname(base).toLowerCase();
  if (TEXT_NAMES.has(base) || TEXT_EXTENSIONS.has(extension)) return PACKAGE_ENTRY_KIND.TEXT;
  if (BINARY_EXTENSIONS.has(extension)) return PACKAGE_ENTRY_KIND.BINARY;
  return PACKAGE_ENTRY_KIND.REJECTED;
}

export function canonicalizePackageEntry(name, input) {
  const source = Buffer.from(input);
  const kind = classifyPackageEntry(name);
  if (kind === PACKAGE_ENTRY_KIND.REJECTED) throw new Error(`Unclassified package entry: ${name}`);
  if (kind === PACKAGE_ENTRY_KIND.BINARY) return Buffer.from(source);
  if (source.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    throw new Error(`UTF-8 BOM is not allowed in package entry: ${name}`);
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(source);
  } catch {
    throw new Error(`Invalid UTF-8 package entry: ${name}`);
  }
  return Buffer.from(text.replaceAll("\r\n", "\n").replaceAll("\r", "\n"), "utf8");
}

export async function collectPackageEntries(directory, relative = "") {
  const result = [];
  for (const item of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    const name = path.posix.join(relative.replaceAll("\\", "/"), item.name);
    if (FORBIDDEN.test(name)) continue;
    if (item.isSymbolicLink()) throw new Error(`Symlink package entry is not allowed: ${name}`);
    if (item.isDirectory()) result.push(...await collectPackageEntries(directory, name));
    else if (item.isFile()) result.push({ name, data: canonicalizePackageEntry(name, await readFile(path.join(directory, name))) });
    else throw new Error(`Unsupported package entry type: ${name}`);
  }
  return result.sort((left, right) => left.name.localeCompare(right.name));
}

export async function createPackageArtifacts(sourceRoot) {
  const packageJson = JSON.parse(await readFile(path.join(sourceRoot, "package.json"), "utf8"));
  const distributionEntries = [];
  for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md", "NOTICE"]) {
    try {
      distributionEntries.push({ name, data: canonicalizePackageEntry(name, await readFile(path.join(sourceRoot, name))) });
    } catch (error) {
      if (name === "NOTICE" && error.code === "ENOENT") continue;
      throw error;
    }
  }
  const pluginEntries = [...await collectPackageEntries(path.join(sourceRoot, "zotero-plugin")), ...distributionEntries];
  const extensionEntries = [...await collectPackageEntries(path.join(sourceRoot, "browser-extension")), ...distributionEntries];
  const artifacts = [
    { name: `paper-library-checker-zotero-${packageJson.version}.xpi`, data: createZip(pluginEntries) },
    { name: `paper-library-checker-extension-${packageJson.version}.zip`, data: createZip(extensionEntries) }
  ];
  const checksums = artifacts.map(({ name, data }) => `${createHash("sha256").update(data).digest("hex")}  ${name}`).join("\n") + "\n";
  return { artifacts, checksums, pluginEntries, extensionEntries };
}
