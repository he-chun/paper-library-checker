# 双模式架构、性能优化与当前问题总结

本文用于向外部专家说明本轮开发对 Paper Library Checker 项目和 Git
仓库所做的修改、现有验证证据，以及免 XPI 标准模式仍未解决的问题。

## 仓库状态

- 仓库：`he-chun/paper-library-checker`
- 工作分支：`feature/dual-backend-foundation`
- 主分支基线：`c37b07e`
- 本文档创建前的实现 HEAD：`496b17d`
- 相对 `main`：24 个实现/文档提交，54 个文件发生变化
- 变更规模：约 4577 行新增、256 行删除
- 浏览器扩展、Zotero XPI 和 npm 包版本均仍为 `0.4.1`
- 未合并主分支
- 未提交 `dist/`
- 未修改 Zotero 插件源码

## 一、已经完成的项目修改

### 1. 双后端架构

浏览器扩展新增统一后端接口：

```js
probe()
check(candidate)
batchCheck(candidates)
getCapabilities()
```

新增模块：

- `browser-extension/src/backends/backend-resolver.js`
- `browser-extension/src/backends/enhanced-backend.js`
- `browser-extension/src/backends/local-api-backend.js`
- `browser-extension/src/backends/local-api-matcher.js`

模式解析规则：

- `enhanced`：只使用 Zotero XPI 后端。
- `standard`：只使用 Zotero 内置 Local API。
- `auto`：先探测增强后端，失败后回退标准后端。
- 非法或缺失模式值回退 `auto`。
- 自动回退返回可选的 `degradedReason`。
- 显式选择标准或增强模式时不跨模式回退。

增强模式原有行为已封装但未改变：

- `/zotero-checker` 路径不变。
- HMAC method、path 和 body 规范不变。
- token 仍保存在 `chrome.storage.local`。
- endpoint 的存储位置和默认值不变。
- `/health`、`/check`、`/batch-check` 响应保持兼容。
- Zotero XPI 源码没有修改。

### 2. 免 XPI 标准模式

标准模式只允许访问：

```text
http://127.0.0.1:23119/api/
http://localhost:23119/api/
```

所有请求都由扩展 service worker 发起，content script 不直接访问 Zotero
Local API。

已经实现：

- Local API 可用性探测。
- Local API 未开启、不可用、不兼容、超时和 JSON 损坏等稳定错误。
- 个人库查询。
- 所有可访问群组库查询。
- DOI、PMID、ISBN、CNKI ID 和 CNKI URL 精确核验。
- 规范化中英文标题精确核验。
- 年份和作者冲突排除。
- 附件、笔记和批注排除。
- 返回结果最小化。
- 原始 Zotero item 只在 service worker 内存中处理。

标准模式能力：

```json
{
  "exactIdentifiers": true,
  "exactTitle": true,
  "fuzzyTitle": false,
  "possibleMatch": false,
  "batch": true,
  "realtimeIndex": false,
  "authenticatedProtocol": false
}
```

### 3. 标准模式批量和群组查询

已经实现：

- 使用稳定 key 对候选去重。
- 重复候选共享同一查询结果。
- 结果数组保持输入顺序。
- 单条错误隔离，不中断整批。
- 页面上限仍为 80 条。
- service worker 上限仍为 200 条。
- 查询个人库和全部可访问群组库。
- 群组列表短期缓存。
- 查询结果有界短期内存缓存。
- 同一 item 跨库去重。
- 单个群组失败不影响其他库继续匹配。
- 新批次取消或忽略同一作用域的旧批次。
- 不同标签页的批次互不取消。
- 同一标签页的详情和参考文献 workload 互不取消。

### 4. 设置页、Popup 和页面状态

设置页新增：

- 自动（推荐）
- 标准模式
- 增强模式

具体行为：

- 标准模式保存时不要求 token。
- 标准模式折叠增强 endpoint/token。
- 增强模式继续验证 64 字符 token。
- 旧 endpoint/token 保留，模式切换可逆。
- “测试连接”统一通过 service worker 后端探测。

Popup 新增：

- Zotero 连接状态。
- 当前实际模式。
- 当前匹配能力。
- 当前页面状态。
- 自动回退原因。
- 可执行修复入口。

同时保留旧的 `connected` 和 `indexReady` 字段。

此前出现“正在检查、未保存、不在 Zotero 库中同时显示”的状态冲突，已经
通过统一页面状态、Popup 跟踪终态和检查期间禁用重复操作进行处理。

### 5. 页面批次稳定性

针对动态页面连续发现参考文献的问题，已经实现：

- 相同的进行中批次直接复用。
- 新候选集只淘汰同一 workload 的旧批次。
- 已完成的相同候选集不再被 DOM 或前台事件自动重复检查。
- 用户手动重新检查仍可强制执行。
- 自动错误重试使用有界指数退避。
- Popup 与页面终态同步。
- 详情查询优先于排队中的参考文献查询。
- Local API probe 不再被 item 查询队列阻塞。
- 标准模式参考文献结果逐条增量显示。
- 使用 page-scoped request ID 忽略旧页面或旧批次结果。

