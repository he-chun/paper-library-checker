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
const packagePath = path.join(root, "package.json");
const updateManifestPath = path.join(root, "updates.json");

const [english, chinese, packageText, updateManifestText] = await Promise.all([
  readFile(readmePath, "utf8"),
  readFile(chineseReadmePath, "utf8"),
  readFile(packagePath, "utf8"),
  readFile(updateManifestPath, "utf8")
]);
const packageMetadata = JSON.parse(packageText);
const updateManifest = JSON.parse(updateManifestText);
const currentVersion = packageMetadata.version;
const releaseUrl = `https://github.com/he-chun/paper-library-checker/releases/tag/v${currentVersion}`;
const canonicalFacts = [
  currentVersion,
  "Zotero 9.0.x",
  "Zotero 9.0.6",
  "151.0.4129.78",
  releaseUrl
];

test("README language switchers are reciprocal and mark the current language", () => {
  assert.match(english, /^# Paper Library Checker\r?\n\r?\n\*\*English\*\* \| \[简体中文\]\(README\.zh-CN\.md\)/);
  assert.match(chinese, /^# Paper Library Checker\r?\n\r?\n\[English\]\(README\.md\) \| \*\*简体中文\*\*/);
});

test("localized READMEs derive the current version and preserve qualified runtime facts", () => {
  const addon = updateManifest.addons["paper-library-checker@he-chun.github.io"];
  assert.equal(addon.updates.at(-1).version, currentVersion);
  for (const content of [english, chinese]) {
    for (const fact of canonicalFacts) assert(content.includes(fact), fact);
  }
});

test("Simplified Chinese support matrix preserves qualified support levels", () => {
  const rows = [
    "| CNKI 中文页面 | 内置 CNKI 提取器 | 已支持并完成测试 | 实验性 |",
    "| CNKI 英文页面 | 内置 CNKI/通用元数据提取 | 实验性 | 实验性 |",
    "| MDPI | 通用引文元数据 | 已支持并完成测试 | 不支持 |",
    "| ScienceDirect | 通用元数据和站点适配器；可选本地 translation-server | 尽力支持；真实访问可能受到站点验证限制 | 尽力支持 |",
    "Springer、Wiley、PubMed、arXiv、IEEE、ACM、Taylor & Francis 和 DOI.org",
    "只表示内容脚本可以在该域名运行，并不等于项目已经验证或承诺支持该网站"
  ];
  for (const row of rows) assert(chinese.includes(row), row);
});

test("both READMEs retain installation and pairing instructions", () => {
  for (const marker of [
    "Tools > Plugins",
    "Install Plugin From File",
    "edge://extensions",
    "Developer mode",
    "Load unpacked",
    "manifest.json",
    "Pairing token"
  ]) assert(english.includes(marker), marker);
  for (const marker of [
    "工具（Tools）> 插件（Plugins）",
    "从文件安装插件（Install Plugin From File）",
    "edge://extensions",
    "开发人员模式（Developer mode）",
    "加载解压缩的扩展（Load unpacked）",
    "manifest.json",
    "配对令牌（Pairing token）"
  ]) assert(chinese.includes(marker), marker);
  assert(english.includes("pairing token"));
  assert(chinese.includes("配对令牌"));
});

test("localized READMEs follow the user-first section order", () => {
  const sections = [
    [
      english,
      "## Why use it?",
      "## Requirements and compatibility",
      "## Quick start",
      "## Supported sites and status",
      "## How to use",
      "## Update or uninstall",
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
      "## 运行要求与兼容性",
      "## 快速开始",
      "## 支持的网站与状态",
      "## 使用方法",
      "## 更新或卸载",
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
    /A local-first Zotero companion that tells you whether the paper you are viewing is already saved—before you create a duplicate item/
  );
  for (const marker of [
    "CNKI",
    "local Zotero 9 library",
    "`Saved`",
    "`Possible match`",
    "`Not saved`",
    "no Zotero library upload"
  ]) assert(english.slice(0, 1500).includes(marker), marker);

  assert.match(
    chinese,
    /一个本地优先的 Zotero 配套工具：在保存前判断当前论文是否已经存在于 Zotero 文献库，避免重复收藏和重复条目/
  );
  for (const marker of [
    "知网（CNKI）",
    "本地 Zotero 9 文献库",
    "已保存",
    "可能匹配",
    "不会上传 Zotero 文献库"
  ]) assert(chinese.slice(0, 1500).includes(marker), marker);
});

test("both README first screens provide localized quick links", () => {
  for (const marker of [
    "[Download releases]",
    "[Quick start](#quick-start)",
    "[Supported sites](#supported-sites-and-status)",
    "[Privacy](#local-data-flow-and-privacy)",
    "[简体中文](README.zh-CN.md)"
  ]) assert(english.slice(0, 1500).includes(marker), marker);

  for (const marker of [
    "[下载发布版本]",
    "[快速开始](#快速开始)",
    "[支持的网站](#支持的网站与状态)",
    "[隐私说明](#本地数据流和隐私)",
    "[English](README.md)"
  ]) assert(chinese.slice(0, 1200).includes(marker), marker);
});

test("both support matrices preserve qualified support levels", () => {
  const englishRows = [
    "| CNKI Chinese | Built-in CNKI extractor | Supported and tested | Experimental |",
    "| CNKI English | Built-in CNKI/generic extraction | Experimental | Experimental |",
    "| MDPI | Generic citation metadata | Supported and tested | Not supported |",
    "| ScienceDirect | Generic metadata plus a site adapter; optional local translation-server | Best effort; live access may be challenged | Best effort |",
    "Springer, Wiley, PubMed, arXiv, IEEE, ACM, Taylor & Francis, and DOI.org",
    "it is not by itself a claim of live-site support"
  ];
  for (const row of englishRows) assert(english.includes(row), row);
});

test("both READMEs answer the high-intent discovery FAQ questions", () => {
  for (const question of [
    "Does Paper Library Checker work with CNKI?",
    "Does it upload my Zotero library?",
    "Is this a plagiarism checker?"
  ]) assert(english.includes(question), question);

  for (const question of [
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
  for (const marker of [
    "文献库：正在检查",
    "文献库：已保存",
    "文献库：可能匹配",
    "文献库：未保存",
    "文献库：无法识别",
    "文献库：选择条目",
    "文献库：离线",
    "文献库：正在索引",
    "复制配对令牌",
    "重置配对令牌",
    "撤销配对令牌",
    "自动检查参考文献列表"
  ]) assert(chinese.includes(marker), marker);
});

test("localized usage guidance keeps matching and support qualifications", () => {
  assert(english.includes("is not absolute proof about the entire Zotero library"));
  assert(english.includes("requires manual confirmation"));
  assert(english.includes("unpacked extension directory must remain in its original location"));
  assert(english.includes("MDPI References are not supported"));

  assert(chinese.includes("不是对整个 Zotero 文献库的绝对证明"));
  assert(chinese.includes("需要人工确认"));
  assert(chinese.includes("解压扩展目录必须保持在原位置"));
  assert(chinese.includes("MDPI References 不支持"));
});

test("both READMEs retain update and clean-uninstall guidance", () => {
  for (const content of [english, chinese]) {
    for (const marker of ["edge://extensions", "Reload", "Revoke pairing token"]) {
      assert(content.includes(marker), marker);
    }
  }
  assert(english.includes("Update or uninstall"));
  assert(english.includes("the 0.3 migration"));
  assert(chinese.includes("更新或卸载"));
  assert(chinese.includes("重新加载"));
  assert(chinese.includes("0.3 迁移说明"));
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
