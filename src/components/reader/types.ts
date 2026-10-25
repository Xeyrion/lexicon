import type { WordEntry } from '../../types'

export interface ReaderRect {
  top: number
  right: number
  bottom: number
  left: number
  width: number
  height: number
}

export interface ReaderLookup {
  kind: 'word' | 'phrase'
  query: string
  entry: WordEntry | null
  words: { word: string; entry: WordEntry | null }[]
}
