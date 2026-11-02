# Lexicon 问题清单

> 定位：本地运行工具（`start.cmd` + 本地 JSON 文件），不考虑静态托管、多端同步、多用户。
>
> **这里只放还没解决的问题。** 每轮改了什么、怎么验证的、当时的数字，全部在
> [`docs/HISTORY.md`](HISTORY.md)。不要往本文档追加批次日志——那正是它上次膨胀到 600 行、
> 出现两段重复内容的原因。
>
> 数字（测试条数、文件行数）以命令输出为准，不抄进文档；`npm run docs:check` 会拦。

## 当前状态（2026-11-01）

**未决**

- **#39 schema 迁移**：三个 store 都是 version 1，暂时没有真实迁移需求，只补了文档说明。
- **#34 无障碍的全量审计**：键盘路径、对比度、`aria-live` 已做，屏幕阅读器未实测。
- **#11 的自动修复**：只做「检测到异常并提示」，不改写 `due` / `days`。
- **#42 安全边界**：`/api/storage` 无鉴权（仅本机 Origin 校验）、无 CSP。
- **M1/M5 存储架构**：整文件 JSON + 全量重写；`library.json` 超过约 10MB 后，1.2 秒的读取预算和 3 秒的写入预算会变紧。
- **CI 与页面级 E2E**：`npm test` 覆盖纯函数和本地接口，页面回归仍靠 `scripts/smoke-*.mjs` 手跑。
- **游戏 · 译文没有母语审校**：2,069 条（1,720 事件 + 184 天赋 + 165 成就）已全部翻完，
  `translate:check` 只校验 id、占位符、残留中文和长度比例，语感没人逐条读过。
- **游戏 · 内容分级**：含死亡、疾病、暴力等情节，目前只在游戏首页写了一行提示；公开仓库前若要更严，需要黑名单或版本分级（当前决定：不做黑名单）。
- **游戏 · 上游同步**：`src/game/remake/` 是 vendor 的 `d20aa81`，引擎更新要按 `UPSTREAM.md` 手动 diff；数据层是自己的 JSON，不受影响。
- **游戏 · 只有一款**：`registry.ts` 和多游戏分键（`profiles` / `runs` / 成就按 gameId）已就位，但没被第二款游戏验证过。
- **游戏 · 部分小字不可点词**：天赋选择卡是 `<button>`（点词会误选中），成就页为一个小功能加载整本词典，这两处没接查词。

**已知取舍**

- `ReaderView` 仍是单个组件（约 400 行）：十几项状态被正文、工具栏、侧栏和移动端 sheet 共用，硬拆只会变成 prop 转手。
- 读超时（1.2 秒）会暂停该数据的写入并提示重新加载。阈值是经验值，遇到慢盘误报就调大。

## 状态说明

- `待修`：已确认，等待修复。
- `修复中`：已分配给子代理或正在修改。
- `已修`：代码已改，待构建/人工验证。
- `已验证`：构建、lint、手动冒烟均通过。
- `待确认`：会改变整体运行逻辑或数据语义，需要项目所有者先拍板。
- `暂缓`：本轮不做，记录备查。
## 需要你拍板的重大改动

以下项目会影响整体运行方式、数据格式或恢复语义，子代理不会擅自实施。

> 2026-10-25 决定：M4 采用“保留备份 + 清空弹窗告知 + 设置页展示目录/大小”；M1、M5 暂不推进；#21 只做服务端紧凑 JSON；#20、#24、#35 本轮修复。#3、#29 随之解决。
> 
> M7（备份浏览/恢复）与 M8（MIT）已完成。备份浏览/恢复已接入，清空弹窗已告知备份保留且不提供一键删除，损坏文件可隔离。

