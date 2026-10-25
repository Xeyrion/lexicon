import type { Story, StoryChoice, StoryEnding, StoryNode } from '../../types'

/**
 * The exported template must itself be a valid story: it is the first thing a
 * writer imports, and a template that fails `validateStory` teaches the wrong
 * shape. `_`-prefixed keys are documentation; the importer drops unknown keys.
 */
type TemplateChoice = StoryChoice & { _comment?: string }
type TemplateNode = Omit<StoryNode, 'choices'> & {
  _comment?: string
  choices?: TemplateChoice[]
}
type TemplateEnding = StoryEnding & { _comment?: string }

export interface StoryTemplate extends Omit<Story, 'nodes' | 'endings'> {
  _readme: string[]
  _comment?: string
  nodes: TemplateNode[]
  endings: TemplateEnding[]
}

export const STORY_TEMPLATE: StoryTemplate = {
  _readme: [
    '这是 Lexicon 互动故事的模板。复制一份，改掉内容就能用；它本身也能直接导入。',
    '顶层字段：id（唯一，重复会覆盖同名故事）、title、author、level（可选，如 B1）、description（可选）。',
    'start 是第一个节点的 id。initialVars 声明所有变量；条件、效果和文本变体里用到的变量都必须先在这里声明。',
    'endings 是结局清单。hidden: true 的结局在结局图鉴里只占一个名额，不显示名字；hint 是给玩家的提示。',
    'nodes 是节点清单。text 是正文；variants 按顺序匹配、最后一个命中的替换正文；ending 表示这个节点就是结局。',
    'choices 是选项。to 指向目标节点（指向自己就是回到当前节点）；requires 不满足时该选项不出现；effects 在选中后修改变量。',
    'effects 有两种写法：{ "var": "x", "set": 值 } 直接赋值；{ "var": "x", "add": 数字 } 在原来的数值上累加（负数就是扣减，变量没声明或不是数字时从 0 开始算）。',
    '每个节点要么有 choices，要么有 ending，不能都有，也不能都没有；所有节点都必须从 start 走得到。',
    '以 _ 开头的字段只是说明，导入时会被忽略。',
  ],
  _comment: '三个剧情节点、两个结局：一个普通，一个隐藏。',
  id: 'story-template',
  title: 'The Lantern Road',
  author: '你的名字',
  level: 'A2',
  description: '一个用来演示全部字段的短故事：一条岔路，一盏灯，两个结局。',
  start: 'crossroads',
  initialVars: {
    coins: 3,
    lantern: false,
  },
  endings: [
    {
      id: 'home',
      name: 'Home Before Dark',
      _comment: '普通结局：节点里写 ending: "home" 即可解锁。',
    },
    {
      id: 'river',
      name: 'What the River Keeps',
      hint: 'Carry a light all the way to the water.',
      hidden: true,
      _comment: '隐藏结局：图鉴里只显示 hint，名字要走到才看得到。',
    },
  ],
  nodes: [
    {
      id: 'crossroads',
      _comment: 'start 指向这里。带 variants 的节点会按变量替换正文。',
      text: 'The road ends at a fork: a stone bridge on the left, a dark line of trees on the right. The river is loud tonight, and the light is going.\n\nA wooden box is nailed to the gatepost. Three brass coins sit in the hollow beside it, and a folded note that says only: the bridge is not free.',
      variants: [
        {
          when: [{ var: 'lantern', is: true }],
          text: 'The lantern in your hand throws a small yellow circle on the stones. The road ends at a fork: a stone bridge on the left, a dark line of trees on the right.\n\nThe note on the gatepost says the bridge is not free. The coins in the hollow are still there, and now you can see them.',
        },
      ],
      choices: [
        {
          id: 'pay-toll',
          label: 'Leave three coins and take the bridge',
          to: 'bridge',
          requires: [{ var: 'coins', gte: 3 }],
          effects: [{ var: 'coins', add: -3 }],
          _comment:
            'requires：条件不满足时这个选项根本不出现。effects 用 add 扣减数值：3 + (-3) = 0。',
        },
        {
          id: 'search-hollow',
          label: 'Search the hollow for another coin',
          to: 'crossroads',
          effects: [{ var: 'coins', add: 1 }],
          _comment:
            'add 是数值累加；to 指回当前节点就形成一个小循环，可以反复攒钱。',
        },
        {
          id: 'light-lantern',
          label: 'Light the lantern and take the trees',
          to: 'forest',
          effects: [{ var: 'lantern', set: true }],
          _comment: 'set 是直接赋值：选中后改变变量，后面的正文和条件都会跟着变。',
        },
        {
          id: 'go-home',
          label: 'Turn back before the light goes',
          to: 'home_end',
        },
      ],
    },
    {
      id: 'bridge',
      text: 'The bridge is older than the road. Moss fills the joints between the stones, and the parapet is worn smooth where generations of hands have rested.\n\nHalfway across, a stone has fallen away. Below it the water turns white around the pillars and then goes on, unbothered.',
      choices: [
        {
          id: 'look-down',
          label: 'Look down into the water',
          to: 'river_end',
        },
        {
          id: 'keep-crossing',
          label: 'Step over the gap and keep going',
          to: 'home_end',
        },
      ],
    },
    {
      id: 'forest',
      text: 'The trees close behind you. The path is soft with old leaves, and the lantern makes a circle just wide enough to walk in.\n\nSomething moves at the edge of the light, keeping pace. It does not come closer. It does not fall behind.',
      choices: [
        {
          id: 'follow-water',
          label: 'Follow the sound of water',
          to: 'river_end',
        },
        {
          id: 'walk-faster',
          label: 'Walk faster, towards the village lights',
          to: 'home_end',
        },
      ],
    },
    {
      id: 'home_end',
      text: 'The village lights come up one by one, the way they do when someone is expecting you. Nobody asks where you have been.\n\nIn the morning the road will still be there, and the fork, and the coins in the hollow. You do not go back.',
      ending: 'home',
      _comment: 'ending：指向 endings 里的 id。这个节点不要再写 choices。',
    },
    {
      id: 'river_end',
      text: 'The water is warmer than it looks. It takes the light out of your hand without a sound, and for a moment the whole river is lit from underneath.\n\nThen it is dark again, and the river goes on being the river.',
      ending: 'river',
    },
  ],
}

export function downloadStoryTemplate(): void {
  const blob = new Blob([JSON.stringify(STORY_TEMPLATE, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'lexicon-story-template.json'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
