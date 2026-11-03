import type { Allocation, GameState, ProfileState, Properties } from '@remake/core'
import { DEFAULT_RULES, normalizeRules, type GameRules } from './rules'

/** UI language for the game shell and its content. */
export type GameLocale = 'en' | 'zh'

export interface AchievementMeta {
  mode: 'standard' | 'custom'
  at: string
}

/**
 * What one game remembers between runs: counters, unlocks, best/worst life.
 * The run in flight lives in `SavedRun` instead, so it can be resumed.
 */
export interface StoredProfile {
  times: number
  talents: number[]
  events: number[]
  achievements: number[]
  achievementMeta?: Record<number, AchievementMeta>
  highest?: Properties
  lowest?: Properties
  locked?: number[]
}

export interface GameSettings {
  locale: GameLocale
  speed: number
  rules: GameRules
}

export const SPEED_PRESETS = [1, 2, 3, 5, 10, 20] as const
export const MIN_SPEED = 0.5
export const MAX_SPEED = 20

/** A new life starts with one point of spirit already allocated. */
export const SPIRIT_BASE = 5

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  locale: 'en',
  speed: 1,
  rules: DEFAULT_RULES,
}

/** Shared, never mutated: selectors may return it as a stable fallback. */
export const EMPTY_PROFILE: StoredProfile = {
  times: 0,
  talents: [],
  events: [],
  achievements: [],
}

export function emptyProfile(): StoredProfile {
  return { times: 0, talents: [], events: [], achievements: [] }
}

/**
 * The engine opens a life at age -1: it is a sentinel for "not born yet", and
 * the first `next()` turns it into 0. Showing that number to the player reads
 * as a bug, so the UI floors it at zero. Scoring still uses the real value.
 */
export function shownAge(age: number): number {
  return age > 0 ? age : 0
}

export function clampSpeed(value: unknown): number {
  const speed = Number(value)
  if (!Number.isFinite(speed)) return DEFAULT_GAME_SETTINGS.speed
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(speed * 2) / 2))
}

function numbers(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
    : []
}

function properties(value: unknown): Properties | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const keys = ['age', 'charm', 'intelligence', 'strength', 'money', 'spirit'] as const
  if (keys.some((key) => typeof source[key] !== 'number')) return undefined
  return Object.fromEntries(keys.map((key) => [key, source[key]])) as unknown as Properties
}

function achievementMeta(value: unknown): Record<number, AchievementMeta> | undefined {
  if (!value || typeof value !== 'object') return undefined
  const out: Record<number, AchievementMeta> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    if (item.mode !== 'standard' && item.mode !== 'custom') continue
    const id = Number(key)
    if (!Number.isFinite(id)) continue
    out[id] = { mode: item.mode, at: typeof item.at === 'string' ? item.at : '' }
  }
  return out
}

/** Anything read back from disk is untrusted: it may be hand-edited or old. */
export function sanitizeProfile(value: unknown): StoredProfile {
  if (!value || typeof value !== 'object') return emptyProfile()
  const source = value as Record<string, unknown>
  return {
    times: typeof source.times === 'number' && source.times >= 0 ? Math.floor(source.times) : 0,
    talents: numbers(source.talents),
    events: numbers(source.events),
    achievements: numbers(source.achievements),
    achievementMeta: achievementMeta(source.achievementMeta),
    highest: properties(source.highest),
    lowest: properties(source.lowest),
    locked: Array.isArray(source.locked) ? numbers(source.locked) : undefined,
  }
}

export function sanitizeSettings(value: unknown): GameSettings {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_GAME_SETTINGS, rules: { ...DEFAULT_RULES } }
  }
  const source = value as Record<string, unknown>
  return {
    locale: source.locale === 'zh' ? 'zh' : 'en',
    speed: clampSpeed(source.speed),
    rules: normalizeRules(source.rules as Partial<GameRules> | undefined),
  }
}

export function toProfileState(profile: StoredProfile): ProfileState {
  return {
    times: profile.times,
    talents: new Set(profile.talents),
    events: new Set(profile.events),
    achievements: new Set(profile.achievements),
    highest: profile.highest,
    lowest: profile.lowest,
    locked: profile.locked,
  }
}

export function fromProfileState(profile: ProfileState): StoredProfile {
  return {
    times: profile.times,
    talents: [...profile.talents],
    events: [...profile.events],
    achievements: [...profile.achievements],
    highest: profile.highest,
    lowest: profile.lowest,
    locked: profile.locked,
  }
}

