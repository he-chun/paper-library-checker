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

0.3.0 是首个公开 alpha 版本。其规范构建、Zotero 运行时和 Edge 持久安装门槛
均已通过。桌面端的精确实测目标是受支持的 Zotero 9.0.x 范围内的 Zotero
9.0.6。Microsoft Edge 151.0.4129.78 是主要且唯一纳入发布门槛的浏览器；
Chrome 仍处于实验性范围，未用于 0.3.0 alpha 的发布资格验证。参见公开的
[发布资格报告](docs/verification/release-qualification-0.3.0.md)。由于发布者访问
验证页面替代了正常文章 DOM，ScienceDirect 不被声明为已通过真实站点验证的功能。

规范 Release 校验和：

| 资产 | SHA-256 |
| --- | --- |
| Zotero XPI | `91331ef1bcee06c34bbcadaaf956866b5c06125999da630f48f0f6837234ef59` |
| Edge 扩展 ZIP | `ef69fec94e4ac8bb9de87b4b1c6ab42b226c50d895a6df893150da2f07dc9bd5` |
| LICENSE | `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4` |
| `updates.json` | `9f4bc8e052e7a8325b99a84375b9d81b2a2876b24fde1797a031f18c14573420` |

Release 资产通过
[v0.3.0 GitHub Release](https://github.com/he-chun/paper-library-checker/releases/tag/v0.3.0)
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

1. 从 [v0.3.0 GitHub Release](https://github.com/he-chun/paper-library-checker/releases/tag/v0.3.0)
   下载 `paper-library-checker-zotero-0.3.0.xpi`。
2. 在 Zotero 9 中打开 **Tools > Plugins**，选择 **Install Plugin From File**，
   然后选择下载的 XPI。
3. 重启 Zotero。

用户无需从源代码构建附加组件。

附加组件使用 Zotero 位于 loopback 端口 `23119` 的 HTTP server。它会在首次启动
时生成 256-bit 配对令牌，并把它保存在本地 Zotero preference 中。

## 安装并配对浏览器扩展

1. 从 [v0.3.0 GitHub Release](https://github.com/he-chun/paper-library-checker/releases/tag/v0.3.0)
   下载 `paper-library-checker-extension-0.3.0.zip`。
2. 把它解压到不会移动或删除的稳定目录。
3. 打开 `edge://extensions` 并开启 **Developer mode**。
4. 点击 **Load unpacked**，选择直接包含 `manifest.json` 的解压目录。
5. 在 Zotero 中选择 **Tools > Paper Library Checker: Copy pairing token**，复制
   配对令牌。
6. 打开 extension options，把令牌粘贴到 **Pairing token** 并保存。
7. 刷新已打开的文章页面。

本扩展尚未发布到 Microsoft Edge Add-ons Store，当前使用 Developer mode 的
unpacked 安装方式。移动或删除解压目录可能导致扩展失效。Chrome 可以用于实验，
但不属于 0.3.0 alpha 的发布门槛。

浏览器把 secret 保存在 `chrome.storage.local` 中；非敏感选项使用
`chrome.storage.sync`。可以通过 Zotero Tools 菜单重置或撤销令牌。从 0.2
开发构建升级时需要遵循 [0.3 迁移说明](docs/migration-0.3.md)。

## 配置选项

- `translationServerMode`：`off`、`auto` 或 `always`。
- `enablePageGlow`：可保存状态的可选页面边缘效果；默认为 `false`。
- `autoCheckReferenceLists`：自动检查受支持站点的批量列表；默认为 `false`。
- `broadPageDetection`：在本扩展已注入的受支持网站上检测文章详情页；默认为
  `false`。它不会授予对 manifest 之外站点的访问权限。

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
