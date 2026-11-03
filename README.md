# Lexicon（词间）

一个本地优先的英语学习工具：按 FSRS 间隔重复背单词，把文章和整本书放进来精读，读的时候点一下单词就能查。数据全部保存在本机的 JSON 文件里，不需要账号，也不会上传到云端。

界面基于 React 19 + Vite + TypeScript + Zustand。

![今日](docs/images/dashboard.png)

## 它能做什么

- **背单词**：FSRS 间隔重复，每日新词/复习上限可调，连续天数与记忆率统计。
- **精读文章**：粘贴或导入文章，悬停看词义、点击固定词条、拖选查短语，生词一键收进个人词库。
- **读整本书**：导入 EPUB / Markdown，自动按目录切章，书架管理，按章阅读并记录进度。
- **互动故事**：带分支和轻状态的短篇——选项会改变变量，世界会记得你，结局收进图鉴。
- **玩一局**：抽天赋、分属性，一年一年读完一生；正文能点词，收进同一个生词本。
- **数据自主**：每天自动备份，随时导出/导入完整 JSON，可一键清空。

## 截图

| 今日 | 学习 |
| --- | --- |
| ![今日](docs/images/dashboard.png) | ![学习](docs/images/study.png) |

| 阅读与查词 | 互动故事 |
| --- | --- |
| ![阅读](docs/images/reader.png) | ![故事](docs/images/story.png) |

| 书架 | 统计 |
| --- | --- |
| ![书架](docs/images/library.png) | ![统计](docs/images/stats.png) |

| 游戏 | 成就 |
| --- | --- |
| ![游戏](docs/images/game.png) | ![成就](docs/images/achievements.png) |

深色模式：

![深色模式](docs/images/reader-dark.png)

> 截图由 `npm run shots` 生成（会清空数据目录，只对临时目录使用）。

## 环境要求

- Node.js：`^20.19.0 || >=22.12.0`（Vite 8 的要求，可用 `node -v` 检查）
- npm：随 Node.js 一起安装
- Windows 双击 `start.cmd` 即可；其他平台使用下面的 npm 命令

## 启动

### Windows：双击 `start.cmd`

`start.cmd` 会：

1. 查找 Node.js，并检查版本是否满足要求；
2. 在缺少 `node_modules` 时执行 `npm install`；
3. 构建，然后把 `dist/` 和本地数据接口一起跑起来，打开 <http://127.0.0.1:5173>。

跑的是**构建产物**，所以首屏快、内存小。每次双击会多花一两秒重新构建。

### 改代码时

