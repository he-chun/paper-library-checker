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
const releaseUrl = "https://github.com/he-chun/paper-library-checker/releases/tag/v0.4.0";
const canonicalFacts = [
  "0.4.0",
  "Zotero 9.0.x",
  "Zotero 9.0.6",
  "151.0.4129.78",
  "85cc29a5129092a759528e2ca63a6700877c3cedb1b5fe58872f52d3e1c765e7",
  "dab1b40c9384b5c966a77d8d96a139bbf47dc3a059b44d75c5abecd61ca5100f",
  "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4",
  "57700df0e04a08b6494e96ed1644859803076c97247bacce43d5e5fd7c63693f",
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

test("localized READMEs follow the user-first section order", () => {
  const sections = [
    [
      english,
      "## Why use it?",
      "## Quick start",
      "## Supported sites and status",
      "## How to use",
      "## How it differs from Zotero Connector",
      "## FAQ",
      "## Local data flow and privacy",
      "## Advanced configuration",
      "## Release verification",
      "## Development",
      "## Contributing",
      "## License"
    ],
    [
      chinese,
      "## 为什么使用？",
      "## 快速开始",
      "## 支持的网站与状态",
      "## 使用方法",
      "## 与 Zotero Connector 的区别",
      "## FAQ",
      "## 本地数据流和隐私",
      "## 高级配置",
      "## Release 验证",
      "## 开发",
      "## 贡献",
      "## 许可证"
    ]
  ];
  for (const [content, ...headings] of sections) {
    let previous = -1;
    for (const heading of headings) {
      const position = content.indexOf(heading);
      assert(position > previous, `${heading} follows the preceding section`);
      previous = position;
    }
  }
});

test("both README first screens state the local-first value proposition", () => {
  assert.match(
    english,
    /A local-first Zotero browser extension that tells you whether the paper you are viewing is already saved—before you create a duplicate item/
  );
  for (const marker of [
    "CNKI",
    "local Zotero 9 library",
    "`Saved`",
    "`Possible match`",
    "`Not saved`",
    "prevent duplicate Zotero items"
  ]) assert(english.slice(0, 1500).includes(marker), marker);

  assert.match(
    chinese,
    /一个本地优先的 Zotero 浏览器扩展：在保存前判断当前论文是否已经存在于 Zotero 文献库，避免重复收藏和重复条目/
  );
  for (const marker of [
    "知网（CNKI）",
    "本地 Zotero 9 文献库",
    "检查论文是否已收藏",
    "Zotero 重复收藏",
    "知网 Zotero 插件"
  ]) assert(chinese.slice(0, 1000).includes(marker), marker);
});

test("both README first screens provide localized quick links", () => {
  for (const marker of [
    "[Download v0.4.0]",
    "[Quick start](#quick-start)",
    "[Supported sites](#supported-sites-and-status)",
    "[How it works](#local-data-flow-and-privacy)",
    "[简体中文](README.zh-CN.md)"
  ]) assert(english.slice(0, 1500).includes(marker), marker);

  for (const marker of [
    "[下载 v0.4.0]",
    "[快速开始](#快速开始)",
    "[支持的网站](#支持的网站与状态)",
    "[工作原理](#本地数据流和隐私)",
    "[English](README.md)"
  ]) assert(chinese.slice(0, 1200).includes(marker), marker);
});

test("both support matrices preserve qualified support levels", () => {
  const englishRows = [
    "| CNKI Chinese | Supported and tested | Experimental |",
    "| CNKI English | Experimental | Experimental |",
    "| ScienceDirect | Best effort; live access may be challenged | Best effort |",
    "| MDPI | Supported and tested | Not supported |",
    "| Generic COinS/JSON-LD/citation/DC | Automated regression coverage | Not supported |"
  ];
  for (const row of englishRows) assert(english.includes(row), row);
});

test("both READMEs answer the five discovery FAQ questions", () => {
  for (const question of [
    "How do I check whether a paper is already saved in Zotero?",
    "How can I prevent duplicate Zotero items?",
    "Does Paper Library Checker work with CNKI?",
    "Does it upload my Zotero library?",
    "Is this a plagiarism checker?"
  ]) assert(english.includes(question), question);

  for (const question of [
    "如何检查一篇论文是否已经收藏到 Zotero？",
    "如何避免 Zotero 出现重复条目？",
    "是否支持知网（CNKI）？",
    "是否会上传 Zotero 文献库？",
    "这是论文内容查重工具吗？"
  ]) assert(chinese.includes(question), question);
});

test("both READMEs reject full-text plagiarism claims", () => {
  assert.match(english, /does not inspect paper full text, calculate text similarity, or detect plagiarism/);
  assert(chinese.includes("不检测论文正文、文字重复率或抄袭"));
  assert(chinese.includes("“Zotero 文献查重”仅指收藏条目重复检测"));
});

test("both READMEs keep Release verification in localized disclosure blocks", () => {
  assert(english.includes("<summary>Release verification and SHA-256 checksums</summary>"));
  assert(chinese.includes("<summary>Release 验证与 SHA-256 校验和</summary>"));
  for (const content of [english, chinese]) {
    assert(content.includes("<details>"));
    assert(content.includes("</details>"));
  }
});

test("both usage sections preserve exact UI status and action text", () => {
  const statuses = [
    "Library: checking",
    "Library: saved",
    "Library: possible match",
    "Library: not saved",
    "Library: unrecognized",
    "Library: choose item",
    "Library: offline",
    "Library: indexing"
  ];
  const actions = [
    "↻",
    "Test connection",
    "Copy pairing token",
    "Reset pairing token",
    "Revoke pairing token",
    "Auto-check reference lists"
  ];
  for (const content of [english, chinese]) {
    for (const marker of [...statuses, ...actions]) assert(content.includes(marker), marker);
  }
});

test("localized usage guidance keeps matching and support qualifications", () => {
  assert.match(english, /it is not absolute proof\s+about the entire Zotero library/);
  assert(english.includes("requires manual confirmation"));
  assert(english.includes("unpacked extension directory must remain in its original location"));
  assert(english.includes("MDPI References are not supported"));

  assert(chinese.includes("不是对整个 Zotero 文献库的绝对证明"));
  assert(chinese.includes("需要人工确认"));
  assert(chinese.includes("unpacked 扩展目录必须保持在原位置"));
  assert.match(chinese, /MDPI References\s+不支持/);
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
