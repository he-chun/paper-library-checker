import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const browserRoot = path.join(root, "browser-extension");
const storeRoot = path.join(root, "store-assets", "chrome-web-store");
const iconMap = {
  16: "icons/icon16.png",
  32: "icons/icon32.png",
  48: "icons/icon48.png",
  128: "icons/icon128.png"
};

function inspectPng(buffer) {
  assert.deepEqual(buffer.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const chunks = [];
  for (let offset = 8; offset + 12 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    chunks.push(type);
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType: buffer[25],
    chunks
  };
}

test("0.5.0 manifest declares complete production and action icons", async () => {
  const manifest = JSON.parse(await readFile(path.join(browserRoot, "manifest.json"), "utf8"));
  assert.equal(manifest.version, "0.5.0");
  assert.deepEqual(manifest.icons, iconMap);
  assert.deepEqual(manifest.action.default_icon, iconMap);
  assert.equal(manifest.action.default_popup, "src/popup.html");
  assert.equal(manifest.action.default_title, "__MSG_actionTitle__");
});

test("permission and host sets are identical to the 0.4.0 baseline", async () => {
  const manifest = JSON.parse(await readFile(path.join(browserRoot, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.host_permissions, [
    "http://127.0.0.1:23119/*",
    "http://localhost:23119/*",
    "http://127.0.0.1:1969/*",
    "http://localhost:1969/*"
  ]);
  for (const forbidden of ["key", "update_url"]) assert.equal(forbidden in manifest, false);
  for (const forbidden of ["tabs", "activeTab", "<all_urls>"]) {
    assert.equal(manifest.permissions.includes(forbidden), false);
    assert.equal(manifest.host_permissions.includes(forbidden), false);
  }
});

test("production and store PNGs have exact dimensions and no textual metadata", async () => {
  const files = [
    ...Object.entries(iconMap).map(([size, name]) => [path.join(browserRoot, name), Number(size)]),
    [path.join(storeRoot, "store-icon-128.png"), 128],
    [path.join(storeRoot, "source", "icon-master-1024.png"), 1024],
    [path.join(storeRoot, "promo-small-440x280.png"), [440, 280]]
  ];
  for (const [file, size] of files) {
    const png = inspectPng(await readFile(file));
    const [width, height] = Array.isArray(size) ? size : [size, size];
    assert.equal(png.width, width, file);
    assert.equal(png.height, height, file);
    assert.equal(png.bitDepth, 8, file);
    assert.equal(png.colorType, 6, file);
    for (const chunk of ["eXIf", "iTXt", "tEXt", "zTXt"]) assert.equal(png.chunks.includes(chunk), false, `${file}: ${chunk}`);
  }
});

test("reviewed English store screenshots have exact dimensions and no textual metadata", async () => {
  const files = [
    "01-popup-connected-saved.png",
    "02-popup-not-saved.png",
    "03-options.png"
  ];
  for (const name of files) {
    const file = path.join(storeRoot, "screenshots", "en", name);
    const png = inspectPng(await readFile(file));
    assert.equal(png.width, 1280, file);
    assert.equal(png.height, 800, file);
    assert.equal(png.bitDepth, 8, file);
    assert.equal(png.colorType, 6, file);
    for (const chunk of ["eXIf", "iTXt", "tEXt", "zTXt"]) {
      assert.equal(png.chunks.includes(chunk), false, `${file}: ${chunk}`);
    }
  }
});

test("English and Simplified Chinese locale keys remain identical", async () => {
  const en = JSON.parse(await readFile(path.join(browserRoot, "_locales", "en", "messages.json"), "utf8"));
  const zh = JSON.parse(await readFile(path.join(browserRoot, "_locales", "zh_CN", "messages.json"), "utf8"));
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
});

test("listing and reviewer materials preserve core product facts", async () => {
  const en = await readFile(path.join(storeRoot, "listing.en.md"), "utf8");
  const zh = await readFile(path.join(storeRoot, "listing.zh-CN.md"), "utf8");
  const reviewer = await readFile(path.join(storeRoot, "reviewer-instructions.md"), "utf8");
  const normalizedEn = en.replace(/\s+/g, " ");
  const normalizedZh = zh.replace(/\s+/g, " ");
  const pairs = [
    ["Zotero 9.0.x", "Zotero 9.0.x"],
    ["Offline", "Offline"],
    ["does not save", "不会保存"],
    ["does not upload", "不会上传"],
    ["no telemetry", "没有遥测"],
    ["ScienceDirect", "ScienceDirect"],
    ["MDPI References are not supported", "MDPI References 不支持"],
    ["alpha", "alpha"]
  ];
  for (const [englishFact, chineseFact] of pairs) {
    assert(normalizedEn.includes(englishFact), englishFact);
    assert(normalizedZh.includes(chineseFact), chineseFact);
  }
  assert(reviewer.includes("does not require the companion add-on"));
  assert(reviewer.includes("Standard mode"));
  assert(reviewer.includes("Automatic mode"));
  const summary = en.match(/## Summary\s+([^\n]+)/)?.[1] ?? "";
  assert(summary.length > 0 && summary.length <= 132);
});

test("Chrome Web Store materials recommend the current workflow category", async () => {
  const files = [
    "listing.en.md",
    "listing.zh-CN.md",
    "submission-checklist.md",
    "README.md"
  ];
  for (const name of files) {
    const content = await readFile(path.join(storeRoot, name), "utf8");
    assert(content.includes("Workflow & Planning"), name);
  }
});

test("Chrome Web Store materials record the published 0.4.1 item", async () => {
  const readme = await readFile(path.join(storeRoot, "README.md"), "utf8");
  const checklist = await readFile(path.join(storeRoot, "submission-checklist.md"), "utf8");
  const storeUrl = "https://chromewebstore.google.com/detail/paper-library-checker/pmfobjnkoiiplambnbbkfdlfjcbdogon";
  for (const content of [readme, checklist]) {
    assert(content.includes("Listing status: **Published**"));
    assert(content.includes("Version: **0.4.1**"));
    assert(content.includes("pmfobjnkoiiplambnbbkfdlfjcbdogon"));
    assert(content.includes(storeUrl));
  }
  for (const marker of [
    "CWS_PUBLIC_LISTING=PASS",
    "CWS_INSTALL=PASS",
    "CWS_VERSION_0_4_1=PASS",
    "CWS_EXTENSION_ID_MATCH=PASS",
    "CWS_REPAIR_TOKEN=PASS",
    "CWS_CONNECTED_READY=PASS",
    "CWS_ONE_PAGE_CHECK=PASS",
    "CWS_DUPLICATE_CONTENT_SCRIPT=NONE"
  ]) assert(readme.includes(marker), marker);
  for (const marker of [
    "[x] The verified 0.4.1 browser package was uploaded",
    "[x] Chrome Web Store review passed",
    "[x] Manual publication was completed",
    "[x] Distribution is **Public**"
  ]) assert(checklist.includes(marker), marker);
  assert(checklist.includes("they are not a publication blocker"));
});

test("release documentation updates the existing Chrome Web Store item", async () => {
  const releasing = await readFile(path.join(root, "docs", "releasing.md"), "utf8");
  for (const marker of [
    "pmfobjnkoiiplambnbbkfdlfjcbdogon",
    "higher than the current store version",
    "same formal browser ZIP",
    "Do not create a new store item or extension ID",
    "Submit for review",
    "Confirm that the public listing displays the new version",
    "https://developer.chrome.com/docs/webstore/update"
  ]) assert(releasing.includes(marker), marker);
});

test("privacy and permission documents state the Chrome Web Store boundaries", async () => {
  const publicPrivacy = await readFile(path.join(root, "PRIVACY.md"), "utf8");
  const privacy = await readFile(path.join(storeRoot, "privacy-practices.md"), "utf8");
  const permissions = await readFile(path.join(storeRoot, "permission-justifications.md"), "utf8");
  for (const content of [publicPrivacy, privacy]) {
    assert.match(content, /only to provide or improve the extension's single purpose/);
    assert.match(content, /not sold, used for advertising, transferred for unrelated purposes/);
    assert.match(content, /creditworthiness or for lending purposes/);
  }
  assert.match(privacy, /No, this extension does not use remote code\./);
  assert.match(privacy.replace(/\s+/g, " "), /not sent to the maintainer/);
  assert.match(permissions, /`storage`/);
  assert.match(permissions, /does not request `<all_urls>`/);
  assert.match(permissions, /permission set is unchanged from 0\.4\.1/);
});

test("production JavaScript contains no remote-code execution path", async () => {
  const productionFiles = [
    "src/background.js",
    "src/content.js",
    "src/popup.js",
    "src/options.js"
  ];
  for (const name of productionFiles) {
    const source = await readFile(path.join(browserRoot, name), "utf8");
    assert.doesNotMatch(source, /\beval\s*\(|\bnew\s+Function\s*\(|<script[^>]+https?:\/\//i, name);
  }
});
