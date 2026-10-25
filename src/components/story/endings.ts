import type { Story } from '../../types'

/**
 * Counts against `story.endings`, not the unlocked list: a save can outlive the
 * story it belongs to (a re-import with fewer endings), and a stale id must not
 * push the counter past the denominator.
 */
export function countUnlocked(story: Story, unlocked: string[]): number {
  const ids = new Set(unlocked)
  return story.endings.filter((ending) => ids.has(ending.id)).length
}
