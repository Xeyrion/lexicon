import type {
  Story,
  StoryChoice,
  StoryCondition,
  StoryEffect,
  StoryEnding,
  StoryNode,
  StoryVarValue,
} from '../../types'
import { finiteNumber, isPlainObject, sanitizeBookId, warnRepairs } from './primitives'

function parseVarValue(value: unknown): StoryVarValue | null {
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return null
}

function parseCondition(value: unknown): StoryCondition | null {
  if (!isPlainObject(value)) return null

  if (Array.isArray(value.all)) {
    const items = value.all.map(parseCondition)
    return items.every((item): item is StoryCondition => item !== null)
      ? { all: items }
      : null
  }
  if (Array.isArray(value.any)) {
    const items = value.any.map(parseCondition)
    return items.every((item): item is StoryCondition => item !== null)
      ? { any: items }
      : null
  }
  if (value.not !== undefined) {
    const inner = parseCondition(value.not)
    return inner ? { not: inner } : null
  }

  const name = sanitizeBookId(value.var)
  if (!name) return null
  if ('is' in value) {
    const target = parseVarValue(value.is)
    return target === null ? null : { var: name, is: target }
  }
  const gte = finiteNumber(value.gte)
  if (gte !== null) return { var: name, gte }
  const lte = finiteNumber(value.lte)
  if (lte !== null) return { var: name, lte }
  return null
}

function parseEffect(value: unknown): StoryEffect | null {
  if (!isPlainObject(value)) return null
  const name = sanitizeBookId(value.var)
  if (!name) return null
  if ('set' in value) {
    const target = parseVarValue(value.set)
    return target === null ? null : { var: name, set: target }
  }
  const add = finiteNumber(value.add)
  return add === null ? null : { var: name, add }
}

function parseChoice(value: unknown): StoryChoice | null {
  if (!isPlainObject(value)) return null
  const id = sanitizeBookId(value.id)
  const label = typeof value.label === 'string' ? value.label.trim() : ''
  const to = sanitizeBookId(value.to)
  if (!id || !label || !to) return null

  const requires = Array.isArray(value.requires)
    ? value.requires.map(parseCondition)
    : []
  const effects = Array.isArray(value.effects) ? value.effects.map(parseEffect) : []
  if (requires.some((item) => item === null) || effects.some((item) => item === null)) {
    return null
  }

  return {
    id,
    label,
    to,
    ...(requires.length > 0 ? { requires: requires as StoryCondition[] } : {}),
    ...(effects.length > 0 ? { effects: effects as StoryEffect[] } : {}),
  }
}

function parseNode(value: unknown): StoryNode | null {
  if (!isPlainObject(value)) return null
  const id = sanitizeBookId(value.id)
  const text = typeof value.text === 'string' ? value.text.trim() : ''
  if (!id || !text) return null

  const choices: StoryChoice[] = []
  for (const raw of Array.isArray(value.choices) ? value.choices : []) {
    const choice = parseChoice(raw)
    if (choice) choices.push(choice)
  }

  const variants: { when: StoryCondition[]; text: string }[] = []
  for (const raw of Array.isArray(value.variants) ? value.variants : []) {
    if (!isPlainObject(raw) || typeof raw.text !== 'string' || !raw.text.trim()) continue
    const when = Array.isArray(raw.when) ? raw.when.map(parseCondition) : []
    if (when.some((item) => item === null)) continue
    variants.push({ when: when as StoryCondition[], text: raw.text.trim() })
  }

  const ending = sanitizeBookId(value.ending)
  return {
    id,
    text,
    ...(variants.length > 0 ? { variants } : {}),
    ...(choices.length > 0 ? { choices } : {}),
    ...(ending ? { ending } : {}),
  }
}

function parseStory(value: unknown): Story | null {
  if (!isPlainObject(value)) return null
  const id = sanitizeBookId(value.id)
  const title = typeof value.title === 'string' ? value.title.trim() : ''
  const start = sanitizeBookId(value.start)
  if (!id || !title || !start) return null

  const nodes: StoryNode[] = []
  for (const raw of Array.isArray(value.nodes) ? value.nodes : []) {
    const node = parseNode(raw)
    if (node) nodes.push(node)
  }
  if (nodes.length === 0) return null

  const endings: StoryEnding[] = []
  for (const raw of Array.isArray(value.endings) ? value.endings : []) {
    if (!isPlainObject(raw)) continue
    const endingId = sanitizeBookId(raw.id)
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    if (!endingId || !name) continue
    endings.push({
      id: endingId,
      name,
      ...(typeof raw.hint === 'string' && raw.hint.trim() ? { hint: raw.hint.trim() } : {}),
      ...(raw.hidden === true ? { hidden: true } : {}),
    })
  }

  const initialVars: Record<string, StoryVarValue> = {}
  if (isPlainObject(value.initialVars)) {
    for (const [name, raw] of Object.entries(value.initialVars)) {
      const parsed = parseVarValue(raw)
      if (parsed !== null) initialVars[name] = parsed
    }
  }

  return {
    id,
    title,
    author: typeof value.author === 'string' ? value.author.trim() : '',
    ...(typeof value.level === 'string' && value.level.trim() ? { level: value.level.trim() } : {}),
    ...(typeof value.description === 'string' && value.description.trim()
      ? { description: value.description.trim() }
      : {}),
    start,
    initialVars,
    endings,
    nodes,
  }
}

/** Drops stories that cannot be parsed at all; structural checks live in story.ts. */
export function sanitizeStories(value: unknown): Story[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    console.warn('[Lexicon] 故事数据格式不正确，已跳过。')
    return []
  }

  const stories: Story[] = []
  const seen = new Set<string>()
  let dropped = 0

  for (const entry of value) {
    const story = parseStory(entry)
    if (!story || seen.has(story.id)) {
      dropped += 1
      continue
    }
    seen.add(story.id)
    stories.push(story)
  }

  warnRepairs('故事', dropped, 0)
  return stories
}

export function parseImportedStory(value: unknown): Story | null {
  return parseStory(value)
}
