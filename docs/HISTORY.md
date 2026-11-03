# Lexicon 修复记录

> 每一轮的改动、验证方式和当时的数字。按时间顺序追加，不改旧内容——旧数字是历史快照，
> 不是「现在如何」的说明；当前未决问题见 [`docs/ISSUES.md`](ISSUES.md)。
>
> 2026-11-01：本文件从 `ISSUES.md` 拆出，内容原样搬移。

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

## 2026-10-25 第六批（阅读锚点 + 标题查词）

### 已完成

- **#16 阅读锚点**：见上文第 16 条。
- **标题可查词**：`<h1>` 之前是纯文本，现在用 `ReaderTitle` 按同一套 tokenizer 分词，每个词带 `data-word` / `data-paragraph="-1"` / `data-token`；鼠标悬停、点击查词、短语选择的手柄从正文容器上移到 `<article>`，标题一并覆盖。`activeToken` 用 `paragraph: -1` 标记标题，和正文的 0..n 不冲突。

### 本轮验证（首次真实浏览器）

新增 `scripts/smoke-reader.mjs`（`npm run smoke:reader`），用 `puppeteer-core` 驱动本机 Chrome，无头跑一遍阅读页。种子数据：40 段文章，进度 0.75 + `anchor {paragraph: 30}`。

- 锚点恢复：`scrollY=3987`，视口内第一个可见单词的 `data-paragraph` 正是 **30**，与写入的锚点一致。
- 百分比回退：把锚点去掉后重跑，`scrollY=3430 / max 4590 = 0.747`，落在 paragraph 25 —— 百分比路径仍正常。
- 标题查词：`h1` 内有 4 个 `data-word` 节点，点击后词条面板打开（显示 attention 的音标与释义），页面无 JS 异常。

### 未验证 / 待办

- 只在 1280×900 桌面视口跑过，移动端底部 sheet 下的锚点恢复未测。
- 锚点在「同一段文字内滚动」时不会变化（锚点粒度是词），属于设计取舍。
- `puppeteer-core` 是新增的 devDependency，只服务冒烟脚本；不想要可以删掉脚本和依赖。

## 2026-10-25 第七批（首启引导 / 无障碍 / 时间异常）

### 已完成

- **#33 首启引导**：见上文第 33 条。
- **#34 键盘查词 + 对比度**：见上文第 34 条。
- **#11 时间异常检测**：见上文第 11 条。

### 本轮验证（无头 Chrome）

`scripts/smoke-app.mjs`（`npm run smoke:app`，需配合 `--force-clean` 与临时数据目录）跑通：

- 空数据目录下 Dashboard 出现「三步，先跑通一遍。」，`<ol>` 恰好 3 步。
- 点第三步 → 直接创建示例文章并跳到 `#/read/<id>`，标题渲染出 5 个可查词节点。
- 键盘：聚焦正文后 `reader-word-focus` 落在标题词 `Practice`，两次右方向键移到 `Noticing`，回车打开词条面板。
- 写入一条 `due = 2200-01-01` 的记录后，设置页出现「检测到 1 条记录的时间与当前系统时间不一致」。
- 全流程 `pageerror` 为 0。

对比度实测（脚本计算，非目测）：浅色 `--faint` 2.61 → 4.55、`--muted` 4.93 → 6.31；深色 `--faint` 3.65 → 4.84。均达到 WCAG AA 的 4.5:1。

### 未验证 / 待办

- 对比度只覆盖 `--muted` / `--faint` 两个变量；`--amber` 等图表色未审计（非正文用途）。
- 键盘路径只在桌面 1280×900 验过，移动端底部 sheet 下的表现未测。
- 屏幕阅读器只加了 `aria-live` 与 `aria-label`，没有用 NVDA/VoiceOver 实际听过。
- 首启卡片只在「零进度 + 零文章」出现；只读了文章没学词的中间态仍会看到它（有意为之）。

## 2026-10-25 第八批（第二阶段：书籍模式）

### 已完成