```powershell
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

开发服务器按需编译、热更新，但每次打开都要现编译，第一次进页面会慢一些。

### 手动启动（等价于 start.cmd）

```powershell
npm install
npm start
```

两种方式都固定 `5173` 端口和 `127.0.0.1`，同一时间只能开一个。请通过本地服务访问应用，不要直接双击 `dist/index.html`；否则保存数据的本地接口不可用，只能退回到浏览器缓存。

## 数据保存在哪里

默认位置（Windows）：

```text
%APPDATA%\lexicon\
├── study.json            学习设置、卡片进度、每日统计、个人词库
├── reader.json           阅读文章与阅读设置
├── reader-progress.json  文章与章节的阅读进度
├── library.json          书架：书籍与章节正文
├── stories.json          故事：内容、存档与结局图鉴
├── game.json             游戏：各游戏进度、成就与开局设置
├── config.json           设置页里可调的本机配置（目前只有导入上限）
└── backups\              自动每日备份
```

其他平台的默认位置：

- macOS：`~/Library/Application Support/lexicon`
- Linux：`${XDG_DATA_HOME:-~/.local/share}/lexicon`

### 自定义数据目录

- 设置环境变量 `LEXICON_DATA_DIR` 可以指定数据目录，建议使用绝对路径。
- 在仓库下创建空文件 `data\.portable`，`start.cmd` 会把数据目录切到仓库内的 `data\`（便携模式）。
- 优先级：`LEXICON_DATA_DIR` > `data\.portable` > 平台默认目录。
- 启动时终端会打印实际使用的数据目录（`Lexicon data: ...`）。

### 内置服务器（`npm run serve`）

`npm run serve` 会用 `server/standalone.ts` 起一个普通 Node HTTP 服务：静态文件来自 `dist/`，`/api/storage` 走同一套本地数据接口。打包出来的桌面版跑的就是这个入口。

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `LEXICON_HOST` | `127.0.0.1` | 监听地址；只在需要局域网访问时才改 |
| `LEXICON_PORT` | `5173` | 端口；被占用时会尝试打开已运行的那一份 |
| `LEXICON_WEB_ROOT` | 自动查找 `dist/` | 静态文件目录，打包版把 `dist/` 放在可执行文件旁边即可 |
| `LEXICON_OPEN` | 开 | 启动后是否自动打开浏览器；设成 `0` 关闭 |

### 导入大小上限

单次导入的请求体上限默认是 **64 MB**，由本地服务校验，客户端会先拿这个值比较所选文件的体积，超限直接提示而不是先把文件读进内存。

- **在「设置 → 数据 → 本地数据」底部可以直接调整**（16 / 32 / 64 / 128 / 256 / 512 MB），改动会先弹确认框，保存到数据目录下的 `config.json`，重启后依然有效。
- 环境变量 `LEXICON_MAX_IMPORT_MB` 只作为**默认值**：没有在设置页保存过时才生效，取值会被收敛到 8–512 MB。
- 不建议调得过大：导入时整份文件要先读进浏览器内存再解析，超出浏览器能承受的范围会直接卡住标签页。

### 备份与恢复

- **手动导出/导入**：在「设置 → 数据」中导出 `lexicon-backup-YYYY-MM-DD.json`，其中包含学习记录、个人词库和阅读库。导入会覆盖当前学习数据；如果备份带有阅读库，也会一并覆盖阅读库。格式错误的条目会被跳过或修正，完全无法识别的文件会被拒绝。导入过程会先校验并在失败时回滚，尽量避免半套数据。
- **自动备份**：服务端在每天第一次写入前，把对应文件复制到 `backups/`，例如 `backups/study-2026-10-24.json`。每种数据保留最近 30 份，三种数据合计最多约 90 份；备份与主文件在同一磁盘，不能替代异地备份。
- **自动备份浏览与恢复（已接入）**：在「设置 → 数据 → 自动备份」可以按 `study` / `reader` / `reader-progress` 分类查看备份列表、大小与时间，点击「恢复」会用所选备份覆盖对应数据。恢复前会自动把当前文件保存为一份安全备份（`*-restore-*.json`），恢复后页面会重新加载。当前版本**不提供**备份删除 UI，如需删除旧备份请到备份目录手动操作。
- **损坏文件隔离（quarantine）**：如果某个数据文件损坏，设置页「本地数据」会标记为「损坏」并提供「隔离损坏文件」。隔离会将文件重命名为 `<kind>.corrupt-<时间戳>-<pid>.json` 保留在数据目录中，不会直接删除。隔离后页面会重新加载，可再从自动备份或手动 JSON 备份恢复。
- **查看占用**：在「设置 → 数据 → 本地数据」可以看到数据目录、备份目录、各数据文件大小、备份总份数与总大小。如果觉得 30 份偏多，可以直接到备份目录手动删除旧文件。
- **清空数据语义**：「清除全部数据」只会删除主数据文件（`study.json`、`reader.json`、`reader-progress.json`、`game.json`），**不会删除** `backups/` 目录。清空弹窗会明确提示备份仍会保留，且需要彻底清理时由用户手动删除备份目录。确认弹窗支持取消（Escape/遮罩/取消按钮）。
- **手动恢复自动备份**：也可以先关闭应用，再把需要恢复的备份文件复制回原文件名，例如把 `backups/study-2026-10-24.json` 覆盖为 `study.json`。备份文件本身是完整的数据信封（包含 `appId`、`revision` 和 `data`），不要只截取其中一部分。

## 部署到网页（GitHub Pages）

本地版和网页版是**同一份代码的两个构建产物**，靠 `base` 区分：

```powershell
npm run build        # base = /        → start.cmd、npm run serve、打包的 exe
npm run build:pages  # base = ./       → 静态托管
```

网页版没有 Node 进程，`/api/storage` 不存在。应用启动时会探测一次（要求返回 JSON，避免把静态托管的 SPA 外壳误判成服务端），连不上就自动改用 **IndexedDB**。所以网页版能玩、能背、能查词，刷新和关浏览器都不丢，但：

- 数据在**当前浏览器**里，换浏览器/换设备看不到
- 没有每日自动备份，也没有损坏隔离
- 清理浏览数据会丢，**「导出备份」是唯一的保险**

仓库里的 `.github/workflows/pages.yml` 会在 push 到 `main` 时自动构建并部署。第一次使用需要在 GitHub 仓库的 **Settings → Pages → Source** 里选 **GitHub Actions**。

> 资源用相对路径（`base: './'`）而不是 `/lexicon/`：Pages 的地址保留仓库名的大小写，写死一个 `/lexicon/` 而仓库叫 `Lexicon` 就会整站 404。应用用的是 hash 路由，路径不会变，相对路径始终解析到正确位置。

## 书籍模式

「阅读」页面顶部可以在**文章**和**书籍**之间切换，书架在 `/library`。

- **导入**：支持 **EPUB** 和 **Markdown**。EPUB 的章节边界写在文件里（OPF spine + nav/NCX），所以能直接切好；Markdown 按标题层级推断，推断不准时在预览页用「按哪一级标题切」下拉改。
- **导入前先确认**：解析完不会立刻落盘，先进「确认目录」页。可以改书名/作者、改章节名、合并、删除、上下移动；确认后才写入 `library.json`。
- **自己写**：书架可以「新建书籍」，然后一章一章地加、改、删、排序；章节正文有 20 万字符上限，草稿自动保存。
- **读**：章节复用文章阅读器（查词、悬停、短语、进度锚点都在），底部有「上一章 / 目录 / 下一章」。
- **不支持**：TXT（没有章节结构，猜不准）。扫描版或带 DRM 的 EPUB 提取不出文字，导入时会直接报错而不是给你一本空书。

## 互动故事

「阅读」顶部第三个 tab。**是带选择的阅读，不是文字冒险**：没有物品栏、战斗、骰子或自由输入。

- 节点是一段英文正文，底部 2–5 个选项通向别的节点。正文复用阅读器，**点单词照样能查词、加生词本**；选项整行都能点选，只有点到单词时才是查词（单词悬停会亮起来）。
- **世界记得你**：故事可以有少量变量（`courage`、`helped_stranger`），选项能改变量、也能被变量限制（不满足时置灰并说明，不隐藏），同一节点还能按变量显示不同文本。
- **朗读**：每个节点都能整段朗读，念到哪句哪句就亮起来，可以边听边看。语速沿用设置里的「发音 → 语速」。
- **存档**：每次选择都会保存；「撤销一步」连变量一起回滚；结局会解锁进图鉴（隐藏结局只计入总数，不显示名字）。
- **变量写法**：`effects` 有两种——`{"var":"coins","set":true}` 赋值、`{"var":"coins","add":1}` 累加（负数即扣减）；`requires` 支持 `is` / `gte` / `lte` 和 `all` / `any` / `not` 组合。
- **自己写**：`npm run story:check <file>` 校验、`npm run story:map <file>` 看分支树，或在「故事 → 导出模板」拿一份带全部字段的模板。导入时校验不过会直接拒绝并列出问题。

## 游戏

「游戏」tab（`/game`）是一个小游戏列表，目前只有一款：**人生模拟器**（`/game/remake`）。

- **节奏按阅读走**：没有实时倒计时，点「下一年」才推进；自动播放 0.5×–20× 可调，读得慢不会错过事件。空格 / 回车也能推进。
- **查词就在正文里**：事件正文、追加句、天赋名、成就名都能点开词条，收进生词本后和学习模块共用同一套 FSRS 复习。
- **两种语言**：EN / 中一键切换，只换文案、不重开当前局；中文模式纯阅读，不触发查词。
- **两种局**：标准局（10 抽 3 选、20 点属性）与自定义局（抽选数、点数、单项上限、刷新次数、自选天赋都可调）。成就按局类型标注「标准 / 自定义」，同一条先自定义后标准会升级为标准。
- **中途退出不丢**：当前局（年龄、日志、属性、随机数游标）写进 `game.json`，回首页可以「继续这一局」；「开始新的一生」会覆盖它。
- **内容提示**：含死亡、疾病、暴力等情节，基调是黑色幽默。
- **来源与许可**：引擎与事件数据来自 [VickScarlet/remake](https://github.com/VickScarlet/remake)（MIT，`d20aa81`），原始 `LICENSE` 与版权行保留在 `src/game/remake/`；界面、存档、查词、设置页是这里新写的，文案为英文重写与翻译。设计和边界见 [`docs/PLAN-remake.md`](docs/PLAN-remake.md)。

## 常用脚本

```powershell
npm start            # 构建后启动（日常使用，跑 dist/）
npm run dev          # 启动开发服务器（同时提供本地数据接口）
npm run build        # 类型检查并构建到 dist/
npm run build:pages  # 同上，但资源用相对路径，供静态托管（GitHub Pages）使用
npm run build:server # 只把 server/ 编译成 dist-server/（打包用）
npm run serve        # 构建后用内置服务器跑 dist/，不经过 vite preview
npm run preview      # 预览已构建的版本
npm run lint         # oxlint
npm test             # Vitest：校验器、备份解析，以及本地数据接口的集成测试
npm run test:watch   # Vitest 监听模式
npm run dicts        # 重建 public/data/books 词书数据（需要网络）
npm run reader-data  # 重建 public/data/reader 阅读词典数据（需要网络）
npm run game:data    # 从 scripts/game-data/*.xlsx 重建游戏数据（不需要网络）
npm run translate:check  # 校验游戏英译的 id、占位符和残留中文
npm run translate:doc    # 重新生成 docs/translate/PROGRESS.md 进度表
npm run icons        # 重新生成 PWA 图标
npm run smoke:reader # 无头 Chrome 跑一遍阅读页（需先启动 dev 服务）
npm run smoke:app    # 首启引导 / 键盘查词 / 时间异常提示（加 --force-clean 会清数据）
npm run smoke:books  # 造一本 EPUB 走完导入、改目录、章节阅读与跳转
npm run smoke:stories # 内置短篇玩到结局、撤销一步、检查图鉴解锁
npm run smoke:game   # 玩完一整局：存档字段、中局恢复、总结与成就、回到开头
npm run story:check  # 校验一个故事 JSON（作者用）
npm run story:map    # 打印故事分支树（作者用）
npm run shots        # 重生成 docs/images 截图（会清空数据目录，只对临时目录用）
npm run docs:check   # 检查 README / docs 是否与代码脱节
```

`dicts` 和 `reader-data` 会从 ECDICT 与 ipa-dict 拉取源数据（版本已固定到具体 commit，产物可复现），耗时取决于网络；生成结果在 `public/data/`。脚本也支持通过 `LEXICON_RAW_DIR` 环境变量复用本地原始数据缓存（旧名 `LEARNWORD_RAW_DIR` 仍兼容，新名优先）。

## 项目结构

```text
src/
  pages/        每个路由一个页面；study/ 与 reader/ 放该页拆出来的会话视图与工具
  components/   按领域分目录：reader、library、story、settings
  hooks/        跨页面复用的状态逻辑（词典、存储、草稿）
  lib/          纯函数：validation/ 按数据域拆分、EPUB/Markdown 解析、故事引擎、FSRS、统计、存储适配
  store/        Zustand store，每个数据文件一个（study / reader / library / stories / game）
  data/         随应用打包的内容（内置短篇）
  game/         游戏：registry、引擎（remake/ 是 vendor 的 MIT 源码）、数据与译文、页面
