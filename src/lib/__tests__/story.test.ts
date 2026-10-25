import { describe, expect, it } from 'vitest'
import { LIGHTHOUSE_STORY } from '../../data/lighthouse'
import {
  applyEffects,
  evaluateAll,
  evaluateCondition,
  isChoiceAvailable,
  reachableNodes,
  resolveNodeText,
  validateStory,
} from '../story'
import type { Story, StoryNode } from '../../types'

const node = (id: string, extra: Partial<StoryNode> = {}): StoryNode => ({
  id,
  text: `${id} text`,
  ...extra,
})

function story(overrides: Partial<Story> = {}): Story {
  return {
    id: 'demo',
    title: 'Demo',
    author: '',
    start: 'a',
    initialVars: { courage: 0, flag: false },
    endings: [{ id: 'end', name: '结束' }],
    nodes: [
      node('a', { choices: [{ id: 'go', label: 'Go', to: 'b' }] }),
      node('b', { ending: 'end' }),
    ],
    ...overrides,
  }
}

describe('条件求值', () => {
  const vars = { courage: 2, flag: true, name: 'ada' }

  it('is / gte / lte', () => {
    expect(evaluateCondition({ var: 'flag', is: true }, vars)).toBe(true)
    expect(evaluateCondition({ var: 'name', is: 'ada' }, vars)).toBe(true)
    expect(evaluateCondition({ var: 'courage', gte: 2 }, vars)).toBe(true)
    expect(evaluateCondition({ var: 'courage', gte: 3 }, vars)).toBe(false)
    expect(evaluateCondition({ var: 'courage', lte: 2 }, vars)).toBe(true)
  })

  it('未声明的变量按 falsy 处理', () => {
    expect(evaluateCondition({ var: 'missing', is: true }, vars)).toBe(false)
    expect(evaluateCondition({ var: 'missing', gte: 0 }, vars)).toBe(false)
    expect(evaluateCondition({ var: 'missing', is: 'ada' }, vars)).toBe(false)
    expect(evaluateCondition({ var: 'missing', lte: 99 }, vars)).toBe(false)
  })

  it('all / any / not 可以嵌套', () => {
    expect(
      evaluateCondition(
        { all: [{ var: 'flag', is: true }, { any: [{ var: 'courage', gte: 9 }, { var: 'courage', gte: 1 }] }] },
        vars,
      ),
    ).toBe(true)
    expect(evaluateCondition({ not: { var: 'flag', is: true } }, vars)).toBe(false)
    expect(evaluateAll(undefined, vars)).toBe(true)
    expect(evaluateAll([], vars)).toBe(true)
  })
})

describe('效果应用', () => {
  it('set 与 add', () => {
    expect(applyEffects({ a: 1 }, [{ var: 'a', add: 2 }])).toEqual({ a: 3 })
    expect(applyEffects({ a: 1 }, [{ var: 'a', set: 9 }])).toEqual({ a: 9 })
    expect(applyEffects({}, [{ var: 'b', add: 1 }])).toEqual({ b: 1 })
    expect(applyEffects({ flag: false }, [{ var: 'flag', set: true }])).toEqual({ flag: true })
  })

  it('不修改原对象', () => {
    const vars = { a: 1 }
    applyEffects(vars, [{ var: 'a', add: 5 }])
    expect(vars).toEqual({ a: 1 })
  })
})

describe('节点文本变体', () => {
  const target = node('x', {
    text: 'base',
    variants: [
      { when: [{ var: 'flag', is: true }], text: 'first' },
      { when: [{ var: 'courage', gte: 2 }], text: 'second' },
    ],
  })

  it('没有命中时用基础文本', () => {
    expect(resolveNodeText(target, { flag: false, courage: 0 })).toBe('base')
  })

  it('多个命中时最后一个生效', () => {
    expect(resolveNodeText(target, { flag: true, courage: 2 })).toBe('second')
    expect(resolveNodeText(target, { flag: true, courage: 1 })).toBe('first')
  })
})

describe('选项可见性', () => {
  it('requires 不满足时不可选', () => {
    const choice = { id: 'c', label: 'C', to: 'b', requires: [{ var: 'courage', gte: 3 }] }
    expect(isChoiceAvailable(choice, { courage: 2 })).toBe(false)
    expect(isChoiceAvailable(choice, { courage: 3 })).toBe(true)
    expect(isChoiceAvailable({ id: 'c', label: 'C', to: 'b' }, {})).toBe(true)
  })
})

describe('结构校验', () => {
  it('正常故事没有错误', () => {
    expect(validateStory(story())).toEqual([])
  })

  it('内置短篇本身必须合法', () => {
    expect(validateStory(LIGHTHOUSE_STORY)).toEqual([])
  })

  it('断链会被指出', () => {
    const broken = story({
      nodes: [node('a', { choices: [{ id: 'go', label: 'Go', to: 'nope' }] })],
    })
    expect(validateStory(broken).join('\n')).toContain('nope')
  })

  it('既无选项也无结局会卡住玩家', () => {
    const stuck = story({ nodes: [node('a'), node('b', { ending: 'end' })] })
    expect(validateStory(stuck).join('\n')).toContain('卡住')
  })

  it('选项与结局不能并存', () => {
    const both = story({
      nodes: [
        node('a', { ending: 'end', choices: [{ id: 'go', label: 'Go', to: 'b' }] }),
        node('b', { ending: 'end' }),
      ],
    })
    expect(validateStory(both).join('\n')).toContain('二选一')
  })

  it('不可达的节点与结局会被指出', () => {
    const orphan = story({
      nodes: [node('a', { ending: 'end' }), node('b', { ending: 'end' })],
      endings: [
        { id: 'end', name: '结束' },
        { id: 'ghost', name: '幽灵结局' },
      ],
    })
    const errors = validateStory(orphan).join('\n')
    expect(errors).toContain('节点 b 从 start 走不到')
    expect(errors).toContain('结局 ghost 不可达')
  })

  it('未声明的变量会被指出（拼写错误重灾区）', () => {
    const typo = story({
      nodes: [
        node('a', {
          choices: [{ id: 'go', label: 'Go', to: 'b', effects: [{ var: 'corage', add: 1 }] }],
        }),
        node('b', { ending: 'end' }),
      ],
    })
    expect(validateStory(typo).join('\n')).toContain('corage')
  })

  it('reachableNodes 只走得到实际分支', () => {
    const wide = story({
      nodes: [
        node('a', {
          choices: [
            { id: 'x', label: 'X', to: 'b' },
            { id: 'y', label: 'Y', to: 'c' },
          ],
        }),
        node('b', { ending: 'end' }),
        node('c', { ending: 'end' }),
        node('d', { ending: 'end' }),
      ],
    })
    const reachable = reachableNodes(wide)
    expect([...reachable].sort()).toEqual(['a', 'b', 'c'])
  })
})
