import { useCallback, useEffect, useRef, useState } from 'react'

/** 输入停顿多久之后写一次草稿。 */
const DRAFT_DELAY = 400
const NEW_DRAFT_KEY = 'lexicon:draft:new'
const EDIT_DRAFT_PREFIX = 'lexicon:draft:edit:'

export interface ArticleDraft {
  title: string
  text: string
  source: string
  savedAt: number
}

type DraftContent = Omit<ArticleDraft, 'savedAt'>

interface ArticleDraftInput {
  /** 编辑模式传文章 id，新建模式不传。 */
  articleId?: string
  title: string
  text: string
  source: string
  onRestore: (draft: ArticleDraft) => void
}

function readDraft(key: string): ArticleDraft | null {
  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { title, text, source, savedAt } = parsed as Record<string, unknown>
    if (
      typeof title !== 'string' ||
      typeof text !== 'string' ||
      typeof source !== 'string' ||
      typeof savedAt !== 'number' ||
      !Number.isFinite(savedAt)
    ) {
      return null
    }
    // 空草稿没有恢复价值，当作不存在。
    if (!text.trim()) return null
    return { title, text, source, savedAt }
  } catch {
    return null
  }
}

function writeDraft(key: string, draft: ArticleDraft): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // 隐私模式或配额已满时静默放弃：草稿是尽力而为，不该打断写作。
  }
}

function removeDraft(key: string): void {
  try {
    window.sessionStorage.removeItem(key)
  } catch {
    // 同上，读不到存储也不影响编辑器。
  }
}

/**
 * 把编辑器内容以草稿形式存进 sessionStorage：关掉标签页就失效，
 * 不写进 reader.json，避免污染用户的真实数据和备份。
 */
export function useArticleDraft({ articleId, title, text, source, onRestore }: ArticleDraftInput) {
  const key = articleId ? `${EDIT_DRAFT_PREFIX}${articleId}` : NEW_DRAFT_KEY
  // 进入组件时的内容，用来判断「和原文一致」。
  const original = useRef<DraftContent>({ title, text, source })
  // 上一次写过草稿的内容，用来区分「用户真的改了」和「只是重渲染」。
  const lastSeen = useRef<DraftContent>({ title, text, source })
  const timerRef = useRef<number | null>(null)
  const [pendingDraft, setPendingDraft] = useState<ArticleDraft | null>(() => {
    const stored = readDraft(key)
    if (!stored) return null
    const same =
      stored.title === title && stored.text === text && stored.source === source
    return same ? null : stored
  })

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    const last = lastSeen.current
    if (title === last.title && text === last.text && source === last.source) return

    lastSeen.current = { title, text, source }
    // 用户开始自己写东西了，旧草稿已经过时，不必再问要不要恢复。
    setPendingDraft(null)

    const blank = text.trim().length === 0
    const untouched =
      title === original.current.title &&
      text === original.current.text &&
      source === original.current.source
    if (blank || untouched) {
      removeDraft(key)
      return
    }

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      writeDraft(key, { title, text, source, savedAt: Date.now() })
    }, DRAFT_DELAY)

    return stopTimer
  }, [key, title, text, source, stopTimer])

  const clearDraft = useCallback(() => {
    stopTimer()
    removeDraft(key)
  }, [key, stopTimer])

  const restoreDraft = useCallback(() => {
    if (!pendingDraft) return
    onRestore(pendingDraft)
    setPendingDraft(null)
  }, [onRestore, pendingDraft])

  const discardDraft = useCallback(() => {
    clearDraft()
    setPendingDraft(null)
  }, [clearDraft])

  return { pendingDraft, restoreDraft, discardDraft, clearDraft }
}
