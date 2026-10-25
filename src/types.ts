export type Accent = 'us' | 'uk'
export type ThemeMode = 'light' | 'dark' | 'system'
export type GradeKey = 'again' | 'hard' | 'good' | 'easy'

export interface WordEntry {
  id: string
  word: string
  phoneticUS: string
  phoneticUK: string
  phoneticAlt: string
  trans: string[]
  definition: string[]
  pos: string
  tags: string[]
  rank: number
}

export interface WordBook {
  id: string
  name: string
  nameZh: string
  description: string
  level: string
  wordCount: number
  words: WordEntry[]
  custom?: boolean
}

export interface BookMeta {
  id: string
  name: string
  nameZh: string
  description: string
  level: string
  wordCount: number
  file?: string
  custom?: boolean
}

export interface BookRegistry {
  generatedAt: string
  sources: { name: string; url: string; license: string }[]
  books: BookMeta[]
}

export interface SerializedCard {
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: number
  last_review?: string
}

export interface CardRecord {
  bookId: string
  wordId: string
  card: SerializedCard
  introducedAt: string
  updatedAt: string
  reviews: number
}

export interface DayStat {
  date: string
  newCount: number
  reviewCount: number
  uniqueReviewCount?: number
  again: number
  hard: number
  good: number
  easy: number
}

export interface Settings {
  accent: Accent
  dailyNew: number
  dailyReview: number
  autoSpeak: boolean
  rate: number
  theme: ThemeMode
  showDefinition: boolean
}

export interface PersonalWord extends WordEntry {
  addedAt: string
}

export interface ReaderSnapshot {
  articles: ReaderArticle[]
  settings: ReaderSettings
}

export interface Snapshot {
  app: 'lexicon'
  version: 1 | 2
  exportedAt: string
  settings: Settings
  currentBookId: string
  progress: Record<string, CardRecord>
  days: Record<string, DayStat>
  personalWords: PersonalWord[]
  reader?: ReaderSnapshot
}

export type SessionStage = 'new' | 'review' | 'learning' | 'relearning'

export interface SessionCard {
  word: WordEntry
  kind: 'new' | 'review'
  stage?: SessionStage
  record?: CardRecord
  requeued?: boolean
}

export interface PendingSessionCard {
  card: SessionCard
  dueAt: number
}

/**
 * Where the reader actually was: the first visible word token. Stored next to
 * the scroll percentage because percentages drift when fonts or images change
 * the document height.
 */
export interface ReaderAnchor {
  paragraph: number
  token: number
}

export interface ReaderArticle {
  id: string
  title: string
  source: string
  text: string
  createdAt: string
  updatedAt: string
  lastReadAt?: string
  progress: number
  anchor?: ReaderAnchor
  wordCount: number
}

export interface ReaderSettings {
  fontSize: number
}

export type ReaderWordTuple = [
  string,
  string,
  string,
  string,
  string,
  string[],
  string,
  string[],
  number,
]

export interface ReaderLexicon {
  generatedAt: string
  sources: { name: string; url: string; license: string }[]
  words: ReaderWordTuple[]
  aliases: Record<string, string>
}

export type ReaderPhraseTuple = [string, string, string[], string, string[], number]

export interface ReaderPhraseData {
  generatedAt: string
  phrases: ReaderPhraseTuple[]
}
