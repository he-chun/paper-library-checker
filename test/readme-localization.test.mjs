import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicExport,
  loadPublicExportManifest
} from "../scripts/create-public-export.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const readmePath = path.join(root, "README.md");
const chineseReadmePath = path.join(root, "README.zh-CN.md");
const releaseUrl = "https://github.com/he-chun/paper-library-checker/releases/tag/v0.3.0";
const canonicalFacts = [
  "0.3.0",
  "Zotero 9.0.x",
  "Zotero 9.0.6",
  "151.0.4129.78",
  "91331ef1bcee06c34bbcadaaf956866b5c06125999da630f48f0f6837234ef59",
  "ef69fec94e4ac8bb9de87b4b1c6ab42b226c50d895a6df893150da2f07dc9bd5",
  "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4",
  "9f4bc8e052e7a8325b99a84375b9d81b2a2876b24fde1797a031f18c14573420",
  releaseUrl
];

const [english, chinese] = await Promise.all([
  readFile(readmePath, "utf8"),
  readFile(chineseReadmePath, "utf8")
]);

test("README language switchers are reciprocal and mark the current language", () => {
  assert.match(english, /^# Paper Library Checker\r?\n\r?\n\*\*English\*\* \| \[简体中文\]\(README\.zh-CN\.md\)/);
  assert.match(chinese, /^# Paper Library Checker\r?\n\r?\n\[English\]\(README\.md\) \| \*\*简体中文\*\*/);
});

test("localized READMEs preserve canonical version, runtime, hashes, and Release facts", () => {
  for (const content of [english, chinese]) {
    for (const fact of canonicalFacts) assert(content.includes(fact), fact);
  }
});

test("Simplified Chinese support matrix preserves qualified support levels", () => {
  const rows = [
    "| CNKI 中文页面 | 已支持并完成测试 | 实验性 |",
    "| CNKI 英文页面 | 实验性 | 实验性 |",
    "| ScienceDirect | 尽力支持；真实访问可能受到站点验证限制 | 尽力支持 |",
    "| MDPI | 已支持并完成测试 | 不支持 |",
    "| 通用 COinS/JSON-LD/citation/DC 元数据 | 有自动化回归测试覆盖 | 不支持 |",
    "| 其他已列出的学术站点 | 实验性/尽力支持 | 不支持 |"
  ];
  for (const row of rows) assert(chinese.includes(row), row);
});

test("both READMEs retain installation and pairing instructions", () => {
  for (const content of [english, chinese]) {
    for (const marker of [
      "Tools > Plugins",
      "Install Plugin From File",
      "edge://extensions",
      "Developer mode",
      "Load unpacked",
      "manifest.json",
      "Pairing token"
    ]) assert(content.includes(marker), marker);
  }
  assert(english.includes("pairing token"));
  assert(chinese.includes("配对令牌"));
});

test("both READMEs retain privacy and protocol boundaries", () => {
  for (const content of [english, chinese]) {
    for (const marker of ["HMAC-SHA256", "chrome.storage.local", "token-in-JSON", "SECURITY.md"]) {
      assert(content.includes(marker), marker);
    }
  }
  assert.match(english, /no telemetry/i);
  assert.match(english, /does not upload Zotero library data/i);
  assert(chinese.includes("无遥测"));
  assert(chinese.includes("不会上传 Zotero 文献库数据"));
});

test("Simplified Chinese README is included in fresh public exports", async () => {
  const manifest = await loadPublicExportManifest(root);
  assert(manifest.files.includes("README.md"));
  assert(manifest.files.includes("README.zh-CN.md"));

  const parent = await mkdtemp(path.join(os.tmpdir(), "plc-localization-"));
  const destination = path.join(parent, "public-export");
  try {
    await createPublicExport({ sourceRoot: root, destination });
    await Promise.all([
      stat(path.join(destination, "README.md")),
      stat(path.join(destination, "README.zh-CN.md"))
    ]);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("relative README links resolve to repository files", async () => {
  for (const [name, content] of [["README.md", english], ["README.zh-CN.md", chinese]]) {
    const directory = path.dirname(path.join(root, name));
    const links = [...content.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
    for (const link of links) {
      if (/^(?:https?:|#)/i.test(link)) continue;
      const target = decodeURIComponent(link.split("#", 1)[0]);
      await assert.doesNotReject(stat(path.resolve(directory, target)), `${name}: ${link}`);
    }
  }
});