- **新增第 4 种数据 `library`**：`library.json` 存书籍与章节正文。改动覆盖 server 的 `KINDS` / 备份文件名正则 / 备份统计、`storage.ts` 的缓存键、`storageInfo.ts` 的校验、设置页的文件清单、`resetAll` 的清空列表，以及备份格式（`Snapshot.version` 2 → 3，`library` 字段可选，旧备份仍可导入）。
- **解析层** `src/lib/bookParse.ts`：EPUB（fflate 解压 + 容错属性解析，不用 DOMParser）与 Markdown。EPUB 的章节标题优先 nav → ncx → 首个标题标签；正文去掉 script/style、块级标签转换行、解码实体、去掉与章节标题重复的首行。Markdown 按结构推断切分层级，支持手动指定 `level`（`null` 表示不切分）。
- **阅读层**：`/read/:id` 同时解析文章与章节（文章优先），章节复用整个阅读器 —— 查词、悬停、短语、字号、进度与**词级锚点**全部可用。顶部显示书名与 `2/5` 位置，底部有「上一章 / 目录 / 下一章」。
- **书架**：`/library`（网格卡片 + 进度）、`/library/:bookId`（章节列表、书名作者就地编辑、上移下移、删除、添加章节）、`/library/:bookId/chapters/:chapterId/edit`（章节编辑 + 草稿自动保存）、`/library/import`（解析 → 确认目录 → 才落盘）。
- **导航**：侧边栏「阅读」同时高亮 `/read` 与 `/library`；「词库」改名为「词书」以区分「书架」。`/read` 与 `/library` 顶部共用「文章 / 书籍」切换，仍是两个路由，前进后退与刷新都正常。
- **导入预览即编辑**（2c 与 2d 合并）：改书名/作者、改章节名、合并到上一章、删除、上下移动；Markdown 还能改切分层级。确认前不写任何文件。

### 本轮验证

- `npm test` 87 条全绿（新增 15 条解析测试）；`npm run build` 通过；`npx oxlint` 0 warning。
- `scripts/smoke-books.mjs`（`npm run smoke:books`）在无头 Chrome 里跑通：
  - 空书架 → 导入页 → 上传现场生成的 EPUB（2 章，nav 标题）→ 预览页书名 `Quiet Mornings`、2 章；
  - 预览页改名后导入 → 书籍详情页显示 `Renamed Chapter`；
  - 点第一章进阅读页，标题正确、有「下一章」；点下一章到 `The Second Wind`；
  - Markdown：`# 书名 + ## 章` 自动切成「前言 + 2 章」，改选三级标题后重切成「前言 + 1 章」；
  - 全程 `pageerror` 为 0。

### 未验证 / 待办

- 真实书库里的脏 EPUB（缺 OPF、编码异常、超长单章）只做了单元测试级别的覆盖，没有拿真实文件压过。
- 章节正文**不能在导入预览页里改**（只能改结构），要等导入后进章节编辑页。
- 章节排序是上移/下移按钮，没有拖拽。
- 大书（整本几十 MB 的 EPUB）只做了 40 MB 文件上限拦截，没有测解压耗时与内存。

## 2026-10-25 第九批（第三阶段：互动故事）

### 已完成

