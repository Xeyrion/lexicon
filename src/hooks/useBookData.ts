import { useEffect, useMemo, useState } from 'react'
import type { WordBook } from '../types'
import { getBook, makePersonalBook } from '../lib/books'
import { useAppStore } from '../store/appStore'

interface RemoteBook {
  id: string
  book: WordBook | null
  error: string | null
}

export function useBookData(bookId: string) {
  const personalWords = useAppStore((state) => state.personalWords)
  const personalBook = useMemo(
    () => (bookId === 'personal' ? makePersonalBook(personalWords) : null),
    [bookId, personalWords],
  )
  const [remote, setRemote] = useState<RemoteBook>({ id: '', book: null, error: null })

  useEffect(() => {
    if (bookId === 'personal') return
    let cancelled = false

    getBook(bookId)
      .then((data) => {
        if (cancelled) return
        setRemote({ id: bookId, book: data, error: null })
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setRemote({
          id: bookId,
          book: null,
          error: reason instanceof Error ? reason.message : '词库加载失败',
        })
      })

    return () => {
      cancelled = true
    }
  }, [bookId])

  if (bookId === 'personal') {
    return { book: personalBook, loading: false, error: null }
  }

  const current = remote.id === bookId
  return {
    book: current ? remote.book : null,
    loading: !current,
    error: current ? remote.error : null,
  }
}
