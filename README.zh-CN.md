# Paper Library Checker

[English](README.md) | **简体中文**

[![持续集成](https://github.com/he-chun/paper-library-checker/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/he-chun/paper-library-checker/actions/workflows/ci.yml)
[![当前版本](https://img.shields.io/github/v/release/he-chun/paper-library-checker?include_prereleases&display_name=tag)](https://github.com/he-chun/paper-library-checker/releases)
[![许可证](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**一个本地优先的 Zotero 配套工具：在保存前判断当前论文是否已经存在于 Zotero 文献库，避免重复收藏和重复条目。**

Paper Library Checker 将知网（CNKI）等受支持学术页面的元数据与本地 Zotero 9 文献库比较，显示“已保存”“可能匹配”或“未保存”。标准模式直接使用 Zotero 内置 Local API，无需安装 Paper Library Checker Zotero 附加组件；增强模式提供更快批量检查、完整模糊匹配、“可能匹配”和实时索引更新。项目无遥测，也不会上传 Zotero 文献库。

[从 Chrome Web Store 安装](https://chromewebstore.google.com/detail/paper-library-checker/pmfobjnkoiiplambnbbkfdlfjcbdogon) · [下载发布版本](https://github.com/he-chun/paper-library-checker/releases) · [快速开始](#快速开始) · [支持的网站](#支持的网站与状态) · [隐私说明](#本地数据流和隐私) · [English](README.md)

> Alpha 软件：在首个稳定版本发布前，站点覆盖范围和安装细节可能发生变化。

**[从 Chrome Web Store 安装](https://chromewebstore.google.com/detail/paper-library-checker/pmfobjnkoiiplambnbbkfdlfjcbdogon)** — 当前商店版本为 0.4.1。

当前源码树正在准备 0.5.0 发布候选；在配套 0.5.0 产物正式发布前，
公开商店条目和 GitHub 可下载 Release 仍保持 0.4.1。

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
| Google Chrome | Chrome Web Store 是浏览器扩展的主要公开分发渠道；商店版 0.4.1 已通过安装、连接、popup 和代表性页面检查。 |
| Microsoft Edge | 可以从 Chrome Web Store 安装扩展；站点支持边界仍以本文的支持表为准。 |
| 分发方式 | 浏览器扩展默认从 Chrome Web Store 安装；GitHub Releases 中的 Zotero XPI 是可选的，用于启用增强模式。GitHub 浏览器 ZIP 保留用于开发、审计或手动安装。 |

浏览器扩展和 Zotero 桌面端是必需组件；配套 Zotero 附加组件仅为增强模式所需。使用任一模式时都请保持 Zotero 运行。

## 快速开始

1. [从 Chrome Web Store 安装浏览器扩展](https://chromewebstore.google.com/detail/paper-library-checker/pmfobjnkoiiplambnbbkfdlfjcbdogon)。
2. 启动 Zotero 9；如果其内置 Local API 被关闭，请先启用。
3. 打开浏览器扩展**设置**，保留**自动（推荐）**或选择**标准模式**，然后点击**测试连接（Test connection）**。标准模式不需要配对令牌或 XPI。
4. 打开受支持的文章页，点击工具栏图标，再选择**检查当前页面（Check this page）**。

### 可选的增强模式

1. 从 [GitHub v0.4.1 Release](https://github.com/he-chun/paper-library-checker/releases/tag/v0.4.1) 下载 Zotero XPI，并通过 Zotero 的**工具（Tools）> 插件（Plugins）> 从文件安装插件（Install Plugin From File）**安装。
2. 重启 Zotero，选择**工具 > 文献库检查器：复制配对令牌**。
3. 在扩展**设置**中选择**增强模式**（或保留**自动**），展开增强模式连接设置，把 64 字符令牌粘贴到**配对令牌（Pairing token）**，再点击**测试连接**。

增强模式提供更快的参考文献批量检查、完整模糊题名匹配、“可能匹配”和实时索引更新。

### 模式能力矩阵

| 能力 | 标准 / Indexed | 标准 / Direct 回退 | 增强 / XPI |
| --- | --- | --- | --- |
| 需要 XPI | 否 | 否 | 是 |
| 个人库和群组库 | 完整快照 | 尽力搜索 | 附加组件实时索引 |
| 完整标识符/题名精确召回 | 是（索引就绪时） | 否 | 是 |
| 可确认“未保存” | 是（索引就绪时） | 否 | 是 |
| 参考文献批量 | 是 | 最多 10 条回退候选 | 是 |
| 模糊题名/“可能匹配” | 否 | 否 | 是 |
| Zotero 实时更新 | 否 | 否 | 是 |

Direct 未命中和过期索引未命中只显示**未找到匹配，结果可能不完整**，不会显示绝对的**未保存**。规范字段和解析规则见[模式能力契约](docs/mode-capability-contract.md)。

### 手动/开发者安装

如需开发、审计或手动安装备用流程，请从 GitHub v0.4.1 Release 下载浏览器
ZIP，并解压到不会移动或删除的稳定目录。打开 `chrome://extensions` 或
`edge://extensions`，启用**开发人员模式（Developer mode）**，选择
**加载解压缩的扩展（Load unpacked）**，并选中直接包含 `manifest.json` 的
目录。使用较新的手动 ZIP 替换文件后，请在该页面点击**重新加载（Reload）**。
加载后不要移动、改名或删除解压目录。

### 从 unpacked 安装迁移

安装 Chrome Web Store 版本前，先停用或移除旧的 unpacked 扩展。商店版使用
固定扩展 ID `pmfobjnkoiiplambnbbkfdlfjcbdogon`，其存储和 pairing token 可能
不会从 unpacked 版本自动迁移。请在**设置（Options）**中重新粘贴令牌，点击
**保存（Save）**，再点击**测试连接（Test connection）**。不要同时启用
unpacked 版和商店版，否则重复 content script 可能产生重复状态徽标或互相冲突
的页面状态。

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

本扩展不处理缺少可用页面元数据的 PDF，不保存记录，不修改 Zotero 文献库，也不承诺达到 Zotero Connector 翻译器的覆盖范围。发布到 Chrome Web Store 不会扩大本表中的站点支持声明。

## 使用方法

### 检查文章详情页

1. 保持 Zotero 运行。标准模式使用 Zotero 内置 Local API；增强模式下，Zotero **工具**菜单中禁用的 `文献库检查器（<版本号>）` 表示附加组件已加载。
2. 打开[支持的网站与状态](#支持的网站与状态)所覆盖的文章详情页。
3. 等待页面标题附近或右下角出现状态徽标。

扩展会提取页面元数据，并请求所选后端完成匹配。标准模式通常使用个人库和可访问群组库的 IndexedDB 最小化快照；索引就绪后，标识符和题名精确检查具有完整结果，不会为每个候选发起一次 Zotero HTTP 搜索。没有索引时，详情页和小批量使用 Direct Local API 兼容回退：正向命中精确，但 quicksearch 未命中不完整。增强模式使用附加组件的本地内存索引。浮动 `↻` 按钮可以重新检查文章、在受支持的列表页手动启动批量检查，也可以拖动。

设置页新增**标准模式索引**区域，显示状态、条目/文献库数量、上次成功更新时间和进度，并提供**刷新索引**、**清除索引**、**清除并重建**、**取消构建**。快照超过 30 分钟后会在后台刷新；刷新期间旧 generation 继续提供查询，只有新完整快照成功后才原子切换。

### 工具栏弹窗

点击浏览器工具栏中的**文献库检查器**，可以查看 Zotero 连接状态、当前实际模式、索引或匹配能力、当前页面状态和自动回退原因。需要处理问题时，**修复连接**会打开设置入口。旧有 `connected` 和 `indexReady` 健康字段继续兼容；在 Direct 模式中，`indexReady` 只表示旧式健康检查可用，不表示存在完整持久索引。新调用方应读取 `capabilities.engine`、`indexState` 和明确的完整性能力字段。**检查当前页面**与 `↻` 共用入口。

“不支持当前页面”表示活动标签中没有注入内容脚本，例如浏览器内部页面或 manifest 站点列表以外的网站；它不代表新增了站点支持。浏览器界面跟随浏览器显示语言，Zotero 工具菜单跟随 Zotero/Gecko 语言设置。项目内置英文和简体中文。

### 状态说明

| 中文页面徽标 | English UI | 含义 |
| --- | --- | --- |
| `文献库：正在检查` | `Library: checking` | 正在执行检查。 |
| `文献库：已保存` | `Library: saved` | 在本地文献库中找到匹配。 |
| `文献库：可能匹配` | `Library: possible match` | 增强模式找到模糊匹配，需要人工确认；标准模式不会产生此状态。 |
| `文献库：未保存` | `Library: not saved` | 使用当前页面提供的元数据没有找到匹配。 |
| `文献库：未找到匹配，结果可能不完整` | `Library: no match; result may be incomplete` | Direct 回退未找到候选；构建或刷新标准索引后才能获得完整结果。 |
| `文献库：上次索引中已保存` | `Library: saved in previous index` | 索引需要更新或正在刷新，匹配来自上次快照。 |
| `文献库：索引需要更新` | `Library: index needs update` | 上次快照未命中；刷新完成前不会宣称绝对“未保存”。 |
| `文献库：无法识别` | `Library: unrecognized` | 没有识别到受支持的元数据。 |
| `文献库：选择条目` | `Library: choose item` | translation-server 返回多个候选。 |
| `文献库：离线` | `Library: offline` | 无法通过所选模式连接。 |
| `文献库：正在索引` | `Library: indexing` | 增强模式本地索引尚未准备好。 |

徽标和页面边缘效果使用红色表示已保存/匹配，橙色表示可能匹配，蓝色表示完整的未保存结果，黄色表示正在检查/无法识别/选择条目/结果不完整，紫色表示离线/正在索引/错误。`文献库：未保存`（`Library: not saved`）只用于基于当前页面元数据的 Indexed 就绪或 XPI 完整结果，不是对整个 Zotero 文献库的绝对证明；Direct 和过期索引未命中使用带有“不完整”限定的提示。

### 收藏后重查与列表检查

增强模式会监听 Zotero 条目的新增、修改、删除和移入回收站事件，并实时更新附加组件索引。由于 Zotero 9.0.6 不能可靠保证基于 `since` 捕获全部变化，标准模式采用完整快照刷新。标准刷新成功后会通知已检查页面重新检查；若修改后需要立即得到新结果，请使用**刷新索引**。

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
| `文献库：离线` / `Library: offline` | 启动 Zotero 并点击**测试连接**。标准模式需启用 Zotero Local API；增强模式需保留默认端点，必要时重新复制令牌。 |
| `文献库：正在索引` / `Library: indexing` | 等待本地索引完成后点击 `↻`；如果持续出现，再重启 Zotero。 |
| `文献库：可能匹配` / `Library: possible match` | 这是模糊题名匹配，不是确定已收藏；请在 Zotero 中核对题名、年份和作者。 |
| `文献库：无法识别` / `Library: unrecognized` | 页面没有提供可用的受支持元数据；PDF 页面尤其可能缺少足够元数据。 |
| 参考文献列表没有变色 | 开启**自动检查参考文献列表**或点击 `↻`，并确认页面有受支持的列表适配器。 |
| 手动加载的扩展重启后消失 | 解压扩展目录必须保持在原位置。如已移动，请重新执行**加载解压缩的扩展**并重新配对。 |

## 更新或卸载

从 Chrome Web Store 安装的扩展由商店渠道更新，用户不需要下载 ZIP 来替换
商店版。下载 GitHub 浏览器 ZIP 并在 `chrome://extensions` 或
`edge://extensions` 中点击**重新加载（Reload）**，只适用于手动/unpacked
安装。Zotero XPI 仍使用当前 GitHub/Zotero 更新流程。删除浏览器扩展会移除其
本地扩展身份和存储，重新安装后可能需要再次粘贴 pairing token 并测试连接。

完整卸载步骤：

1. 在 Zotero 中选择**工具 > 文献库检查器：撤销配对令牌**（**Tools > Paper Library Checker: Revoke pairing token**）。
2. 在 `chrome://extensions` 或 `edge://extensions` 中移除浏览器扩展。
3. 在 Zotero 的**工具 > 插件**中移除附加组件。
4. 如果使用手动安装，请在浏览器不再列出扩展后删除解压的浏览器扩展目录。

从 0.4.x 升级的用户请阅读[双模式迁移说明](docs/migration-0.5.md)。从 0.2 开发构建升级的用户还应阅读 [0.3 迁移说明](docs/migration-0.3.md)。

## 与 Zotero Connector 的区别

Zotero Connector 用于把条目保存到 Zotero。Paper Library Checker 不会替代 Zotero Connector，也不会保存条目；它检查页面元数据是否可能匹配本地文献库中的已有条目，再显示页面徽标或列表标记，帮助你决定是否保存。

## FAQ

### 是否支持知网（CNKI）？

支持。CNKI 中文文章详情页已支持并完成测试；CNKI 英文详情页和参考文献/列表检查仍为实验性。

### 是否会上传 Zotero 文献库？

不会。标准模式通过 Zotero 内置 Local API 读取匹配候选，原始记录只在扩展 service worker 内处理；增强模式使用附加组件经过认证的本地内存索引并返回最小化结果。项目不会上传 Zotero 文献库数据，也不会用于遥测。可选 translation-server 只接收当前公开页面 URL。

### 这是论文内容查重工具吗？

不是。本项目检查的是文献条目是否已存在于 Zotero，不检测论文正文、文字重复率或抄袭。中文所说的“Zotero 文献查重”仅指收藏条目重复检测。

## 本地数据流和隐私

```text
学术页面 DOM -> 内容脚本 -> 扩展 service worker
    标准模式 -> Zotero 内置 Local API -> service worker 重新核验
    增强模式 -> 认证附加组件 API -> 附加组件内存索引
两者都只返回状态 / 匹配类型 / 置信度
```

候选元数据可能包括题名、公开标识符、日期、数量有限的作者值和当前文章 URL。匹配始终通过本机回环接口完成；响应不会暴露 Zotero item ID、key、已存储 URL、附件、笔记、分类或无关的文献库元数据。

标准模式不需要令牌。Zotero Local API 原始 item JSON 只存在于 service worker 内存，不返回网页、不存储、不记录日志、不上传，也不用于遥测。增强模式配对密钥继续保存在 `chrome.storage.local`，不会进入同步存储；附加组件请求使用版本化 HMAC-SHA256 认证并返回最小化结果，旧式 bearer token 和 token-in-JSON 请求会被拒绝。可选 translation-server 只接收当前公开页面 URL。访问过的页面可以观察徽标对 DOM 的修改。

参见 [PRIVACY.md](PRIVACY.md)、[威胁模型](docs/threat-model.md)和 [SECURITY.md](SECURITY.md)。请勿在公开 issue 中报告漏洞。

## 高级配置

<details>
<summary>面向高级用户的配置选项</summary>

- `endpoint`：保留默认值 `http://127.0.0.1:23119/zotero-checker`。
- `connectionMode=auto`：优先使用健康且兼容的增强后端，失败后回退标准模式并报告原因。
- `connectionMode=standard`：只使用 Zotero 内置 Local API，不探测附加组件。
- `connectionMode=enhanced`：只使用认证附加组件，不自动回退。
- `translationServerMode=off`：从不使用 translation-server。
- `translationServerMode=auto`：仅在优先学术域名需要时尝试，失败后回退到本地提取器。
- `translationServerMode=always`：优先调用 translation-server。
- `enablePageGlow`：只改变视觉提示，默认 `false`。
- `autoCheckReferenceLists`：控制自动批量检查，默认 `false`，不影响手动 `↻`。
- `broadPageDetection`：只影响 manifest 已注入的网站，默认 `false`，不会扩大主机权限。
- `developerMode`：在设置页显示有界的 service worker 内存日志，包括后端阶段、请求耗时、缓存使用、批次数量和稳定错误；默认 `false`。可在同一面板刷新或清空，service worker 重启也会清空。日志不包含配对令牌或 Zotero 原始条目记录。

在 `auto` 模式下，带有 `citation_doi` 的 ScienceDirect 和 MDPI 页面通常使用通用提取器；MDPI References 不会被扫描。实现细节和限制请参阅[匹配规则](docs/matching.md)、[架构说明](docs/architecture.md)和[本地协议](docs/protocol.md)。

</details>

## Release 验证

<details>
<summary>Release 验证与 SHA-256 校验和</summary>

0.5.0 是已准备的双模式发布候选。已接受的资格证据覆盖规范自动测试套件，
以及报告中记录的 Chrome、Zotero 9.0.6、标准 Indexed、Direct 回退、
增强/XPI、生命周期和 CNKI 真实运行验证。在 0.5.0 产物正式发布前，
Chrome Web Store 和 GitHub Release 仍保持 0.4.1；“发布候选”不表示已经发布。
历史完整 Edge 资格验证的精确目标仍为 Microsoft Edge 151.0.4129.78。

在 v0.5.0 正式发布前，请从
[v0.4.1 GitHub Release](https://github.com/he-chun/paper-library-checker/releases/tag/v0.4.1)
下载当前公开产物及
[`SHA256SUMS.txt`](https://github.com/he-chun/paper-library-checker/releases/download/v0.4.1/SHA256SUMS.txt)。
候选准备期间，仓库根目录 [`updates.json`](updates.json) 有意继续指向已发布的
0.4.1 Zotero 更新。已接受的候选证据见
[0.5.0 资格报告](docs/verification/dual-mode-0.5.0-qualification.md)。

</details>

## 开发

需要 Node.js 20.19 或更高版本。

```powershell
npm ci
npm test
npm run check
npm run build
npm run inspect:artifacts
npm run verify:release
```

PowerShell 兼容入口仍为 `.\scripts\package-zotero-plugin.ps1`。合成测试样例政策和手动站点检查见 [docs/test-matrix.md](docs/test-matrix.md)，架构与协议细节见 [docs/architecture.md](docs/architecture.md) 和 [docs/protocol.md](docs/protocol.md)。

## 贡献

请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。当前优先事项是安全审查、合成适配器回归测试和可复现的发布验证。用户可见变更记录在 [CHANGELOG.md](CHANGELOG.md) 中。

## 许可证

Copyright 2026 he-chun。基于 Apache License, Version 2.0 许可。参见 [LICENSE](LICENSE)、公开的[许可证决策记录](docs/license-decision.md)和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