- **新增第 5 种数据 `stories`**：`stories.json` 存故事内容、存档与结局图鉴。同样走了 KINDS / 备份文件名 / 缓存键 / 校验 / 设置页清单 / `resetAll` / 备份格式（`version: 4`，`stories` 可选）。
- **引擎** `src/lib/story.ts`：条件求值（`is` / `gte` / `lte` / `all` / `any` / `not`）、效果（`set` / `add`）、文本变体（最后一个命中生效）、可达性计算、结构校验。校验是硬错误：断链、无出边、选项与结局并存、不可达节点/结局、未声明变量，全部拒绝导入。
- **内置短篇** `src/data/lighthouse.ts`：19 节点 / 3 结局（1 个隐藏）/ 4 个变量（`courage` `trust` `helped_stranger` `knows_name`），B1 难度，两处文本变体示范「世界记得你」。
- **阅读页** `/stories/:storyId`：正文复用 `ReaderText`（点击查词 + 生词本），底部 2–5 个选项，条件不满足时**置灰并说明**而不是隐藏；结局页显示结局名 + 本周目路径 + 已解锁数；「撤销一步」按 `history` 栈回滚节点**和变量**。
- **列表与图鉴** `/stories`：内置 + 导入的故事、`已解锁 X / Y`、可折叠图鉴（未解锁显示 `???`，隐藏结局只计入分母）、导入（JSON → 结构 → 校验三级报错）、导出带全部字段的模板。
- **作者工具**：`npm run story:check <file>` / `npm run story:map <file>`。CLI 通过 Vite 的 SSR 加载器直接引用 `src/lib/story.ts`，**不复制一份校验逻辑**，所以作者看到的错误和导入时完全一致。map 用缩进树展示分支、`★` 标结局、`↺` 标回环、标注条件与效果。

### 本轮验证

- `npm test` 103 条全绿（新增 16 条引擎测试，含「内置短篇必须合法」这条回归）。
- `npm run story:check` 对内置故事输出「19 个节点，3 个结局，没有问题」；`story:map` 正确画出分支、回环与条件标注。
- `scripts/smoke-stories.mjs`：列表 → 开始 → 连点第一个可选选项 8 步到达结局 `Keeper` → 撤销一步后结局卡消失、选项恢复 → 刷新后图鉴显示 `已解锁 1 / 3`；全程 `pageerror` 为 0。
- 三个冒烟（app / books / stories）在同一个实例上顺序跑过，无回归。

### 顺带修掉的一个真 bug

`src/index.css` 里 `a { color: inherit }` 等元素重置**没有放进 `@layer base`**，而未分层规则优先级高于 Tailwind 的 utilities —— 结果是**所有链接上的 `text-*` 类一直没生效**（侧边栏当前项、移动端导航的高亮色、这次新增的 tab 都受影响）。新 tab 的「故事」因为背景和文字同色而完全看不见，才把它暴露出来。已把元素重置包进 `@layer base`。

### 未验证 / 待办

- 故事页只做了「点击查词」，**没有**悬停预览和拖选短语（文章阅读器有）。要补的话得把 Reader 里的那套手柄抽成 hook。
- 存档失效（故事更新导致节点 id 变化）只做了「提示重新开始」，没有尝试迁移。
- 导入模板只验证了能通过 `validateStory`，没有做「用模板真的写一个故事再导入」的完整闭环。
- 图鉴没有做「查看已解锁结局的正文回放」。

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

## 2026-11-01 第十批（数据安全补口 + 服务端测试 + 拆分 + 启动入口）

### 已完成

- **读超时不再被当成「没有数据」**（`src/lib/storage.ts`）：`readFile` 现在区分「连不上」和「服务在线但超过 1.2 秒没读完」。后者返回 `timeout`，在没有缓存可回退时把该 kind 记入 `unreadKinds`，`schedule` / `flush` 一并拒绝写入，直到某次读取真正成功（或用户删除/恢复该数据）才解除。界面在 `Layout` 顶部提示「…读取超时，本次已暂停保存」，带「重新加载」按钮。此前这条路径会走到「hydration 成功 + 空快照」，而 2.5 秒的 hydration 闸门来不及触发。
- **本地数据接口集成测试**（`server/dataStorage.test.ts`，19 条）：临时目录 + 真实 `http` server + 真实中间件，覆盖 revision 冲突、请求体校验、413、损坏文件、每日备份、备份还原、路径穿越、隔离、多文件导入、导入冲突不改文件、**用注入的 rename 失败验证回滚**、配置夹紧、405/403。
- **拆分**：
  - `src/lib/validation.ts`（965 行）→ `validation/{primitives,study,reader,books,stories,index}.ts`（80–360 行），对外仍是 `../lib/validation`。
  - `server/dataStorage.ts`（920 行）→ `server/storage/{core,config,envelope,backups,lock,http,index}.ts` + 20 行的插件入口。
  - `src/pages/Study.tsx`（879 行）→ 427 行 + `pages/study/{labels,MeaningLine,SessionCard,SessionSummary,SessionWaiting,SessionIdle}`。
  - `src/pages/Reader.tsx`（865 行）→ 697 行 + `pages/reader/{progressStore,anchor,useReaderProgressTracker,ReaderSkeleton,ReaderHint}`。`ReaderView` 本身仍是单组件：它的十几项状态被正文、工具栏、侧栏和移动端 sheet 共用，硬拆只会变成一堆 prop 转手。