server/         本地数据接口：storage/ 下按 core / config / envelope / backups / http 分层
scripts/        词典构建、游戏数据构建、故事作者工具、译文校验、无头浏览器冒烟与截图
docs/           ISSUES.md（未决问题）、HISTORY.md（每轮修复记录）、阶段计划、翻译任务、截图
public/data/    词书与阅读词典（构建产物，已提交，保证离线可用）
```

## 故障排查

### 端口 5173 被占用

`start.cmd` 使用了 `--strictPort`，端口被占用时会直接失败并暂停。找到占用进程后关闭它：

```powershell
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

也可以直接关闭之前残留的终端窗口。不要随意改端口；固定地址与现有文档、浏览器缓存保持一致。

### Node.js 版本不满足

看到 `Unsupported Node.js version` 时，先运行：

```powershell
node -v
npm -v
```

安装 Node.js 20.19+ 或 22.12+ 后重新打开 `start.cmd`。Node.js 21 不在 Vite 8 的支持范围内。

### 数据文件损坏或应用白屏

1. 先不要反复保存，避免覆盖现有数据；备份整个数据目录。
2. 如果只是某个文件损坏，关闭应用后用 `backups/` 中对应日期的备份覆盖它。
3. 如果有之前导出的 JSON 备份，修复顶层结构后可从「设置 → 数据」导入；应用会逐条校验，坏记录会被丢弃并在浏览器控制台给出警告。
4. 页面级渲染错误会显示错误摘要和「重新加载」「返回首页」按钮，可复制摘要用于排查。

