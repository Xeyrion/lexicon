# Lexicon 问题清单与修复计划

> 定位：本地运行工具（`start.cmd` + Vite + 本地 JSON 文件），不考虑静态托管、多端同步、多用户。
>
> 基线：`npm run build` 通过；`npm run lint` 仅 1 条未使用参数警告；`npm audit --omit=dev` 无已知漏洞。
>
> 记录时间：2026-10-24
>
> 当前 Git 基线：`chore: baseline before reliability and UX fixes`、`chore: track generated dictionary assets in the baseline`

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
| M2 | `start.cmd` 从 `vite dev` 改为 `build + preview` | 改变日常启动方式，影响开发调试和 PWA | 建议保留 dev 作为开发入口，另加 `start-local.cmd` |
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
- 状态：`待修`
- 位置：`fsrs.ts`、`date.ts`
- 现象：改系统时间/跨时区后 due 可能异常，streak 断裂，没有修复入口。
- 建议：异常 due 检测与修复计划。

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
- 状态：`部分修复`（短文视为读完；字体/图片后的恢复锚点未改）
- 位置：`Reader.tsx` `updateProgress`
- 现象：不足一屏的文章进度可能 0/1；字体/图片加载后恢复偏移。
- 建议：短文视为读完；滚动高度 + token 锚点。

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
- 状态：`待修`
- 建议：首启引导 + 示例文章/词。

### 34. 无障碍/键盘
- 状态：`待修`
- 建议：单词 button/tabIndex；快捷键帮助；对比度检查。

## 五、维护与工程

### 35. TypeScript strict 未开启
- 状态：`已修`
- 位置：`tsconfig.app.json`、`tsconfig.node.json`
- 处理：已开启 `"strict": true`，`npm run build` 通过；未额外开启 `noUncheckedIndexedAccess` 等更严格选项。

### 36. 无测试、无 CI、无 test 脚本
- 状态：`部分修复`（已有 Vitest 与 59 条纯函数测试；无 CI、无集成/E2E）
- 位置：`vitest.config.ts`、`src/lib/__tests__/`
- 处理：`npm test` / `npm run test:watch` 已可用。测试只覆盖 `validation.ts`（40 条）与 `snapshotImport.ts`（19 条），即「坏数据怎么被丢弃/拒绝」这一层。
- 建议：后续补服务端 `/api/storage` 的集成测试（临时数据目录）与 Playwright 冒烟。

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
- 状态：`待修`
- 位置：server `schemaVersion`、persist `version`
- 建议：客户端校验 + migrate 链 + 兼容性测试。

### 40. 代码组织
- 状态：`部分修复`（Settings 已拆；Study/Reader 未动）
- 位置：`src/pages/Settings.tsx`、`src/components/settings/*`、`src/hooks/useStorageData.ts`
- 现象：`Settings.tsx` 已涨到 1221 行，混着展示、状态、服务端交互和弹窗。
- 处理：`Settings.tsx` 1221 → 399 行。拆出 `components/settings/primitives.tsx`（Section/Toggle/Segmented）、`constants.ts`（STORAGE_FILES）、`format.ts`（formatBytes/formatBackupTime）、`LocalDataPanel.tsx`、`BackupPanel.tsx`、`dialogs.tsx`（恢复/清空全部/清空进度），以及 `hooks/useStorageData.ts`（数据目录、备份列表、导出/导入/隔离/恢复的状态与处理）。只搬不改逻辑，顺手消掉了那条 `set-state-in-effect` 警告（挂载时不再同步置 loading，初始值直接为 true）。
- 备注：`Study.tsx` 879 行、`Reader.tsx` 663 行、`server/dataStorage.ts` 843 行仍未拆。

### 41. 仓库卫生与版本控制
- 状态：`已修`（已初始化 Git，已纳入 `public/data`，已添加 MIT LICENSE）
- 剩余：大文件策略、CI。

### 42. 安全边界（低）
- 状态：`部分修复`（导入大小已限制；鉴权与 CSP 仍是已知边界）
- 现象：`/api/storage` 无鉴权，本机任意进程可读写；无 CSP；导入无大小限制。
- 处理：`GET /api/storage` 返回 `maxImportBytes`（= 服务端 `MAX_BODY_BYTES`，默认 64 MB），导入前用它判断 `file.size`，超限直接给出提示，避免 `file.text()` 先把整份文件读进内存。客户端不写死阈值，两边不会漂移。上限可用环境变量 `LEXICON_MAX_IMPORT_MB` 调整（收敛到 8–512 MB），当前值显示在「设置 → 数据 → 本地数据」底部。
- 备注：仍无鉴权（本机任意进程可调）、无 CSP；只做了本机 Origin 校验。

