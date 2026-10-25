import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReaderLexicon, ReaderPhraseData, WordEntry } from '../types'
import { getReaderLexicon, getReaderPhrases } from '../lib/readerData'
import {
  entryFromPhraseTuple,
  entryFromWordTuple,
  lookupCandidates,
  normalizeLookup,
  normalizePhrase,
  prefersAlias,
} from '../lib/reader'
import { useAppStore } from '../store/appStore'

export interface PhraseWord {
  word: string
  entry: WordEntry | null
}

export function useReaderDictionary() {
  const personalWords = useAppStore((state) => state.personalWords)
  const [lexicon, setLexicon] = useState<ReaderLexicon | null>(null)
  const [phraseData, setPhraseData] = useState<ReaderPhraseData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([getReaderLexicon(), getReaderPhrases()])
      .then(([nextLexicon, nextPhrases]) => {
        if (cancelled) return
        setLexicon(nextLexicon)
        setPhraseData(nextPhrases)
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setError(reason instanceof Error ? reason.message : '阅读词典加载失败')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const maps = useMemo(() => {
    if (!lexicon || !phraseData) return null
    const words = new Map<string, WordEntry>()
    for (const tuple of lexicon.words) {
      const entry = entryFromWordTuple(tuple)
      words.set(entry.id, entry)
    }
    const phrases = new Map<string, WordEntry>()
    for (const tuple of phraseData.phrases) {
      const entry = entryFromPhraseTuple(tuple)
      phrases.set(entry.id, entry)
    }
    return { words, phrases, aliases: lexicon.aliases }
  }, [lexicon, phraseData])

  const personalMap = useMemo(
    () => new Map(personalWords.map((word) => [word.id, word])),
    [personalWords],
  )

  const lookupWord = useCallback(
    (raw: string): WordEntry | null => {
      for (const candidate of lookupCandidates(raw)) {
        const personal = personalMap.get(candidate)
        if (personal) return personal

        const direct = maps?.words.get(candidate)
        const aliasKey = maps?.aliases[candidate]
        const alias = aliasKey ? maps?.words.get(aliasKey) : undefined

        if (prefersAlias(direct, alias)) return alias ?? direct ?? null
        if (direct) return direct
        if (alias) return alias
      }
      return personalMap.get(normalizeLookup(raw)) ?? null
    },
    [maps, personalMap],
  )

  const lookupPhrase = useCallback(
    (raw: string): WordEntry | null => {
      const phrase = normalizePhrase(raw)
      if (!phrase) return null
      return personalMap.get(phrase) ?? maps?.phrases.get(phrase) ?? null
    },
    [maps, personalMap],
  )

  const lookupWordsInPhrase = useCallback(
    (raw: string): PhraseWord[] => {
      return normalizePhrase(raw)
        .split(' ')
        .filter(Boolean)
        .map((word) => ({ word, entry: lookupWord(word) }))
    },
    [lookupWord],
  )

  return {
    loading: !maps && !error,
    error,
    wordCount: lexicon?.words.length ?? 0,
    phraseCount: phraseData?.phrases.length ?? 0,
    lookupWord,
    lookupPhrase,
    lookupWordsInPhrase,
  }
}
