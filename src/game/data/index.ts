import achievementsJson from './generated/zh/achievements.json'
import agesJson from './generated/zh/ages.json'
import charactersJson from './generated/zh/characters.json'
import eventsJson from './generated/zh/events.json'
import talentsJson from './generated/zh/talents.json'
import type { Achievement, Age, Character, Event, Talent } from './types'

export type {
  Achievement,
  AchievementGrade,
  AchievementOpportunity as AchievementOpportunityType,
  Age,
  Character,
  CharacterProperty,
  Event,
  EventBranch,
  EventEffect,
  EventGrade,
  EventWithWeight,
  Talent,
  TalentEffect,
  TalentGrade,
  TalentReplacement,
  TalentWithWeight,
} from './types'
export { AchievementOpportunity } from './types'

/**
 * The engine reads text from these maps directly, so they must be populated
 * before `@remake/core` is imported. Static JSON imports guarantee that:
 * `talent.ts` and `achievement.ts` build their grade/opportunity indexes at
 * module scope, and an empty map there would silently break drawing.
 *
 * English is a display-only overlay (`src/game/i18n/en`), not a second data
 * set: the engine never needs translated text.
 */
export const events = new Map<number, Event>(
  (eventsJson as unknown as Event[]).map((event) => [event.id, event]),
)

export const ages = new Map<number, Age>(
  (agesJson as unknown as Age[]).map((age) => [age.age, age]),
)

export const talents = new Map<number, Talent>(
  (talentsJson as unknown as Talent[]).map((talent) => [talent.id, talent]),
)

export const achievements = new Map<number, Achievement>(
  (achievementsJson as unknown as Achievement[]).map((achievement) => [
    achievement.id,
    achievement,
  ]),
)

export const characters = new Map<number, Character>(
  (charactersJson as unknown as Character[]).map((character) => [character.id, character]),
)