- **构建产物启动入口**：`npm start`（`npm run build && vite preview`），`start.cmd` 改成调用它。最初同时留了 `start-local.cmd` 和 dev 版 `start.cmd`，当天下午又收回成一个入口（两份 `.cmd` 里重复了 30 行 Node 检测，不值得），改代码改用 `npm run dev`。没有另写 `server.mjs`：中间件是 Vite 插件，Node 20 无法直接加载 TS，而 `configurePreviewServer` 已经挂好了同一条中间件。
- **界面小修**：学习卡在移动端原本同时显示两条「点击卡片」提示，且第一条提到空格键；现在只留一条且按设备切换。仪表盘一屏内「连续天数」出现三次，去掉标题右侧那一条。390px 下标题不再断出「么？」孤字，改为在逗号后换行。

### 本轮验证

- `npx tsc -b`：0 错误；`npx oxlint`：0 warning / 0 error（132 个文件）；`npx vitest run`：7 个文件 132 条全绿。
- 构建产物：`vite build` 通过；`vite preview` 起在 5285 端口，`/` 返回 200、`/api/storage` 返回正确信封，截图脚本在构建产物上重跑一遍七个页面。
- 读超时链路用真实浏览器验过：在前面加一个把 `study.json` 延迟 2 秒的代理，页面出现「学习数据读取超时」（且不是 2.5 秒那条），随后切换主题，磁盘文件 revision 保持不变。
- 移动端 390×844 复查：标题在逗号后换行；学习卡只剩一条提示。

### 仍未做

- `ReaderView` 没有继续拆（见上）。
- 没有 CI；集成测试需要手动 `npm test`。
- 页面级 E2E 仍靠 `scripts/smoke-*.mjs` 手跑，没有纳入 `npm test`。

## 2026-11-01 游戏数据落盘（`game.json`）

验证环境：Node 22.22.0、Vite 8.3.5、Chrome headless（桌面 1280×900、移动 390×844），独立临时数据目录 `.tmpcheck/game-data2`，未触碰真实数据目录。

### 改了什么

- **第 6 种数据 `game`**：`server/storage/core.ts` 的 `KINDS`、`src/lib/storage.ts` 的 `PersistedKind` / `CACHE_KEYS` / `KIND_LABELS`、`storageInfo.ts` 的 `KINDS`、设置页 `STORAGE_FILES` 全部加上；`emptyBackupInfo()` 改成由 `KINDS` 推导，避免下次加数据文件时又漏一个键。
- **`src/store/gameStore.ts`**：zustand persist → `createFileBackedStorage({ kind: 'game' })`，结构是 `{ profiles: Record<gameId, StoredProfile>, settings: { locale, speed, rules } }`。`src/game/model.ts` 承接类型与清洗（原来在 `profile.ts` 里），`rules.ts` 只剩纯函数；`profile.ts` 删除。
- **一次性迁移**：`onRehydrateStorage` 读旧键 `lexicon-game-profile-v1[:gameId]`、`-locale-`、`-speed-`、`-rules-`，只补空缺（文件优先），然后 `setState` 触发一次写盘；「清除全部数据」连带删除旧键。
- **读盘门控**：`useGameHydrated()` + `waitForGameHydration()`，三个游戏页在读完 `game.json` 前渲染骨架屏；2.5 秒未完成则 `setHydrationWriteBlocked('game', true)`（该函数签名从 `'study' | 'reader'` 放宽到 `Kind`）。
- **备份**：`Snapshot` 升到 `version: 5`，新增 `game?: { profiles, settings }`；`sanitizeGameSnapshot` 按域放进 `validation/game.ts`；导出、导入、`baseRevisions.game`、导入后的 `replacePersistedKind('game')` 全部接上。
- **文案**：游戏首页加一行内容提示；「清除全部数据」弹窗与设置页说明补上「游戏进度」。
- **播放页高度**：桌面端日志卡改成 flex 填充（`lg:min-h-[calc(100dvh-10.5rem)]` + 卡片 `flex-1`），控制条落到视口底部，1280×800 与 1440×900 下页面正好不滚动；移动端仍是 `max-h-[28rem]` 内滚。

