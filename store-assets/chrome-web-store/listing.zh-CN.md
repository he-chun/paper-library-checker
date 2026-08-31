# Chrome Web Store 商店文案 — 简体中文

## 商店名称

Paper Library Checker

## 简短说明

检查受支持学术网站上的论文是否已存在于本地 Zotero 文献库中。

## 推荐分类

Workflow & Planning

Paper Library Checker 通过检查学术文章是否已存在于本地 Zotero 文献库中，
帮助研究人员更高效地完成文献管理工作流。

## 详细说明

Paper Library Checker 是一个仍处于 alpha 阶段的本地优先 Zotero 配套工具。
它读取受支持学术文章页面中的公开书目信息，并与用户电脑上的本地 Zotero
文献库进行匹配，显示“已保存”“可能匹配”“未保存”或“无法识别”，帮助用户
决定是否保存条目。

运行要求：

- Zotero 9.0.x；
- Zotero 保持运行并启用其内置 Local API。

Zotero 未运行或所选后端无法连接时，显示“离线（Offline）”属于预期行为。

标准模式无需安装 Paper Library Checker Zotero 附加组件，支持标识符/题名精确
匹配和参考文献批量检查。可选增强模式通过配套附加组件提供更快批量检查、完整
模糊匹配、“可能匹配”和实时索引更新。自动模式优先使用健康且兼容的增强后端，
否则回退标准模式并显示原因。

本扩展不会保存文献，也不会替代 Zotero Connector。标准模式的 Local API 原始
记录只在扩展 service worker 内存中处理，不返回网页；增强模式使用认证的本机
回环请求和最小化结果。两种模式都不会上传用户的 Zotero 文献库或用于遥测；
项目没有遥测、广告或开发者运营的服务器。

Chrome 是本次 Chrome Web Store 上架的目标浏览器。Microsoft Edge 通常可以
安装 Chrome Web Store 扩展，但不能保证所有 Edge 环境都兼容。

现有支持边界保持不变：CNKI 中文文章详情页已支持并完成测试；CNKI 英文页和
CNKI 列表/参考文献检查为实验性；ScienceDirect 在访问控制替换正常文章页面时
仅为尽力支持；MDPI 文章详情页已支持并完成测试，但 MDPI References 不支持。
manifest 中列出的其他学术网站使用实验性或尽力支持的通用元数据提取；域名被列出
本身并不表示承诺支持该网站的所有页面。

Paper Library Checker 当前仍是 alpha 软件。本项目是独立项目，与 Zotero、
Google Chrome、Microsoft Edge 及其发布方没有关联，也未获得其认可或背书。
