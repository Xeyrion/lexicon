# 第三阶段：互动故事（计划）

> 状态（2026-10-25）：**已实现并通过端到端冒烟**，见 `docs/ISSUES.md`「第九批」。
> 结论先说：**带选择的阅读，不是文字冒险**。保留"轻状态"作为接口，不预留空字段。

## 一、定位

`任务规划.txt` 原本写的就是「选项分支引擎 / 存档读档回退 / 一个内置短篇 / 复用查词和生词本 / 故事作为阅读里的一个 tab」，方向是阅读，不是玩法。

因此本阶段**只做**：

- 节点 + 2–5 个选项 + 分支
- 轻状态：变量 + 条件（选项可见性、文本变体）
- 存档 / 逐步撤销 / 结局图鉴
- 一个内置短篇（B1，15–20 节点，3 个结局其中 1 个隐藏）
- 模板导出 + 校验器 + 导入

**不做**：物品栏、战斗、骰子、自由输入 parser、地图、应用内节点图、应用内故事编辑器。

## 二、格式（一份 schema，三层用法）

```jsonc
{
  "id": "the-lighthouse",
  "title": "The Lighthouse",
  "author": "",
  "level": "B1",
  "description": "一句话简介",
  "start": "arrive",
  "initialVars": { "courage": 0, "helped_stranger": false },
  "endings": [
    { "id": "leave", "name": "转身离开" },
    { "id": "stay", "name": "留下守夜" },
    { "id": "signal", "name": "点亮信号灯", "hidden": true, "hint": "有些人值得你再点一次灯" }
  ],
  "nodes": [
    {
      "id": "arrive",
      "text": "The door was open, but nobody answered.",
      "choices": [
        { "id": "knock", "label": "Knock again", "to": "hall" },
        { "id": "wait", "label": "Wait outside", "to": "porch", "effects": [{ "var": "courage", "add": 1 }] }
      ]
    },
    {
      "id": "hall",
      "text": "A stranger looked up.",
      "variants": [
        { "when": [{ "var": "helped_stranger", "is": true }],
          "text": "The stranger smiled. \"I never forgot what you did.\"" }
      ],
      "choices": [
        { "id": "ask", "label": "Ask about the light", "to": "lamp",
          "requires": [{ "var": "courage", "gte": 2 }] }
      ]
    },
    { "id": "signal", "text": "...", "ending": "signal" }
  ]
}
```

- **L0 纯跳转**：只有 `nodes` + `choices.to`
- **L1 轻状态**：加 `effects` / `requires`
- **L2 世界记得你**：加 `variants`（同节点不同文本）

三层是同一份 schema 的可选字段，引擎只有一条求值路径。

### 条件与效果

```ts
type VarValue = string | number | boolean

type Condition =
  | { var: string; is: VarValue }
  | { var: string; gte: number }
  | { var: string; lte: number }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }

type Effect = { var: string; set: VarValue } | { var: string; add: number }
```

物品栏、属性、关系值都可以用变量表达（`has_key: true`、`trust: 3`），所以**不需要为"以后可能做文字冒险"预留字段** —— 通用变量 + 条件组合就是那个接口。

### 文本变体

`variants` 按顺序匹配，**最后一个命中的生效**（作者可以写"默认在前、特殊在后"）；都不命中用 `text`。

## 三、数据

独立 `stories` 数据（第 5 种），一个文件 `stories.json`：

```ts
interface StoriesState {
  stories: Story[]
  saves: Record<string, StorySave>   // 每部故事一份当前存档
  meta: Record<string, StoryMeta>    // 跨周目：已解锁结局、通关次数
}

interface StorySave {
  nodeId: string
  vars: Record<string, VarValue>
  visited: string[]
  history: { nodeId: string; choiceId: string }[]  // 逐步撤销用
  updatedAt: string
}

interface StoryMeta {
  unlockedEndings: string[]
  runs: number
}
```

**为什么独立文件**：书的正文只在编辑时写，而故事存档每点一次选择就写一次；混在 `library.json` 里会让选一次选项就重写整本书。

`resetAll` 要一并清空；备份格式升到 `version: 4`，`stories` 字段可选，旧备份照常导入。

## 四、交互

- 阅读页顶部 tab 变成「文章 | 书籍 | 故事」三段
- `/stories` 故事列表：内置短篇 + 已导入的故事，显示已解锁结局数
- `/stories/:storyId` 故事阅读：正文（复用 `ReaderText`，查词/悬停/短语全通）+ 底部选项按钮
  - 有存档时进入询问「继续 / 重新开始」
  - 选项不满足条件时**置灰并说明**（`需要更多勇气`），而不是消失 —— 消失会让玩家不知道有分支
- 结局页：显示结局名 + 本周目路径 + 「再玩一次 / 回看结局」
- 图鉴：已解锁显示名称，未解锁显示 `???`（有 hint 时显示 hint），隐藏结局只计入总数
- 撤销：`history` 栈弹一步，回到上一个节点的状态（vars 也要回滚 → 所以 history 里要存选择前的 vars 快照）

## 五、作者工具

- 「导出模板」：下载带全部可选字段的示例 JSON
- `npm run story:check <file>`：校验并输出人话错误
  - `to` 指向不存在的节点
  - 节点无出边且不是结局
  - 从 `start` 不可达的节点 / 不可达的结局
  - `effects` 改了没在 `initialVars` 声明过的变量（拼写错误重灾区）
  - 条件引用了未声明变量
- `npm run story:map <file>`：终端打印缩进树（作者看结构用，不进应用）
- 导入：走现有「选文件 → 预览 → 确认」流程，校验不过直接拒绝

## 六、里程碑

| 阶段 | 内容 |
| --- | --- |
| 3a | 类型、校验、条件求值、`stories` 数据、备份/导入导出、`resetAll` |
| 3b | 故事阅读页（节点渲染 + 选项 + 存档 + 撤销）、结局页、图鉴 |
| 3c | 内置短篇、模板导出、`story:check` / `story:map`、导入故事 |
| 3d | 冒烟（无头 Chrome 走完一条分支 + 撤销 + 结局解锁）、文档 |

## 七、风险

1. **图校验不严 = 玩家卡死**。断链、死循环、无出边节点必须在导入时挡住，不能靠运行时兜底。
2. **文本变体容易读起来跳跃**。作者要克制；内置短篇只在一处使用，作为示范。
3. **结局图鉴容易变成收集强迫**。未解锁只给 `???`，隐藏结局不进列表，不给攻略。
4. **存档与内容版本**：故事更新后节点 id 变了，旧存档会指向不存在的节点 → 加载时校验，失效则提示「这个故事更新过，请重新开始」，不静默重置。