## 本轮验证记录（2026-10-24）

验证环境：Node 24.18.0、npm 11.16、Chrome headless（桌面 1440×900）、独立临时数据目录，未触碰 `%APPDATA%\lexicon` 的真实数据。

### 已通过

- `npm run lint`、`npx tsc -p tsconfig.app.json --noEmit`、`npm run build` 均通过；PWA 生成 33 个预缓存条目。
- 存储 API：缺失文件返回 404；`baseRevision` 匹配时 revision 递增；旧 revision 返回 409 并携带当前 revision；DELETE 成功且生成当日备份。
- 损坏 JSON：GET/PUT 返回 500，错误信息包含文件绝对路径和“先备份或重命名”的指引。
- 真实页面：开始学习 → 评分 → `study.json` 写入 FSRS 记录 → 刷新后进度仍在（剩余数量减少）。
- 真实页面 409：外部先写入新 revision，页面继续答题只显示冲突横幅，不覆盖文件、不自动重试；刷新后恢复为外部版本。
- 阅读页：词典加载出 54,794 个词条 / 12,125 个短语；点击 `attention` 显示音标与释义；滚动到底进度保存为 100%；“重新阅读”回到顶部并把进度写回 0；浏览器控制台无错误。
- 校验器冒烟：坏设置、坏卡片日期/state、非法日期统计、重复个人词、坏阅读文章、`__proto__` 进度键均被丢弃或修正，未抛异常。

### 未验证 / 仍需人工确认

- 真正崩溃或页面在 debounce 窗口内被强杀后的 pending 重放；大于 60KB 的写入在 `pagehide` 时仍可能被浏览器取消，依赖下次启动的缓存重放。
- 409 后刷新会丢弃本页未写入的更改；横幅已提示先到设置页导出，但还没有“冲突合并”或冲突副本。
- `?from=start` 会留在 URL 中，刷新会再次从头阅读。
- 无 Web Locks 的降级界面未在真实旧浏览器中验证。
- `currentBookId` 回退只在学习页生效；Dashboard 仍可能直接显示词书加载错误。
- 导入备份仍非事务性；所有条目都无效时阅读库会拒绝覆盖，但学习数据仍可能被部分替换。
- `start.cmd` 的 Node 版本检查和提示文案已单独验证，未完整双击启动并等待浏览器打开。
- ~~主包仍有约 707KB 的 chunk 体积警告，路由级拆包尚未做。~~ 已在 2026-10-25 完成路由级拆包（见下方第二批记录）。

## 2026-10-25 第二批验证记录

验证环境：Node 24.18.0、Vite 8.3.5、Chrome headless（桌面 1440×1000、移动 390×844）、独立临时数据目录 `%TEMP%\lexicon-smoke-*`，未触碰真实 `%APPDATA%\lexicon`。

### 已通过

- `npm run lint`、`npm run build` 通过；`tsconfig.app.json` 与 `tsconfig.node.json` 均已开启 `strict: true`，`tsc -b` 无错误。
- 路由拆包：主入口 `App-*.js` 约 218KB（gzip 73KB），通用 vendor `index-*.js` 约 237KB（gzip 75KB），`Stats-*.js` 约 365KB（gzip 106KB，含 recharts）；原先约 707KB 的单一主 chunk 已消失。
- `GET /api/storage` 返回 `directory`、`backupDirectory`、`keepBackups`、`files`、`backups`；备份统计能区分 study/reader/reader-progress 并汇总份数与字节数。
- 服务端写入改为紧凑 JSON：测试 `study.json` 为单行 165B（格式化版本约 300B+）。
- 设置页（桌面与 390px 移动视口）显示数据目录、备份目录、各文件大小、备份总份数/总大小和每类份数；长路径可换行，无横向溢出。
- 清空全部数据弹窗：遮罩/Escape/取消可关闭；确认后三个主数据文件被删除，`backups/study-2026-10-25.json` 仍保留，`GET /api/storage` 显示 `files.*.exists=false`、`backups.total=1`。
- 统计页用 1 条复习记录 + 1 天统计验证：累计点击 2、已学 1、已掌握 1、记忆率 100%、连续 1 天，与旧口径一致；Settings、Stats、Dashboard 三个懒加载路由均能正常渲染。
- 浏览器控制台无运行时异常；仅出现缺失 `reader.json` / `reader-progress.json` 时的预期 404 请求日志。