### 本轮验证

- `npx tsc -b` 0 错误；`npx oxlint` 0 warning / 0 error（161 个文件）；`npx vitest run` 9 个文件 **143 条全绿**（新增 `src/game/__tests__/model.test.ts` 8 条：清洗、倍速夹紧、规则冲突、备份快照）。
- `npm run build` 通过；`Remake` 28.78 kB（gzip 9.41 kB）、`GameSettings` 7.29 kB、`Achievements` 3.42 kB。
- 真实浏览器：先写入旧版 localStorage（局数 7、成就 101、语言 zh、倍速 3）→ 首屏迁移为 `已解锁 1 / 165`，`game.json` 出现 `times: 7 / locale: zh / speed: 3`；跑完一局后 `times: 8`、成就 2 条；刷新后仍显示 `2 / 165`（来自文件而非内存）；`localStorage` 中已无 `lexicon-game-v1`。
- 设置页切到自定义 + EN，`game.json` 的 `settings.rules.preset` 与 `locale` 同步更新；设置页「本地数据」列出 `game.json · 游戏 304.0 B`。
- 「全部清除」后 `game.json` 被删除，`lexicon-game-*` 旧键清空。
- 两个标签页会命中既有的「已在另一个标签页打开」锁，属于原有行为，不是本轮引入。

## 2026-11-01 中断不丢局（`runs` 存档）

起因：玩到一半退出后出现「本地文件读写失败：game.json：未知的数据类型」，并且这一局没了。

### 两个独立的问题

1. **`未知的数据类型` 是旧进程**，不是数据损坏。本地服务的 `KINDS` 在进程启动时确定，新加的 `game` 只有重启后才认。读请求返回 404 被当成「文件不存在」，写请求返回 404 才变成错误横幅，所以表现是「玩到一半退出才报错」。数据没有丢：写入失败时快照留在 IndexedDB 缓存里，带 pending 标记，重启后会自动重放。客户端现在把这句话翻译成可操作的提示（`describeFileError`：提示重启 `npm run dev` / `start.cmd`）。
2. **中途退出确实会丢局**：之前只存 profile，不存进行中的这一局。现在补上。

### 改了什么

- `src/game/model.ts`：`SavedRun`（step / rules / seed / rngState / 抽取 / 已选 / 分配 / logs / game / ended / summary）、`serializeGame` / `deserializeGame`（`Set`/`Map` 拍平再还原）、`sanitizeRun`（读回来的存档按不可信处理，`play` 步骤缺状态就整条丢弃）。
- `src/game/rng.ts`：`seeded()` 返回带 `getState()` 的 RNG，续局从原游标继续，不重放。
- `src/store/gameStore.ts`：新增 `runs`、`setRun`、`clearRun`，进 `partialize` 与 `merge` 清洗；`resetGame` / `resetAllGames` 一并清。
- `src/game/pages/Remake.tsx`：每年与每次换步骤写一次（存储层 600ms 防抖）；首页出现「上一局还没走完 · 停在 N 岁 · 已过 N 年」与「继续这一局」；「回到开头」删除存档。
- 顺带修掉播放页的一个布局漏洞：`min-h` + `flex-1` 在日志很长时会把卡片撑到内容高度（页面滚动、控制条压在卡片上），改成 `lg:h-[calc(100dvh-10.5rem)]` + 卡片 `lg:min-h-0`，13 条日志时卡片仍是 560px 内滚。