### 提示“本地存储服务未连接”

说明页面没有连上 Vite 的本地数据接口。请通过 `start.cmd` 或 `npm run dev` 启动，并确认访问的是 `http://127.0.0.1:5173`，而不是直接打开 HTML 文件。

### 词书或阅读词典加载失败

确认 `public/data/books/`、`public/data/reader/` 存在。如果缺失，运行 `npm run dicts`、`npm run reader-data` 重新生成。

### 查不到某个单词

阅读词典来自 [ECDICT](https://github.com/skywind3000/ECDICT)（英汉，MIT）与 [ipa-dict](https://github.com/open-dict-data/ipa-dict)（音标，MIT）。构建时只保留**带词频、考试大纲标签或柯林斯/牛津标记**的词条，再按频次取前 6 万条，所以下面几类会显示「词典暂未收录这个词」——这是覆盖范围的边界，不是加载失败：

- **很新的词**：`selfie`、`emoji`、`blockchain`、`chatbot`、`microplastic`——ECDICT 的词频语料早于这些词
- **部分缩写与专名**：`COVID`、`e.g.`、`U.S.`——词条正则不收点号，且多数缩写没有词频
- **汉语拼音/罗马化专名**：`gaokao`、`dao`、`mbti`
- **生僻词**：`petrichor`、`defenestrate`

屈折变化（`were`、`studies`、`bigger`）走别名表和查词时的词干回退，不占词条名额。要扩大覆盖，改 `scripts/build-reader-data.mjs` 里的 `WORD_LIMIT` 再跑 `npm run reader-data`；文件体积和主线程解析时间会一起涨。

### 启动后数据像是空的

可能是磁盘或浏览器存储较慢，应用在等待 2.5 秒后先以当前内容继续。先刷新页面确认；如果仍然为空，关闭应用并检查数据目录中的 JSON 文件是否完整，或从 `backups/` 恢复。

## 已知限制

- 单机、单用户使用；没有账号、云同步或多设备合并。
- 同一时间只允许一个标签页写入数据，其他标签页会显示接管/重试界面。
- 开发模式不注册 PWA Service Worker；离线缓存主要面向构建后的 PWA 版本。
- 数据以整份 JSON 文件读写；阅读文章很多或很长时，启动和保存会变慢。
- 导入备份已有基本回滚保护，但仍不是严格意义上的跨多文件原子事务，导入后建议刷新页面确认结果。
- 备份删除需手动到备份目录操作（暂未提供 UI 删除）。
- 有单元测试、本地接口集成测试和 4 个无头浏览器冒烟脚本。前两者由 `.github/workflows/ci.yml` 在 push 与 PR 时自动跑（lint、构建、`npm test`；`npm test` 会顺带检查文档是否过期）。4 个冒烟脚本**不在 CI 里**，需要手动跑，因为它们依赖本机 Chrome。
- 修改后立刻刷新页面，有极小概率丢掉最后一次写入（页面卸载时的落盘可能被导航打断）。
- 发音和朗读用的是**系统语音**（Web Speech API），不是应用自带的。没装英文语音时功能会明确提示并引导安装，不会拿中文语音去念英文。

## 许可证

本项目采用 [MIT License](LICENSE)。

更多待修问题与背景见 [docs/ISSUES.md](docs/ISSUES.md)，开发路线见 [docs/ROADMAP.txt](docs/ROADMAP.txt)。