### 未验证 / 仍需人工确认

- 自动备份列表、一键恢复已接入（M7），但删除备份 UI 暂未提供（需手动操作）。
- 备份保留上限 30 份/类只做了逻辑与统计验证，没有压测 31 份以上的滚动清理。
- `strict` 未包含 `noUncheckedIndexedAccess` 等额外严格选项。
- 移动端仅做 390px 截图检查，未在真实手机/平板上验证触摸与滚动。
- 路由懒加载后的首次切换有短暂骨架屏；已在 Layout 内显示，侧栏不会消失。

## 2026-10-25 第三批（代码体检与构建修复）

工作区当时存在一批未提交的导入重构（新增 `src/lib/snapshotImport.ts`，`Settings.tsx` 导入流程改为走服务端事务式 `/api/storage/import`），处于半成品状态：`npm run build` 失败（5 处 TS 错误），lint 4 条警告全部落在同一段。

### 已处理

- `Settings.tsx` 中重复的解构：`restore` 与 `appReplace` 指向同一个 `state.restore`，且 `appReplace(snapshot.study)` 传入的是 `ParsedStudySnapshot`（无 `app` 字段），实际每次都会走“这不是词间导出的备份文件”分支，是无效调用。已删除，改由 `useAppStore.setState` 一次性写入。
- `useReaderStore((state) => state.replaceArticles)` 指向不存在的方法。已删除；阅读进度改用既有的 `replaceAll`，去掉直接 `setState` 的 `Record<string, never>` 断言。
- `SnapshotParseResult` 改为 `{ ok: true, value } | { ok: false, error }` 判别联合，消除 `parsed.error` 的 `string | undefined` 问题。
- 导入后的写入顺序统一为「先 setState，再 `replacePersistedKind`」：`replacePersistedKind` 会清掉 setState 触发的 debounce 并同步 revision，避免学习库多写一次、阅读库写入顺序与学习库不一致。
- `importBusy` 之前只赋值不消费，已接到「导入备份」按钮的 disabled 与文案（导入中…）。
- 结果：`npm run build` 通过（Settings 33.64KB / gzip 9.51KB，Stats 365KB 未变），`npx oxlint` 仅剩 1 条 `set-state-in-effect`（`loadBackups()` 在挂载 effect 中同步置 loading，非缺陷）。

### 本轮验证

- 服务端（临时数据目录，未触碰 `%APPDATA%\lexicon`）：PUT 基线 revision 递增；`POST /api/storage/import` 基线过期返回 409 并带当前 revision；基线正确时多文件导入返回 `{study:2, reader-progress:1}` 且生成当日备份；损坏 JSON 时 GET 返回 500 且含绝对路径，`POST /:kind/quarantine` 后文件改名为 `*.corrupt-*.json`、GET 变 404；非本机 `Origin` 返回 403。
- 解析器（esbuild 打包后直跑）：正常备份、老 `learnword` 格式、仅学习库备份均通过；非对象/别的应用/缺字段/阅读库全部不可识别时按预期拒绝；合法 `CardRecord` 正常保留，坏条目被丢弃并告警。
- 未验证：真实浏览器里完整走一遍「选择文件 → 导入 → 自动刷新」；`Settings.tsx` 已增至 1221 行（#40 的组织问题在加重）。

### 待办

- 工作区仍有 17 个临时文件（`__res.txt`、`final*.txt`、`out*.txt`、`tsc*.out`、`find_replace.js`、`_tmp_check.py`、空文件 `con`/`res.txt`/`result.txt`），建议清理并补进 `.gitignore`；`con` 是 Windows 保留名，部分工具会报错。
- 本轮改动未提交，建议单独 commit 后再继续。

## 2026-10-25 第四批（A/B 批次：收尾 + 数据安全）

### 批次 A：收尾与测试