### 本轮验证

- `npx vitest run`：9 个文件 **146 条全绿**（`model.test.ts` 从 8 条加到 11 条：引擎状态往返、非法存档丢弃、续局字段归一）。
- 实机（1280×900，独立数据目录）：玩到 11 岁退出 → 首页显示「停在 11 岁 · 已过 12 年」→ 继续后日志行数 13 行完全一致、`下一年` 可用 → 再推 3 年到 14 岁 → 硬刷新后仍可继续。
- 分配属性步骤退出：存档 `step=alloc`、`charm=4`；继续后滑块回到 4，剩余 16 点。
- 布局：1440×900 卡片 560px、1280×800 卡片 460px，两种尺寸页面都不滚动。

### 收尾检查（同日）

- **空写不再落盘**：zustand persist 在每次读盘后会再 `set` 一次相同状态，之前会原样写回文件、白白抬 revision，还可能在切页时撞 409。`createFileBackedStorage` 现在记住 `lastValue`，相同快照直接跳过；`clearPersistedKind` / `replacePersistedKind` / `discardPersistedKind` 同步维护它。实测：打开成就页 revision 不变、0 次 PUT；改语言 1 次 PUT；推一年 1 次 PUT。
- **脏标记残留导致的 409**：在 debounce 窗口内关掉页面，pending 标记会留到下次启动；重放时若文件其实已经写过，服务端返回 409，界面弹出「已被另一个窗口更新」并停写。现在重放遇到 409 会回读文件，内容与本地快照一致就认定「已经写过了」，清掉冲突继续用，不再弹横幅。实测：关闭后立刻重开成就页，横幅消失、改语言仍能写入（revision 26→27）。
- **文档**：`docs/ISSUES.md` 补了游戏板块的 5 条未决项（译文无母语审校、内容分级、上游同步、只验证过一款游戏、部分小字不可点词）。
- **布局**：播放页维持「状态栏一行 + 日志卡填满视口」；中途试过把状态栏做成卡片内的悬浮条（日志区多出 76px），按反馈没有采用，已回退。

## 2026-11-02 为托管部署做准备：三个体验修复 + IndexedDB 后端

起因：把应用放到静态托管（GitHub Pages / PWA）上时，会暴露三个只在真机上才看得出来的问题，同时整条存储链路必须能在没有本地服务的情况下工作。

### 三个修复

- **开局显示「年龄 -1」**：`state.ts:23` 的 `age: -1` 是引擎「尚未出生」的哨兵值，第一次 `next()` 才变 0。之前直接显示给玩家，看着像 bug。新增 `shownAge()` 只钳制显示，不动引擎（`highest.age` / `lowest.age` 参与算分）。改了播放页状态栏和首页续局卡片两处。
- **错误横幅在静态托管下误报**：以前分不清「本来就没有服务端」和「有、但断了」。`storage.ts` 新增 `everConnected`（任一文件请求真正到达服务就置位），`Layout` 只在 `error` 或「连过又断」时才弹横幅。文案去掉 `start.cmd` 这种桌面专属措辞。
- **「已在另一个标签页打开」在手机上误伤**：从书签再点一次、从通知栏恢复都会撞上。`tabLock.ts` 新增一次性自动接管：抢不到锁且当前页可见时，自动请 writer 落盘让位；2.5 秒没成功才退回手动界面，并把重试间隔从 300ms 退回 2000ms。`TabGate` 在接管期间显示启动页而不是那面墙。

### IndexedDB 后端与运行时选择