| 编号 | 事项 | 为什么需要确认 | 建议 |
| --- | --- | --- | --- |
| M1 | 把 `study.json` / `reader.json` 从“整文件覆盖”改为分片或 SQLite/LevelDB | 改变数据文件结构和备份方式，属于存储架构升级 | 暂缓；#21 已先做服务端紧凑 JSON |
| M2 | `start.cmd` 从 `vite dev` 改为 `build + preview` | 改变日常启动方式，影响开发调试和 PWA | 已采纳：`start.cmd` 现在构建 + preview，改代码用 `npm run dev`；不再维护第二个启动脚本 |
| M3 | PWA 数据缓存从 `CacheFirst` 一年改为 `NetworkFirst`/版本化 URL | 改变离线行为和词典更新语义 | 若保留 PWA，建议做版本化 |
| M4 | “清除全部数据”是否连 `backups/` 一起删除 | 涉及隐私与可恢复性的取舍 | 已决定保留备份；清空弹窗告知，设置页展示备份路径/数量/大小 |
| M5 | 词典/词书改为按需分片加载或新数据格式 | 需要改构建脚本与前端加载器 | 暂缓；先测量，再决定是否值得 |
| M6 | 跨浏览器/多进程写入：改为只读 follower、文件锁或单实例检测 | 改变多开行为 | 建议先停止 409 自动覆盖，是否做锁另行确认 |
| M7 | 增加服务端备份浏览/恢复 API 与 UI | 新增数据恢复入口和接口 | 已做（设置页自动备份列表与恢复，恢复前安全备份；暂不提供删除 UI） |
| M8 | 项目 LICENSE 选择 | 法律选择，不能替用户决定 | 已采用 MIT（见 LICENSE、package.json、README） |
| M9 | 引入 Vitest/Playwright 与 CI | 新增开发依赖和脚本 | 建议先加 Vitest，CI 可后置 |

## 一、数据安全（最高优先）

### 1. 损坏 JSON 会造成写入死锁，导入备份还会“假成功”
- 状态：`已修`（已验证）
- 位置：`server/dataStorage.ts` `readEnvelope`/PUT/DELETE、`src/pages/Settings.tsx`（隔离、恢复）
- 现象：手改、BOM、断电截断后，GET/PUT 返回明确的 500 并给出文件路径与指引；DELETE 不解析。导入失败时会回滚已写入的文件，成功再提示。
- 处理：损坏文件可在设置页「本地数据」隔离（`POST /api/storage/:kind/quarantine`），隔离后重命名为 `<kind>.corrupt-<时间戳>-<pid>.json` 保留在数据目录。导入采用全量校验、临时文件写入、失败回滚，且仅在写入成功后才更新内存状态并提示成功。
- 备注：自动备份浏览/恢复与隔离 UI 已接入（M7 部分完成），备份删除 UI 暂无。

### 2. 关闭页面/崩溃可能丢最后一次修改
- 状态：`已修`（待人工验证崩溃重放与大文件 pagehide）
- 位置：`src/lib/storage.ts` `flush()`、`pagehide`/`visibilitychange`、`writeFile()`
- 现象：`flush()` 先清空 `controller.pending`，再写 IndexedDB、再写文件；`lexicon:pending:*` 只在写文件失败后才设置。页面隐藏时的 flush 不被等待，`keepalive` 只在请求体 < 60KB 时开启，`study.json` 很容易超过。
- 建议：写入前先置 dirty 标记；启动时优先重放；成功后才清 pending；关键写入立即落盘。

### 3. 每日备份“有，但不好用”，清空数据不删备份
- 状态：`已修`（已验证）
- 位置：`server/dataStorage.ts` `ensureDailyBackup`/`pruneBackups`/DELETE、`src/pages/Settings.tsx`
- 现象：每个 kind 每天只在当天第一次写入前备份一次；无校验和；与主文件同盘。DELETE 前会备份，且不删 `backups/`，用户以为清干净了，历史记录还在。
- 处理：明确保留备份，不自动删除；设置页显示数据目录、备份目录、各文件大小、备份总份数与总大小；清空全部数据时弹窗告知备份仍保留，需要彻底清理时由用户手动删除。支持按类浏览自动备份并一键恢复（恢复前自动创建安全备份），但暂不提供删除 UI。
- 备注：默认每种数据保留 30 份，三种数据合计最多约 90 份。若觉得占用空间偏大，可到备份目录手动删除旧文件。

### 4. 恢复和持久化数据缺少 schema 校验，坏备份可导致白屏
- 状态：`已验证`（校验器冒烟、ErrorBoundary 构建通过）
- 位置：`appStore.restore`、三个 store 的 `merge`、`Settings.parseReaderSnapshot`
- 现象：只检查少量顶层字段；`settings`、`CardRecord`、`DayStat`、`PersonalWord` 内部字段不校验；坏日期/字符串可导致 `RangeError` 或 NaN。
- 建议：validator + 逐项修复/丢弃；persist version/migrate；顶层 ErrorBoundary。