- 删除根目录 17 个调试残留（`__res.txt`、`final*.txt`、`out*.txt`、`tsc*.out`、`result*.txt`、`find_replace.js`、`_tmp_check.py`，以及 0 字节的 `con`）。`con` 是 Windows 保留设备名，普通删除会失败，最终用 `\\?\` 前缀经 .NET `File.Delete` 移除。
- `.gitignore` 增加根目录临时产物规则（`/*.out`、`/tsc*.txt`、`/out*.txt`、`/result*.txt`、`/__res.txt`、`/res.txt`、`/con`）与 `.workbuddy-ai/`。
- 引入 Vitest：`vitest.config.ts` 独立于 `vite.config.ts`（不加载本地存储插件），`environment: 'node'`。`npm test` / `npm run test:watch` 可用。
- 新增 59 条纯函数测试：`validation.test.ts`（40 条）、`snapshotImport.test.ts`（19 条）。覆盖合法保留、坏条目丢弃、`__proto__` 不污染原型、重复 id 去重、数值夹紧、`parseSnapshot` 的四种拒绝路径与 payload 形状。

### 批次 B：数据安全

- **#13**：`useHydrated` 三态化，超时后不再放开写入，见上文第 13 条。
- **#6**：缓存写入结果可上报，见上文第 6 条。
- **#9**：`summarizeStudy` 支持 `validBookIds`，见上文第 9 条。

### 本轮验证

- `npm run build` 通过（Settings 33.64KB / gzip 9.51KB，Stats 365KB 未变）；`npx tsc -p tsconfig.app.json --noEmit` 无错误；`npx oxlint` 1 warning（`Settings.tsx` 挂载时同步置 loading，非缺陷）。
- `npx vitest run`：2 个文件 59 条全绿。
- 端到端（临时数据目录 `%TEMP%\lexicon-smoke`，未触碰 `%APPDATA%\lexicon`）：用**客户端真实构造的 payload**（`parseSnapshot` → `buildStudyPayload` / `buildReaderPayload` / `buildReaderProgressPayload`）调用 `POST /api/storage/import`，返回 `{study:1, reader:1, reader-progress:1}`；三个文件回读均为 `{state, version:1}` 信封，`settings.dailyNew=30`、`currentBookId=cet6`、`progress` 键 `cet6:abandon`、个人词 1 条、文章 1 篇、`reader-progress.items.a1.progress=0.4`；随后用过期基线再次导入返回 409。

### 未验证 / 待办

- 真实浏览器里点「导入备份」走一遍（本机未装浏览器自动化，只验证了 payload → 服务端 → 文件回读；React 侧仅靠类型检查与代码审阅）。
- hydration 超时闸门没有在真实慢存储下触发过（需要人为把 `readFile` 延迟或指向超大文件）。
- 缓存写满的场景没有实测（只验证了代码路径与横幅文案）。
- #9 的单词级孤儿记录仍在（见第 9 条备注）。

## 2026-10-25 第五批（C/D 批次：体验一致性与工程）

### 已完成

- **#15 草稿自动保存**：`useArticleDraft` + 编辑器顶部恢复条，见上文第 15 条。
- **#32 确认弹窗统一**：`ResetProgressDialog` 替代 `onBlur` 状态机，见上文第 32 条。
- **#40 Settings 拆分**：1221 → 399 行，见上文第 40 条。新增 `src/components/settings/`（primitives / constants / format / LocalDataPanel / BackupPanel / dialogs）与 `src/hooks/useStorageData.ts`。
- **#38 构建可复现**：两个词典脚本 pin 到 commit 并输出 `meta`，见上文第 38 条。
- **#42 导入大小限制**：上限由服务端 `GET /api/storage` 下发（64 MB），见上文第 42 条。

### 本轮验证

- `npm run build` 通过；`Settings-*.js` 33.75 → 36.76 KB（gzip 9.58 → 10.07 KB，拆分后多了几个模块边界，属正常）；`App` / `index` / `Stats` chunk 未变。
- `npx tsc -p tsconfig.app.json --noEmit` 无错误；`npx oxlint` **0 warning 0 error**（此前长期挂着 1 条 `set-state-in-effect`，拆分时顺手消掉）。
- `npm test` 59 条全绿。
- `GET /api/storage` 新增字段 `maxImportBytes = 67108864`，与 `MAX_BODY_BYTES` 一致。
- 四个新模块在 dev 服务下均返回 200（`Settings.tsx`、`useStorageData.ts`、`ArticleComposer.tsx`、`dialogs.tsx`），说明无解析/导入错误。

### 未验证 / 待办

- **设置页没有在真实浏览器里点过**：拆分是纯搬移，靠 `tsc` + 构建 + 模块可加载保证接线正确，但弹窗、备份列表、导入导出这些交互没有实际点一遍。
- 草稿恢复条、清空进度弹窗的视觉与键盘操作同样未实测。
- `npm run dicts` / `reader-data` 没有执行（要下载几十 MB 并覆盖已提交产物），pin 的地址只用 `curl -I` 验过 200。
- 导入大小限制只做了代码路径，没有构造超大文件实测提示文案。

## 本轮子代理分工

### 子代理 A：存储可靠性
- 文件范围：`src/lib/storage.ts`、`server/dataStorage.ts`、`src/components/Layout.tsx`
- 任务：
  - 2：pending 标记前置、成功后才清、启动重放。
  - 5：409 停止自动覆盖，给出冲突提示。
  - 30：错误提示区分 corrupt/offline/read-only。
- 不做：备份 UI、存储架构改造、PWA。

### 子代理 B：阅读性能与查词正确性
- 文件范围：`src/pages/Reader.tsx`、`src/components/reader/ReaderText.tsx`、`src/components/reader/WordPanel.tsx`、`src/hooks/useReaderDictionary.ts`、`src/lib/reader.ts`、`src/pages/Reading.tsx`、`src/lib/tabLock.ts`、`src/components/TabGate.tsx`
- 任务：
  - 7：词典 loading/错误/移动端状态。
  - 8：重新阅读重置。
  - 10：词形候选顺序。
  - 14：Web Locks 降级。
  - 18：滚动性能。
  - 31：移动端阅读小修。
- 不做：改 store、改数据格式、改全局布局。

### 子代理 C：兜底、校验、启动与文档
- 文件范围：`src/store/appStore.ts`、`src/store/readerStore.ts`、`src/store/readerProgressStore.ts`、`src/lib/validation.ts`（新建）、`src/components/ErrorBoundary.tsx`（新建）、`src/main.tsx`、`src/pages/Settings.tsx`、`src/pages/Books.tsx`、`src/pages/Study.tsx`、`src/lib/useHydrated.ts`、`src/lib/useReaderHydrated.ts`、`start.cmd`、`package.json`、`package-lock.json`、`vite.config.ts`、`README.md`
- 任务：
  - 4：ErrorBoundary + restore/merge 校验与容错。
  - 13：hydration 慢存储提示（不破坏现有流程）。
  - 15：个人词删除确认；编辑器草稿（若时间允许）。
  - 17：currentBookId 失效回退。
  - 26：start.cmd 安全修正。
  - 28：版本/命名统一。
  - 37：README 重写。
- 不做：切换到 preview、PWA 改造、加新依赖。

## 验证要求

- 每个子代理至少运行 `npm run lint`，并使用独立的 `tsBuildInfoFile` 运行 `tsc --noEmit`，避免并行冲突。
- 合并后由主代理运行 `npm run build` 和手动冒烟：
  1. 启动应用，确认学习页、阅读页、设置页可打开。
  2. 答题后刷新，确认进度还在。
  3. 关闭/重开标签页，确认单写入锁生效。
  4. 导入一份正常备份，确认数据恢复。
  5. 手动制造坏 JSON（备份后），确认错误提示可理解，且不会“假成功”。
- 每个修复批次单独 commit，便于回滚。

## 本批次更新记录（2026-10-25）

- **M7 完成**：服务端新增备份浏览（`GET /api/storage/backups`）、单类恢复（`POST /api/storage/backups/restore`）、损坏文件隔离（`POST /api/storage/:kind/quarantine`），并在设置页接入「自动备份」列表与恢复（恢复前自动创建安全备份）、「本地数据」隔离入口。
- **M8 完成**：项目采用 MIT License，`LICENSE`、`package.json`、`README.md` 已标注。
- **备份语义收敛**：清空全部数据仅删除主文件，不删除 `backups/`；清空弹窗已明确告知并展示备份路径/数量/大小；导入备份采用事务式处理（全量校验、临时文件写入、失败回滚、损坏文件隔离），失败时不再“假成功”。
- **文档同步**：`README.md` 更新备份恢复/隔离/清空语义及 MIT 说明；`docs/ISSUES.md` 更新 #1/#3/#12 状态，M7/M8 标记为已做，补充本批次验证要点。
