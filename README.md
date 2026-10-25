# Lexicon（词间）

Lexicon 是一个本地优先的英语学习工具：按 FSRS 间隔重复背单词，也可以导入文章做精读、查词并把生词收进个人词库。界面基于 React + Vite + Zustand，数据保存在本机的 JSON 文件里，不需要账号，也不会上传到云端。

## 环境要求

- Node.js：`^20.19.0 || >=22.12.0`（Vite 8 的要求，可用 `node -v` 检查）
- npm：随 Node.js 一起安装
- Windows 可直接使用 `start.cmd`；其他平台使用下面的 npm 命令

## 启动

### Windows：双击 `start.cmd`

`start.cmd` 会：

1. 查找 Node.js，并检查版本是否满足要求；
2. 在缺少 `node_modules` 时执行 `npm install`；
3. 启动本地开发服务器，并打开 <http://127.0.0.1:5173>。

端口固定为 `5173`，host 固定为 `127.0.0.1`。如果启动失败，窗口会停住并显示原因，不会一闪而过。

### 手动启动

```powershell
npm install
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

然后打开 <http://127.0.0.1:5173>。请通过这个本地服务访问应用，不要直接双击 `dist/index.html`；否则保存数据的本地接口不可用，只能退回到浏览器缓存。

## 数据保存在哪里

默认位置（Windows）：

```text
%APPDATA%\lexicon\
├── study.json            学习设置、卡片进度、每日统计、个人词库
├── reader.json           阅读文章与阅读设置
├── reader-progress.json  文章阅读进度
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

### 备份与恢复

- **手动导出/导入**：在「设置 → 数据」中导出 `lexicon-backup-YYYY-MM-DD.json`，其中包含学习记录、个人词库和阅读库。导入会覆盖当前学习数据；如果备份带有阅读库，也会一并覆盖阅读库。格式错误的条目会被跳过或修正，完全无法识别的文件会被拒绝。导入过程会先校验并在失败时回滚，尽量避免半套数据。
- **自动备份**：服务端在每天第一次写入前，把对应文件复制到 `backups/`，例如 `backups/study-2026-10-24.json`。每种数据保留最近 30 份，三种数据合计最多约 90 份；备份与主文件在同一磁盘，不能替代异地备份。
- **自动备份浏览与恢复（已接入）**：在「设置 → 数据 → 自动备份」可以按 `study` / `reader` / `reader-progress` 分类查看备份列表、大小与时间，点击「恢复」会用所选备份覆盖对应数据。恢复前会自动把当前文件保存为一份安全备份（`*-restore-*.json`），恢复后页面会重新加载。当前版本**不提供**备份删除 UI，如需删除旧备份请到备份目录手动操作。
- **损坏文件隔离（quarantine）**：如果某个数据文件损坏，设置页「本地数据」会标记为「损坏」并提供「隔离损坏文件」。隔离会将文件重命名为 `<kind>.corrupt-<时间戳>-<pid>.json` 保留在数据目录中，不会直接删除。隔离后页面会重新加载，可再从自动备份或手动 JSON 备份恢复。
- **查看占用**：在「设置 → 数据 → 本地数据」可以看到数据目录、备份目录、各数据文件大小、备份总份数与总大小。如果觉得 30 份偏多，可以直接到备份目录手动删除旧文件。
- **清空数据语义**：「清除全部数据」只会删除主数据文件（`study.json`、`reader.json`、`reader-progress.json`），**不会删除** `backups/` 目录。清空弹窗会明确提示备份仍会保留，且需要彻底清理时由用户手动删除备份目录。确认弹窗支持取消（Escape/遮罩/取消按钮）。
- **手动恢复自动备份**：也可以先关闭应用，再把需要恢复的备份文件复制回原文件名，例如把 `backups/study-2026-10-24.json` 覆盖为 `study.json`。备份文件本身是完整的数据信封（包含 `appId`、`revision` 和 `data`），不要只截取其中一部分。

## 常用脚本

```powershell
npm run dev          # 启动开发服务器（同时提供本地数据接口）
npm run build        # 类型检查并构建到 dist/
npm run preview      # 预览已构建的版本
npm run lint         # oxlint
npm test             # Vitest（校验器与备份解析的纯函数测试）
npm run test:watch   # Vitest 监听模式
npm run dicts        # 重建 public/data/books 词书数据（需要网络）
npm run reader-data  # 重建 public/data/reader 阅读词典数据（需要网络）
npm run icons        # 重新生成 PWA 图标
```

`dicts` 和 `reader-data` 会从 ECDICT 与 ipa-dict 拉取源数据（版本已固定到具体 commit，产物可复现），耗时取决于网络；生成结果在 `public/data/`。脚本也支持通过 `LEXICON_RAW_DIR` 环境变量复用本地原始数据缓存（旧名 `LEARNWORD_RAW_DIR` 仍兼容，新名优先）。

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

### 启动后数据像是空的

可能是磁盘或浏览器存储较慢，应用在等待 2.5 秒后先以当前内容继续。先刷新页面确认；如果仍然为空，关闭应用并检查数据目录中的 JSON 文件是否完整，或从 `backups/` 恢复。

## 已知限制

- 单机、单用户使用；没有账号、云同步或多设备合并。
- 同一时间只允许一个标签页写入数据，其他标签页会显示接管/重试界面。
- 开发模式不注册 PWA Service Worker；离线缓存主要面向构建后的 PWA 版本。
- 数据以整份 JSON 文件读写；阅读文章很多或很长时，启动和保存会变慢。
- 导入备份已有基本回滚保护，但仍不是严格意义上的跨多文件原子事务，导入后建议刷新页面确认结果。
- 备份删除需手动到备份目录操作（暂未提供 UI 删除）。
- 尚未接入自动化测试和 CI。

## 许可证

本项目采用 [MIT License](LICENSE)。

更多待修问题与背景见 [docs/ISSUES.md](docs/ISSUES.md)。