### 5. 409 的处理是“接受服务端版本再覆盖”，不是合并
- 状态：`已验证`（真实页面 409 冒烟：不覆盖、不重试、刷新恢复）
- 位置：`src/lib/storage.ts` `writeFile()`
- 现象：收到 409 后直接采用服务端 revision 并重试，用当前内存快照覆盖对方数据；读取超时后 revision 仍为 0，也可能覆盖较新文件。
- 建议：409 停止自动重试并提示刷新；读取超时后不要直接进入可写状态；多实例写入方案见 M6。

### 6. 浏览器缓存回退是静默的，且有约 5MB 天花板
- 状态：`已修`（已验证：写入结果可上报、横幅区分三种情况）
- 位置：`src/lib/storage.ts` `writeLocal()`/`writeCache()`/`reportCacheFailure()`、`src/components/Layout.tsx`、`src/pages/Settings.tsx`
- 现象：localStorage 写入异常被吞掉；超过容量后仍显示“暂时保存在浏览器缓存中”。
- 处理：`writeLocal` 返回布尔，`writeCache` 返回 `'idb' | 'local' | 'failed'`；只有当**文件写入也失败且缓存同样失败**时才置 `cacheWriteFailed`（文件写成功时说明数据已落盘，缓存失败不影响数据安全）。命中时 Layout 顶部出现「当前更改只保存在内存里」横幅并给出去导出备份的入口，设置页补充“浏览器缓存只是副本，上限约 5 MB”的说明。
- 备注：仍未做精确容量估算（只给上限提示），也没有在缓存模式下强制拦截写入。

## 二、正确性

### 7. 词典没加载完就查词，会误报“未收录”
- 状态：`已验证`（桌面查词正常；加载中/失败状态已接入）
- 位置：`useReaderDictionary`、`WordPanel`、`ReaderHint`
- 现象：初始 `maps=null`，`lookupWord` 返回 null；面板显示“词典暂未收录”；加载完成后不刷新；移动端看不到加载/错误状态。
- 建议：loading 状态、加载完重算当前 panel、移动端状态、两个 JSON 独立降级。

### 8. “重新阅读”不会重置进度
- 状态：`已验证`（重新阅读回到顶部，进度写回 0）
- 位置：`src/pages/Reading.tsx`、`src/pages/Reader.tsx`
- 现象：文案变为“重新阅读”，但链接仍是 `/read/:id`，Reader 恢复到文末。
- 建议：`?from=start` 或独立按钮。

### 9. 词书重建/删词后旧 progress 残留
- 状态：`部分修复`（整本词书级已统一；单词级仍靠百分比夹紧）
- 位置：`src/lib/stats.ts` `summarizeStudy`、`src/pages/Stats.tsx`
- 现象：旧 `bookId:wordId` 记录不清理，统计口径不一致。
- 处理：`summarizeStudy` 增加可选 `validBookIds`，统计页用 registry 里的词书 id + `personal` 构造集合传入，整本词书被删后其孤儿记录不再计入「已学/已掌握」。`registry` 加载中时传 `undefined`（不筛选），避免数字闪成 0。
- 备注：单本词书内删掉个别词造成的孤儿记录仍在 `progress` 里，只是每本书的百分比会用 `wordCount` 夹紧。彻底清理需要加载词表（12MB）或改数据层，本轮不做。

### 10. 词形还原的候选顺序会命中错误词条
- 状态：`已验证`（starer→stare、changer→change、hoper→hope、hoped→hope）
- 位置：`src/lib/reader.ts` `lookupCandidates`
- 现象：`-ing/-ed/-er` 先去 e 词干再加 +e；`starer -> star`、`changer -> chang`、`hoper -> hop`。
- 建议：优先“+e 原形”，再用词频/词性消歧。

### 11. 系统时钟/时区变化没有防护
- 状态：`部分修复`（只做检测与提示，不做自动修复）
- 位置：`src/lib/health.ts`、`src/components/settings/HealthPanel.tsx`、`Settings.tsx`
- 现象：改系统时间/跨时区后 due 可能异常，streak 断裂，没有修复入口。
- 处理：`inspectStudyData(progress, days, now)` 扫描三类异常——`due` 超过 10 年、`last_review`/`introducedAt`/`updatedAt` 晚于明天、`days` 的 key 晚于明天；设置页「数据」区块在命中时显示「时间记录异常」提示，列出各自数量并建议先导出备份。7 条单测覆盖阈值与边界。
- 备注：**故意不自动修**。重排 `due` 会改写用户的学习记录，风险高于问题本身；提示足够让用户自己判断（多半是系统时间设错了）。

