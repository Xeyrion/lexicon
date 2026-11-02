import { BookOpenText, Languages, MousePointer2 } from 'lucide-react'

/** The right-hand card that explains lookup before anything is selected. */
export function ReaderHint({
  loading,
  error,
  wordCount,
  phraseCount,
  onRetry,
}: {
  loading: boolean
  error: string | null
  wordCount: number
  phraseCount: number
  onRetry: () => void
}) {
  if (loading && !error) {
    return (
      <div className="surface-flat animate-pulse p-5">
        <div className="h-3 w-20 rounded-full bg-sunken" />
        <div className="mt-4 h-5 w-36 rounded-full bg-sunken" />
        <div className="mt-4 space-y-2">
          <div className="h-3 rounded-full bg-sunken/70" />
          <div className="h-3 w-4/5 rounded-full bg-sunken/70" />
        </div>
      </div>
    )
  }

  return (
    <div className="surface-flat p-5">
      <p className="kicker">Dictionary</p>
      <p className="display mt-3 text-xl text-ink">读的时候，随手查</p>
      {error ? (
        <div className="mt-3">
          <p className="text-xs leading-relaxed text-accent">{error}</p>
          <button type="button" className="btn btn-secondary mt-3 w-full" onClick={onRetry}>
            重试加载
          </button>
        </div>
      ) : (
        <>
          <ul className="mt-4 space-y-2.5 text-[11px] leading-relaxed text-muted">
            <li className="flex items-start gap-2">
              <MousePointer2 size={13} className="mt-0.5 shrink-0 text-accent" strokeWidth={1.8} />
              悬停单词，看简要释义
            </li>
            <li className="flex items-start gap-2">
              <BookOpenText size={13} className="mt-0.5 shrink-0 text-accent" strokeWidth={1.8} />
              点击单词，固定完整词条
            </li>
            <li className="flex items-start gap-2">
              <Languages size={13} className="mt-0.5 shrink-0 text-accent" strokeWidth={1.8} />
              选中多个词，查短语
            </li>
          </ul>
          <p className="mt-4 border-t border-line pt-3 text-[10px] text-faint">
            {wordCount.toLocaleString('zh-CN')} 个词条 · {phraseCount.toLocaleString('zh-CN')} 个短语
          </p>
        </>
      )}
    </div>
  )
}
