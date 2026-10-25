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

function errorMessage(reason: unknown, fallback: string): string {
  if (reason instanceof SyntaxError) return '词典文件格式异常，请重试'
  if (reason instanceof Error && reason.message) {
    if (/failed to fetch|networkerror|load failed/i.test(reason.message)) {
      return '网络请求失败，请检查网络后重试'
    }
    const httpStatus = reason.message.match(/阅读词典加载失败（(\d+)）/)
    if (httpStatus) return `服务返回 ${httpStatus[1]}，请稍后重试`
    return reason.message
  }
  return fallback
}

export function useReaderDictionary() {
  const personalWords = useAppStore((state) => state.personalWords)
  const [lexicon, setLexicon] = useState<ReaderLexicon | null>(null)
  const [phraseData, setPhraseData] = useState<ReaderPhraseData | null>(null)
  const [lexiconError, setLexiconError] = useState<string | null>(null)
  const [phraseError, setPhraseError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    // 两个文件独立加载：短语加载失败不影响单词查询，反之亦然。
    getReaderLexicon()
      .then((next) => {
        if (!cancelled) setLexicon(next)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setLexiconError(errorMessage(reason, '单词词典加载失败'))
      })
    getReaderPhrases()
      .then((next) => {
        if (!cancelled) setPhraseData(next)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setPhraseError(errorMessage(reason, '短语词典加载失败'))
      })

    return () => {
      cancelled = true
    }
  }, [attempt])

  const words = useMemo(() => {
    if (!lexicon) return null
    const map = new Map<string, WordEntry>()
    for (const tuple of lexicon.words) {
      const entry = entryFromWordTuple(tuple)
      map.set(entry.id, entry)
    }
    return map
  }, [lexicon])

  const phrases = useMemo(() => {
    if (!phraseData) return null
    const map = new Map<string, WordEntry>()
    for (const tuple of phraseData.phrases) {
      const entry = entryFromPhraseTuple(tuple)
      map.set(entry.id, entry)
    }
    return map
  }, [phraseData])

  const aliases = lexicon?.aliases

  const personalMap = useMemo(
    () => new Map(personalWords.map((word) => [word.id, word])),
    [personalWords],
  )

  const lookupWord = useCallback(
    (raw: string): WordEntry | null => {
      for (const candidate of lookupCandidates(raw)) {
        const personal = personalMap.get(candidate)
        if (personal) return personal

        const direct = words?.get(candidate)
        const aliasKey = aliases?.[candidate]
        const alias = aliasKey ? words?.get(aliasKey) : undefined

        if (prefersAlias(direct, alias)) return alias ?? direct ?? null
        if (direct) return direct
        if (alias) return alias
      }
      return personalMap.get(normalizeLookup(raw)) ?? null
    },
    [aliases, personalMap, words],
  )

  const lookupPhrase = useCallback(
    (raw: string): WordEntry | null => {
      const phrase = normalizePhrase(raw)
      if (!phrase) return null
      return personalMap.get(phrase) ?? phrases?.get(phrase) ?? null
    },
    [personalMap, phrases],
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

  const retry = useCallback(() => {
    setLexiconError(null)
    setPhraseError(null)
    setAttempt((value) => value + 1)
  }, [])
  const wordLoading = !words && !lexiconError
  const phraseLoading = !phrases && !phraseError

  return {
    loading: wordLoading || phraseLoading,
    wordLoading,
    phraseLoading,
    error: lexiconError ?? phraseError,
    wordError: lexiconError,
    phraseError,
    wordCount: lexicon?.words.length ?? 0,
    phraseCount: phraseData?.phrases.length ?? 0,
    retry,
    lookupWord,
    lookupPhrase,
    lookupWordsInPhrase,
  }
}
