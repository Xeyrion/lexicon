/**
 * English overlay for the remake data.
 *
 * The engine keeps the Chinese source; this module only supplies display text.
 * Files are the per-batch outputs under `src/game/i18n/en/`; `import.meta.glob`
 * keeps the merge automatic as batches are added.
 */
interface EventFile {
  events?: Record<string, string>
  posts?: Record<string, string>
}

interface ItemFile {
  items?: Record<string, { name: string; description: string }>
}

const eventFiles = import.meta.glob('./events/*.json', { eager: true }) as Record<
  string,
  EventFile
>
const talentFiles = import.meta.glob('./talents/*.json', { eager: true }) as Record<
  string,
  ItemFile
>
const achievementFiles = import.meta.glob('./achievements/*.json', { eager: true }) as Record<
  string,
  ItemFile
>

export const enEvents = new Map<number, string>()
export const enPosts = new Map<number, string>()
export const enTalents = new Map<number, { name: string; description: string }>()
export const enAchievements = new Map<number, { name: string; description: string }>()

for (const file of Object.values(eventFiles)) {
  for (const [id, text] of Object.entries(file.events ?? {})) enEvents.set(Number(id), text)
  for (const [id, text] of Object.entries(file.posts ?? {})) enPosts.set(Number(id), text)
}

for (const file of Object.values(talentFiles)) {
  for (const [id, item] of Object.entries(file.items ?? {})) enTalents.set(Number(id), item)
}

for (const file of Object.values(achievementFiles)) {
  for (const [id, item] of Object.entries(file.items ?? {})) enAchievements.set(Number(id), item)
}

export const coverage = {
  events: enEvents.size,
  posts: enPosts.size,
  talents: enTalents.size,
  achievements: enAchievements.size,
}
