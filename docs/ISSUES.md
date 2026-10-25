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

以下项目会影响整体运行方式、数据格式或恢复语义，子代理不会擅自实施：

| 编号 | 事项 | 为什么需要确认 | 建议 |
| --- | --- | --- | --- |
| M1 | 把 `study.json` / `reader.json` 从“整文件覆盖”改为分片或 SQLite/LevelDB | 改变数据文件结构和备份方式，属于存储架构升级 | 先做本轮可靠性修复，再单独评估 |
| M2 | `start.cmd` 从 `vite dev` 改为 `build + preview` | 改变日常启动方式，影响开发调试和 PWA | 建议保留 dev 作为开发入口，另加 `start-local.cmd` |
| M3 | PWA 数据缓存从 `CacheFirst` 一年改为 `NetworkFirst`/版本化 URL | 改变离线行为和词典更新语义 | 若保留 PWA，建议做版本化 |
| M4 | “清除全部数据”是否连 `backups/` 一起删除 | 涉及隐私与可恢复性的取舍 | 建议弹窗让用户选择 |
| M5 | 词典/词书改为按需分片加载或新数据格式 | 需要改构建脚本与前端加载器 | 先测量，再决定是否值得 |
| M6 | 跨浏览器/多进程写入：改为只读 follower、文件锁或单实例检测 | 改变多开行为 | 建议先停止 409 自动覆盖，是否做锁另行确认 |
| M7 | 增加服务端备份浏览/恢复 API 与 UI | 新增数据恢复入口和接口 | 建议做，但单独一批 |
| M8 | 项目 LICENSE 选择 | 法律选择，不能替用户决定 | 建议 MIT，与数据源一致 |
| M9 | 引入 Vitest/Playwright 与 CI | 新增开发依赖和脚本 | 建议先加 Vitest，CI 可后置 |

## 一、数据安全（最高优先）

### 1. 损坏 JSON 会造成写入死锁，导入备份还会“假成功”
- 状态：`待修`
- 位置：`server/dataStorage.ts` `readEnvelope`/PUT、`src/store/appStore.ts` `restore`、`src/pages/Settings.tsx` `handleImport`
- 现象：手改、BOM、断电截断后，GET/PUT 都在 `JSON.parse` 失败并返回 500；DELETE 不解析，所以只能“清空全部数据”或手删文件。导入备份只 `setState`，debounce 后才 PUT；PUT 失败时页面已提示“备份已恢复”。
- 建议：坏文件自动改名隔离后允许覆盖；恢复/导入等写入成功再报成功；提供单 kind 重置。
- 备注：自动隔离属于恢复语义改动，先做“明确报错 + 指引”，隔离/覆盖 UI 放 M7 批次。

### 2. 关闭页面/崩溃可能丢最后一次修改
- 状态：`已修`（待人工验证崩溃重放与大文件 pagehide）
- 位置：`src/lib/storage.ts` `flush()`、`pagehide`/`visibilitychange`、`writeFile()`
- 现象：`flush()` 先清空 `controller.pending`，再写 IndexedDB、再写文件；`lexicon:pending:*` 只在写文件失败后才设置。页面隐藏时的 flush 不被等待，`keepalive` 只在请求体 < 60KB 时开启，`study.json` 很容易超过。
- 建议：写入前先置 dirty 标记；启动时优先重放；成功后才清 pending；关键写入立即落盘。

### 3. 每日备份“有，但不好用”，清空数据不删备份
- 状态：`待确认`（M4/M7）
- 位置：`server/dataStorage.ts` `ensureDailyBackup`/`pruneBackups`/DELETE
- 现象：每个 kind 每天只在当天第一次写入前备份一次；保留 30 份；无校验和；与主文件同盘。DELETE 前会备份，且不删 `backups/`，用户以为清干净了，历史记录还在。
- 建议：备份列表/恢复/删除 UI；清空时询问是否连备份一起删；重要写入前滚动备份。

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
- 状态：`待修`
- 位置：`src/lib/storage.ts` `writeLocal()`/`readCache()`
- 现象：localStorage 写入异常被吞掉；超过容量后仍显示“暂时保存在浏览器缓存中”。
- 建议：记录并显示缓存写入失败；估算容量；缓存模式下提示导出。

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
- 状态：`待修`
- 位置：`src/lib/stats.ts` `bookStats`、Stats/Dashboard
- 现象：旧 `bookId:wordId` 记录不清理，统计口径不一致。
- 建议：清理失效 key 或统一统计基准。

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
- 状态：`待修`
- 位置：`Settings.handleImport`
- 现象：三个 store 分别 debounce 写入，中途失败会半套数据。
- 建议：全量校验/暂存，全部成功后再切换 UI。

### 13. hydration 超时后以“空数据”继续
- 状态：`待修`（仅增加超时警告，未改为慢存储只读）
- 位置：`useHydrated`、`useReaderHydrated`
- 现象：2.5 秒后强制返回 true，可能用空状态覆盖旧文件。
- 建议：慢存储只读提示，不直接可写。