/* ------------------------------------------------------------------ *
 * The run in flight
 * ------------------------------------------------------------------ */

export type SavedStep = 'talents' | 'alloc' | 'play' | 'summary'

export interface SavedLogEntry {
  age: number
  events: number[]
  talents: number[]
  achievements: number[]
}

/** `GameState` with its Set/Map flattened, so JSON can hold it. */
export interface SavedGameState {
  props: GameState['props']
  life: number
  talents: number[]
  events: number[]
  achievements: number[]
  talentTriggers: [number, number][]
}

export interface SavedRun {
  step: SavedStep
  savedAt: string
  rules: GameRules
  seed: number
  /** Where the RNG had got to; resuming replays the same stream from here. */
  rngState: number
  rerollsLeft: number
  drawn: number[]
  selected: number[]
  finalTalents: number[]
  bonus: number
  alloc: Allocation
  logs: SavedLogEntry[]
  game: SavedGameState | null
  ended: boolean
  summary: { score: number; achievements: number[] } | null
}

export function serializeGame(state: GameState): SavedGameState {
  return {
    props: state.props,
    life: state.life,
    talents: [...state.talents],
    events: [...state.events],
    achievements: [...state.achievements],
    talentTriggers: [...state.talentTriggers.entries()],
  }
}

function plainProperties(value: unknown): Properties | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const keys = ['age', 'charm', 'intelligence', 'strength', 'money', 'spirit'] as const
  if (keys.some((key) => typeof source[key] !== 'number' || !Number.isFinite(source[key]))) {
    return undefined
  }
  return Object.fromEntries(keys.map((key) => [key, source[key]])) as unknown as Properties
}

export function deserializeGame(value: unknown): GameState | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const props = source.props as Record<string, unknown> | undefined
  if (!props || typeof props !== 'object') return null
  const current = plainProperties(props.current)
  const highest = plainProperties(props.highest)
  const lowest = plainProperties(props.lowest)
  if (!current || !highest || !lowest) return null
  const triggers = Array.isArray(source.talentTriggers)
    ? (source.talentTriggers.filter(
        (entry): entry is [number, number] =>
          Array.isArray(entry) && typeof entry[0] === 'number' && typeof entry[1] === 'number',
      ) as [number, number][])
    : []
  return {
    props: { current, highest, lowest },
    life: typeof source.life === 'number' ? source.life : 1,
    talents: new Set(numbers(source.talents)),
    events: new Set(numbers(source.events)),
    achievements: new Set(numbers(source.achievements)),
    talentTriggers: new Map(triggers),
  }
}

const STEPS: SavedStep[] = ['talents', 'alloc', 'play', 'summary']

function sanitizeLogs(value: unknown): SavedLogEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({
      age: typeof entry.age === 'number' && Number.isFinite(entry.age) ? Math.round(entry.age) : 0,
      events: numbers(entry.events),
      talents: numbers(entry.talents),
      achievements: numbers(entry.achievements),
    }))
}

function sanitizeAllocation(value: unknown): Allocation {
  const source = (value ?? {}) as Record<string, unknown>
  const read = (key: string, fallback = 0) =>
    typeof source[key] === 'number' && Number.isFinite(source[key])
      ? Math.max(0, Math.round(source[key] as number))
      : fallback
  return {
    charm: read('charm'),
    intelligence: read('intelligence'),
    strength: read('strength'),
    money: read('money'),
    spirit: read('spirit', SPIRIT_BASE),
  }
}

/** A run read back from disk is untrusted: any broken field drops the run. */
export function sanitizeRun(value: unknown): SavedRun | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const step = STEPS.find((item) => item === source.step)
  if (!step) return null
  const parsed = source.game == null ? null : deserializeGame(source.game)
  // Normalise through the engine shape so a hand-edited save cannot smuggle
  // fields the renderer would then trust.
  const game = parsed ? serializeGame(parsed) : null
  // Only the play step needs engine state; the earlier steps are just picks,
  // and the summary screen is built from the log it already carries.
  if (step === 'play' && !game) return null
  const summary =
    source.summary && typeof source.summary === 'object'
      ? {
          score:
            typeof (source.summary as Record<string, unknown>).score === 'number'
              ? ((source.summary as Record<string, unknown>).score as number)
              : 0,
          achievements: numbers((source.summary as Record<string, unknown>).achievements),
        }
      : null
  return {
    step,
    savedAt: typeof source.savedAt === 'string' ? source.savedAt : '',
    rules: normalizeRules(source.rules as Partial<GameRules> | undefined),
    seed: typeof source.seed === 'number' ? source.seed >>> 0 : 1,
    rngState: typeof source.rngState === 'number' ? source.rngState >>> 0 : 1,
    rerollsLeft: typeof source.rerollsLeft === 'number' ? Math.max(0, source.rerollsLeft) : 0,
    drawn: numbers(source.drawn),
    selected: numbers(source.selected),
    finalTalents: numbers(source.finalTalents),
    bonus: typeof source.bonus === 'number' ? source.bonus : 0,
    alloc: sanitizeAllocation(source.alloc),
    logs: sanitizeLogs(source.logs),
    game,
    ended: source.ended === true,
    summary,
  }
}

