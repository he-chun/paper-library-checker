import { unzipSync, zipSync } from "fflate";

const FIXED_MTIME = new Date(1980, 0, 1, 0, 0, 0);
const MAX_ENTRIES = 1000;
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 1000;

const crcTable = Array.from({ length: 256 }, (_, number) => {
  let value = number;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function validateEntryName(name) {
  if (typeof name !== "string" || !name || name.includes("\0") || name.includes("\\")) {
    throw new Error(`Unsafe ZIP entry name: ${JSON.stringify(name)}`);
  }
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) {
    throw new Error(`Absolute ZIP entry path: ${name}`);
  }
  const parts = name.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Ambiguous ZIP entry path: ${name}`);
  }
  return name;
}

export function createZip(entries) {
  const files = {};
  const names = new Set();
  let totalBytes = 0;
  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    const name = validateEntryName(entry.name);
    if (names.has(name)) throw new Error(`Duplicate ZIP entry: ${name}`);
    names.add(name);
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    if (data.length > MAX_ENTRY_BYTES) throw new Error(`ZIP entry is too large: ${name}`);
    totalBytes += data.length;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error("ZIP total uncompressed size is too large");
    files[name] = [new Uint8Array(data), { level: 9, mtime: FIXED_MTIME }];
  }
  return Buffer.from(zipSync(files, { level: 9, mtime: FIXED_MTIME }));
}

function findEndOfCentralDirectory(buffer) {
  const minimum = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("ZIP end-of-central-directory record not found");
}

function parseEntries(buffer) {
  const endOffset = findEndOfCentralDirectory(buffer);
  const disk = buffer.readUInt16LE(endOffset + 4);
  const centralDisk = buffer.readUInt16LE(endOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(endOffset + 8);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const centralSize = buffer.readUInt32LE(endOffset + 12);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  if (disk || centralDisk || entriesOnDisk !== entryCount) throw new Error("Multi-disk ZIP archives are not supported");
  if (entryCount > MAX_ENTRIES) throw new Error("ZIP contains too many entries");
  if (centralOffset + centralSize !== endOffset) throw new Error("ZIP central directory boundaries are inconsistent");

  const entries = [];
  const names = new Set();
  let offset = centralOffset;
  let totalBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid central-directory entry signature");
    const madeBy = buffer.readUInt16LE(offset + 4);
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const modifiedTime = buffer.readUInt16LE(offset + 12);
    const modifiedDate = buffer.readUInt16LE(offset + 14);
    const crc = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const externalAttributes = buffer.readUInt32LE(offset + 38);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = validateEntryName(buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"));
    if (names.has(name)) throw new Error(`Duplicate ZIP entry: ${name}`);
    names.add(name);
    if (flags & 0x0001) throw new Error(`Encrypted ZIP entry is not allowed: ${name}`);
    if (flags & 0x0008) throw new Error(`Data-descriptor ZIP entry is not allowed: ${name}`);
    if (![0, 8].includes(method)) throw new Error(`Unsupported ZIP compression method for ${name}`);
    if (size > MAX_ENTRY_BYTES) throw new Error(`ZIP entry is too large: ${name}`);
    if (compressedSize && size / compressedSize > MAX_COMPRESSION_RATIO) throw new Error(`Suspicious ZIP compression ratio: ${name}`);
    totalBytes += size;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error("ZIP total uncompressed size is too large");
    const unixMode = (externalAttributes >>> 16) & 0xffff;
    if ((madeBy >>> 8) === 3 && (unixMode & 0xf000) === 0xa000) throw new Error(`ZIP symlink is not allowed: ${name}`);
    entries.push({ name, flags, method, modifiedTime, modifiedDate, crc, compressedSize, size, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset !== endOffset) throw new Error("ZIP central directory length is inconsistent");
  return entries;
}

export function inspectZip(buffer, { requireManifest = true } = {}) {
  const archive = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const entries = parseEntries(archive);
  const spans = [];
  for (const entry of entries) {
    const offset = entry.localOffset;
    if (archive.readUInt32LE(offset) !== 0x04034b50) throw new Error(`Invalid local header for ${entry.name}`);
    const flags = archive.readUInt16LE(offset + 6);
    const method = archive.readUInt16LE(offset + 8);
    const modifiedTime = archive.readUInt16LE(offset + 10);
    const modifiedDate = archive.readUInt16LE(offset + 12);
    const crc = archive.readUInt32LE(offset + 14);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const size = archive.readUInt32LE(offset + 22);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const name = archive.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    if (name !== entry.name || flags !== entry.flags || method !== entry.method || crc !== entry.crc
      || compressedSize !== entry.compressedSize || size !== entry.size
      || modifiedTime !== entry.modifiedTime || modifiedDate !== entry.modifiedDate) {
      throw new Error(`Local and central ZIP headers disagree for ${entry.name}`);
    }
    const dataStart = offset + 30 + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > archive.length) throw new Error(`ZIP entry exceeds archive bounds: ${entry.name}`);
    spans.push({ start: offset, end: dataEnd, name: entry.name });
  }
  spans.sort((a, b) => a.start - b.start);
  for (let index = 1; index < spans.length; index += 1) {
    if (spans[index - 1].end > spans[index].start) throw new Error(`Overlapping ZIP entries: ${spans[index].name}`);
  }

  const extracted = unzipSync(new Uint8Array(archive));
  const extractedNames = Object.keys(extracted).sort();
  const expectedNames = entries.map((entry) => entry.name).sort();
  if (JSON.stringify(extractedNames) !== JSON.stringify(expectedNames)) throw new Error("Extracted ZIP inventory does not match the central directory");
  for (const entry of entries) {
    const data = extracted[entry.name];
    if (data.length !== entry.size || crc32(data) !== entry.crc) throw new Error(`ZIP CRC or size mismatch: ${entry.name}`);
  }
  if (requireManifest && !extractedNames.includes("manifest.json")) throw new Error("Archive root does not contain manifest.json");
  return {
    entries: expectedNames,
    entryCount: entries.length,
    compressedBytes: archive.length,
    uncompressedBytes: entries.reduce((sum, entry) => sum + entry.size, 0),
    dataDescriptorEntries: entries.filter((entry) => entry.flags & 0x0008).length,
    overlappedComponents: false
  };
}
