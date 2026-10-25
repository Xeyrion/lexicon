import type { ReaderLexicon, ReaderPhraseData } from '../types'

const BASE = import.meta.env.BASE_URL

let lexiconPromise: Promise<ReaderLexicon> | null = null
let phrasePromise: Promise<ReaderPhraseData> | null = null

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`阅读词典加载失败（${response.status}）`)
  }
  return (await response.json()) as T
}

export function getReaderLexicon(): Promise<ReaderLexicon> {
  if (!lexiconPromise) {
    lexiconPromise = fetchJson<ReaderLexicon>(`${BASE}data/reader/lexicon.json`).catch((error) => {
      lexiconPromise = null
      throw error
    })
  }
  return lexiconPromise
}

export function getReaderPhrases(): Promise<ReaderPhraseData> {
  if (!phrasePromise) {
    phrasePromise = fetchJson<ReaderPhraseData>(`${BASE}data/reader/phrases.json`).catch((error) => {
      phrasePromise = null
      throw error
    })
  }
  return phrasePromise
}
