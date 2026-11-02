import { describe, expect, it } from 'vitest'
import { next, start } from '@remake/core'
import type { Allocation, ProfileState } from '@remake/core'
import type { RNG } from '@remake/vitex'
import { achievements, ages, events, talents } from '@remake/data'

/** Deterministic RNG with the same signature the engine expects. */
function seeded(seed: number): RNG {
  let a = seed >>> 0
  return (max = 1, min = 0) => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
    return min + Math.floor(value * (max - min + 1))
  }
}

const allocation: Allocation = {
  charm: 4,
  intelligence: 4,
  strength: 4,
  money: 4,
  spirit: 4,
}

function emptyProfile(): ProfileState {
  return {
    times: 0,
    talents: new Set(),
    events: new Set(),
    achievements: new Set(),
  }
}

function play(seed: number) {
  const profile = emptyProfile()
  const rng = seeded(seed)
  let state = start(profile, allocation).state
  let years = 0
  let eventCount = 0
  for (; years < 200; years++) {
    const result = next(state, profile, rng)
    state = result.state
    eventCount += result.events.length
    if (result.end) break
  }
  return { state, years, eventCount }
}

describe('remake engine', () => {
  it('loads all data tables', () => {
    expect(events.size).toBe(1720)
    expect(ages.size).toBe(501)
    expect(talents.size).toBe(184)
    expect(achievements.size).toBe(165)
  })

  it('plays one deterministic life to the end', () => {
    const first = play(20261101)
    const second = play(20261101)
    expect(first.years).toBeGreaterThan(0)
    expect(first.eventCount).toBeGreaterThan(0)
    expect(first.state.props.current.age).toBe(second.state.props.current.age)
    expect(first.eventCount).toBe(second.eventCount)
  })

  it(
    'plays 300 lives without throwing',
    () => {
      const agesSeen: number[] = []
      let totalEvents = 0
      for (let i = 0; i < 300; i++) {
        const result = play(i + 1)
        agesSeen.push(result.state.props.current.age)
        totalEvents += result.eventCount
      }
      const sorted = [...agesSeen].sort((a, b) => a - b)
      const avg = agesSeen.reduce((sum, age) => sum + age, 0) / agesSeen.length
      console.log(
        `lives=300 avgAge=${avg.toFixed(1)} min=${sorted[0]} ` +
          `p50=${sorted[150]} p90=${sorted[270]} max=${sorted[299]} ` +
          `avgEvents=${(totalEvents / agesSeen.length).toFixed(1)}`,
      )
      expect(agesSeen.every((age) => age > 0 && age <= 500)).toBe(true)
    },
    30_000,
  )
})
