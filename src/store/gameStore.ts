import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createFileBackedStorage } from '../lib/storage'
import { isPlainObject } from '../lib/validation'
import {
  DEFAULT_GAME_SETTINGS,
  EMPTY_PROFILE,
  clampSpeed,
  sanitizeProfile,
  sanitizeRun,
  sanitizeSettings,
  type GameLocale,
  type GameSettings,
  type SavedRun,
  type StoredProfile,
} from '../game/model'
import { normalizeRules, type GameRules } from '../game/rules'

const STORAGE_NAME = 'lexicon-game-v1'

/**
 * Keys written before game data moved into `game.json`. They are read once on
 * first hydration so an existing profile/achievements are not lost, and are
 * cleared by "clear all data" so they cannot resurrect a reset profile.
 */
const LEGACY_KEYS = {
  profile: 'lexicon-game-profile-v1',
  locale: 'lexicon-game-locale-v1',
  speed: 'lexicon-game-speed-v1',
  rules: 'lexicon-game-rules-v1',
}

interface GameStore {
  /** One profile per game id, so adding a game cannot mix its unlocks. */
  profiles: Record<string, StoredProfile>
  /** The run in flight, if any. Exiting mid-run must not throw it away. */
  runs: Record<string, SavedRun>
  settings: GameSettings
  setProfile: (gameId: string, profile: StoredProfile) => void
  setRun: (gameId: string, run: SavedRun) => void
  clearRun: (gameId: string) => void
  setLocale: (locale: GameLocale) => void
  setSpeed: (speed: number) => void
  setRules: (rules: GameRules) => void
  resetGame: (gameId: string) => void
  /** Used by "clear all data"; also drops the legacy localStorage keys. */
  resetAllGames: () => void
}

function sanitizeRuns(value: unknown): Record<string, SavedRun> {
  if (!isPlainObject(value)) return {}
  const runs: Record<string, SavedRun> = {}
  for (const [gameId, raw] of Object.entries(value)) {
    if (!gameId) continue
    const run = sanitizeRun(raw)
    if (run) runs[gameId] = run
  }
  return runs
}

function sanitizeProfiles(value: unknown): Record<string, StoredProfile> {
  if (!isPlainObject(value)) return {}
  const profiles: Record<string, StoredProfile> = {}
  for (const [gameId, raw] of Object.entries(value)) {
    if (!gameId) continue
    profiles[gameId] = sanitizeProfile(raw)
  }
  return profiles
}

function readLegacy(): { profiles: Record<string, StoredProfile>; settings: Partial<GameSettings> } | null {
  if (typeof localStorage === 'undefined') return null
  const profiles: Record<string, StoredProfile> = {}
  const settings: Partial<GameSettings> = {}
  let found = false
  try {
    // The pre-namespacing key held the single game's profile.
    for (const key of [LEGACY_KEYS.profile, `${LEGACY_KEYS.profile}:remake`]) {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const gameId = key === LEGACY_KEYS.profile ? 'remake' : key.slice(LEGACY_KEYS.profile.length + 1)
      if (profiles[gameId]) continue
      profiles[gameId] = sanitizeProfile(JSON.parse(raw) as unknown)
      found = true
    }
    const locale = localStorage.getItem(LEGACY_KEYS.locale)
    if (locale === 'en' || locale === 'zh') {
      settings.locale = locale
      found = true
    }
    const speed = localStorage.getItem(LEGACY_KEYS.speed)
    if (speed !== null) {
      settings.speed = clampSpeed(speed)
      found = true
    }
    const rules = localStorage.getItem(LEGACY_KEYS.rules)
    if (rules) {
      settings.rules = normalizeRules(JSON.parse(rules) as Partial<GameRules>)
      found = true
    }
  } catch {
    return null
  }
  return found ? { profiles, settings } : null
}

