export type GamePreset = 'standard' | 'custom'

export interface GameRules {
  preset: GamePreset
  pullCount: number
  pickCount: number
  points: number
  allocLimit: number
  rerolls: number
  selfSelect: boolean
}

export const DEFAULT_RULES: GameRules = {
  preset: 'standard',
  pullCount: 10,
  pickCount: 3,
  points: 20,
  allocLimit: 10,
  rerolls: 0,
  selfSelect: false,
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)))

export function normalizeRules(input: Partial<GameRules> | null | undefined): GameRules {
  const value = input ?? {}
  const pullCount = clamp(Number(value.pullCount) || DEFAULT_RULES.pullCount, 6, 20)
  const allocLimit = clamp(Number(value.allocLimit) || DEFAULT_RULES.allocLimit, 5, 99)
  const pickCount = clamp(Number(value.pickCount) || DEFAULT_RULES.pickCount, 1, Math.min(10, pullCount))
  const capacity = allocLimit * 5
  const points = clamp(Number(value.points) || DEFAULT_RULES.points, 10, capacity)
  return {
    preset: value.preset === 'custom' ? 'custom' : 'standard',
    pullCount,
    pickCount,
    points,
    allocLimit,
    rerolls: clamp(Number(value.rerolls) || 0, 0, 20),
    selfSelect: Boolean(value.selfSelect),
  }
}

/** Standard rules are locked; only custom rules are user-editable. */
export function effectiveRules(rules: GameRules): GameRules {
  return rules.preset === 'standard' ? DEFAULT_RULES : normalizeRules(rules)
}
