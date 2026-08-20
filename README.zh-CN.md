# Paper Library Checker

[English](README.md) | **简体中文**

**一个本地优先的 Zotero 浏览器扩展：在保存前判断当前论文是否已经存在于 Zotero 文献库，避免重复收藏和重复条目。**

Paper Library Checker 支持知网（CNKI）、MDPI 等学术页面，把网页元数据与本地 Zotero 9 文献库比较，直接显示“已保存”“可能匹配”或“未保存”。它适合希望检查论文是否已收藏、减少 Zotero 重复收藏，并寻找知网 Zotero 插件的用户；项目无遥测，也不会上传文献库。

[下载 v0.4.0](https://github.com/he-chun/paper-library-checker/releases/tag/v0.4.0) · [快速开始](#快速开始) · [支持的网站](#支持的网站与状态) · [工作原理](#本地数据流和隐私) · [English](README.md)

> Alpha 软件：在首个稳定版本发布前，协议和安装细节可能会发生变化。

Zotero 是 Corporation for Digital Scholarship 的注册商标。本独立项目与 Zotero 项目没有关联，也未获得 Zotero 项目的认可或背书。

## 为什么使用？

- Zotero 文献较多，容易忘记某篇论文是否已经收藏。
- 希望在点击 Zotero Connector 保存前，避免重复收藏和重复条目。
- 经常在知网检索中文文献。
- 进行文献综述或系统综述，需要连续筛选大量文章和参考文献列表。
- 不希望把 Zotero 文献库上传到第三方服务。

## 快速开始

Paper Library Checker 由 Zotero 桌面附加组件和 Chrome/Edge 浏览器扩展组成。使用期间请保持 Zotero 运行。

1. 从 [v0.4.0 GitHub Release](https://github.com/he-chun/paper-library-checker/releases/tag/v0.4.0) 下载 `paper-library-checker-zotero-0.4.0.xpi` 和 `paper-library-checker-extension-0.4.0.zip`。
2. 在 Zotero 9 中打开 **Tools > Plugins**，选择 **Install Plugin From File**，安装 XPI，然后重启 Zotero。
3. 把浏览器 ZIP 解压到不会移动或删除的稳定目录。打开 `edge://extensions`，启用 **Developer mode**，选择 **Load unpacked**，并选中直接包含 `manifest.json` 的目录。
4. 在 Zotero 中选择 **Tools > Paper Library Checker: Copy pairing token**。打开扩展 **Options**，把令牌粘贴到 **Pairing token**，点击 **Save**，再点击 **Test connection**。
5. 刷新文章页面。连接成功时会显示 `Connected to Paper Library Checker 0.4.0`。

用户无需从源代码构建组件。本扩展尚未发布到 Microsoft Edge Add-ons Store；unpacked 扩展目录必须保持在原位置，移动、改名或删除会导致扩展失效。Chrome 可以实验性使用，但不属于 0.4.0 alpha 发布门槛。

附加组件使用 Zotero 的 loopback 端口 `23119`，首次启动时生成 256-bit 配对令牌，并保存在本地 Zotero preference 中。浏览器把 secret 保存在 `chrome.storage.local`，非敏感选项使用 `chrome.storage.sync`。从 0.2 开发构建升级时请阅读 [0.3 迁移说明](docs/migration-0.3.md)。

## 支持的网站与状态

| 场景 | 文章详情页 | 参考文献/列表批量检测 |
| --- | --- | --- |
| CNKI 中文页面 | 已支持并完成测试 | 实验性 |
| CNKI 英文页面 | 实验性 | 实验性 |
| ScienceDirect | 尽力支持；真实访问可能受到站点验证限制 | 尽力支持 |
| MDPI | 已支持并完成测试 | 不支持 |
| 通用 COinS/JSON-LD/citation/DC 元数据 | 有自动化回归测试覆盖 | 不支持 |
| 其他已列出的学术站点 | 实验性/尽力支持 | 不支持 |

Chrome 仍为实验性。未知站点永远不会被自动扫描参考文献；宽泛文章检测仍是默认关闭的实验性功能。本扩展不处理缺少可用页面元数据的 PDF，不保存记录，不修改 Zotero 文献库，也不承诺达到 Zotero Connector translators 的覆盖范围。

## 使用方法

### 检查文章详情页

1. 保持 Zotero 运行。Zotero **Tools** 菜单中禁用的 `Paper Library Checker (0.4.0)` 表示附加组件已加载。
2. 打开[支持的网站与状态](#支持的网站与状态)所覆盖的文章详情页。
3. 等待页面标题附近或右下角出现状态徽标。

扩展会提取页面元数据，并与 Zotero 附加组件的本地内存索引匹配。浮动 `↻` 按钮可以重新检查文章、在受支持的列表页手动启动批量检查，也可以拖动。通过 Zotero Connector 保存条目或在 Zotero 中编辑条目后，请点击 `↻` 或刷新页面。

### 工具栏弹窗

点击浏览器工具栏中的 **文献库检查器**，可以查看 **Zotero**（`已连接` 或 `离线`）、**索引**（`就绪` 或 `正在索引`）和**当前页面**（`已保存`、`可能匹配`、`未保存`、`无法识别`、`尚未检查`、`不支持当前页面`或 `错误`）。**检查当前页面** 与 `↻` 共用入口；**打开设置** 会打开扩展 Options。

`不支持当前页面` 表示活动标签中没有注入 content script，并不代表新增站点支持。弹窗不会读取或显示配对令牌，也不会扩大站点访问权限。浏览器界面跟随浏览器显示语言，Zotero Tools 菜单跟随 Zotero/Gecko locale；项目内置英文和简体中文。

### 状态说明

| UI text | 状态 |
| --- | --- |
| `Library: checking` | 正在检查。 |
| `Library: saved` | 在本地文献库中找到匹配。 |
| `Library: possible match` | 找到模糊匹配，需要人工确认。 |
| `Library: not saved` | 使用当前页面提供的元数据没有找到匹配。 |
| `Library: unrecognized` | 没有识别到受支持元数据。 |
| `Library: choose item` | translation-server 返回多个候选。 |
| `Library: offline` | 无法连接附加组件或配对失败。 |
| `Library: indexing` | 本地索引尚未准备好。 |

徽标和页面边缘效果使用 red 表示 saved/matched，orange 表示 possible match，blue 表示 not saved，yellow 表示 checking/unrecognized/choice，purple 表示 offline/indexing/error。`Library: not saved` 只表示当前页面元数据未找到匹配，不是对整个 Zotero 文献库的绝对证明。

### 收藏后重查与列表检查

附加组件会监听 Zotero item 的新增、修改、删除和 trash 事件，并自动更新本地索引。网页不会始终自动发起新请求，修改后请点击 `↻` 或刷新。

**Auto-check reference lists** 默认关闭。开启后，受支持页面会在加载和滚动时自动检查；未开启时可点击 `↻` 手动检查。单页最多处理 80 个候选。CNKI reference/list 为 experimental，ScienceDirect 为 best effort，MDPI References 不支持。

### 页面边缘效果和配对令牌

**Enable page edge glow** 默认关闭，只改变视觉提示；`prefers-reduced-motion` 会禁用动画。

- **Copy pairing token**：复制当前令牌。
- **Reset pairing token**：生成并自动复制新令牌，旧令牌失效。
- **Revoke pairing token**：立即撤销当前令牌。

执行 **Reset pairing token** 后，在扩展 Options 中粘贴新令牌，点击 **Save**，再点击 **Test connection**。执行 **Revoke pairing token** 后，需要生成并保存新令牌才能重新连接。

### 常见问题

| 问题 | 检查方法 |
| --- | --- |
| 没有状态徽标 | 确认 Zotero 正在运行、附加组件已加载且扩展已启用；页面需要 citation、DC、COinS、JSON-LD 或 CNKI 元数据。刷新或点击 `↻`。`broadPageDetection` 只在扩展已注入的网站中生效。 |
| `Library: offline` | 保留默认 endpoint 并点击 **Save**；检查令牌是否已重置或撤销，点击 **Test connection**，必要时重新复制令牌。 |
| `Library: indexing` | 等待本地索引完成后点击 `↻`；如果持续出现，再重启 Zotero。 |
| `Library: possible match` | 这是模糊题名匹配，不是确定已收藏；需要人工确认题名、年份和作者。 |
| `Library: unrecognized` | 页面没有提供可用的受支持元数据；PDF 页面尤其可能缺少足够元数据。 |
| 列表没有变色 | 开启 **Auto-check reference lists** 或点击 `↻`，并确认页面有受支持的列表 adapter。 |
| Edge 扩展重启后消失 | unpacked 扩展目录必须保持在原位置。如已移动，请在 `edge://extensions` 中重新执行 **Load unpacked** 并重新配对。 |

## 与 Zotero Connector 的区别

Zotero Connector 用于把条目保存到 Zotero。Paper Library Checker 不会替代 Zotero Connector，也不会保存条目；它检查页面元数据是否可能匹配本地文献库中的已有条目，再显示页面徽标或列表标记，帮助你决定是否保存。

## FAQ

### 如何检查一篇论文是否已经收藏到 Zotero？

保持 Zotero 运行，打开受支持的文章页面，查看页面徽标或工具栏弹窗。“已保存”表示找到匹配，“可能匹配”需要人工确认，“未保存”只表示根据当前页面元数据未找到匹配，并非对整个文献库的绝对证明。

### 如何避免 Zotero 出现重复条目？

使用 Zotero Connector 前先看检查结果。“已保存”时不要重复保存；“可能匹配”时先在 Zotero 中核对题名、年份和作者。

### 是否支持知网（CNKI）？

支持。CNKI 中文文章详情页已支持并完成测试；CNKI 英文详情页和 reference/list 检查仍为实验性。

### 是否会上传 Zotero 文献库？

不会。匹配使用附加组件的本地内存索引；项目无遥测，不会上传 Zotero 文献库数据。可选的 translation-server 集成只把当前公开页面 URL 发送到另行安装的本地服务。

### 这是论文内容查重工具吗？

不是。本项目检查的是文献条目是否已存在于 Zotero，不检测论文正文、文字重复率或抄袭。中文所说的“Zotero 文献查重”仅指收藏条目重复检测。

## 本地数据流和隐私

```text
学术页面 DOM
    -> 隔离的浏览器 content script
    -> 扩展 service worker
    -> 经过身份验证的 HTTP loopback 请求
    -> Zotero 附加组件内存索引
    -> 状态 / 匹配类型 / 置信度
```

候选元数据可能包括题名、公开标识符、日期、数量有限的 creator 值和当前文章 URL。匹配响应不会暴露 Zotero item ID、key、library metadata、已存储 URL、附件、note 或 collection。本项目无遥测，也不会上传 Zotero 文献库数据。

可选的 Zotero translation-server 集成会把当前公开页面 URL 发送给单独安装在 `127.0.0.1:1969` 的服务。所有本地 API endpoint 都要求版本化 HMAC-SHA256 请求签名；可重复使用的 pairing secret 不会放入请求字段，legacy bearer-token 和 token-in-JSON 请求会 fail closed。访问过的页面可以观察 badge 对 DOM 的修改。参见 [PRIVACY.md](PRIVACY.md)、[威胁模型](docs/threat-model.md)和 [SECURITY.md](SECURITY.md)。请勿在公开 issue 中报告漏洞。

## 高级配置

- `endpoint`：普通用户保留默认值 `http://127.0.0.1:23119/zotero-checker`。
- `translationServerMode=off`：从不使用 translation-server。
- `translationServerMode=auto`：仅在优先学术域名需要时尝试，失败后回退到本地 extractor。
- `translationServerMode=always`：优先调用 translation-server。
- `enablePageGlow`：只改变视觉提示，默认 `false`。
- `autoCheckReferenceLists`：控制自动批量检查，默认 `false`，不影响手动 `↻`。
- `broadPageDetection`：只影响 manifest 已注入的网站，默认 `false`，不会扩大 host 权限。

在 `auto` 模式下，带有 `citation_doi` 的 ScienceDirect 和 MDPI 页面通常使用通用 extractor。MDPI References 不会被扫描。creator 值按首次出现顺序去重，并限制在协议上限 20。

## Release 验证

<details>
<summary>Release 验证与 SHA-256 校验和</summary>

0.4.0 是当前公开 alpha 版本。规范构建、定向 Zotero 运行时 smoke、Edge 持久安装、工具栏 popup、手动页面检查和双语界面门槛均已通过。精确实测桌面目标是受支持的 Zotero 9.0.x 范围内的 Zotero 9.0.6；Microsoft Edge 151.0.4129.78 是主要发布测试浏览器，Chrome 仍为实验性。

| 资产 | SHA-256 |
| --- | --- |
| Zotero XPI | `85cc29a5129092a759528e2ca63a6700877c3cedb1b5fe58872f52d3e1c765e7` |
| Edge 扩展 ZIP | `dab1b40c9384b5c966a77d8d96a139bbf47dc3a059b44d75c5abecd61ca5100f` |
| LICENSE | `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4` |
| `updates.json` | `57700df0e04a08b6494e96ed1644859803076c97247bacce43d5e5fd7c63693f` |

资产通过 [v0.4.0 GitHub Release](https://github.com/he-chun/paper-library-checker/releases/tag/v0.4.0) 发布，Zotero 更新清单是仓库根目录的 [`updates.json`](updates.json)。公开的 [0.3.0 发布资格报告](docs/verification/release-qualification-0.3.0.md)继续作为首个 alpha 的历史记录。由于发布者访问验证页面替代了正常文章 DOM，ScienceDirect 不被声明为已通过真实站点验证的功能。

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

PowerShell 兼容入口仍为 `.\scripts\package-zotero-plugin.ps1`。合成 fixture 政策和手动站点检查见 [docs/test-matrix.md](docs/test-matrix.md)，架构与协议细节见 [docs/architecture.md](docs/architecture.md) 和 [docs/protocol.md](docs/protocol.md)。

## 贡献

请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。当前优先事项是安全审查、合成 adapter 回归测试和可复现的发布验证。

## 许可证

Copyright 2026 he-chun。基于 Apache License, Version 2.0 许可。参见 [LICENSE](LICENSE)、公开的[许可证决策记录](docs/license-decision.md)和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
