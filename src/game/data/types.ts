/**
 * Data shapes for the vendored remake engine.
 *
 * These mirror `packages/data/src/*.types.ts` upstream (MIT). Enums are
 * replaced with const objects + unions because the app's tsconfig enables
 * `erasableSyntaxOnly`, which forbids TS enums.
 */

export type EventGrade = 0 | 1 | 2 | 3

export interface EventEffect {
  CHR?: number
  INT?: number
  STR?: number
  MNY?: number
  SPR?: number
  LIF?: number
  AGE?: number
}

export interface EventBranch {
  condition: string
  event: number
}

export interface Event {
  id: number
  event: string
  grade: EventGrade
  postEvent?: string
  effect?: EventEffect
  NoRandom?: boolean
  include?: string
  exclude?: string
  branch?: EventBranch[]
  format?: boolean
}

export type EventWithWeight = [number, number]

export interface Age {
  age: number
  event: EventWithWeight[][]
}

export type TalentGrade = 0 | 1 | 2 | 3

export interface TalentEffect {
  MNY?: number
  STR?: number
  INT?: number
  CHR?: number
  SPR?: number
  RND?: number
}

export type TalentWithWeight = [number, number]

export interface TalentReplacementTalent {
  talent: TalentWithWeight[]
  grade?: never
}

export interface TalentReplacementGrade {
  grade: TalentGrade
  talent?: never
}

export type TalentReplacement = TalentReplacementTalent | TalentReplacementGrade

export interface Talent {
  id: number
  name: string
  description: string
  condition?: string
  grade: TalentGrade
  effect?: TalentEffect
  exclusive?: boolean
  points?: number
  exclude?: number[]
  replacement?: TalentReplacement
  max: number
}

export type AchievementGrade = 0 | 1 | 2 | 3

export const AchievementOpportunity = {
  Start: 'START',
  Trajectory: 'TRAJECTORY',
  Summary: 'SUMMARY',
  End: 'END',
} as const

export type AchievementOpportunity =
  (typeof AchievementOpportunity)[keyof typeof AchievementOpportunity]

export interface Achievement {
  id: number
  name: string
  description: string
  grade: AchievementGrade
  condition: string
  hide: boolean
  opportunity: AchievementOpportunity
}

export interface CharacterProperty {
  CHR: number
  INT: number
  STR: number
  MNY: number
}

export interface Character {
  id: number
  name: string
  property: CharacterProperty
  talent: number[]
}