### 6. 开发者模式日志

新增 opt-in 开发者模式：

- 日志保存在 service worker 的 200 条内存环形缓冲区。
- 设置页可以查看、复制和清除。
- 不写入持久存储。
- content script 无权读取。
- 不包含 token、请求正文、query 值、endpoint 或原始 Zotero item。
- 记录 operation、backend、workload、batch ID、请求阶段、耗时、缓存命中、
  结果数量和稳定错误码。

用户认为本地浏览器扩展无需做过度脱敏，但当前实现仍维持最小化诊断字段。

## 二、针对性能和稳定性问题做过的修复

### 1. 防止批次不断取消和重启

相关提交：

- `7a35f7f Prevent repeated batches from canceling searches`
- `655c6fc Prevent Local API search queue buildup`
- `24f0792 Avoid repeating completed page batches`
- `0988319 Isolate same-tab match workloads`

这些修改解决了动态 DOM 触发导致批次反复取消、旧请求继续在 Zotero 内部
积压，以及详情和参考文献互相取消的问题。

### 2. 超时和冷却

Local API 请求超时为 30 秒。item 查询超时后：

- 进入 60 秒快速失败冷却。
- 避免浏览器已经 abort、但 Zotero 内部仍继续排队搜索。
- 页面自动重试从 60 秒指数退避至 5 分钟。
- 用户手动重新检查不受自动退避限制。

### 3. 前台详情查询优先

提交：`96b1cfe Prioritize foreground Local API work`

详情检查比排队中的参考文献优先；轻量 probe 完全绕过 item 查询队列。

### 4. 参考文献结果增量显示

提交：`8d81ec7 Render standard batch results incrementally`

单条参考文献完成后立即显示，不再等待整批全部结束。最终有序批量响应仍然
保留，增量消息只携带输入索引和最小化结果。

### 5. 移除带标题候选的全文兜底

提交：`933c572 Avoid slow full-text fallback for titled items`

真实日志发现：

| 阶段 | 耗时 |
| --- | ---: |
| 标题 quicksearch | 633 ms |
| DOI `everything` | 22.967 s |
| CNKI `everything` | 815 ms |
| 整个详情检查 | 24.972 s |

DOI 全文搜索返回 0 条结果，却占总时间约 92%。

当前策略：

- 有标题的候选只使用 `titleCreatorYear`。
- 标题查询返回的记录仍核验 DOI、PMID、ISBN 和 CNKI。
- 没有标题的 identifier-only 候选才使用 `everything`。

重要兼容性代价：如果网页 DOI 与 Zotero DOI 相同，但两边标题差异大到
`titleCreatorYear` 无法找到该记录，当前标准模式不会再执行昂贵的 DOI
全文兜底，可能出现漏检。这是目前需要专家重点评估的正确性与性能取舍。

### 6. 标题查询并发

提交：`496b17d Parallelize lightweight Local API title searches`

第二份真实日志显示：

- 38 条唯一参考文献。
- 1 条缓存命中。
- 37 次实际标题请求。
- 所有请求严格串行。
- 请求耗时合计 31.244 秒。
- 中位请求耗时 583 ms。
- 最慢请求耗时 3.537 秒。
- 整批耗时 31.253 秒。
- 10 条 `matched`、28 条 `not_found`、0 条 `error`。

当前调度策略改为：

- `titleCreatorYear` 最多并发 4。
- identifier-only `everything` 并发固定为 1。
- 所有 Local API item 请求总并发不超过 6。
- 两个通道继续支持详情优先级、取消和错误隔离。

该修改已经通过模拟测试，但尚无修改后的真实 Zotero 日志验证。此前给出的
8–12 秒是根据四并发推算的估计值，不是实测结果，也仍达不到接近 XPI 的
目标。

## 三、为什么 XPI 模式明显更快

增强模式的 Zotero XPI 启动时：

1. 遍历个人库和所有群组库。
2. 在 Zotero 进程内建立以下内存索引：

   ```js
   identifierIndex = new Map()
   titleIndex = new Map()
   ngramIndex = new Map()
   itemsByID = new Map()
   ```

3. 通过 Zotero Notifier 增量处理新增、修改和删除。
4. 浏览器对整个参考文献列表只发送一个 `/batch-check` 请求。
5. Zotero 插件在同一进程内使用内存 Map 完成全部匹配。

标准模式目前没有索引，其查询量近似为：

```text
参考文献数量 × 可访问库数量 × 独立 Local API 查询
```

每次查询都需要经过：

- HTTP 请求。
- Zotero quicksearch。
- 数据库检索。
- JSON 序列化。
- service worker JSON 解析。
- 独立结果核验。

因此 HMAC、日志和脱敏不是主要开销。主要差异是“内存索引查找”和“逐条
数据库搜索”。

Zotero Local API 当前只公开 `titleCreatorYear` 和 `everything` 两种
quicksearch，没有批量标题查询或精确 DOI 字段查询接口。官方文档：
<https://www.zotero.org/support/dev/web_api/v3/basics>。

