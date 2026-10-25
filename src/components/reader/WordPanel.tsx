import { useState } from 'react'
import { Check, Copy, Plus, Volume2, X } from 'lucide-react'
import type { Accent, PersonalWord, WordEntry } from '../../types'
import { speakWord } from '../../lib/speech'
import { PhoneticLine } from '../PhoneticLine'
import type { ReaderLookup } from './types'

const TAG_LABELS: Record<string, string> = {
  zk: '中考',
  gk: '高考',
  cet4: 'CET-4',
  cet6: 'CET-6',
  ky: '考研',
  ielts: 'IELTS',
  toefl: 'TOEFL',
  gre: 'GRE',
}

interface WordPanelProps {
  lookup: ReaderLookup
  accent: Accent
  rate: number
  personalWords: PersonalWord[]
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  onAdd: (entry: WordEntry) => string | null
  onOpenWord: (word: string) => void
  onClose: () => void
}

export function WordPanel({
  lookup,
  accent,
  rate,
  personalWords,
  loading = false,
  error = null,
  onRetry,
  onAdd,
  onOpenWord,
  onClose,
}: WordPanelProps) {
  const entry = lookup.entry
  const isPersonal = entry ? personalWords.some((word) => word.id === entry.id) : false
  const [message, setMessage] = useState<string | null>(null)

  const add = () => {
    if (!entry) return
    const error = onAdd(entry)
    setMessage(error ?? '已加入生词本')
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(entry?.word ?? lookup.query)
      setMessage('已复制')
    } catch {
      setMessage('复制失败，请手动选择文本')
    }
  }

  const tags = entry?.tags.filter((tag) => TAG_LABELS[tag]).slice(0, 4) ?? []
  const hasPhonetic = Boolean(entry?.phoneticUS || entry?.phoneticUK || entry?.phoneticAlt)

  return (
    <div className="surface-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="kicker">{lookup.kind === 'phrase' ? 'Phrase' : 'Word'}</p>
          <h2 className="display mt-2 break-words text-[2rem] leading-[1.05] text-ink">
            {entry?.word ?? lookup.query}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          {entry && (
            <button
              type="button"
              className="icon-button h-9 w-9"
              onClick={() => void speakWord(entry.word, accent, rate)}
              aria-label="播放发音"
              title="播放发音"
            >
              <Volume2 size={16} strokeWidth={1.8} />
            </button>
          )}
          <button type="button" className="icon-button -mr-2 h-9 w-9" onClick={onClose} aria-label="关闭词条">
            <X size={17} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {entry && hasPhonetic && (
        <div className="mt-4">
          <PhoneticLine
            word={entry.word}
            us={entry.phoneticUS}
            uk={entry.phoneticUK}
            alt={entry.phoneticAlt}
            accent={accent}
            rate={rate}
          />
        </div>
      )}

      {entry ? (
        <div className="mt-5 space-y-2">
          {entry.trans.map((line) => (
            <p key={line} className="text-sm leading-relaxed text-ink-soft">
              {line}
            </p>
          ))}
        </div>
      ) : loading ? (
        <div className="mt-5 rounded-xl border border-dashed border-line bg-sunken/50 p-4">
          <p className="text-sm text-muted">
            {lookup.kind === 'phrase' ? '短语词典加载中…' : '词典加载中…'}
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
            加载完成后会自动显示查询结果，无需重新点击。
          </p>
        </div>
      ) : error ? (
        <div className="mt-5 rounded-xl border border-dashed border-line bg-sunken/50 p-4">
          <p className="text-sm text-accent">词典加载失败</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-faint">{error}</p>
          {onRetry && (
            <button type="button" className="btn btn-secondary mt-3" onClick={onRetry}>
              重试加载
            </button>
          )}
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-line bg-sunken/50 p-4">
          <p className="text-sm text-muted">
            {lookup.kind === 'phrase' ? '词典暂未收录这个短语。' : '词典暂未收录这个词。'}
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
            可以先逐个查看单词，或复制后到个人词库手动添加。
          </p>
        </div>
      )}

      {tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="chip">
              {TAG_LABELS[tag]}
            </span>
          ))}
        </div>
      )}

      {lookup.kind === 'phrase' && lookup.words.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-faint">包含单词</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {lookup.words.map((item, index) => (
              <button
                key={`${item.word}-${index}`}
                type="button"
                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  item.entry
                    ? 'border-line bg-surface text-ink hover:border-accent/40 hover:text-accent'
                    : 'border-dashed border-line text-faint hover:text-muted'
                }`}
                onClick={() => onOpenWord(item.word)}
              >
                {item.word}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex gap-2">
        {entry && (
          <button
            type="button"
            className="btn btn-primary flex-1"
            onClick={add}
            disabled={isPersonal}
          >
            {isPersonal ? (
              <>
                <Check size={15} strokeWidth={2} />
                已在生词本
              </>
            ) : (
              <>
                <Plus size={15} strokeWidth={2} />
                加入生词本
              </>
            )}
          </button>
        )}
        <button
          type="button"
          className={`btn btn-secondary ${entry ? 'px-3.5' : 'flex-1'}`}
          onClick={() => void copy()}
          aria-label={lookup.kind === 'phrase' ? '复制短语' : '复制单词'}
        >
          <Copy size={15} strokeWidth={1.8} />
          {!entry && (lookup.kind === 'phrase' ? '复制短语' : '复制单词')}
        </button>
      </div>

      {message && <p className="mt-2 text-[11px] text-accent">{message}</p>}
      {entry && (
        <p className="mt-3 text-[10px] leading-relaxed text-faint">
          加入后可在「词库 → 个人词库」里继续复习。
        </p>
      )}
    </div>
  )
}