### 12. 导入备份不是事务性的
- 状态：`已修`（已验证）
- 位置：`server/dataStorage.ts` `importKinds`、`src/pages/Settings.tsx` `handleImport`
- 现象：三个 store 分别 debounce 写入，中途失败会半套数据。
- 处理：服务端采用事务式导入（全量 preflight、临时文件写入、失败回滚、损坏文件隔离），客户端仅在服务端提交成功后才更新内存状态并提示成功。旧版冲突检测仍保留。

### 13. hydration 超时后以“空数据”继续
- 状态：`已修`（超时改为只读，不再放开写入）
- 位置：`src/lib/useHydrated.ts`、`src/lib/useReaderHydrated.ts`、`src/lib/storage.ts` `setHydrationWriteBlocked`、`src/components/Layout.tsx`
- 现象：2.5 秒后强制返回 true，可能用空状态覆盖旧文件。
- 处理：`useHydrated` 改为三态 `'loading' | 'ready' | 'slow'`。`slow` 时仍然渲染应用（不把用户困在启动页），但通过 `setHydrationWriteBlocked('study' | 'reader', true)` 暂停全部写入：`schedule()` 直接丢弃新快照，`flush()` 提前返回（页面隐藏时也不会写）。学习与阅读两个来源用 keyed Set 记录，互相不会误解除。Layout 顶部出现「已暂停保存…请重新加载」横幅，附「重新加载」按钮。
- 备注：`flush()` 仍不检查标签页写锁（`yieldToOtherTab` 依赖它在让出锁之前落盘），只检查 hydration 闸门。

### 14. 不支持 Web Locks 的浏览器永远停在启动页
- 状态：`已修`（无 Web Locks 时显示说明，需用户明确“仍然进入”）
- 位置：`src/lib/tabLock.ts`、`TabGate`
- 现象：`navigator.locks` 不存在时一直 `checking`，没有降级。
- 建议：检测不到时给出说明并降级，不要无限等待。

### 15. 删除/编辑保护不一致
- 状态：`已修`
- 位置：`Books.tsx` 个人词删除、`src/hooks/useArticleDraft.ts`、`src/components/reader/ArticleComposer.tsx`
- 现象：个人词删除无确认；文章编辑器无草稿自动保存。
- 处理：个人词删除已有 `window.confirm`（早先已加，此前文档记录有误）。编辑器新增草稿自动保存：输入停顿 400ms 写入 `sessionStorage`（编辑 `lexicon:draft:edit:<id>`、新建 `lexicon:draft:new`），**不写进 `reader.json`**，避免污染真实数据和备份；进入时若草稿与当前内容不同，显示「发现未保存的草稿（保存于 HH:mm）」并给「恢复 / 丢弃」，不自动覆盖；提交成功后清除草稿，取消时保留。读写均 try/catch，隐私模式下静默降级。
- 备注：草稿随标签页关闭失效；同一篇在多个标签页编辑时各自独立（sessionStorage 按标签页隔离）。

### 16. 短文进度和恢复位置不精确
- 状态：`已修`（短文视为读完；恢复改为 token 锚点，百分比仅作回退）
- 位置：`src/pages/Reader.tsx`、`src/components/reader/ReaderText.tsx`、`src/store/readerProgressStore.ts`、`src/lib/validation.ts`
- 现象：不足一屏的文章进度可能 0/1；字体/图片加载后恢复偏移。
- 处理：进度记录新增 `anchor: { paragraph, token }`，指向「视口顶部第一个可见单词」。滚动时用 `document.elementFromPoint()` 探测（每帧一次布局读取，不遍历全文），恢复时用 `querySelector('[data-paragraph][data-token]')` 定位并 `scrollTo`，因此字体/图片改变高度也能落回同一句。没有 anchor（旧备份、文章被改过）时回落到原来的百分比算法。编辑正文会清掉 anchor（token 位置已失效），保留百分比。
- 备注：`ReaderArticle` 也带 `anchor`，导出/导入随阅读库一起走；`sanitizeReaderAnchor` 允许标题的 `paragraph: -1`，非法值只丢 anchor、不丢整条进度。

