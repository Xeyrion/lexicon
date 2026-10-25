import { useEffect, useState } from 'react'
import type { BookRegistry } from '../types'
import { getRegistry } from '../lib/books'

export function useRegistry() {
  const [registry, setRegistry] = useState<BookRegistry | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getRegistry()
      .then((data) => {
        if (!cancelled) setRegistry(data)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '词库加载失败')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { registry, error }
}
