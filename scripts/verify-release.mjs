import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { inspectZip } from "./zip.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
// SHA-256 of the official Apache-2.0 text with LF line endings and no BOM.
const APACHE_2_0_LF_SHA256 = "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4";
const REQUIRED_DISTRIBUTION_FILES = ["LICENSE", "THIRD_PARTY_NOTICES.md"];

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

export function validateApacheLicense(data) {
  const buffer = Buffer.from(data);
  if (buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    throw new Error("LICENSE must not contain a UTF-8 BOM");
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  if (text.replaceAll("\r\n", "").includes("\r")) {
    throw new Error("LICENSE contains a non-standard line ending");
  }
  const normalized = text.replaceAll("\r\n", "\n");
  const digest = sha256(Buffer.from(normalized, "utf8"));
  if (digest !== APACHE_2_0_LF_SHA256) {
    throw new Error("LICENSE is not the unmodified Apache License 2.0 text");
  }
  return digest;
}

export function validatePackageLicense(packageJson, packageLock) {
  if (packageJson.license !== "Apache-2.0") {
    throw new Error(`package.json license must be Apache-2.0, received ${packageJson.license || "<missing>"}`);
  }
  const lockLicense = packageLock.packages?.[""]?.license;
  if (lockLicense !== "Apache-2.0") {
    throw new Error(`package-lock root license must be Apache-2.0, received ${lockLicense || "<missing>"}`);
  }
}

export function validateThirdPartyNotices(data) {
  if (!data || Buffer.from(data).length <= 100) {
    throw new Error("THIRD_PARTY_NOTICES.md is missing or empty");
  }
}

export function validateVersions(versions) {
  if (versions.some((version) => !version) || new Set(versions).size !== 1) {
    throw new Error(`Version mismatch: ${versions.map((version) => version || "<missing>").join(", ")}`);
  }
  return versions[0];
}

export function validateReleaseTag(tag, version) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error(`Release tag must be vX.Y.Z, received ${tag || "<empty>"}`);
  if (tag.slice(1) !== version) throw new Error(`Tag ${tag} does not match version ${version}`);
}

export function validateRequiredEntries(entries, noticeRequired) {
  const names = new Set(entries);
  for (const name of ["manifest.json", ...REQUIRED_DISTRIBUTION_FILES]) {
    if (!names.has(name)) throw new Error(`Release artifact is missing ${name}`);
  }
  if (noticeRequired && !names.has("NOTICE")) throw new Error("Release artifact is missing NOTICE");
  if (!noticeRequired && names.has("NOTICE")) throw new Error("Release artifact contains a stale NOTICE");
}

async function optionalFile(name) {
  try {
    const data = await readFile(path.join(root, name));
    const info = await stat(path.join(root, name));
    if (!info.isFile()) throw new Error(`${name} must be a regular file`);
    return data;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function main() {
  const [packageData, lockData, browserData, pluginData, rdf, server, license, thirdParty] = await Promise.all([
    readFile(path.join(root, "package.json"), "utf8"),
    readFile(path.join(root, "package-lock.json"), "utf8"),
    readFile(path.join(root, "browser-extension", "manifest.json"), "utf8"),
    readFile(path.join(root, "zotero-plugin", "manifest.json"), "utf8"),
    readFile(path.join(root, "zotero-plugin", "install.rdf"), "utf8"),
    readFile(path.join(root, "zotero-plugin", "src", "server.js"), "utf8"),
    readFile(path.join(root, "LICENSE")),
    readFile(path.join(root, "THIRD_PARTY_NOTICES.md"))
  ]);
  const packageJson = JSON.parse(packageData);
  const packageLock = JSON.parse(lockData);
  const browser = JSON.parse(browserData);
  const plugin = JSON.parse(pluginData);
  validatePackageLicense(packageJson, packageLock);
  const licenseDigest = validateApacheLicense(license);
  validateThirdPartyNotices(thirdParty);
  const notice = await optionalFile("NOTICE");

  const versions = [
    packageJson.version,
    browser.version,
    plugin.version,
    rdf.match(/<em:version>([^<]+)<\/em:version>/)?.[1],
    server.match(/this\.pluginVersion\s*=\s*"([^"]+)"/)?.[1]
  ];
  validateVersions(versions);

  const tag = process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME || "";
  validateReleaseTag(tag, packageJson.version);

  const dist = process.env.PLC_DIST_DIR ? path.resolve(root, process.env.PLC_DIST_DIR) : path.join(root, "dist");
  const artifactNames = [
    `paper-library-checker-zotero-${packageJson.version}.xpi`,
    `paper-library-checker-extension-${packageJson.version}.zip`
  ];
  const checksumLines = (await readFile(path.join(dist, "SHA256SUMS.txt"), "utf8")).trimEnd().split("\n");
  if (checksumLines.length !== artifactNames.length) throw new Error("SHA256SUMS.txt must contain exactly two artifacts");
  const expectedChecksums = new Map();
  for (const line of checksumLines) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    if (!match || expectedChecksums.has(match[2])) throw new Error(`Invalid SHA256SUMS.txt line: ${line}`);
    expectedChecksums.set(match[2], match[1]);
  }

  const rootFiles = new Map([
    ["LICENSE", license],
    ["THIRD_PARTY_NOTICES.md", thirdParty]
  ]);
  if (notice) rootFiles.set("NOTICE", notice);
  for (const name of artifactNames) {
    const artifact = await readFile(path.join(dist, name));
    inspectZip(artifact);
    const extracted = unzipSync(new Uint8Array(artifact));
    validateRequiredEntries(Object.keys(extracted), Boolean(notice));
    for (const [entryName, expected] of rootFiles) {
      if (!Buffer.from(extracted[entryName]).equals(expected)) {
        throw new Error(`${name} contains a modified ${entryName}`);
      }
    }
    if (sha256(artifact) !== expectedChecksums.get(name)) throw new Error(`Checksum mismatch for ${name}`);
  }

  console.log(`release metadata valid: tag=${tag} version=${packageJson.version} license_sha256=${licenseDigest}`);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) await main();
