# 下一轮修复计划（建议）

> **状态（2026-10-25）**：批次 A 与 B 已完成，见 `docs/ISSUES.md`「第四批」。剩余：D1（拆 Settings.tsx）、C（#15 草稿 / #32 弹窗）、D2（#38）、D4（#42）。
>
> 依据：2026-10-25 代码体检 + `docs/ISSUES.md` 现状逐条核对代码。
> 目标：先把「会悄悄丢数据 / 会悄悄算错」的做完，再动结构，最后做体验。
> 规模标注：S ≈ 半天内、M ≈ 1–2 天、L ≈ 3 天以上（含自测与冒烟）。

## 一句话结论

建议下一轮只做 **A + B + D1**（收尾与测试、三个数据安全项、Settings 拆分），顺手捎带 **D4**；#33/#34/#11/#39 与 M1/M2/M3/M5/M6 继续压着。理由见文末「为什么不按编号顺序做」。

## 待办逐条裁决

| 编号 | 事项 | 我的判断 | 规模 | 备注 |
| --- | --- | --- | --- | --- |
| — | 提交现有导入重构 + 清理临时文件 | **必做** | S | 上一轮改完还没提交，17 个垃圾文件还在根目录 |
| #36/M9 | 加 Vitest，先只测纯函数 | **必做（只做前半）** | S | 导入链路刚重写、零测试，这是最大风险点 |
| #13 | hydration 超时后按空数据继续 | **必做** | M | 会真的覆盖文件，最该先修 |
| #6 | 缓存回退静默 + 5MB 天花板 | **必做** | M | 提示文案在撒谎（说"保存在缓存中"，其实可能没存） |
| #9 | 词书重建后旧 progress 残留 | **必做** | S | `summarizeStudy` 把孤儿 key 也算"已学" |
| #40 | Settings.tsx 1221 行 | **建议做（只搬不改）** | M | 后面每批都要改它，越晚拆越贵 |
| #15 | 编辑器无草稿自动保存 | **建议做** | S | 只剩这一半 |
| #32 | 确认/重置不一致 | **建议做（缩水版）** | S | 文档说"个人词没有确认"，实测已有（`Books.tsx:318`），只剩"清空进度"交互 |
| #42 | 导入无大小限制 | **顺手做** | S | 客户端加 `file.size` 判断，5 行 |
| #38 | 词典构建不可复现 | **可做** | S | pin commit + 记 sha256 + 环境变量改名 |
| #11 | 时钟/时区变化无防护 | **降级做** | S | 只做"检测异常 due + 设置页提示"，不做自动修复 |
| #16 | 短文/图片后进度锚点 | **暂缓** | S | 短文已修；图片锚点价值低 |
| #39 | schema 迁移缺失 | **暂缓** | M | 三个 store 都是 version 1，没有真实迁移需求，先加文档说明 |
| #33 | 首启引导 / 空状态 | **下一轮** | M | 影响首次体验，但不影响数据 |
| #34 | 无障碍 / 键盘 | **下一轮** | M | 需要单独一轮系统性做 |
| M1 | 换 SQLite/分片 | **不做** | L | 现在的痛点已被 #21 缓解，收益不明 |
| M2 | start.cmd 改 build+preview | **不做** | S | dev 更适合日常改代码 |
| M3 | PWA 缓存版本化 | **不做** | M | 只有装成 PWA 才受影响 |
| M5/#19/#22/#23 | 词典/阅读库分片 | **不做** | L | 先测量再决定 |
| M6 | 多标签写入文件锁 | **不做** | M | 409 已改为"停止覆盖 + 提示刷新"，够用 |

---

## 批次 A：收尾 + 最小测试（S，先做）

**为什么先做**：上一轮把导入改成了服务端事务式接口，这是全项目最危险的一条路径（一次覆盖三个数据文件），目前**零测试**；而且改动还没进 Git，回滚点都没有。

