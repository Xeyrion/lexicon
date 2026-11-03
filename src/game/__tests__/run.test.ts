import { describe, expect, it } from 'vitest'
import type { GameState } from '@remake/core'
import {
  SPIRIT_BASE,
  fromSavedRun,
  initialRun,
  mergeAchievementMeta,
  toSavedRun,
  type RunState,
} from '../model'
import { DEFAULT_RULES } from '../rules'

const props = { age: 30, charm: 5, intelligence: 6, strength: 7, money: 8, spirit: 9 }

const gameState: GameState = {
  props: { current: { ...props }, highest: { ...props }, lowest: { ...props } },
  life: 1,
  talents: new Set([1001, 1002]),
  events: new Set([10]),
  achievements: new Set([101]),
  talentTriggers: new Map([[1001, 2]]),
}

function playingRun(overrides: Partial<RunState> = {}): RunState {
  return {
    ...initialRun(DEFAULT_RULES),
    step: 'play',
    seed: 42,
    game: gameState,
    logs: [{ age: 30, events: [10], talents: [], achievements: [101] }],
    alloc: { charm: 3, intelligence: 2, strength: 1, money: 0, spirit: SPIRIT_BASE },
    ...overrides,
  }
}

describe('run state', () => {
  it('starts on the home screen with a clean slate', () => {
    const run = initialRun(DEFAULT_RULES)
    expect(run.step).toBe('home')
    expect(run.game).toBeNull()
    expect(run.logs).toEqual([])
    expect(run.ended).toBe(false)
    expect(run.error).toBeNull()
    expect(run.summary).toBeNull()
    expect(run.alloc.spirit).toBe(SPIRIT_BASE)
    expect(run.rules).toBe(DEFAULT_RULES)
  })

  it('does not save a run that never started', () => {
    // The home screen must not leave a "继续这一局" offer behind.
    expect(toSavedRun(initialRun(DEFAULT_RULES), 0)).toBeNull()
  })

  it('round-trips every field through the wire form', () => {
    const run = playingRun({ rerollsLeft: 2, bonus: 3, ended: true })
    const saved = toSavedRun(run, 99)
    expect(saved).not.toBeNull()

    const restored = fromSavedRun(saved!)
    expect(restored.step).toBe('play')
    expect(restored.seed).toBe(42)
    expect(restored.rerollsLeft).toBe(2)
    expect(restored.bonus).toBe(3)
    expect(restored.ended).toBe(true)
    expect(restored.alloc).toEqual(run.alloc)
    expect(restored.logs).toEqual(run.logs)
    expect(restored.game?.props.current.age).toBe(30)
    expect(restored.game?.talents.has(1002)).toBe(true)
    expect(restored.game?.talentTriggers.get(1001)).toBe(2)
    // `error` describes this session, not the run, so it is not persisted.
    expect(restored.error).toBeNull()
  })

  it('flattens the engine state so JSON can hold it', () => {
    const saved = toSavedRun(playingRun(), 7)
    expect(saved?.rngState).toBe(7)
    expect(saved?.game?.talents).toEqual([1001, 1002])
    expect(saved?.game?.talentTriggers).toEqual([[1001, 2]])
    // A Set/Map would vanish silently through JSON.stringify.
    expect(() => JSON.stringify(saved)).not.toThrow()
    expect(JSON.parse(JSON.stringify(saved)).game.talents).toEqual([1001, 1002])
  })
})

describe('mergeAchievementMeta', () => {
  const at = '2026-11-03T00:00:00.000Z'

  it('records ids it has never seen', () => {
    const merged = mergeAchievementMeta({}, [1, 2], 'standard', at)
    expect(merged).toEqual({
      1: { mode: 'standard', at },
      2: { mode: 'standard', at },
    })
  })

  it('keeps the first-earned timestamp on a repeat unlock', () => {
    const existing = { 1: { mode: 'standard' as const, at: '2020-01-01T00:00:00.000Z' } }
    const merged = mergeAchievementMeta(existing, [1], 'standard', at)
    expect(merged[1].at).toBe('2020-01-01T00:00:00.000Z')
  })

  it('upgrades a custom unlock to standard', () => {
    const existing = { 1: { mode: 'custom' as const, at: '2020-01-01T00:00:00.000Z' } }
    const merged = mergeAchievementMeta(existing, [1], 'standard', at)
    expect(merged[1]).toEqual({ mode: 'standard', at: '2020-01-01T00:00:00.000Z' })
  })

  it('never downgrades a standard unlock back to custom', () => {
    const existing = { 1: { mode: 'standard' as const, at: '2020-01-01T00:00:00.000Z' } }
    const merged = mergeAchievementMeta(existing, [1], 'custom', at)
    expect(merged[1]).toEqual({ mode: 'standard', at: '2020-01-01T00:00:00.000Z' })
  })

  it('ignores duplicates and does not mutate the input', () => {
    const existing = { 1: { mode: 'standard' as const, at: '2020-01-01T00:00:00.000Z' } }
    const merged = mergeAchievementMeta(existing, [1, 1, 2, 2], 'standard', at)
    expect(Object.keys(merged).sort()).toEqual(['1', '2'])
    expect(existing).toEqual({ 1: { mode: 'standard', at: '2020-01-01T00:00:00.000Z' } })
  })
})
