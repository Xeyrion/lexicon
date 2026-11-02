import type { GameSnapshot } from '../../types'
import { sanitizeProfile, sanitizeRun, sanitizeSettings } from '../../game/model'
import { isPlainObject } from './primitives'

/**
 * A backup is user-editable, so a game profile read from one goes through the
 * same sanitizer as the file: unknown fields are dropped, not trusted.
 */
export function sanitizeGameSnapshot(value: unknown): GameSnapshot | null {
  if (!isPlainObject(value)) return null
  if (value.profiles !== undefined && !isPlainObject(value.profiles)) return null

  const profiles: GameSnapshot['profiles'] = {}
  if (isPlainObject(value.profiles)) {
    for (const [gameId, raw] of Object.entries(value.profiles)) {
      if (!gameId) continue
      profiles[gameId] = sanitizeProfile(raw)
    }
  }

  // A run that fails to parse is dropped rather than failing the whole backup:
  // losing one in-flight life is much better than refusing the import.
  const runs: NonNullable<GameSnapshot['runs']> = {}
  if (isPlainObject(value.runs)) {
    for (const [gameId, raw] of Object.entries(value.runs)) {
      if (!gameId) continue
      const run = sanitizeRun(raw)
      if (run) runs[gameId] = run
    }
  }

  return {
    profiles,
    ...(value.settings === undefined ? {} : { settings: sanitizeSettings(value.settings) }),
    ...(Object.keys(runs).length > 0 ? { runs } : {}),
  }
}
