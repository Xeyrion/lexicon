# 人生模拟器 · 翻译任务

> 源文案：[VickScarlet/remake](https://github.com/VickScarlet/remake) @ `d20aa81`
> 许可：MIT，Copyright (c) 2021-2026 神戸小鳥 and 神户小德。译文版权归本项目。
> 范围：1,720 条事件 + 184 个天赋 + 165 个成就，共 2,069 条。

## 进度

| 范围 | 批次 | 条数 | 中文字数 | 状态 |
| --- | --- | --- | --- | --- |
| 0–6 岁 · 童年 | 5 | 185 | 4527 | 待校对 |
| 7–12 岁 · 少年 | 5 | 179 | 2534 | 待校对 |
| 13–18 岁 · 青春期 | 8 | 282 | 4186 | 待校对 |
| 19–25 岁 · 青年 | 7 | 261 | 3711 | 待校对 |
| 26–40 岁 · 成年 | 8 | 296 | 4828 | 待校对 |
| 41+ 岁 · 中年以后 | 9 | 358 | 6448 | 待校对 |
| 分支专用 / 备用内容 | 4 | 159 | 2361 | 待校对 |
| 天赋 · Talents | 5 | 184 | 2042 | 待校对 |
| 成就 · Achievements | 5 | 165 | 1456 | 待校对 |
| **合计** | **56** | **2069** | **32093** | — |

逐批进度见 [PROGRESS.md](./PROGRESS.md)。状态由 `src/game/i18n/en/**/<batch>.json` 的完成度推导，不要手改。

## 怎么用

1. 打开 `batches/` 下的某个文件，找到 `## Batch 01-01`。
2. 把「输入」整段 JSON 和上面的「要求」一起发给模型；也可以直接用下面的提示词模板。
3. 模型返回 JSON 后，存成 `src/game/i18n/en/events/01-01.json`（天赋/成就放 `talents/`、`achievements/`）。
4. 跑 `npm run translate:check` 校验（G0 提供），再跑 `npm run translate:doc` 更新进度。

## 提示词模板

```text
你是中译英译者。把输入 JSON 翻成自然、克制的英文。
事件：第二人称、过去时为主、短句、冷幽默；`zh` 是正文，`post` 是追加句。
天赋/成就：`name` 用 2–5 词的短标签，`description` 一句话。
保留中国文化语境（高考、户口、春运等），不本地化；保留 `{CurrentYear}` 占位符；
意译优先，不增删信息，不加解释；英文长度控制在中文的 1.5–2.5 倍。
只输出 JSON，不要 markdown 代码块。
```

## 规则

1. 第二人称、过去时为主、短句、冷幽默，沿用“人生流水账”的语气。
2. 保留中国文化语境，不本地化：高考 → the Gaokao；户口 → hukou；春运 → Spring Festival travel rush。
3. 意译优先。中文梗直译不好笑的，改写成英文里同样荒诞的说法，不逐字对。
4. `{CurrentYear}` 原样保留，不翻译、不改写。
5. 不增删信息，不加解释，不合并句子；一条对应一条。
6. 英文长度控制在中文的 1.5–2.5 倍，避免一行变三行。
7. 只输出 JSON；不要 markdown 代码块，不要前后缀。

## 输出格式

事件：

```json
{
  "events": { "10000": "You died." },
  "posts": { "10001": "The next line." }
}
```

天赋 / 成就：

```json
{
  "items": { "1001": { "name": "Family Heirloom", "description": "It might protect you." } }
}
```

- `events` 必有；`posts` 只放有 `post` 的 id。
- id 用字符串，和输入一致；不要新增或遗漏 id。

## 术语表

| 中文 | 英文 |
| --- | --- |
| 高考 | the Gaokao (national college entrance exam) |
| 中考 | the high school entrance exam |
| 户口 | hukou (household registration) |
| 春运 | Spring Festival travel rush |
| 单位 | work unit (danwei) |
| 国企 | state-owned enterprise |
| 下岗 | laid off from a state-owned enterprise |
| 编制 | a permanent government post (bianzhi) |
| 公务员 | civil servant |
| 独生子女 | only child |
| 计划生育 | one-child policy |
| 留守儿童 | left-behind child |
| 打工 | work away from home |
| 拆迁 | demolition and relocation |
| 学区房 | school-district apartment |
| 补课 | tutoring |
| 班主任 | homeroom teacher |
| 相亲 | blind date |
| 彩礼 | bride price |
| 房贷 | mortgage |
| 五险一金 | social insurance and housing fund |
| 居委会 | neighborhood committee |
| 城管 | urban management officer |
| 知青 | sent-down youth |
| 下海 | go into business |
| 铁饭碗 | iron rice bowl (a stable job) |
| 压岁钱 | New Year money |
| 坐月子 | postpartum confinement |
| 考研 | postgraduate entrance exam |
| 考公 | civil service exam |
| 广场舞 | square dancing |

## 批次索引

| 文件 | 范围 | 批次 |
| --- | --- | --- |
| [01-age-0-6.md](./batches/01-age-0-6.md) | 0–6 岁 · 童年 | 5 |
| [02-age-7-12.md](./batches/02-age-7-12.md) | 7–12 岁 · 少年 | 5 |
| [03-age-13-18.md](./batches/03-age-13-18.md) | 13–18 岁 · 青春期 | 8 |
| [04-age-19-25.md](./batches/04-age-19-25.md) | 19–25 岁 · 青年 | 7 |
| [05-age-26-40.md](./batches/05-age-26-40.md) | 26–40 岁 · 成年 | 8 |
| [06-age-41plus.md](./batches/06-age-41plus.md) | 41+ 岁 · 中年以后 | 9 |
| [99-unreferenced.md](./batches/99-unreferenced.md) | 分支专用 / 备用内容 | 4 |
| [07-talents.md](./batches/07-talents.md) | 天赋 · Talents | 5 |
| [08-achievements.md](./batches/08-achievements.md) | 成就 · Achievements | 5 |

## 状态说明

- 未开始：0 条；进行中：1 条以上但未齐；待校对：条数齐了但没人审；已校对：审过。
- 每批一个文件，方便断点续翻、多人分工、按批回滚。
- 不要直接改 `PROGRESS.md` 的状态列，重跑生成脚本即可。