### 14. 不支持 Web Locks 的浏览器永远停在启动页
- 状态：`已修`（无 Web Locks 时显示说明，需用户明确“仍然进入”）
- 位置：`src/lib/tabLock.ts`、`TabGate`
- 现象：`navigator.locks` 不存在时一直 `checking`，没有降级。
- 建议：检测不到时给出说明并降级，不要无限等待。

### 15. 删除/编辑保护不一致
- 状态：`部分修复`（个人词删除已确认；文章编辑器草稿自动保存未做）
- 位置：`Books.tsx` 个人词删除、`EditArticle.tsx`/`ArticleComposer.tsx`
- 现象：个人词删除无确认；文章编辑器无草稿自动保存。
- 建议：删除确认/撤销；编辑器 debounce 草稿。

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
- 状态：`待确认`（M5）
- 位置：`useReaderDictionary`、`readerData.ts`
- 现象：7.27MB / 54,794 词条 + 0.82MB 短语，主线程 parse + 构建 Map。
- 建议：分片/Worker/IndexedDB 缓存。

### 20. 主包过大，没有路由级拆包
- 状态：`待修`
- 位置：`App.tsx`、`vite.config.ts`
- 现象：主 chunk 约 693KB（gzip 约 210KB），所有页面静态 import。
- 建议：路由 lazy、recharts 按需、manualChunks。

### 21. 每次答题全量序列化并写整个 study.json
- 状态：`待确认`（M1）
- 位置：三个 store 的 persist、`dataStorage.ts`
- 现象：每次 set 全量 `JSON.stringify`；服务端还 pretty-print。
- 建议：分片/增量；服务端紧凑 JSON。

### 22. 阅读库单文件存全文
- 状态：`待确认`（M1）
- 位置：`readerStore.ts`
- 现象：改字号/重命名都重写整个 `reader.json`。
- 建议：文章分文件或 IndexedDB。

### 23. 词书全量加载
- 状态：`暂缓`（M5）
- 现象：每本 1.3–2.6MB，整本 fetch+parse。
- 建议：分页/分片。

### 24. 统计页重复全量遍历
- 状态：`待修`
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
- 状态：`待修`
- 位置：`Settings.tsx`；服务端已有 `GET /api/storage`
- 现象：用户不知道 `%APPDATA%\lexicon`、`LEXICON_DATA_DIR`、`data\.portable`。
- 建议：显示路径 + 复制/打开按钮。

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
- 状态：`待修`
- 位置：`Settings.tsx`、`Books.tsx`
- 现象：文章删除有确认，个人词没有；清空进度二次确认靠 onBlur；全部清除不删备份。
- 建议：统一确认/撤销，列出删除/保留清单。

### 33. 首次使用/空状态
- 状态：`待修`
- 建议：首启引导 + 示例文章/词。

### 34. 无障碍/键盘
- 状态：`待修`
- 建议：单词 button/tabIndex；快捷键帮助；对比度检查。

## 五、维护与工程

### 35. TypeScript strict 未开启
- 状态：`待修`
- 位置：`tsconfig.app.json`
- 建议：先开 `strictNullChecks`，逐步开全 strict。

### 36. 无测试、无 CI、无 test 脚本
- 状态：`待确认`（M9）
- 建议：Vitest + 临时目录集成测试；Playwright 冒烟。

### 37. 文档缺失
- 状态：`已修`
- 位置：`README.md`
- 建议：本地运行、数据目录、备份恢复、故障排查、词典重建。

### 38. 词典构建不可复现
- 状态：`待修`
- 位置：`scripts/build-dicts.mjs`、`scripts/build-reader-data.mjs`
- 现象：从 `master` 拉取，无 commit pin/checksum；`LEARNWORD_RAW_DIR` 旧名。
- 建议：固定版本、记录 hash、改名 `LEXICON_*`。

### 39. schema 迁移缺失
- 状态：`待修`
- 位置：server `schemaVersion`、persist `version`
- 建议：客户端校验 + migrate 链 + 兼容性测试。

### 40. 代码组织
- 状态：`待修`
- 位置：`Study.tsx` 841 行、`Settings.tsx` 554 行、`Reader.tsx` 524 行
- 建议：拆组件/hooks；共享 `fetchJson`；稳定 hook 返回值。

### 41. 仓库卫生与版本控制
- 状态：`已修`（已初始化 Git，已纳入 `public/data`）
- 剩余：LICENSE（M8）、大文件策略、CI。

### 42. 安全边界（低）
- 状态：`暂缓`
- 现象：`/api/storage` 无鉴权，本机任意进程可读写；无 CSP；导入无大小限制。
- 建议：限制导入大小，文档说明信任边界。

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
- 主包仍有约 707KB 的 chunk 体积警告，路由级拆包尚未做。

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
