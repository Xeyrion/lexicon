# Game data sources

这五个 xlsx 来自 [VickScarlet/remake](https://github.com/VickScarlet/remake) 的
`packages/data/src/`，固定 commit `d20aa815cf2f92d489302e64ae13ba39d3d17d63`。

- 许可：MIT，`Copyright (c) 2021-2026 神戸小鳥 and 神户小德`
- 用途：`npm run game:data` 把它们转成 `src/game/data/generated/zh/*.json`

| 文件 | 内容 |
| --- | --- |
| `event.xlsx` | 事件：正文、追加句、稀有度、五维/寿命/年龄效果、分支 |
| `age.xlsx` | 每个年龄的事件池（`id*weight|level`） |
| `talent.xlsx` | 天赋：名称、描述、条件、效果、替换、互斥 |
| `achievement.xlsx` | 成就：名称、描述、条件、隐藏、触发时机 |
| `character.xlsx` | 名人模式角色 |
| `overrides.json` | 本地内容改写，key = 事件 id；`game:data` 时覆盖 xlsx 文本 |

不要手改这些 xlsx。上游更新时按 `src/game/remake/UPSTREAM.md` 的步骤整体替换，
再跑 `npm run game:data`。

要改某条文案，优先改 `overrides.json`（例如把一条敏感事件换成中性表述），
不要直接改 `src/game/data/generated/zh/*.json`——下次 `game:data` 会覆盖。