- 新增 `src/lib/storageRemote.ts`：`detectBackend()` 探测 `/api/storage`，**要求 `content-type` 是 JSON**（静态托管会用 SPA 外壳回 200 + HTML，只看 `response.ok` 会误判）；结果存 localStorage，下次启动先用缓存值、后台再校正一次，避免拖慢 hydration。
- `storage.ts` 里原 `readFile` / `writeFile` / `deleteFile` 改名 `http*`，新增同名的三个分发函数。**引擎（防抖、脏标记、串行写、未读拦截）一行没改**，调用点一行没改。
- idb 路径直接用缓存键当存储键：没有服务端时「缓存」就是「唯一的那份」，不需要两份数据。revision 恒为 0（单进程不需要版本号）。

### 验证

- `npx tsc -b` / `oxlint` 干净；`npm test` **147 条全绿**（新增 `shownAge` 1 条）。
- 静态托管（`python -m http.server` 跑 `dist/`）实测：横幅**不出现**、`localStorage` 记录 `backend: idb`、开局年龄显示 **0**、推 8 年后 9 条日志、**刷新后仍出现「上一局还没走完」**（数据来自 IndexedDB，全程无服务端）。

### 未做

- 导入仍 POST 到 `/api/storage/import`，静态托管下会 404——**部署前必须改**，否则网页版只能进不能出。
- 设置页「本地数据 / 自动备份」面板在 idb 模式下还没降级。

## 2026-11-02 部署前的最后两块：导入不依赖服务端、设置页降级

### 导入

`handleImport` 以前必定 POST 到 `/api/storage/import`，静态托管下 404——网页版就成了「只能进不能出」的单向门。

现在先 `await detectBackend()`：idb 模式下跳过请求，直接用零 revision 走 `replacePersistedKind`。没有服务端时浏览器就是落点，把快照写进 store 再让 `replacePersistedKind` 落盘，这一步本身就是导入。文件模式下行为一字未改。

顺带把导入大小上限改成 `storageInfo?.maxImportBytes ?? 64 MB`——idb 模式拿不到服务端配置，以前是**完全不做检查**，一个几百 MB 的文件会整个读进内存。

### 设置页

`LocalDataPanel` 多了 `backend` 参数。idb 模式不再渲染文件列表（那会变成一排失败请求），换成一段说明：数据在浏览器里、没有每日备份、清理浏览数据或换设备就没了、建议定期导出。

### 验证（静态托管，`python -m http.server` 跑 `dist/`）

- 全程无 `pageerror`，无横幅。
- 设置页显示「这一份是网页版，数据保存在当前浏览器里（IndexedDB）…」。
- 导出 → 全新浏览器（空存储）→ 导入：提示「备份已导入，学习记录、阅读库、书架、故事、游戏已更新」。
- 直接读 IndexedDB：导入前 `keyval-store` 里**一个键都没有**，导入后出现 6 个键（`lexicon-study-v1` / `-game-v1` / `-reader-v1` / `-reader-progress-v1` / `-library-v1` / `-stories-v1`），且 `lexicon-study-v1` 里被手工改过的 `settings.dailyNew = 33` 原样落地。
- `npm test` 147 条、`tsc` / `oxlint` / `docs:check` 全绿。

### 发现但未修

- **导出不含进行中的这一局**：`Snapshot.game` 只有 `{ profiles, settings }`，`runs` 没进去。中途导出再导入，续局卡片就没了。对「网页当副本、靠导出保底」的定位来说这是真缺口，下一轮补。

## 2026-11-02 备份带上进行中的这一局

上一轮记录里那个缺口：`Snapshot.game` 只有 `{ profiles, settings }`，`runs` 没进去，中途导出再导入续局卡片就没了。

- `GameSnapshot` 加 `runs?: Record<string, SavedRun>`。
- `sanitizeGameSnapshot` 逐个 `sanitizeRun`，**坏的那条单独丢弃**而不是整个备份失败——丢一局总比拒收整份备份好。没有 run 时不写这个字段（旧备份导入路径不变）。
- 导出带上 `gameState.runs`；导入时 `runs: snapshot.game.runs ?? {}`，是替换不是合并——备份的语义是「复刻另一台设备」。
- 新增 2 条测试：合法 run 保留、坏 run 丢弃、无 run 时字段不存在。

