# 游戏板块：嵌入 remake（计划）

> 状态（2026-11-01 21:25）：**游戏数据已落盘 `game.json`。**
> 已做：vendor 引擎、xlsx→JSON、游戏中心、标准/自定义局（抽天赋 → 分配 → 逐年 → 结算）、移动端、
> 成就页（按游戏隔离，带 EN/中 切换、标准/自定义角标）、英文覆盖层（2,069 条）、
> 顶部 EN/中 切换、点词查词、属性滑块、自动倍速（1×–20×）、刷新/自选天赋、
> 第 6 种数据 `game`（`game.json`、备份导入导出、本地数据面板、旧 localStorage 一次性迁移）。
> 未做：更多游戏。
> 上游：[VickScarlet/remake](https://github.com/VickScarlet/remake) @ `d20aa81`，MIT。
> 决策：`/game` 做成**游戏中心**，这是第一款；只借引擎和数据，UI 自己写；内容翻译成纯英文，中文保留为可切换原版；**不做中英同屏对照**。

---

## 一、结论

| 项 | 决定 |
| --- | --- |
| 入口 | `/game` 是游戏中心（卡片列表），第一款 `remake` 进 `/game/remake` |
| 扩展 | 注册表驱动：加游戏 = 加一条 registry + 一个模块，中心页自动出现 |
| 嵌入方式 | 引擎内嵌（vendor `core` / `condition` / `vitex`），不用 iframe |
| 语言 | `en`（默认）/ `zh` 两套完整文案，整体切换；不做对照；切换按钮在游戏页顶部 |
| 查词 | 只在英文模式可用；中文模式纯阅读 |
| 推进 | 显式「下一年」+ 自动播放；点词只查词，不推进 |
| 可调项 | 语言、自动播放倍速（1×–20×）；存 `game.json`，不重开当前局 |
| 存档 | `game.json` 只存 profile + 设置；当前局不落盘 |
| 合规 | 保留 MIT 全文与版权行；设置页加「开源许可」；板块不用原名 |

---

## 二、语言模型

### 2.1 两种单语模式

- `en`（默认）：事件、天赋、成就全部英文。正文用 `InlineWords` 渲染，点词 → `WordPanel` → 生词本。
- `zh`：上游原文，纯阅读，不查词。

切换是**整体**的，不是逐条对照。理由：这是一款快速点击的游戏，每条事件下面再挂一行中文，日志密度会翻倍，节奏会散；需要中文时一键切过去更干净。

切换语言**不重开当前局**：两份文案都在内存里，直接重渲染日志。当前年龄、属性、已触发事件全部保留。

### 2.2 中文模式为什么不查词

Lexicon 的词库是英文的（ECDICT + `WordEntry` 的音标字段 + FSRS 卡片）。中文取词要另建一条管线（`Intl.Segmenter` + CC-CEDICT + 词库 schema 加 `lang` + 中文 TTS + 备份迁移），工程量比翻译大，也会让英语词库混进中文词。本期不做。

---

## 三、合规

- **保留 MIT 全文与版权行**：`Copyright (c) 2021-2026 神戸小鳥 and 神户小德`。
  - 仓库内：`src/game/remake/LICENSE` + 根目录 `THIRD_PARTY_NOTICES.md`。
  - 产物内：设置 → 关于 → 开源许可，列出 remake、ECDICT、ipa-dict 等。
- **不改上游代码的版权头**；我们改动的文件在文件头注明「modified for Lexicon」。
- **板块名用「人生模拟器」**（通用词，不与原名「人生重开模拟器」完全相同）；不要使用原名或它的图标。
- **删 `specialthanks-*.xlsx`**：捐赠者名单属于个人信息，运行时用不到。
- 翻译是演绎作品，MIT 允许；英文译文版权归本项目。
- 固定上游 commit（`d20aa81`），写进 `src/game/remake/UPSTREAM.md`，升级时按 commit diff。

---

## 四、架构

### 4.0 游戏中心（hub）

`/game` 不是某一款游戏，是入口。

- `src/game/registry.ts`：一个数组，每条 `{ id, title, subtitle, description, tags, status, accent, route }`。
- `src/game/hub/GameHub.tsx`：卡片网格；`status: 'ready' | 'soon'` 控制可点 / 置灰。
- 第一款 `remake` 的卡片：标题「人生模拟器」，副标题「一年一年地过完一生」，标签「文字 / 人生 / 英文」。
- 以后加游戏：新建 `src/game/<id>/`，registry 加一条，路由加一个 `/game/<id>`。中心页不用改。
- 中心页显示「最近玩过」（读 `game.json` 的 `lastPlayed`）；没有记录时显示一句引导，不放空卡片占位。

导航：左侧「游戏」→ `/game`；移动端第 6 项。

### 4.1 目录

```text
src/game/
  registry.ts              游戏注册表（hub 用）
  hub/                     GameHub / GameCard
  remake/                  vendored 上游（core / condition / vitex + LICENSE + UPSTREAM.md）
  data/                    JSON loader：按 locale 构造 events / ages / talents 的 Map
  i18n/
    ui.ts                  游戏壳的中英文案
    en/                    英文覆盖层（key = 事件 / 天赋 / 成就 id）
  ui/                      Start / Play / Summary / Properties / LogList
  pages/                   Game.tsx（hub）/ Remake.tsx（单页三步：start → play → summary）
src/store/gameStore.ts     profile + 设置持久化；当前局在内存
scripts/build-game-data.mjs
public/data/game/{zh,en}/{events,ages,talents,achievements,characters}.json
```

`/game/remake` 用**单页三步**而不是三个路由：当前局不落盘，路由跳转会丢状态；单页用内部 step 更稳，返回键交给浏览器的 `/game`。

### 4.2 vendor 策略

- `packages/core`（约 30KB）、`packages/condition`（单文件）、`packages/vitex`（2.6KB）都是纯 TS，无框架依赖。
- 新依赖只有 `immer`（core 已经在用）。
- Vite / tsconfig 加四个别名：
  - `@remake/core` → `src/game/remake/core/src`
  - `@remake/condition` → `src/game/remake/condition`
  - `@remake/vitex` → `src/game/remake/vitex`
  - `@remake/data` → `src/game/data/index.ts`（我们自己实现）
- **core 源码一行不改**，这样上游更新时 diff 干净；所有适配都在 data 层和 UI 层。

### 4.3 数据管线

`scripts/build-game-data.mjs`：Node 直接读 xlsx → JSON，**不需要 bun**。

需要移植的三个 transformer（照 `packages/data/src/*.types.ts` 抄逻辑，不抄文案）：

| 文件 | 关键逻辑 |
| --- | --- |
| `event.types.ts` | `id`/`grade`/`effect`/`branch`（`condition:eventId` 拆分） |
| `age.types.ts` | `id*weight|level` 语法、层级数组、按小数位放大权重 |
| `talent.types.ts` | `replacement`（`id*weight` 或 grade）、`exclude`、`max` |

输出：

```text
public/data/game/
  meta.json                上游 commit、生成时间、各表条数、许可
  zh/{events,ages,talents,achievements,characters}.json
  en/{同上}
```

英文覆盖层放在 `src/game/i18n/en/*.json`（key = id），build 时合并进 `en/*.json`。这样译文在 git 里可 review，不埋在 xlsx 里。

校验（`npm run game:check`）：

- 每个 id 在 zh / en 都存在；
- 占位符 `{CurrentYear}` 原样保留；
- 英文里不残留中文；
- 覆盖率（允许未翻译，运行时回退中文并打标）。

### 4.4 UI 流程

1. `/game`：游戏中心，卡片列表（当前只有「人生模拟器」）。
2. `/game/remake` 顶部栏：返回、标题、`EN | 中文` 分段控件、设置（自动间隔 / 字号）、成就。
3. 开局：抽 10 个天赋 → 选 3 个 → 分配 20 点（滑块，单项上限 10，初始快乐 5）。
4. 逐年：属性条（颜值/智力/体质/家境/快乐 + 年龄）+ 日志 + 「下一年」+ 自动。
5. 总结：评分、成就、这一局查了几个词 / 收了几个。

**交互细节**：

- **语言按钮在游戏页顶部**，切换后只重渲染日志，不重开当前局。
- 「下一年」固定在底部，键盘空格 / 回车也能推进。
- 自动播放默认 1200ms（原版 500ms 是给刷的），设置里可调 800 / 1200 / 2000。
- 点词只查词，不推进；点空白处也不推进——必须点按钮或按空格。
- 日志按年龄分组；事件行、天赋行、成就行用不同前缀区分。

### 4.5 存档与设置

`game.json`（zustand persist 信封：`{ state, version: 1 }`）：

```ts
interface GameFileState {
  profiles: Record<string, {          // 按 gameId 分键，成就互不串台
    times: number
    talents: number[]
    events: number[]
    achievements: number[]            // 引擎用的 id 集合，两种模式都并入
    achievementMeta?: Record<number, {
      mode: 'standard' | 'custom'     // 首次解锁的模式；后来标准局解锁则升级为 standard
      at: string
    }>
    highest?: Properties
    lowest?: Properties
    locked?: number[]
  }>
  settings: {
    locale: 'en' | 'zh'
    speed: number                     // 0.5–20，自动播放倍速
    rules: {
      preset: 'standard' | 'custom'
      pullCount: number               // 抽几个天赋
      pickCount: number               // 选几个
      points: number                  // 基础属性点
      allocLimit: number              // 单项上限
      rerolls: number                 // 每局可刷新次数
      selfSelect: boolean             // 自选天赋
    }
  }
}
```

落盘走 `createFileBackedStorage({ kind: 'game' })`：和 study / reader 同一套 revision、409 冲突、浏览器缓存兜底、
每日备份与「本地数据」面板，`game` 是第 6 种数据。读盘前的写入被 `useGameHydrated` 挡住——否则空 profile 会覆盖文件。

旧版本写在 localStorage 的 `lexicon-game-profile-v1[:gameId]`、`-locale-`、`-speed-`、`-rules-` 在首次读盘后
一次性补进空缺字段（文件里已有的优先），「清除全部数据」会一并删掉这些旧键。

规则在**开局时快照**进当前局，改设置不影响正在进行的这一局；语言和倍速立即生效。

**进行中的这一局也会存**（`runs: Record<gameId, SavedRun>`，同一份 `game.json`）：
`step / rules / seed / rngState / drawn / selected / finalTalents / bonus / alloc / logs / game / ended / summary`。
`GameState` 里的 `Set`/`Map` 在存盘时拍平成数组（`serializeGame`），读回时再还原（`deserializeGame`）；
`rngState` 记的是 RNG 的内部游标，继续这一局时从那一点往下走，所以中断前后的后续事件完全一致。

- 每推一年、每次换步骤都写一次（存储层 600ms 防抖）。
- 首页看到「上一局还没走完 · 停在 N 岁」和「继续这一局」；「开始新的一生」会覆盖它。
- 只有 `play` 步骤必须有引擎状态，天赋/分配两步只是选择，没有 `game` 也能续。
- 「回到开头」会删掉这一局的存档。

### 4.6 设置页

路由 `/game/settings`，两个分区：

**通用**（立即生效）

- 语言：English / 中文
- 字号：沿用阅读器的字号档位
- 自动播放：1× / 2× / 3× / 5× / 10× / 20× / 自定义（0.5–20）

**人生模拟器 · 开局规则**（下一局生效）

| 预设 | 抽 | 选 | 属性点 | 单项上限 | 刷新 | 自选 | 成就 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 标准（默认） | 10 | 3 | 20 | 10 | 0 | 否 | ✅ 标准点亮 |
| 自定义 | 6–20 | 1–10 | 10–99 | 5–99 | 0–20 | 可选 | ✅ 点亮，带「自定义」备注 |

校验规则：

- `pickCount ≤ pullCount`
- `points ≤ allocLimit × 5`（否则点数分配不完，页面直接提示并夹紧）
- `rerolls` 0–20；`selfSelect` 开启时至少 `pickCount` 个可选天赋

只有两档，不再设「宽松 / 沙盒」——中间档位没有明确语义，调参直接进自定义。

设置页底部：「恢复默认」「清除本游戏进度」（只清 `profile` 和成就元数据，不动生词本和学习数据）。

### 4.7 成就系统

引擎已经有完整实现，不用改：

- 数据：`achievement.xlsx` 共 **165 条**，字段 `name / description / grade / condition / hide / opportunity`。
- 时机：`START`（分配完成）、`TRAJECTORY`（每年）、`SUMMARY`（结算）、`END`（结束）。
- `achievement.trigger(opportunity, state, profile)` 返回本次新解锁的 id；`start / next / summary / end` 已经调好。
- 条件走同一套 `@remake/condition`，可以引用年龄、属性、天赋、事件、历史局数。

**两种模式都点亮，但分轨记录**：

- 标准局解锁 → 正常点亮，金色边框，角标「标准」。
- 自定义局解锁 → 点亮，但用描边样式，角标「自定义」。
- 同一成就先自定义、后标准 → 升级为标准，`achievementMeta.mode` 改写为 `standard`，保留首次时间。
- 图鉴进度显示三个数：`标准 42 · 自定义 17 · 共 165`；筛选支持「全部 / 标准 / 自定义 / 未解锁」。
- 结算页：自定义局在标题旁挂「自定义局」标签，成就列表逐条带角标。

UI：

- `/game/:gameId/achievements`：按游戏隔离；网格 + 筛选 + 进度；未解锁显示 `???`，`hide=1` 的隐藏成就只显示占位；页头带 EN/中 切换。
- 游戏过程中解锁时，右上角 toast：`成就 · 名字`，自定义局 toast 加一行小字「自定义局」。
- 持久化：`profile.achievements` 是并集（引擎条件要用），`achievementMeta` 记模式和首次时间；标准优先。

新增第 6 种数据 kind `game`，要同步改：

- `src/lib/storage.ts`（`PersistedKind` + 存储名 + 中文名）
- `server/storage/`（kind 注册、备份文件名）
- `src/lib/validation/`（新增 `game.ts`）
- 备份格式 `version: 5`（`game` 可选）
- `resetAll`、设置页「本地数据」、`docs:check` 的 README 数据表

---

## 五、翻译工作流

### 5.1 规模

| 范围 | 条数 | 中文字数 |
| --- | --- | --- |
| 全部事件 | 1,720 | 28,587（含 postEvent） |
| 0–30 岁 | 1,071 | 17,742 |
| 天赋 | 184 | 2,042 |
| 成就 | 165 | 1,456 |
| **合计** | **2,069** | **32,085** |

### 5.2 风格

- 第二人称、短句、冷幽默；沿用原文的“人生流水账”语气。
- **保留中国文化语境**（高考、户口、春运、单位），不做本地化——读者是中国人，熟悉的背景反而降低阅读门槛。
- 意译优先。中文梗直译不好笑的，改写成英文里同样荒诞的说法，不逐字对。
- 占位符 `{CurrentYear}` 必须保留。
- 英文长度控制在中文的 1.5–2.5 倍，避免一行变三行。

### 5.3 批次

任务文档已经生成在 `docs/translate/`：

- `README.md`：规则、提示词模板、输出格式、术语表、批次索引。
- `PROGRESS.md`：56 批的逐批进度表。
- `batches/`：9 个文件（6 个年龄段 + 分支专用 + 天赋 + 成就），每批 40 条。

事件按**首次出现的年龄**归档，同一条只翻一次；159 条不在年龄池里的单独放 `99-unreferenced.md`：
其中 154 条由其他事件的 `branch` 触发（正常可达），5 条只被条件引用、当前版本抽不到（上游遗留）。
先翻 0–30（约 1,071 条 / 1.77 万字）把闭环打通，再补 41+ 和天赋/成就。

模型返回的 JSON 按批存到 `src/game/i18n/en/{events,talents,achievements}/<batch>.json`；
`npm run translate:doc` 重算 `PROGRESS.md`，`npm run translate:check` 校验 id、占位符、残留中文和长度比。

### 5.4 QA

- 脚本：id 对齐、占位符、残留中文、长度比。
- 抽读：每批抽 10 条，检查语气和时态。
- 术语表：高考 / 户口 / 春运 / 单位 等固定译法，避免同一概念多种写法。

### 5.5 翻译管线（opencode 实测）

**本机现状**（2026-11-01 实测）：

- `opencode` v2.1.4 已安装；模型 id 是 `opencode/deepseek-v4.1-flash-free`（不是 `deepseek-v4-flash-free`）。
- 非交互调用：`opencode run --model opencode/deepseek-v4.1-flash-free "prompt"`。
- **免费额度已用尽**：四个 free 模型（deepseek / mimo / glm / flint）全部返回
  `429 FreeUsageLimitError`，提示订阅 OpenCode Go。官方没有公布重置周期。
- 这个版本的 `opencode run` 在 Windows 上会挂住（spawn `serve --stdio` 后无输出），
  `--attach` 也不是这个版本的参数；直接打 Zen API 可用，但免费模型限制在 OpenCode 客户端内。
- 顺带：`~/.local/share/opencode/opencode.db` 已经 2.8GB，升级到 2.2.5 前建议先清一下会话。

**管线设计**：`scripts/translate-game.mjs`

```text
读 zh JSON + 已有 en 覆盖层
  → 按年龄段切批（30–50 条/批）
  → provider 适配器：
       opencode  调 CLI / Zen API
       manual    只产出 _pending/batch-N.json，交给人或我来填
  → 每条按 id 缓存，已翻的跳过；失败重试 3 次
  → 每批落盘 + 校验（id、占位符、残留中文、长度比）
  → 429 时停止，写出剩余批次清单，不阻塞其他工作
```

**子代理**可以建（Agent 工具起一个执行器），但它只是把批次喂给 opencode；真正的限制是额度，
不是并发。额度恢复或换成付费 key 之后，`npm run translate:game -- --provider opencode` 就能跑；
在那之前用 `--provider manual` 产出待翻清单，我按清单直接翻，格式和缓存完全一致。

---

## 六、里程碑

| 阶段 | 交付 | 验收 |
| --- | --- | --- |
| G0 地基 ✅ | vendor、别名、数据管线、headless 跑 1 万局 | 300 局无异常，数据 id 全部对齐 |
| G1 中心 + 标准局 ✅ | `/game` 卡片列表、`/game/remake` 三步、设置页骨架、标准规则 | 能从中心进、完整玩一局、设置能改 |
| G2 自定义 + 英文层 ✅ | 刷新 / 自选天赋 / 预设校验、全量译文、顶部语言切换、查词 + 生词本 | 自定义局能开、英文模式点词能查、切语言不重开 |
| G3 全量 + 成就 ✅ | 2,069 条译文、成就页、结算成就列表 | 165 条成就可解锁可回看，`translate:check` 0 错误 |
| G4 落盘 + 打磨 ✅ | `game.json`、备份导入导出、倍速、内容提示、冒烟、文档 | 刷新后进度仍在，备份带游戏数据，README 同步 |
| G5 更多游戏 | 第二款游戏验证 registry 与 `game` 数据分键 | 两款游戏的成就互不串台 |

---

## 七、风险

1. **翻译丢梗**。中文互联网梗直译必死；意译 + 保留文化语境，必要时改写。
2. **age 权重移植错**。`id*weight|level` 有层级和小数放大，手写正则会错；必须照 transformer 移植，并用同 seed 对拍分布。
3. **敏感内容**。上游有些擦边事件，公开前逐条过一遍，该删的删。
4. **上游更新**。pin commit；data 层隔离；升级时按 diff 走。
5. **性能**。5,494 行年龄池 + 1,720 条事件，JSON < 1MB，无压力；日志只渲染最近 N 年，避免长列表。
6. **词库覆盖**。文化词（高考、户口）查不到，`WordPanel` 会显示空；可加一层术语表兜底，非必需。
7. **自定义局把成就刷成白菜**。两档都点亮，但分轨记录：标准局金色角标、自定义局描边角标；图鉴进度分开计数。含金量靠标注区分，不靠封锁。
8. **自选天赋破坏条件判断**。52 个天赋带 `condition`、16 个是专属天赋；选择器要标出「条件触发」，专属默认不开放，避免选了不生效。

---

## 八、已定 / 待确认

**已定**：

1. 导航叫「游戏」，中心页第一张卡叫「人生模拟器」。
2. 成就图鉴 v1 做，数据 165 条，引擎已经接好。
3. 翻译先做 0–30 岁，再补 41+。
4. 自动播放默认 1200ms，可调 800 / 1200 / 2000。
5. 语言按钮在游戏页顶部，切换不重开当前局。
6. 设置页 `/game/settings`：通用 + 开局规则；只有标准 / 自定义两档。
7. 开局规则可调：抽几个、选几个、属性点、单项上限、刷新次数、自选天赋。
8. 成就两档都点亮：标准局金色角标，自定义局描边角标；同一条先自定义后标准会升级为标准。

**待确认**：

1. opencode 免费额度已用尽，是等重置、订阅 Go，还是直接用 `--provider manual` 让我翻？
2. 游戏中心的卡片除了「人生模拟器」，要不要先放 1–2 张「敬请期待」占位（我倾向不放，空卡不好看）。

> 翻译任务文档已生成：[`docs/translate/README.md`](./translate/README.md)。56 批、2,069 条，每批 40 条，直接拿单批去喂模型即可。