### 17. `currentBookId` 失效时没有自动回退
- 状态：`已修`（学习页自动回退；Dashboard 仍可能直接报词书错误）
- 位置：`Study.tsx`、`appStore`
- 现象：指向不存在书时只显示“没有找到这本词书”。
- 建议：启动校验并回退。

## 三、性能

### 18. 阅读页滚动每帧重渲染全文
- 状态：`已修`（进度条独立订阅、ReaderText memo；未做帧率实测）
- 位置：`Reader.tsx` `updateProgress`、`ReaderText.tsx`
- 现象：`setDisplayProgress` 每帧触发父组件重渲染，`ReaderText` 未 memo。
- 建议：进度条独立/ref 更新；`ReaderText` memo；稳定回调。

### 19. 7MB 词典首次加载成本高
- 状态：`暂缓`（M5，暂不推进）
- 位置：`useReaderDictionary`、`readerData.ts`
- 现象：7.27MB / 54,794 词条 + 0.82MB 短语，主线程 parse + 构建 Map。
- 建议：分片/Worker/IndexedDB 缓存。

### 20. 主包过大，没有路由级拆包
- 状态：`已修`（路由 lazy + Suspense；主 chunk 由约 707KB 降到约 218KB，Stats 独立 365KB）
- 位置：`App.tsx`、`vite.config.ts`
- 现象：主 chunk 约 693KB（gzip 约 210KB），所有页面静态 import。
- 建议：路由 lazy、recharts 按需、manualChunks。

### 21. 每次答题全量序列化并写整个 study.json
- 状态：`已修`（服务端紧凑 JSON；分片/增量仍按 M1 暂缓）
- 位置：三个 store 的 persist、`dataStorage.ts`
- 现象：每次 set 全量 `JSON.stringify`；服务端还 pretty-print。
- 建议：分片/增量；服务端紧凑 JSON。

### 22. 阅读库单文件存全文
- 状态：`暂缓`（M1，暂不推进）
- 位置：`readerStore.ts`
- 现象：改字号/重命名都重写整个 `reader.json`。
- 建议：文章分文件或 IndexedDB。

### 23. 词书全量加载
- 状态：`暂缓`（M5）
- 现象：每本 1.3–2.6MB，整本 fetch+parse。
- 建议：分页/分片。

### 24. 统计页重复全量遍历
- 状态：`已修`（`summarizeStudy` 单次遍历 progress/days，词书进度改为一次建 Map）
- 位置：`stats.ts`、Stats/Dashboard
- 建议：`useMemo` + 一次遍历聚合。

### 25. 开发模式启动的固有开销
- 状态：`待确认`（M2）
- 现象：`start.cmd` 跑 dev，首次进入按需编译。
- 建议：另加 build+preview 入口。

## 四、体验与一致性

### 26. 启动脚本硬编码他人路径、版本提示不准、失败即闪退
- 状态：`已修`（版本检查与失败 pause；未做完整双击启动冒烟）
- 位置：`start.cmd`
- 现象：残留 `C:\Users\yxie627\...`；提示 Node 20+ 但 Vite 8 要 20.19+/22.12+；失败无 pause。
- 建议：删硬编码、准确版本检查、失败 pause。

### 27. dev 模式与 PWA/离线叙事不一致
- 状态：`待确认`（M2/M3）
- 位置：`vite.config.ts`、`start.cmd`
- 现象：dev 不注册 SW；build 版数据 CacheFirst 一年且 URL 无版本。
- 建议：明确“必须启动本地服务”；PWA 版本化/NetworkFirst。

### 28. 版本/命名不统一
- 状态：`已修`
- 位置：`package.json`、`Settings.tsx`、`start.cmd`、`Books.tsx`、`README.md`
- 现象：`learnword@0.0.0`、UI `v0.1.0`、`learnword-*` CSV、README 模板。
- 建议：统一 `lexicon`，版本注入，README 重写。

### 29. 数据目录不可见
- 状态：`已修`（设置页显示数据目录、备份目录、文件大小和备份占用）
- 位置：`Settings.tsx`、`server/dataStorage.ts`、`src/lib/storageInfo.ts`
- 现象：用户不知道 `%APPDATA%\lexicon`、`LEXICON_DATA_DIR`、`data\.portable`。
- 处理：显示路径 + 文件/备份大小；未加“复制路径”或“打开目录”按钮，避免新增本地系统调用接口，路径可直接选中复制。

