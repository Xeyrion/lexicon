import type { RNG } from '@remake/vitex'

/** A fresh 32-bit seed for one run. */
export function randomSeed(): number {
  const buffer = new Uint32Array(1)
  crypto.getRandomValues(buffer)
  return buffer[0] ?? 1
}

/** An RNG that can report where it is, so a run can be resumed mid-stream. */
export interface SeededRNG extends RNG {
  getState: () => number
}

/**
 * mulberry32. Same signature as the engine's RNG: (max, min) -> integer in
 * [min, max]. A per-run stream keeps a save/replay deterministic.
 */
export function seeded(seed: number): SeededRNG {
  let state = seed >>> 0
  const next: RNG = (max = 1, min = 0) => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
    return min + Math.floor(value * (max - min + 1))
  }
  return Object.assign(next, { getState: () => state >>> 0 })
}