## 四、当前核心问题

### P0：免 XPI 模式没有本地索引

并发只能重叠等待，无法把几十次数据库查询变成一次内存查表。

如果目标是接近 XPI 的亚秒级或 1–2 秒批量响应，需要在扩展侧建立标准模式
本地索引。可能方案：

1. 首次连接时分页读取个人库和群组库。
2. 只保留匹配需要的规范化字段。
3. 使用 IndexedDB 持久化；否则 Manifest V3 service worker 被回收后索引
   会丢失。
4. 使用 `Last-Modified-Version` 和 `since` 进行增量更新，并处理删除记录。
5. 页面检查直接查询本地索引。
6. 索引未就绪、过期或更新失败时回退当前直接查询后端。

这实际上是在浏览器扩展中重建 XPI 已经拥有的索引能力。

### P0：标题快速路径可能牺牲 DOI 完整性

`933c572` 避免了约 23 秒的全文查询，但可能漏掉：

```text
网页 DOI == Zotero DOI
网页标题与 Zotero 标题明显不同
```

需要决定：

- 是否接受标准模式的这一限制；
- 是否恢复全文兜底；
- 或在完成扩展侧索引后恢复完整精确标识符保证。

### P1：四并发尚未真实验证

最新真实日志来自并发修改之前。重新加载扩展后，需要确认日志是否出现最多
四条连续的 `backend_request_started`，随后才出现对应的
`backend_request_completed`。

如果时间戳仍然严格串行，说明 Zotero 内部也序列化标题 quicksearch，提高
浏览器端并发没有实际收益。

### P1：群组库会乘法放大查询

未命中时可能需要查询个人库和全部群组库。大量群组下，当前直接查询架构
无法稳定达到低延迟。

### P1：标准索引的存储和隐私边界尚未决策

需要明确：

- 使用纯内存还是 IndexedDB。
- 保存原始 item，还是只保存规范化匹配字段。
- 是否允许保存标题和作者。
- 索引清除、迁移和损坏恢复方式。
- service worker 冷启动行为。
- 群组退出或权限变化后的数据清理方式。

### P1：0.5.0 尚未达到正式发布条件

当前仍为 `0.4.1`。尚未完成正式记录的：

- 四并发修改后的真实批量性能验证。
- Chrome 完整测试矩阵。
- Edge 完整测试矩阵。
- 群组库正式验证。
- 大型库正式验证。
- CNKI 80 条参考文献列表正式验证。
- 新增和删除 Zotero 条目后的结果变化验证。
- 标准索引设计和实现。

## 五、Git 提交记录

本文档创建前，工作分支包含以下 24 个提交：

```text
09cb4f9 Add browser backend abstraction
7287976 Document dual backend architecture
c098c78 Add Local API standard matching backend
89c88fc Document standard Local API privacy boundary
c331ea2 Add grouped Local API batch matching
afacc77 Document standard batch verification
704fa7f Add dual-mode extension UI
f85ff93 Prepare dual-mode release documentation
b485bd4 Add local developer performance logs
7a35f7f Prevent repeated batches from canceling searches
655c6fc Prevent Local API search queue buildup
fd01056 Document Local API timeout recovery
24f0792 Avoid repeating completed page batches
31a35f6 Document automatic batch suppression
dea5c67 Keep popup page status in sync
e9e0f13 Document popup page-state convergence
0988319 Isolate same-tab match workloads
7d54803 Document match workload isolation
96b1cfe Prioritize foreground Local API work
1703262 Document Local API foreground priority
8d81ec7 Render standard batch results incrementally
74d15e0 Document incremental standard batch results
933c572 Avoid slow full-text fallback for titled items
496b17d Parallelize lightweight Local API title searches
```

## 六、自动验证状态

最近一次完整验证结果：

- `npm ci`：通过。
- `npm test`：276/276 通过。
- `npm run check`：通过，共检查 166 个文件。
- `npm run build`：通过。
- `npm run inspect:artifacts`：通过。
- `npm run verify:release`：以 `v0.4.1` 通过。
- 构建产物结构检查通过。
- 未提交 `dist/`。
- 未修改版本号。

## 七、建议专家重点回答的问题

1. 在不安装 XPI 的前提下，是否同意建立 IndexedDB 本地索引？
2. 标准模式的目标应是亚秒级查询，还是无需 XPI、允许数秒等待？
3. 当前关闭带标题候选的 DOI 全文兜底是否可接受？
4. Local API 增量同步应如何可靠处理个人库、群组库、删除和权限变化？
5. 索引应该只保存规范化字段，还是保存完整 Zotero item？
6. service worker 冷启动时应阻塞检查、使用旧索引，还是临时回退直接查询？
7. 是否应该将标准后端进一步拆分为 `DirectLocalApiBackend` 和
   `IndexedLocalApiBackend`？
8. 索引构建失败或过期时，能力声明和 UI 应如何降级？
9. 是否应保留当前四并发优化，还是在索引完成后恢复为更低并发？
10. 首次全库同步、增量同步和正常查询分别应设定什么性能门槛？