### 30. 错误提示语义不清
- 状态：`已修`（区分离线/损坏/写入冲突，冲突时提示导出后再刷新）
- 位置：`Layout.tsx`、`Settings.tsx`
- 现象：损坏时仍说“缓存在浏览器”，导入仍报成功。
- 建议：区分 read-only/offline/corrupt，给具体操作。

### 31. 移动端阅读缺口
- 状态：`已修`（移动端显示词典状态；选词条宽度未改）
- 位置：`Reader.tsx`、`SelectionAction.tsx`
- 现象：词典状态只在桌面；选词条固定宽度估算。
- 建议：移动端状态；实际尺寸测量。

### 32. 确认/重置不一致
- 状态：`已修`
- 位置：`src/components/settings/dialogs.tsx` `ResetProgressDialog`、`src/pages/Settings.tsx`
- 现象：清空进度的二次确认靠 `confirm` 状态机 + `onBlur`，鼠标移开就复原，键盘用户尤其别扭；和「清空全部数据」的弹窗也不一致。
- 处理：改为 `ResetProgressDialog`，与 `ResetAllDialog` 同一套结构：遮罩/Escape/取消可关闭，列出「会保留的内容」（个人词库、词书选择、学习计划、外观设置）与「自动备份不会删除」。
- 备注：个人词删除仍是 `window.confirm`（`Books.tsx`），没有统一成弹窗——它是列表内的单条操作，用原生确认框更轻，暂不改。

### 33. 首次使用/空状态
- 状态：`已修`
- 位置：`src/pages/Dashboard.tsx`、`src/lib/sampleArticle.ts`
- 现象：示例文章其实早就有了，但只藏在「阅读 → 新建 → 试试示例」里；新用户看到的 Dashboard 和日常面板没有区别。
- 处理：示例内容抽到 `src/lib/sampleArticle.ts`（编辑器和引导卡共用）。Dashboard 在「零学习进度 + 阅读库为空 + 阅读库已 hydration」时显示「从这里开始」三步卡片：选词书 / 学第一组词（`/study?book=x&extra=10`）/ 读一篇示例。第三步**直接创建文章并跳转阅读页**，不经过编辑器。卡片可关闭，状态存 `sessionStorage`，不写任何 JSON。
- 备注：只在真正的新装状态出现；读过示例或学过词之后自动消失。多步向导没做，也不建议做。

### 34. 无障碍/键盘
- 状态：`部分修复`（键盘查词与对比度已修；未做全量审计）
- 位置：`src/pages/Reader.tsx`、`src/components/reader/ReaderText.tsx`、`src/index.css`
- 现象：正文单词是 `<span data-word>`，没有 role/tabIndex，点击靠容器事件委托，键盘完全查不了词；`--faint` 在浅色主题下对比度只有 2.6:1，却承载了大量 10–11px 说明文字。
- 处理：
  - **键盘查词**：`<article>` 变成单个 tab 停靠点（`tabIndex=0` + `aria-label` 说明用法），进入后用左右方向键按 DOM 顺序在单词间移动（`reader-word-focus` 高亮，`scrollIntoView({block:'nearest'})` 跟随），回车/空格查词，Esc 关闭。配一个 `aria-live` 区域播报「当前单词：xxx」。
  - **对比度**：浅色 `--muted` 4.9→6.3:1、`--faint` 2.6→4.6:1（同时加深 muted 以保住四级层次）；深色 `--faint` 3.65→4.84:1。正文卡片加了 `:focus-visible` 描边。
- 备注：**没有**给每个单词加 tabIndex（几千个停靠点是灾难）。未做的部分：图表配色对比度、全量焦点顺序检查、独立快捷键帮助面板（用法写在正文上方一行提示里）。

## 五、维护与工程

### 35. TypeScript strict 未开启
- 状态：`已修`
- 位置：`tsconfig.app.json`、`tsconfig.node.json`
- 处理：已开启 `"strict": true`，`npm run build` 通过；未额外开启 `noUncheckedIndexedAccess` 等更严格选项。