function clearLegacy(): void {
  if (typeof localStorage === 'undefined') return
  for (const key of Object.values(LEGACY_KEYS)) {
    try {
      localStorage.removeItem(key)
      localStorage.removeItem(`${key}:remake`)
    } catch {
      // best-effort
    }
  }
}

/** Set by `merge`: whether the file already carried settings of its own. */
let persistedSettingsPresent = false

export const useGameStore = create<GameStore>()(
  persist(
    (set) => ({
      profiles: {},
      runs: {},
      settings: { ...DEFAULT_GAME_SETTINGS, rules: { ...DEFAULT_GAME_SETTINGS.rules } },

      setProfile: (gameId, profile) =>
        set((state) => ({ profiles: { ...state.profiles, [gameId]: profile } })),

      setRun: (gameId, run) =>
        set((state) => ({ runs: { ...state.runs, [gameId]: run } })),

      clearRun: (gameId) =>
        set((state) => {
          if (!state.runs[gameId]) return state
          const runs = { ...state.runs }
          delete runs[gameId]
          return { runs }
        }),

      setLocale: (locale) =>
        set((state) => ({ settings: { ...state.settings, locale } })),

      setSpeed: (speed) =>
        set((state) => ({ settings: { ...state.settings, speed: clampSpeed(speed) } })),

      setRules: (rules) =>
        set((state) => ({ settings: { ...state.settings, rules: normalizeRules(rules) } })),

      resetGame: (gameId) =>
        set((state) => {
          const profiles = { ...state.profiles }
          const runs = { ...state.runs }
          delete profiles[gameId]
          delete runs[gameId]
          return { profiles, runs }
        }),

      resetAllGames: () => {
        clearLegacy()
        set({
          profiles: {},
          runs: {},
          settings: { ...DEFAULT_GAME_SETTINGS, rules: { ...DEFAULT_GAME_SETTINGS.rules } },
        })
      },
    }),
    {
      name: STORAGE_NAME,
      version: 1,
      storage: createJSONStorage(() =>
        createFileBackedStorage({ kind: 'game', debounceMs: 600 }),
      ),
      partialize: (state) => ({
        profiles: state.profiles,
        runs: state.runs,
        settings: state.settings,
      }),
      merge: (persisted, current) => {
        const saved = isPlainObject(persisted) ? persisted : {}
        persistedSettingsPresent = saved.settings !== undefined
        return {
          ...current,
          profiles: sanitizeProfiles(saved.profiles),
          runs: sanitizeRuns(saved.runs),
          settings:
            saved.settings === undefined
              ? current.settings
              : sanitizeSettings(saved.settings),
        }
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const legacy = readLegacy()
        if (!legacy) return
        // Only fill gaps: whatever the file already has wins, so a migrated
        // value can never overwrite newer data on a second load.
        const profiles = { ...state.profiles }
        let changed = false
        for (const [gameId, profile] of Object.entries(legacy.profiles)) {
          if (profiles[gameId]) continue
          profiles[gameId] = profile
          changed = true
        }
        let settings = state.settings
        if (!persistedSettingsPresent) {
          settings = {
            locale: legacy.settings.locale ?? settings.locale,
            speed: legacy.settings.speed ?? settings.speed,
            rules: legacy.settings.rules ?? settings.rules,
          }
          changed = true
        }
        // setState (rather than a direct mutation) is what makes the persist
        // middleware write the migrated snapshot into game.json.
        if (changed) useGameStore.setState({ profiles, settings })
      },
    },
  ),
)

/** Non-reactive read for one game; use the store hook when the UI must update. */
export function getProfile(gameId = 'remake'): StoredProfile {
  return useGameStore.getState().profiles[gameId] ?? EMPTY_PROFILE
}

export function saveProfile(profile: StoredProfile, gameId = 'remake'): void {
  useGameStore.getState().setProfile(gameId, profile)
}

export function getSettings(): GameSettings {
  return useGameStore.getState().settings
}
