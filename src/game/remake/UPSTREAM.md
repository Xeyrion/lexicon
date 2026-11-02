# Vendored: remake engine

- 上游：<https://github.com/VickScarlet/remake>
- 固定 commit：`d20aa815cf2f92d489302e64ae13ba39d3d17d63`（2026-11-01）
- 许可：MIT，`Copyright (c) 2021-2026 神戸小鳥 and 神户小德`（见 `LICENSE`）

## 收进来的文件

```text
core/src/{achievement,character,event,game,index,state,talent}.ts
condition/index.ts
vitex/index.ts
```

`*.spec.ts` 没有收：上游测试用 `bun test`，本项目用 Vitest，测试另写在
`src/game/__tests__/`。

## 改动

**源码零改动。** 上游用 `@remake/core` / `@remake/condition` / `@remake/vitex` /
`@remake/data` 四个包名，本仓库用 Vite + tsconfig 别名指过来：

| 包名 | 指向 |
| --- | --- |
| `@remake/core` | `src/game/remake/core/src` |
| `@remake/condition` | `src/game/remake/condition` |
| `@remake/vitex` | `src/game/remake/vitex` |
| `@remake/data` | `src/game/data`（自建，读 `generated/zh/*.json`） |

`@remake/data` 没有 vendor，因为它的入口是 `../dist/*`（由 `v-transform` 生成）。
我们用 `scripts/build-game-data.mjs` 直接读 xlsx 生成 JSON，行为对齐
`packages/data/src/*.types.ts` 里的 transformer。

## 升级步骤

1. 改 `scripts/build-game-data.mjs` 里的 `UPSTREAM` 和 `scripts/game-data/*.xlsx`。
2. 重新拷贝上面列出的 9 个文件。
3. `npm run game:data`。
4. `npm run test`，确认 `src/game/__tests__/` 的引擎测试仍过。
5. 更新本文件的 commit。