### 36. 无测试、无 CI、无 test 脚本
- 状态：`部分修复`（已有 Vitest：纯函数测试 + 本地接口集成测试；仍无 CI 与浏览器 E2E 流水线）
- 位置：`vitest.config.ts`、`src/lib/__tests__/`
- 处理：`npm test` / `npm run test:watch` 已可用，覆盖校验器（坏数据怎么被丢弃/拒绝）、备份解析，以及 `server/dataStorage.test.ts` 里本地接口的集成测试（临时数据目录 + 真实 http server）。条数以命令输出为准。
- 建议：加 CI，把 `scripts/smoke-*.mjs` 纳入流水线。

### 37. 文档缺失
- 状态：`已修`
- 位置：`README.md`
- 建议：本地运行、数据目录、备份恢复、故障排查、词典重建。

### 38. 词典构建不可复现
- 状态：`已修`
- 位置：`scripts/build-dicts.mjs`、`scripts/build-reader-data.mjs`、`README.md`
- 现象：从 `master` 拉取，无 commit pin/checksum；`LEARNWORD_RAW_DIR` 旧名。
- 处理：源地址固定到 commit（ECDICT `ab22ad3`、ipa-dict `972cd67`，2026-10-25 取 HEAD 并用 `curl -I` 验过 200）；每本词书、`index.json`、`lexicon.json`、`phrases.json` 顶层新增 `meta: { sourceCommit, sources, generatedAt }`；环境变量改为 `LEXICON_RAW_DIR`，旧名 `LEARNWORD_RAW_DIR` 保留兜底。
- 备注：`meta` 只是新增字段，前端读取逻辑未变。已有的 `public/data/**` 没有重新生成，`meta` 要等下次执行 `npm run dicts` / `reader-data` 才会出现。

### 39. schema 迁移缺失
- 状态：`暂缓`（目前没有真实迁移需求）
- 位置：server `schemaVersion`、persist `version`
- 现状：三个 store 都是 `version: 1`，服务端 `schemaVersion` 也是 1；本次新增的 `ReaderArticle.anchor` 是可选字段，旧数据缺它就回落到百分比，不需要迁移。
- 建议：等真要改结构（比如第二阶段加书籍数据）时再做 migrate 链；在那之前只需要「读到更高 version 时拒绝并提示」这一层保护。

### 40. 代码组织
- 状态：`部分修复`（Settings 已拆；Study/Reader 未动）
- 位置：`src/pages/Settings.tsx`、`src/components/settings/*`、`src/hooks/useStorageData.ts`
- 现象：`Settings.tsx` 已涨到 1221 行，混着展示、状态、服务端交互和弹窗。
- 处理：`Settings.tsx` 1221 → 399 行。拆出 `components/settings/primitives.tsx`（Section/Toggle/Segmented）、`constants.ts`（STORAGE_FILES）、`format.ts`（formatBytes/formatBackupTime）、`LocalDataPanel.tsx`、`BackupPanel.tsx`、`dialogs.tsx`（恢复/清空全部/清空进度），以及 `hooks/useStorageData.ts`（数据目录、备份列表、导出/导入/隔离/恢复的状态与处理）。只搬不改逻辑，顺手消掉了那条 `set-state-in-effect` 警告（挂载时不再同步置 loading，初始值直接为 true）。
- 备注：`Study.tsx`、`Reader.tsx`、`server/dataStorage.ts` 已在 2026-11-01 拆分，见 `docs/HISTORY.md`「第十批」。

### 41. 仓库卫生与版本控制
- 状态：`已修`（已初始化 Git，已纳入 `public/data`，已添加 MIT LICENSE）
- 剩余：大文件策略、CI。

### 42. 安全边界（低）
- 状态：`部分修复`（导入大小已限制；鉴权与 CSP 仍是已知边界）
- 现象：`/api/storage` 无鉴权，本机任意进程可读写；无 CSP；导入无大小限制。
- 处理：`GET /api/storage` 返回 `maxImportBytes`（= 服务端 `MAX_BODY_BYTES`，默认 64 MB），导入前用它判断 `file.size`，超限直接给出提示，避免 `file.text()` 先把整份文件读进内存。客户端不写死阈值，两边不会漂移。上限可在「设置 → 数据 → 本地数据」直接调整（16–512 MB 预设，改前二次确认），保存到数据目录下的 `config.json`，重启后仍生效；环境变量 `LEXICON_MAX_IMPORT_MB` 只在没有保存过设置时作为默认值。
- 备注：仍无鉴权（本机任意进程可调）、无 CSP；只做了本机 Origin 校验。