1. 清理根目录临时文件：`__res.txt`、`final.txt`、`final3.txt`、`out*.txt`、`tsc*.out`、`tsc*.log`、`result*.txt`、`res.txt`、`find_replace.js`、`_tmp_check.py`、`con`（Windows 保留名，会卡部分工具）。`.gitignore` 补一条根目录 `*.txt` 白名单式规则（保留 README/LICENSE 不受影响）。
2. 拆两个 commit：`feat(storage): transactional import via /api/storage/import`、`fix(settings): drop duplicated import wiring`（我上一轮的修复混在里面，可以一起）。
3. 引入 Vitest（`devDependencies` + `test` 脚本），只写纯函数测试，不碰 DOM：
   - `parseSnapshot`：正常 / 老 `learnword` / 缺字段 / 阅读库全坏 / 坏条目混合（我上一轮已经用 esbuild 手跑过这 5 组，直接固化成用例）
   - `sanitizeProgress` / `sanitizeDays` / `sanitizeReaderArticles`：合法保留、非法丢弃、重复 key 去重
   - `buildStudyPayload` / `buildReaderProgressPayload`：输出 `{state, version:1}` 形状
4. **补一次真实浏览器冒烟**（上一轮没做）：设置页选一份备份 → 导入 → 自动刷新 → 学习页/阅读页数据正确。这是 A 的验收条件。

**验收**：`npm test` 全绿、`npm run build` 通过、手动导入一次成功。

## 批次 B：三个数据安全项（M）

### B1 #13 hydration 超时不再放开写入

现状：`useHydrated` 2.5 秒超时后直接 `return true`（`src/lib/useHydrated.ts:23`），App 正常渲染，用户可答题 → 触发 persist 写入。虽然 409 能挡住一部分，但**文件不存在或 revision 恰好为 0 时就会用空数据覆盖**。

改法：
- `useHydrated` 返回三态 `'loading' | 'ready' | 'slow'`，`useReaderHydrated` 同步改。
- `slow` 时仍渲染应用（不要卡在启动页），但：调用 `setStorageWriterEnabled(false)` 停写、顶部横幅「数据加载超过 2.5 秒，已暂停保存」+「重试加载」按钮。
- 注意 `src/lib/tabLock.ts` 里有 5 处 `setStorageWriterEnabled` 调用，需要改成 `enabled && !slow` 的组合判断，否则会被 tabLock 重新打开。

**验收**：把数据目录指向一个超大 `study.json`（或临时给 `readFile` 加延迟），超时后页面可看但不可写，横幅出现，重试后恢复。

### B2 #6 缓存写入失败要说话

现状：`writeLocal`（`src/lib/storage.ts:138`）吞掉 quota 异常；`writeCache` 先 IndexedDB 失败再退 localStorage，两处都失败时无人知晓。`Layout.tsx:164` 仍然显示「更改暂时保存在浏览器缓存中」——这句话在缓存也写不进去时是错的。

改法：
- `writeLocal` 返回 `boolean`；`writeCache` 返回 `'idb' | 'local' | 'failed'`。
- 新增状态 `cacheWriteFailed`，并入现有的 `reportFileStatus` 体系（新增一档或复用 `error` + 专门文案）。
- 横幅文案分三种：正常离线（有缓存）/ 缓存写入失败（**请立即导出备份**）/ 文件损坏。
- 顺带在设置页显示「当前数据约 X KB，浏览器缓存上限约 5 MB」。

**验收**：DevTools 里把 localStorage 配额打满（或临时把 `writeCache` 改成返回 failed），横幅变成"缓存写入失败"，且不误报为"已保存"。

### B3 #9 统计口径统一

现状：`summarizeStudy`（`src/lib/stats.ts:239`）遍历 `progress` 全量计数，`bookStats` 只数 `book.words` 里存在的词。词书重建/删词后，Stats 页"已学"会大于各词书之和。