/* ------------------------------------------------------------------ *
 * The run, in memory
 * ------------------------------------------------------------------ */

export type RunStep = 'home' | SavedStep

export type RunSummary = { score: number; achievements: number[] }

/**
 * Everything one life consists of, as a single value.
 *
 * This used to be thirteen `useState` hooks, which meant "reset the run" was a
 * nine-line list of setters, "restore the run" a twelve-line list, and the
 * autosave effect a thirteen-key object plus a thirteen-item dependency array —
 * three hand-maintained lists that had to stay in step with `SavedRun`. Adding
 * a field and forgetting one of them lost it silently. One object means one
 * place to add it and `{ ...previous, ... }` everywhere else.
 *
 * `error` is here but not in `SavedRun`: it describes a failure of the current
 * session, not something worth restoring.
 */
export interface RunState {
  step: RunStep
  rules: GameRules
  seed: number
  rerollsLeft: number
  drawn: number[]
  selected: number[]
  finalTalents: number[]
  bonus: number
  alloc: Allocation
  game: GameState | null
  logs: SavedLogEntry[]
  ended: boolean
  error: string | null
  summary: RunSummary | null
}

/** The home screen: no life in flight. */
export function initialRun(rules: GameRules): RunState {
  return {
    step: 'home',
    rules,
    seed: 0,
    rerollsLeft: 0,
    drawn: [],
    selected: [],
    finalTalents: [],
    bonus: 0,
    alloc: { charm: 0, intelligence: 0, strength: 0, money: 0, spirit: SPIRIT_BASE },
    game: null,
    logs: [],
    ended: false,
    error: null,
    summary: null,
  }
}

/**
 * The wire form, or `null` on the home screen — there is no run to resume yet,
 * and storing one would make the home screen offer "继续这一局" for a life that
 * never started.
 */
export function toSavedRun(run: RunState, rngState: number): SavedRun | null {
  if (run.step === 'home') return null
  return {
    step: run.step,
    savedAt: new Date().toISOString(),
    rules: run.rules,
    seed: run.seed,
    rngState,
    rerollsLeft: run.rerollsLeft,
    drawn: run.drawn,
    selected: run.selected,
    finalTalents: run.finalTalents,
    bonus: run.bonus,
    alloc: run.alloc,
    logs: run.logs,
    game: run.game ? serializeGame(run.game) : null,
    ended: run.ended,
    summary: run.summary,
  }
}

export function fromSavedRun(saved: SavedRun): RunState {
  return {
    step: saved.step,
    rules: saved.rules,
    seed: saved.seed,
    rerollsLeft: saved.rerollsLeft,
    drawn: saved.drawn,
    selected: saved.selected,
    finalTalents: saved.finalTalents,
    bonus: saved.bonus,
    alloc: saved.alloc,
    game: saved.game ? deserializeGame(saved.game) : null,
    logs: saved.logs,
    ended: saved.ended,
    error: null,
    summary: saved.summary,
  }
}

/**
 * Fold the achievements of a finished run into the profile's unlock table.
 *
 * A standard run upgrades an achievement first earned in a custom run, but not
 * the other way round, and the first-earned timestamp is kept either way — the
 * achievement list shows when it was really first seen.
 */
export function mergeAchievementMeta(
  existing: Record<number, AchievementMeta>,
  ids: Iterable<number>,
  mode: AchievementMeta['mode'],
  at: string,
): Record<number, AchievementMeta> {
  const merged = { ...existing }
  for (const id of new Set(ids)) {
    const previous = merged[id]
    if (!previous || (previous.mode === 'custom' && mode === 'standard')) {
      merged[id] = { mode, at: previous?.at ?? at }
    }
  }
  return merged
}
