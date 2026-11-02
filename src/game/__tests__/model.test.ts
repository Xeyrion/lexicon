import { describe, expect, it } from 'vitest'
import type { GameState } from '@remake/core'
import {
  DEFAULT_GAME_SETTINGS,
  clampSpeed,
  deserializeGame,
  emptyProfile,
  fromProfileState,
  sanitizeProfile,
  sanitizeRun,
  sanitizeSettings,
  serializeGame,
  toProfileState,
} from '../model'
import { DEFAULT_RULES, normalizeRules } from '../rules'
import { sanitizeGameSnapshot } from '../../lib/validation'

const props = { age: 30, charm: 5, intelligence: 6, strength: 7, money: 8, spirit: 9 }

const gameState: GameState = {
  props: { current: { ...props }, highest: { ...props }, lowest: { ...props } },
  life: 1,
  talents: new Set([1001, 1002]),
  events: new Set([10]),
  achievements: new Set([101]),
  talentTriggers: new Map([[1001, 2]]),
}

describe('game model', () => {
  it('keeps known profile fields and drops the rest', () => {
    const profile = sanitizeProfile({
      times: 4,
      talents: [1, 'x', 2],
      events: [10],
      achievements: [101],
      achievementMeta: {
        101: { mode: 'standard', at: '2026-10-01T00:00:00.000Z' },
        102: { mode: 'nonsense', at: '' },
      },
      highest: { age: 90, charm: 1, intelligence: 2, strength: 3, money: 4, spirit: 5 },
      extra: 'ignored',
    })

    expect(profile.times).toBe(4)
    expect(profile.talents).toEqual([1, 2])
    expect(profile.achievementMeta?.[101]?.mode).toBe('standard')
    expect(profile.achievementMeta?.[102]).toBeUndefined()
    expect(profile.highest?.age).toBe(90)
    expect('extra' in profile).toBe(false)
  })

  it('falls back to an empty profile for garbage', () => {
    expect(sanitizeProfile(null)).toEqual(emptyProfile())
    expect(sanitizeProfile({ times: -3, talents: 'nope' })).toEqual(emptyProfile())
    // A partial profile must not throw away the fields it does have.
    expect(sanitizeProfile({ highest: { age: 1 } })).toEqual(emptyProfile())
  })

  it('round-trips through the engine profile shape', () => {
    const stored = sanitizeProfile({ times: 2, talents: [3], events: [4], achievements: [5] })
    const back = fromProfileState(toProfileState(stored))
    expect(back.talents).toEqual([3])
    expect(back.achievements).toEqual([5])
  })

  it('clamps speed to the supported range', () => {
    expect(clampSpeed(0)).toBe(0.5)
    expect(clampSpeed(99)).toBe(20)
    expect(clampSpeed(2.26)).toBe(2.5)
    expect(clampSpeed('abc')).toBe(DEFAULT_GAME_SETTINGS.speed)
  })

  it('sanitizes settings, including impossible rule combinations', () => {
    const settings = sanitizeSettings({
      locale: 'fr',
      speed: 100,
      rules: { preset: 'custom', pullCount: 6, pickCount: 9, points: 999, allocLimit: 5 },
    })

    expect(settings.locale).toBe('en')
    expect(settings.speed).toBe(20)
    expect(settings.rules.preset).toBe('custom')
    expect(settings.rules.pickCount).toBe(6)
    expect(settings.rules.points).toBe(25)
    expect(sanitizeSettings(undefined).rules).toEqual(DEFAULT_RULES)
  })

  it('normalizes rules without losing a valid preset', () => {
    expect(normalizeRules({ preset: 'custom', pullCount: 12, pickCount: 4 }).pullCount).toBe(12)
    expect(normalizeRules({}).preset).toBe('standard')
  })
})

describe('game snapshot', () => {
  it('rejects non-objects so a bad backup cannot wipe the file', () => {
    expect(sanitizeGameSnapshot(null)).toBeNull()
    expect(sanitizeGameSnapshot([])).toBeNull()
    expect(sanitizeGameSnapshot({ profiles: 'nope' })).toBeNull()
  })

  it('sanitizes every profile and keeps settings optional', () => {
    const parsed = sanitizeGameSnapshot({
      profiles: {
        remake: { times: 3, achievements: [1, 2] },
        other: { times: 'x' },
      },
    })

    expect(parsed?.profiles.remake.times).toBe(3)
    expect(parsed?.profiles.remake.achievements).toEqual([1, 2])
    expect(parsed?.profiles.other).toEqual(emptyProfile())
    expect(parsed?.settings).toBeUndefined()
  })
})

describe('saved run', () => {
  it('round-trips the engine state through JSON', () => {
    const saved = serializeGame(gameState)
    expect(saved.talents).toEqual([1001, 1002])
    expect(saved.talentTriggers).toEqual([[1001, 2]])

    const restored = deserializeGame(JSON.parse(JSON.stringify(saved)))
    expect(restored?.talents.has(1002)).toBe(true)
    expect(restored?.talentTriggers.get(1001)).toBe(2)
    expect(restored?.props.current.age).toBe(30)
  })

  it('rejects a run whose step has no state to restore', () => {
    expect(sanitizeRun({ step: 'play' })).toBeNull()
    expect(sanitizeRun({ step: 'nonsense' })).toBeNull()
    // Before the engine starts there is no state yet, and that is fine: the
    // talent and allocation steps are just picks.
    expect(sanitizeRun({ step: 'talents' })?.step).toBe('talents')
    expect(sanitizeRun({ step: 'alloc', game: null })?.step).toBe('alloc')
  })

  it('normalises a resumed run and keeps the rng position', () => {
    const run = sanitizeRun({
      step: 'play',
      game: serializeGame(gameState),
      logs: [{ age: 30, events: [10], talents: [], achievements: [] }],
      alloc: { charm: 3, intelligence: 2, strength: 1, money: 0, spirit: 5 },
      rules: { preset: 'custom', pullCount: 12, pickCount: 4 },
      seed: 42,
      rngState: 99,
      ended: false,
    })

    expect(run?.game?.achievements).toEqual([101])
    expect(run?.logs[0].age).toBe(30)
    expect(run?.alloc.charm).toBe(3)
    expect(run?.rules.pullCount).toBe(12)
    expect(run?.rngState).toBe(99)
  })
})