改法（选一种，建议 A）：
- **A（只改统计）**：`summarizeStudy` 增加可选参数 `validKeys?: Set<string>`，Stats/Dashboard 在词书加载完成后传入已知词书 id 集合，孤儿 key 不计入。不改数据。
- B（清数据）：加载后清理孤儿记录，需二次确认 + 备份，风险高，不建议这轮做。

**验收**：造一条 `bookId` 不存在的 progress 记录，Stats 页"已学"不再把它算进去。

## 批次 D1：#40 只拆 Settings.tsx（M）

现状 1221 行，一个文件里塞了：备份列表、本地数据卡片、隔离、清空弹窗、导入导出、主题/字号设置。上一轮重构又加了约 500 行。

改法（**只搬不改逻辑**，一次 commit，便于回滚）：
- `src/pages/Settings.tsx` 只留页面骨架与路由级状态
- `src/components/settings/BackupPanel.tsx`（列表 + 恢复确认）
- `src/components/settings/LocalDataPanel.tsx`（目录/大小/隔离）
- `src/components/settings/ResetDialogs.tsx`（清空数据 / 清空进度）
- `src/hooks/useStorageInfo.ts`（把 `loadStorageInfo` / `loadBackups` / 请求 id 竞态处理抽出去，顺便消掉现在那条 `set-state-in-effect` 警告）

**验收**：拆分前后 `npm run build` 产物体积基本一致、设置页逐项点一遍无变化。不要在这一批里顺手改行为。

## 批次 C：一致性（S，可选）

- **#15 草稿自动保存**：`ArticleComposer` 里 debounce 300ms 写 `sessionStorage`（key 带 articleId），进入时若有草稿提示"恢复未保存的修改"。不要写进 `reader.json`，避免污染数据。
- **#32 缩水版**：`Settings.tsx` 的"清空进度"现在靠 `confirm` 状态机 + `onBlur` 二次确认，改成和"清空全部数据"一致的弹窗组件。个人词删除已有 `window.confirm`，可以不动（文档要改）。

## 批次 D2/D4（顺手）

- **D4 #42**：`handleImport` 里先判 `file.size > 32MB` 直接拒绝；服务端 `MAX_BODY_BYTES` 已是 64MB，不用改。
- **D2 #38**：`scripts/build-dicts.mjs` / `build-reader-data.mjs` 把 `master` 换成固定 commit、把源文件 sha256 写进输出 JSON 的 `meta`；环境变量 `LEARNWORD_RAW_DIR` → `LEXICON_RAW_DIR`（旧名保留一个版本）。

---

## 为什么不按编号顺序做

1. **#13/#6 比 #9 更急**：前两个会让"用户以为存了其实没存"，#9 只是数字不准。
2. **#40 要早拆**：#15、#32、#42 全都要改 Settings/Composer，先拆再改，否则冲突面积越滚越大。
3. **#33/#34 需要单独一轮**：首启引导和无障碍都要设计稿级别的判断，混在数据修复里做容易两头不到位。
4. **架构级（M1/M2/M3/M5/M6）先不动**：现在没有证据表明它们是瓶颈，改了要重写备份与迁移语义，收益/风险比最差。

## 需要你拍板的三件事

1. **测试范围**：只做纯函数单测（S），还是连"启动临时数据目录 + 打真实 API"的集成测试一起做（M）？后者能覆盖事务导入，但要引入临时目录管理。
2. **#9 选 A 还是 B**：只改统计口径（不碰数据），还是清理孤儿记录（更彻底但要确认 + 备份）。
3. **#40 拆分范围**：只拆 Settings，还是连 `Study.tsx`(879 行) 一起拆？后者收益更大但这一轮会明显变长。

## 每批的验收清单（固定动作）

- `npm run build`（tsc -b + vite build）通过，无新增 chunk 体积警告
- `npx oxlint` 0 error，warning 不增加
- 用 `LEXICON_DATA_DIR` 指向临时目录做冒烟，**不碰** `%APPDATA%\lexicon`
- 每批单独 commit，message 用 `fix(scope): ...` / `refactor(scope): ...`
- 完成后回填 `docs/ISSUES.md` 的状态列
