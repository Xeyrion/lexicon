import type {
  Story,
  StoryChoice,
  StoryCondition,
  StoryEffect,
  StoryNode,
  StoryVarValue,
} from '../types'

export type StoryVars = Record<string, StoryVarValue>

/** Missing vars are falsy, so authors do not have to declare everything. */
function varOf(vars: StoryVars, name: string): StoryVarValue | undefined {
  return Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : undefined
}

export function evaluateCondition(condition: StoryCondition, vars: StoryVars): boolean {
  if ('all' in condition) {
    return condition.all.every((item) => evaluateCondition(item, vars))
  }
  if ('any' in condition) {
    return condition.any.some((item) => evaluateCondition(item, vars))
  }
  if ('not' in condition) {
    return !evaluateCondition(condition.not, vars)
  }

  const value = varOf(vars, condition.var)
  if ('is' in condition) return value === condition.is
  if (typeof value !== 'number') return false
  if ('gte' in condition) return value >= condition.gte
  return value <= condition.lte
}

export function evaluateAll(
  conditions: StoryCondition[] | undefined,
  vars: StoryVars,
): boolean {
  if (!conditions || conditions.length === 0) return true
  return conditions.every((condition) => evaluateCondition(condition, vars))
}

export function applyEffects(vars: StoryVars, effects: StoryEffect[] | undefined): StoryVars {
  if (!effects || effects.length === 0) return vars
  const next: StoryVars = { ...vars }
  for (const effect of effects) {
    if ('set' in effect) {
      next[effect.var] = effect.set
      continue
    }
    const current = next[effect.var]
    next[effect.var] = (typeof current === 'number' ? current : 0) + effect.add
  }
  return next
}

export function findNode(story: Story, nodeId: string): StoryNode | undefined {
  return story.nodes.find((node) => node.id === nodeId)
}

/**
 * Variants are applied in order and the last match wins, so authors can write
 * "default first, special later" without thinking about precedence rules.
 */
export function resolveNodeText(node: StoryNode, vars: StoryVars): string {
  let text = node.text
  for (const variant of node.variants ?? []) {
    if (evaluateAll(variant.when, vars)) text = variant.text
  }
  return text
}

export function isChoiceAvailable(choice: StoryChoice, vars: StoryVars): boolean {
  return evaluateAll(choice.requires, vars)
}

export function isEndingNode(node: StoryNode): boolean {
  return Boolean(node.ending)
}

export function startVars(story: Story): StoryVars {
  return { ...story.initialVars }
}

/** Nodes reachable from the start node, following every choice. */
export function reachableNodes(story: Story): Set<string> {
  const seen = new Set<string>()
  const queue = [story.start]
  while (queue.length > 0) {
    const id = queue.pop()
    if (!id || seen.has(id)) continue
    const node = findNode(story, id)
    if (!node) continue
    seen.add(id)
    for (const choice of node.choices ?? []) queue.push(choice.to)
  }
  return seen
}

function collectConditionVars(
  condition: StoryCondition,
  out: Set<string>,
): void {
  if ('all' in condition) {
    for (const item of condition.all) collectConditionVars(item, out)
    return
  }
  if ('any' in condition) {
    for (const item of condition.any) collectConditionVars(item, out)
    return
  }
  if ('not' in condition) {
    collectConditionVars(condition.not, out)
    return
  }
  out.add(condition.var)
}

/**
 * Structural checks. Everything here is a hard error: a story that fails these
 * can strand the player, and runtime fallbacks would only hide the author's bug.
 */
export function validateStory(story: Story): string[] {
  const errors: string[] = []

  if (!story.id.trim()) errors.push('缺少 id。')
  if (!story.title.trim()) errors.push('缺少 title。')
  if (!story.start.trim()) errors.push('缺少 start。')

  const ids = new Set<string>()
  for (const node of story.nodes) {
    if (!node.id.trim()) {
      errors.push('有节点缺少 id。')
      continue
    }
    if (ids.has(node.id)) errors.push(`节点 id 重复：${node.id}`)
    ids.add(node.id)
  }

  if (!ids.has(story.start)) {
    errors.push(`起始节点 ${story.start} 不存在。`)
  }

  const endingIds = new Set<string>()
  for (const ending of story.endings) {
    if (!ending.id.trim()) errors.push('有结局缺少 id。')
    if (endingIds.has(ending.id)) errors.push(`结局 id 重复：${ending.id}`)
    endingIds.add(ending.id)
  }

  const declared = new Set(Object.keys(story.initialVars))

  for (const node of story.nodes) {
    const choices = node.choices ?? []
    if (choices.length === 0 && !node.ending) {
      errors.push(`节点 ${node.id} 既没有选项也没有结局，玩家会卡住。`)
    }
    if (choices.length > 0 && node.ending) {
      errors.push(`节点 ${node.id} 同时有选项和结局，请二选一。`)
    }
    if (node.ending && !endingIds.has(node.ending)) {
      errors.push(`节点 ${node.id} 指向未声明的结局 ${node.ending}。`)
    }

    const choiceIds = new Set<string>()
    for (const choice of choices) {
      if (!choice.id.trim()) {
        errors.push(`节点 ${node.id} 有选项缺少 id。`)
      } else if (choiceIds.has(choice.id)) {
        errors.push(`节点 ${node.id} 的选项 id 重复：${choice.id}`)
      }
      choiceIds.add(choice.id)

      if (!choice.label.trim()) errors.push(`节点 ${node.id} 的选项 ${choice.id} 缺少 label。`)
      if (!ids.has(choice.to)) {
        errors.push(`节点 ${node.id} 的选项 ${choice.id} 指向不存在的节点 ${choice.to}。`)
      }

      const used = new Set<string>()
      for (const condition of choice.requires ?? []) collectConditionVars(condition, used)
      for (const effect of choice.effects ?? []) used.add(effect.var)
      for (const name of used) {
        if (!declared.has(name)) {
          errors.push(`节点 ${node.id} 的选项 ${choice.id} 用了未声明的变量 ${name}（应在 initialVars 里声明）。`)
        }
      }
    }

    const variantVars = new Set<string>()
    for (const variant of node.variants ?? []) {
      for (const condition of variant.when) collectConditionVars(condition, variantVars)
    }
    for (const name of variantVars) {
      if (!declared.has(name)) {
        errors.push(`节点 ${node.id} 的文本变体用了未声明的变量 ${name}。`)
      }
    }
  }

  const reachable = reachableNodes(story)
  for (const node of story.nodes) {
    if (!reachable.has(node.id)) {
      errors.push(`节点 ${node.id} 从 start 走不到。`)
    }
  }

  const reachableEndings = new Set(
    story.nodes.filter((node) => reachable.has(node.id) && node.ending).map((node) => node.ending),
  )
  for (const ending of story.endings) {
    if (!reachableEndings.has(ending.id)) {
      errors.push(`结局 ${ending.id} 不可达（没有任何可达节点指向它）。`)
    }
  }

  return errors
}
