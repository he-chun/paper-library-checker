# Chrome Web Store 商店文案 — 简体中文

## 商店名称

Paper Library Checker

## 简短说明

检查受支持学术网站上的论文是否已存在于本地 Zotero 文献库中。

## 详细说明

Paper Library Checker 是一个仍处于 alpha 阶段的本地优先 Zotero 配套工具。
它读取受支持学术文章页面中的公开书目信息，并与用户电脑上的本地 Zotero
文献库进行匹配，显示“已保存”“可能匹配”“未保存”或“无法识别”，帮助用户
决定是否保存条目。

运行要求：

- Zotero 9.0.x；
- 配套的 Paper Library Checker Zotero 附加组件；
- Zotero 及该附加组件需要保持运行；未运行时显示“离线（Offline）”属于预期行为。

本扩展不会保存文献，也不会替代 Zotero Connector；不会上传用户的 Zotero
文献库；没有遥测、广告或开发者运营的服务器。匹配和配对均在用户电脑上完成。

Chrome 是本次 Chrome Web Store 上架的目标浏览器。Microsoft Edge 通常可以
安装 Chrome Web Store 扩展，但不能保证所有 Edge 环境都兼容。

现有支持边界保持不变：CNKI 中文文章详情页已支持并完成测试；CNKI 英文页和
CNKI 列表/参考文献检查为实验性；ScienceDirect 在访问控制替换正常文章页面时
仅为尽力支持；MDPI 文章详情页已支持并完成测试，但 MDPI References 不支持。
manifest 中列出的其他学术网站使用实验性或尽力支持的通用元数据提取；域名被列出
本身并不表示承诺支持该网站的所有页面。

Paper Library Checker 当前仍是 alpha 软件。本项目是独立项目，与 Zotero、
Google Chrome、Microsoft Edge 及其发布方没有关联，也未获得其认可或背书。
