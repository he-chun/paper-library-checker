# Paper Library Checker

[English](README.md) | **简体中文**

**Zotero 的第三方附加组件**

Paper Library Checker 会标记本地 Zotero 文献库中已有的学术文章。它由一个
Chrome/Edge 扩展和一个 Zotero 桌面附加组件组成，文献库匹配始终在用户的
计算机上完成。

> Alpha 软件：在首个稳定版本发布前，协议和安装细节可能会发生变化。

Zotero 是 Corporation for Digital Scholarship 的注册商标。本独立项目与
Zotero 项目没有关联，也未获得 Zotero 项目的认可或背书。

## 与 Zotero Connector 的区别

Zotero Connector 用于把条目保存到 Zotero。Paper Library Checker 不会替代
Zotero Connector，也不会保存条目。它检查页面元数据是否可能与本地文献库中的
已有条目匹配，然后显示页面徽标或列表标记。

## 支持矩阵

| 场景 | 文章详情页 | 参考文献/列表批量检测 |
| --- | --- | --- |
| CNKI 中文页面 | 已支持并完成测试 | 实验性 |
| CNKI 英文页面 | 实验性 | 实验性 |
| ScienceDirect | 尽力支持；真实访问可能受到站点验证限制 | 尽力支持 |
| MDPI | 已支持并完成测试 | 不支持 |
| 通用 COinS/JSON-LD/citation/DC 元数据 | 有自动化回归测试覆盖 | 不支持 |
| 其他已列出的学术站点 | 实验性/尽力支持 | 不支持 |

0.4.0 是当前公开 alpha 版本。其规范构建、定向 Zotero 运行时 smoke、Edge
持久安装、工具栏 popup、手动页面检查和双语界面门槛均已通过。桌面端的精确实测
目标仍是受支持的 Zotero 9.0.x 范围内的 Zotero 9.0.6。Microsoft Edge
151.0.4129.78 是主要发布测试浏览器；Chrome 仍处于实验性范围。公开的
[0.3.0 发布资格报告](docs/verification/release-qualification-0.3.0.md)继续作为
首个 alpha 的历史记录。由于发布者访问验证页面替代了正常文章 DOM，
ScienceDirect 不被声明为已通过真实站点验证的功能。

规范 Release 校验和：

| 资产 | SHA-256 |
| --- | --- |
| Zotero XPI | `85cc29a5129092a759528e2ca63a6700877c3cedb1b5fe58872f52d3e1c765e7` |
| Edge 扩展 ZIP | `dab1b40c9384b5c966a77d8d96a139bbf47dc3a059b44d75c5abecd61ca5100f` |
| LICENSE | `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4` |
| `updates.json` | `57700df0e04a08b6494e96ed1644859803076c97247bacce43d5e5fd7c63693f` |