实测（静态托管，两个全新浏览器）：玩到 6 岁（8 条日志）→ 导出 → 另一个浏览器导入 → 首页显示「上一局还没走完 · 停在 6 岁 · 已过 7 年」→ 继续后日志仍是 8 条，与导出时完全一致。

## 2026-11-02 部署链路：base 跟着 mode 走 + Actions

- `vite.config.ts` 改成函数式配置，`base: env.VITE_BASE || '/'`。`npm run build` 仍是 `/`（start.cmd、standalone、以后的 exe 全不变），`npm run build:pages` 读 `.env.pages`。
- **用 `./` 而不是 `/lexicon/`**：Pages 的地址保留仓库名大小写，写死 `/lexicon/` 而仓库叫 `Lexicon` 就会整站 404。应用是 hash 路由、路径不变，相对路径永远解析到正确位置。
- `.github/workflows/pages.yml`：push 到 `main` 触发，`upload-pages-artifact` 走 artifact 而不是 `gh-pages` 分支——`dist/` 有 23 MB 词典，每次部署提交一遍会把仓库撑爆。

### 验证

- 两种构建的产物路径分别是 `/assets/...` 与 `./assets/...`。
- 把 `dist/` 放进 `lexicon/` 子目录用静态服务器跑（模拟 Pages 项目站）：页面正常渲染、`backend=idb`、service worker 已接管，**唯一的 4xx 是探测用的 `/api/storage` 404**，属于预期。

### 首次部署后的小修

线上跑通后仍有两处噪音：设置页在 idb 模式下照样请求 `/api/storage` 与 `/api/storage/backups`，控制台留下 404，备份面板也白转一圈。`useStorageData` 的挂载 effect 现在先 `detectBackend()`，idb 模式直接跳过这两次请求并把 loading 归位。

顺带记一下第一次部署踩的坑：**Pages 默认没开**，`configure-pages` 会以 `HttpError: Not Found` 失败，build 前几步其实都过了。用 `gh api --method POST repos/<owner>/<repo>/pages -f build_type=workflow` 开一次即可，之后 workflow 自动接管。

### 手机上没有读音

现象：手机上点喇叭没声音，也没有任何提示。

原因在 `speech.ts`：`pickVoice` 找不到英语语音时直接 `return`——**刻意静音**（用中文语音读英文会走音）。问题是一大批安卓机没有 Google TTS 引擎，`getVoices()` 返回空数组，于是永远走这条静音分支，用户看起来就是「按钮坏了」。

- `SpeechProvider.speak` 改为返回 `boolean`，表示「到底出声了没有」。
- 新增 `playRecording()`：拿不到语音时，**单个单词**改用有道发音音频（`dictvoice?audio=…&type=1|2`，1 美音 / 2 英音）。整句朗读不做回退——录音接口只覆盖单词。
- 桌面浏览器有语音，永远走本地合成，不会多发请求。

验证：在无语音环境（stub `getVoices()` 返回 `[]`）下点设置页「试听」，发出 `https://dict.youdao.com/dictvoice?audio=serendipity&type=1`；接口实测 200 / `audio/mpeg` / 11 KB。

### 语音检测可见化

「手机上换成谷歌语音还是不能读」——问题是分不清两种失败：浏览器**一个语音都没看到**，还是**看到了但没英文**。以前面板只在空列表时给 Windows/macOS 路径，手机上等于没说。

`VoicePanel` 现在同时保留原始列表，空英文时显示「浏览器报告了 N 个语音，其中英文 0 个」，列出看到的前 6 个 `name (lang)`，并给一个「重新检测」按钮。两种情况的处置不同：0 个是浏览器没接上引擎（要重启浏览器），有 N 个是缺英文包（去引擎设置装）。

另外：安卓改完引擎必须**完全关掉浏览器再打开**，语音列表在页面加载时读一次，`voiceschanged` 在 Android 上经常不触发。
