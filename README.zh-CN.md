# Paper Library Checker

[English](README.md) | **简体中文**

[![持续集成](https://github.com/he-chun/paper-library-checker/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/he-chun/paper-library-checker/actions/workflows/ci.yml)
[![当前版本](https://img.shields.io/github/v/release/he-chun/paper-library-checker?include_prereleases&display_name=tag)](https://github.com/he-chun/paper-library-checker/releases)
[![许可证](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**一个本地优先的 Zotero 配套工具：在保存前判断当前论文是否已经存在于 Zotero 文献库，避免重复收藏和重复条目。**

Paper Library Checker 将受支持学术页面的元数据与本地 Zotero 9 文献库比较，直接在页面上显示“已保存”“可能匹配”或“未保存”。它适用于知网（CNKI）等文献检索流程；项目无遥测，也不会上传 Zotero 文献库。

[下载发布版本](https://github.com/he-chun/paper-library-checker/releases) · [快速开始](#快速开始) · [支持的网站](#支持的网站与状态) · [隐私说明](#本地数据流和隐私) · [English](README.md)

> Alpha 软件：在首个稳定版本发布前，站点覆盖范围和安装细节可能发生变化。

Zotero 是 Corporation for Digital Scholarship 的注册商标。本独立项目与 Zotero 项目没有关联，也未获得 Zotero 项目的认可或背书。

## 为什么使用？

- 在点击 Zotero Connector 保存前，检查文献库中是否已有相同条目。
- 浏览知网文章和受支持的参考文献列表时，不必反复切换到 Zotero 搜索。
- 区分确定匹配和需要人工核对的模糊匹配。
- 所有文献库匹配都在本机完成。

## 运行要求与兼容性

| 组件 | 当前支持状态 |
| --- | --- |
| Zotero 桌面端 | 仅支持 Zotero 9.0.x；发布时精确实测版本为 9.0.6。 |
| Microsoft Edge | 主要发布测试浏览器。 |
| Google Chrome | 实验性支持，不属于当前发布门槛。 |
| 分发方式 | 手动安装 XPI 和解压加载浏览器扩展；尚未发布到浏览器扩展商店。 |

Paper Library Checker 包含两个必需组件：Zotero 桌面附加组件和浏览器扩展。使用期间请保持 Zotero 运行。

## 快速开始

1. 打开 [GitHub Releases](https://github.com/he-chun/paper-library-checker/releases)，选择当前 alpha 版本，下载 Paper Library Checker 的 `.xpi` 和浏览器扩展 `.zip` 文件。
2. 在 Zotero 中打开**工具（Tools）> 插件（Plugins）**，选择**从文件安装插件（Install Plugin From File）**，安装 XPI，然后重启 Zotero。
3. 把浏览器 ZIP 解压到不会移动或删除的稳定目录。在 Edge 中打开 `edge://extensions`，启用**开发人员模式（Developer mode）**，选择**加载解压缩的扩展（Load unpacked）**，并选中直接包含 `manifest.json` 的目录。
4. 在 Zotero 中选择**工具 > 文献库检查器：复制配对令牌**（**Tools > Paper Library Checker: Copy pairing token**）。打开浏览器扩展的**设置（Options）**，把令牌粘贴到**配对令牌（Pairing token）**，点击**保存（Save）**，再点击**测试连接（Test connection）**。
5. 刷新文章页面。连接成功时会显示 `已连接到文献库检查器 <版本号>`；英文界面显示 `Connected to Paper Library Checker <version>`。

加载扩展后不要移动、改名或删除解压目录，否则浏览器扩展可能失效。普通用户无需从源代码构建任何组件。

## 支持的网站与状态

| 网站或场景 | 元数据获取方式 | 文章详情页 | 参考文献/列表批量检测 |
| --- | --- | --- | --- |
| CNKI 中文页面 | 内置 CNKI 提取器 | 已支持并完成测试 | 实验性 |
| CNKI 英文页面 | 内置 CNKI/通用元数据提取 | 实验性 | 实验性 |
| MDPI | 通用引文元数据 | 已支持并完成测试 | 不支持 |
| ScienceDirect | 通用元数据和站点适配器；可选本地 translation-server | 尽力支持；真实访问可能受到站点验证限制 | 尽力支持 |
| Springer、Wiley、PubMed、arXiv、IEEE、ACM、Taylor & Francis 和 DOI.org | 通用元数据；可选本地 translation-server | 实验性/尽力支持 | 不支持 |
| 合成 COinS、JSON-LD、citation 和 DC 测试样例 | 通用提取器 | 仅有自动化回归测试覆盖 | 不支持 |

某个域名出现在浏览器 manifest 中，只表示内容脚本可以在该域名运行，并不等于项目已经验证或承诺支持该网站。未知站点永远不会被自动扫描参考文献；宽泛文章检测仍是默认关闭的实验性功能。

本扩展不处理缺少可用页面元数据的 PDF，不保存记录，不修改 Zotero 文献库，也不承诺达到 Zotero Connector 翻译器的覆盖范围。Chrome 仍为实验性支持。

## 使用方法

### 检查文章详情页

1. 保持 Zotero 运行。Zotero **工具**菜单中禁用的 `文献库检查器（<版本号>）`；英文界面中的 `Paper Library Checker (<version>)` 表示附加组件已加载。
2. 打开[支持的网站与状态](#支持的网站与状态)所覆盖的文章详情页。
3. 等待页面标题附近或右下角出现状态徽标。

扩展会提取页面元数据，并与 Zotero 附加组件的本地内存索引匹配。浮动 `↻` 按钮可以重新检查文章、在受支持的列表页手动启动批量检查，也可以拖动。通过 Zotero Connector 保存条目或在 Zotero 中编辑条目后，请点击 `↻` 或刷新页面。

### 工具栏弹窗

点击浏览器工具栏中的**文献库检查器**，可以查看 **Zotero**（“已连接”或“离线”）、**索引**（“就绪”或“正在索引”）和**当前页面**（“已保存”“可能匹配”“未保存”“无法识别”“尚未检查”“不支持当前页面”或“错误”）。**检查当前页面**与 `↻` 共用入口；**打开设置**会打开扩展设置页。

“不支持当前页面”表示活动标签中没有注入内容脚本，例如浏览器内部页面或 manifest 站点列表以外的网站；它不代表新增了站点支持。浏览器界面跟随浏览器显示语言，Zotero 工具菜单跟随 Zotero/Gecko 语言设置。项目内置英文和简体中文。

### 状态说明

| 中文页面徽标 | English UI | 含义 |
| --- | --- | --- |
| `文献库：正在检查` | `Library: checking` | 正在执行检查。 |
| `文献库：已保存` | `Library: saved` | 在本地文献库中找到匹配。 |
| `文献库：可能匹配` | `Library: possible match` | 找到模糊匹配，需要人工确认。 |
| `文献库：未保存` | `Library: not saved` | 使用当前页面提供的元数据没有找到匹配。 |
| `文献库：无法识别` | `Library: unrecognized` | 没有识别到受支持的元数据。 |
| `文献库：选择条目` | `Library: choose item` | translation-server 返回多个候选。 |
| `文献库：离线` | `Library: offline` | 无法连接附加组件或配对失败。 |
| `文献库：正在索引` | `Library: indexing` | 本地索引尚未准备好。 |

徽标和页面边缘效果使用红色表示已保存/匹配，橙色表示可能匹配，蓝色表示未保存，黄色表示正在检查/无法识别/选择条目，紫色表示离线/正在索引/错误。`文献库：未保存`（`Library: not saved`）只描述当前页面元数据的检查结果，不是对整个 Zotero 文献库的绝对证明。

### 收藏后重查与列表检查

附加组件会监听 Zotero 条目的新增、修改、删除和移入回收站事件，并自动更新本地索引。网页不会始终自动发起新请求，修改后请点击 `↻` 或刷新。

**自动检查参考文献列表（Auto-check reference lists）**默认关闭。开启后，受支持页面会在加载和滚动时自动检查；未开启时可点击 `↻` 手动检查。单页最多处理 80 个候选。CNKI 参考文献/列表检查为实验性，ScienceDirect 为尽力支持，MDPI References 不支持。

### 页面边缘效果和配对令牌

**启用页面边缘光效（Enable page edge glow）**默认关闭，只改变视觉提示；`prefers-reduced-motion` 会禁用动画。

- **复制配对令牌（Copy pairing token）**：复制当前令牌。
- **重置配对令牌（Reset pairing token）**：生成并自动复制新令牌，旧令牌失效。
- **撤销配对令牌（Revoke pairing token）**：立即撤销当前令牌。

重置令牌后，在扩展设置中粘贴新令牌，点击**保存（Save）**，再点击**测试连接（Test connection）**。撤销令牌后，需要生成并保存新令牌才能重新连接。

### 常见问题

| 问题 | 检查方法 |
| --- | --- |
| 没有状态徽标 | 确认 Zotero 正在运行、附加组件已加载且扩展已启用；确认域名出现在支持表中，且页面提供可用的 citation、DC、COinS、JSON-LD 或 CNKI 元数据。刷新或点击 `↻`。 |
| `文献库：离线` / `Library: offline` | 保留默认端点并点击**保存**；检查令牌是否已重置或撤销。点击**测试连接**，必要时重新复制令牌。 |
| `文献库：正在索引` / `Library: indexing` | 等待本地索引完成后点击 `↻`；如果持续出现，再重启 Zotero。 |
| `文献库：可能匹配` / `Library: possible match` | 这是模糊题名匹配，不是确定已收藏；请在 Zotero 中核对题名、年份和作者。 |
| `文献库：无法识别` / `Library: unrecognized` | 页面没有提供可用的受支持元数据；PDF 页面尤其可能缺少足够元数据。 |
| 参考文献列表没有变色 | 开启**自动检查参考文献列表**或点击 `↻`，并确认页面有受支持的列表适配器。 |
| Edge 扩展重启后消失 | 解压扩展目录必须保持在原位置。如已移动，请在 `edge://extensions` 中重新执行**加载解压缩的扩展**并重新配对。 |

## 更新或卸载

更新已加载的解压扩展时，下载新 ZIP，在同一个稳定目录中替换或更新文件，然后在 `edge://extensions` 中点击**重新加载（Reload）**。保持目录不变通常可以保留扩展存储；只有扩展标识或已保存令牌发生变化时才需要重新配对。需要手动更新 Zotero 附加组件时，可通过**工具 > 插件**安装新版 XPI。

完整卸载步骤：

1. 在 Zotero 中选择**工具 > 文献库检查器：撤销配对令牌**（**Tools > Paper Library Checker: Revoke pairing token**）。
2. 在 `edge://extensions` 中移除浏览器扩展。
3. 在 Zotero 的**工具 > 插件**中移除附加组件。
4. 确认 Edge 不再列出扩展后，删除解压的浏览器扩展目录。

从 0.2 开发构建升级的用户还应阅读 [0.3 迁移说明](docs/migration-0.3.md)。

## 与 Zotero Connector 的区别

Zotero Connector 用于把条目保存到 Zotero。Paper Library Checker 不会替代 Zotero Connector，也不会保存条目；它检查页面元数据是否可能匹配本地文献库中的已有条目，再显示页面徽标或列表标记，帮助你决定是否保存。

## FAQ

### 是否支持知网（CNKI）？

支持。CNKI 中文文章详情页已支持并完成测试；CNKI 英文详情页和参考文献/列表检查仍为实验性。

### 是否会上传 Zotero 文献库？

不会。匹配使用附加组件的本地内存索引；项目无遥测，不会上传 Zotero 文献库数据。可选的 translation-server 集成只把当前公开页面 URL 发送到另行安装的本地服务。

### 这是论文内容查重工具吗？

不是。本项目检查的是文献条目是否已存在于 Zotero，不检测论文正文、文字重复率或抄袭。中文所说的“Zotero 文献查重”仅指收藏条目重复检测。

## 本地数据流和隐私

```text
学术页面 DOM
    -> 隔离的浏览器内容脚本
    -> 扩展 service worker
    -> 经过身份验证的 HTTP 本机回环请求
    -> Zotero 附加组件内存索引
    -> 状态 / 匹配类型 / 置信度
```

候选元数据可能包括题名、公开标识符、日期、数量有限的作者值和当前文章 URL。匹配始终通过本机回环接口完成；响应不会暴露 Zotero item ID、key、已存储 URL、附件、笔记、分类或无关的文献库元数据。

配对密钥保存在 `chrome.storage.local`，不会进入同步存储。本地 API 使用版本化 HMAC-SHA256 请求认证；可重复使用的密钥不会随请求发送，旧式 bearer token 和 token-in-JSON 请求会被拒绝。可选的 translation-server 集成只把当前公开页面 URL 发送给另行安装在 `127.0.0.1:1969` 的本地服务。访问过的页面可以观察徽标对 DOM 的修改。

参见 [PRIVACY.md](PRIVACY.md)、[威胁模型](docs/threat-model.md)和 [SECURITY.md](SECURITY.md)。请勿在公开 issue 中报告漏洞。

## 高级配置

<details>
<summary>面向高级用户的配置选项</summary>

- `endpoint`：保留默认值 `http://127.0.0.1:23119/zotero-checker`。
- `translationServerMode=off`：从不使用 translation-server。
- `translationServerMode=auto`：仅在优先学术域名需要时尝试，失败后回退到本地提取器。
- `translationServerMode=always`：优先调用 translation-server。
- `enablePageGlow`：只改变视觉提示，默认 `false`。
- `autoCheckReferenceLists`：控制自动批量检查，默认 `false`，不影响手动 `↻`。
- `broadPageDetection`：只影响 manifest 已注入的网站，默认 `false`，不会扩大主机权限。

在 `auto` 模式下，带有 `citation_doi` 的 ScienceDirect 和 MDPI 页面通常使用通用提取器；MDPI References 不会被扫描。实现细节和限制请参阅[匹配规则](docs/matching.md)、[架构说明](docs/architecture.md)和[本地协议](docs/protocol.md)。

</details>

## Release 验证

<details>
<summary>Release 验证与 SHA-256 校验和</summary>

0.4.0 是当前公开 alpha 版本。规范构建、定向 Zotero 运行时冒烟测试、Edge 持久安装、工具栏弹窗、手动页面检查和双语界面门槛均已通过。精确实测桌面目标是受支持的 Zotero 9.0.x 范围内的 Zotero 9.0.6；Microsoft Edge 151.0.4129.78 是主要发布测试浏览器，Chrome 仍为实验性。

请从 [v0.4.0 GitHub Release](https://github.com/he-chun/paper-library-checker/releases/tag/v0.4.0) 下载规范构建产物及 [`SHA256SUMS.txt`](https://github.com/he-chun/paper-library-checker/releases/download/v0.4.0/SHA256SUMS.txt)。仓库根目录的 [`updates.json`](updates.json) 是 Zotero 更新清单。公开的 [0.3.0 发布资格报告](docs/verification/release-qualification-0.3.0.md)继续作为首个 alpha 的历史记录。由于发布者访问验证页面替代了正常文章 DOM，ScienceDirect 不被声明为已通过真实站点验证的功能。

</details>

## 开发

需要 Node.js 20.19 或更高版本。

```powershell
npm ci
npm test
npm run check
npm run build
npm run inspect:artifacts
```

PowerShell 兼容入口仍为 `.\scripts\package-zotero-plugin.ps1`。合成测试样例政策和手动站点检查见 [docs/test-matrix.md](docs/test-matrix.md)，架构与协议细节见 [docs/architecture.md](docs/architecture.md) 和 [docs/protocol.md](docs/protocol.md)。

## 贡献

请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。当前优先事项是安全审查、合成适配器回归测试和可复现的发布验证。用户可见变更记录在 [CHANGELOG.md](CHANGELOG.md) 中。

## 许可证

Copyright 2026 he-chun。基于 Apache License, Version 2.0 许可。参见 [LICENSE](LICENSE)、公开的[许可证决策记录](docs/license-decision.md)和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