Release 资产通过
[v0.4.0 GitHub Release](https://github.com/he-chun/paper-library-checker/releases/tag/v0.4.0)
发布。Zotero 更新清单是仓库根目录中的 [`updates.json`](updates.json)。

未知站点永远不会被自动扫描参考文献。宽泛文章检测仍为实验性功能，并默认禁用。
本扩展不处理缺少可用页面元数据的 PDF，不保存记录，不修改 Zotero 文献库，也不
承诺达到 Zotero Connector translators 的覆盖范围。

## 本地数据流

```text
学术页面 DOM
    -> 隔离的浏览器 content script
    -> 扩展 service worker
    -> 经过身份验证的 HTTP loopback 请求
    -> Zotero 附加组件内存索引
    -> 状态 / 匹配类型 / 置信度
```

候选元数据可能包括题名、公开标识符、日期、数量有限的 creator 值和当前文章
URL。匹配响应不会暴露 Zotero item ID、key、library metadata、已存储 URL、
附件、note 或 collection。本项目无遥测，也不会上传 Zotero 文献库数据。

可选的 Zotero translation-server 集成会把当前公开页面 URL 发送给单独安装在
`127.0.0.1:1969` 的服务。参见 [PRIVACY.md](PRIVACY.md) 和
[威胁模型](docs/threat-model.md)。

## 安装 Zotero 附加组件

1. 从 [v0.4.0 GitHub Release](https://github.com/he-chun/paper-library-checker/releases/tag/v0.4.0)
   下载 `paper-library-checker-zotero-0.4.0.xpi`。
2. 在 Zotero 9 中打开 **Tools > Plugins**，选择 **Install Plugin From File**，
   然后选择下载的 XPI。
3. 重启 Zotero。

用户无需从源代码构建附加组件。

附加组件使用 Zotero 位于 loopback 端口 `23119` 的 HTTP server。它会在首次启动
时生成 256-bit 配对令牌，并把它保存在本地 Zotero preference 中。

## 安装并配对浏览器扩展

1. 从 [v0.4.0 GitHub Release](https://github.com/he-chun/paper-library-checker/releases/tag/v0.4.0)
   下载 `paper-library-checker-extension-0.4.0.zip`。
2. 把它解压到不会移动或删除的稳定目录。
3. 打开 `edge://extensions` 并开启 **Developer mode**。
4. 点击 **Load unpacked**，选择直接包含 `manifest.json` 的解压目录。
5. 在 Zotero 中选择 **Tools > Paper Library Checker: Copy pairing token**，复制
   配对令牌。
6. 打开 extension options，把令牌粘贴到 **Pairing token** 并保存。
7. 刷新已打开的文章页面。

本扩展尚未发布到 Microsoft Edge Add-ons Store，当前使用 Developer mode 的
unpacked 安装方式。更新现有 unpacked 安装时，请下载新的 ZIP，在同一个稳定扩展
目录中替换或更新文件，然后在 `edge://extensions` 点击 **Reload**。保持相同目录
通常会保留扩展 storage；仅当扩展 identity 或已存储 token 改变时才需要重新配对。
移动或删除解压目录可能导致扩展失效。Chrome 可以用于实验，但不属于 0.4.0
alpha 的发布门槛。

浏览器把 secret 保存在 `chrome.storage.local` 中；非敏感选项使用
`chrome.storage.sync`。可以通过 Zotero Tools 菜单重置或撤销令牌。从 0.2
开发构建升级时需要遵循 [0.3 迁移说明](docs/migration-0.3.md)。

## 使用方法

### 首次使用

使用 Paper Library Checker 期间必须保持 Zotero 运行。Zotero **Tools** 菜单中
禁用的 `Paper Library Checker (0.4.0)` 菜单项表示附加组件已经加载。

1. 选择 **Tools > Paper Library Checker: Copy pairing token**。
2. 打开扩展的 **Options**，把令牌粘贴到 **Pairing token**，然后点击 **Save**。
3. 点击 **Test connection**。连接成功时会显示
   `Connected to Paper Library Checker 0.4.0`。

普通用户通常应保留默认 endpoint：
`http://127.0.0.1:23119/zotero-checker`。

### 检查文章详情页

1. 保持 Zotero 运行。
2. 打开[支持矩阵](#支持矩阵)覆盖的文章详情页。
3. 等待页面标题附近或右下角出现状态徽标。

扩展会提取页面元数据，并与 Zotero 附加组件的本地内存索引匹配。页面上的浮动
`↻` 按钮可以手动重新检查文章、在受支持的列表页面手动触发批量检查，也可以拖动
改变位置。如果刚通过 Zotero Connector 保存条目或在 Zotero 中修改条目，请点击
`↻` 或刷新页面。

### 工具栏弹窗

点击浏览器工具栏中的 **文献库检查器**，可以查看三组独立状态：**Zotero**
（`已连接` 或 `离线`）、**索引**（`就绪` 或 `正在索引`）以及**当前页面**
（`已保存`、`可能匹配`、`未保存`、`无法识别`、`尚未检查`、`不支持当前页面`
或 `错误`）。**检查当前页面** 与浮动 `↻` 共用同一个手动检查入口；
**打开设置** 会打开标准扩展 Options 页面。

`不支持当前页面` 表示活动标签中没有注入扩展 content script，例如浏览器内部页面，
或不在现有 manifest 站点列表中的网站；这不代表新增了站点支持。弹窗不会读取或
显示配对令牌，也不会扩大站点访问权限。

浏览器界面跟随浏览器显示语言，Zotero Tools 菜单跟随 Zotero/Gecko locale。
项目内置英文和简体中文；其他 locale 回退到英文。界面语言不根据文章网页语言切换。

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

徽标和页面边缘效果使用以下颜色：red 表示 saved/matched，orange 表示 possible
match，blue 表示 not saved，yellow 表示 checking/unrecognized/choice，purple 表示
offline/indexing/error。`Library: not saved` 表示使用当前页面提供的元数据没有找到
匹配，不是对整个 Zotero 文献库的绝对证明。

### 收藏后重新检查

附加组件会监听 Zotero item 的新增、修改、删除和 trash 事件，并自动更新本地索引。
已经打开的网页不会始终自动重新发起请求，因此保存或修改条目后请点击 `↻` 或刷新
页面。无需手动重建 Zotero 索引。

### 参考文献和列表检查

**Auto-check reference lists** 默认关闭。开启后，受支持页面会在加载和滚动时自动
检查列表；未开启时，可以点击 `↻` 手动触发受支持的列表检查。单个页面当前最多
处理 80 个候选。

参考文献链接或行使用以下颜色：red 表示 saved，orange 表示 possible match，blue
表示 not found，gray 表示 checking，purple 表示 error。功能级别仍以支持矩阵为准：
CNKI reference/list 为 experimental，ScienceDirect 为 best effort，MDPI References
不支持。

### 页面边缘效果

**Enable page edge glow** 默认关闭。开启后，视口边缘会使用与结果对应的颜色作为
视觉提示，但不会改变匹配结果。`prefers-reduced-motion` 会禁用动画效果。

### 配对令牌操作

- **Copy pairing token**：复制当前令牌。
- **Reset pairing token**：生成并自动复制新令牌，旧令牌随即失效。
- **Revoke pairing token**：立即撤销当前令牌。

执行 **Reset pairing token** 后，打开扩展 Options，粘贴新令牌，点击 **Save**，
再点击 **Test connection**。执行 **Revoke pairing token** 后，在重新生成并保存新
令牌前，扩展无法连接。

### 常见问题

| 问题 | 检查方法 |
| --- | --- |
| 没有状态徽标 | 确认 Zotero 正在运行、附加组件已经加载且扩展已经启用。确认当前页面属于 manifest 注入站点，并具有 citation、DC、COinS、JSON-LD 或 CNKI 元数据。刷新页面或点击 `↻`。`broadPageDetection` 只在扩展已经注入的网站中生效。 |
| `Library: offline` | 确认 Zotero 正在运行、endpoint 保持默认，并已点击 **Save**。检查是否重置或撤销过令牌；点击 **Test connection**，必要时重新复制令牌。 |
| `Library: indexing` | Zotero 初次启动时正在建立本地索引。等待后点击 `↻`；如果持续出现，再重启 Zotero。 |
| `Library: possible match` | 这是模糊题名匹配，不是确定已收藏；需要人工确认，在 Zotero 中核对题名、年份和作者。 |
| `Library: unrecognized` | 当前页面没有提供可用的受支持元数据，不能据此判定是否已收藏；PDF 页面尤其可能没有足够元数据。 |
| 列表没有变色 | 开启 **Auto-check reference lists** 或点击 `↻`，并确认当前站点和页面支持列表 adapter。列表功能可能仍为 experimental 或 best effort。 |
| Edge 扩展重启后消失 | unpacked 扩展目录必须保持在原位置，不能移动、改名或删除。如已移动，请在 `edge://extensions` 中重新执行 **Load unpacked** 并重新配对。 |

## 配置选项

- `endpoint`：普通用户应保留默认值
  `http://127.0.0.1:23119/zotero-checker`。
- `translationServerMode=off`：从不使用 translation-server。
- `translationServerMode=auto`：仅在优先学术域名需要时尝试 translation-server；
  失败后仍可回退到本地 extractor。
- `translationServerMode=always`：优先调用 translation-server。
- `enablePageGlow`：只改变视觉提示；默认为 `false`。
- `autoCheckReferenceLists`：控制自动批量检查；默认为 `false`，不影响手动点击
  `↻` 检查。
- `broadPageDetection`：只影响 manifest 已经注入的网站；默认为 `false`，不会扩大
  host 权限。

在 `auto` 模式下，带有 `citation_doi` 的 ScienceDirect 和 MDPI 页面通常使用
通用 extractor。`always` 会强制优先使用 translation-server。MDPI References
不会被扫描。在本地 API 序列化之前，来自所有 extractor 和 translation-server
路径的 creator 值会按首次出现顺序去重，并限制在协议上限 20；Zotero 服务仍会
拒绝超过该上限的直接请求。

## 开发

需要 Node.js 20.19 或更高版本。

```powershell
npm ci
npm test
npm run check
npm run build
npm run inspect:artifacts
```

仍可使用 PowerShell 兼容入口：

```powershell
.\scripts\package-zotero-plugin.ps1
```

合成 fixture 政策和手动站点检查记录在 `test/` 和
[docs/test-matrix.md](docs/test-matrix.md) 中。架构与协议细节见
[docs/architecture.md](docs/architecture.md) 和 [docs/protocol.md](docs/protocol.md)。

## 隐私与安全

所有本地 API endpoint 都要求使用版本化 HMAC-SHA256 请求签名，签名覆盖
method、path、timestamp、nonce 和 exact body hash。可重复使用的配对 secret
绝不会作为请求字段发送。legacy bearer-token 和 token-in-JSON 请求会 fail closed。
请求、批次、字段和缓存均有上限；响应经过最小化；项目日志会脱敏 secret 并在本地
轮换。发布资格验证使用 Zotero 9.0.6 和干净的 Microsoft Edge profile，包括
持久 native 安装和正常 Edge 重启。访问过的页面可以观察 badge 对 DOM 的修改；
这一边界记录在 [PRIVACY.md](PRIVACY.md) 中。

不要在公开 issue 中报告漏洞。请遵循 [SECURITY.md](SECURITY.md)。

## 许可证状态

Copyright 2026 he-chun。基于 Apache License, Version 2.0 许可。参见
[LICENSE](LICENSE)、公开的[许可证决策记录](docs/license-decision.md)和
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 贡献

请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。当前优先事项是安全审查、合成 adapter
回归测试和可复现的发布验证。
