import type { GameSnapshot } from '../../types'
import { sanitizeProfile, sanitizeSettings } from '../../game/model'
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

  return {
    profiles,
    ...(value.settings === undefined ? {} : { settings: sanitizeSettings(value.settings) }),
  }
}
