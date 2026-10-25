import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
} from 'react'
import { ArrowRight, FileText, History, Sparkles, Upload, X } from 'lucide-react'
import type { ReaderArticle } from '../../types'
import {
  MAX_ARTICLE_CHARS,
  countWords,
  defaultArticleTitle,
  prepareArticleBody,
  readingMinutes,
} from '../../lib/reader'
import { useArticleDraft, type ArticleDraft } from '../../hooks/useArticleDraft'
import { SAMPLE_ARTICLE } from '../../lib/sampleArticle'
import { useReaderStore } from '../../store/readerStore'

interface ArticleComposerProps {
  article?: ReaderArticle
  onSave: (article: ReaderArticle) => void
  onCancel?: () => void
}

function formatClock(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number) => `${value}`.padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function ArticleComposer({ article, onSave, onCancel }: ArticleComposerProps) {
  const createArticle = useReaderStore((state) => state.createArticle)
  const updateArticle = useReaderStore((state) => state.updateArticle)
  const fileRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(article?.title ?? '')
  const [text, setText] = useState(article?.text ?? '')
  const [source, setSource] = useState(article?.source ?? '粘贴')
  const [error, setError] = useState<string | null>(null)
  const editing = Boolean(article)

  const applyDraft = useCallback((draft: ArticleDraft) => {
    setTitle(draft.title)
    setText(draft.text)
    setSource(draft.source)
    setError(null)
  }, [])

  const { pendingDraft, restoreDraft, discardDraft, clearDraft } = useArticleDraft({
    articleId: article?.id,
    title,
    text,
    source,
    onRestore: applyDraft,
  })

  const words = countWords(text)
  const minutes = readingMinutes(words)
  const tooLong = text.length > MAX_ARTICLE_CHARS

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (text.trim()) return
    const pasted = event.clipboardData.getData('text')
    if (!pasted.trim()) return
    event.preventDefault()
    const markdown = /^\s*#{1,6}\s+/m.test(pasted) || /```/.test(pasted)
    setText(prepareArticleBody(pasted, { markdown }))
    setSource('粘贴')
    setError(null)
  }

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    try {
      if (file.size > MAX_ARTICLE_CHARS * 4) {
        setError('文件太大了，请控制在 20 万字符以内。')
        return
      }
      const raw = await file.text()
      const markdown = /\.md$|\.markdown$/i.test(file.name)
      setTitle(file.name.replace(/\.[^.]+$/, ''))
      setText(prepareArticleBody(raw, { markdown }))
      setSource(file.name)
      setError(null)
    } catch {
      setError('文件读取失败，请换一个 .txt 或 .md 文件。')
    } finally {
      input.value = ''
    }
  }

  const loadSample = () => {
    setTitle(SAMPLE_ARTICLE.title)
    setText(SAMPLE_ARTICLE.body)
    setSource('示例文章')
    setError(null)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const body = text.trim()
    if (!body) {
      setError(editing ? '正文不能为空。' : '先粘贴一篇文章，或者导入 .txt / .md 文件。')
      return
    }
    if (body.length > MAX_ARTICLE_CHARS) {
      setError('文章太长了，请控制在 20 万字符以内。')
      return
    }
    if (countWords(body) === 0) {
      setError('没有检测到英文单词，请检查内容。')
      return
    }
    const payload = {
      title: title.trim() || defaultArticleTitle(),
      text: body,
      source: source || '粘贴',
    }
    if (article) {
      const updated = updateArticle(article.id, payload)
      if (!updated) {
        setError('文章已经不存在了，可能已被删除。')
        return
      }
      clearDraft()
      onSave(updated)
      return
    }
    const created = createArticle(payload)
    clearDraft()
    onSave(created)
  }

  return (
    <form onSubmit={submit} className="surface-card overflow-hidden">
      {pendingDraft && (
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-accent-wash px-6 py-3 sm:px-8">
          <History size={15} className="shrink-0 text-accent" strokeWidth={1.8} />
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-soft">
            发现未保存的草稿（保存于 {formatClock(pendingDraft.savedAt)}）
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-line bg-surface px-3 py-1 text-[11px] font-medium text-ink transition-colors hover:border-accent/40 hover:text-accent"
              onClick={restoreDraft}
            >
              恢复
            </button>
            <button
              type="button"
              className="rounded-full px-3 py-1 text-[11px] text-muted transition-colors hover:bg-surface-muted hover:text-ink"
              onClick={discardDraft}
            >
              丢弃
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 border-b border-line px-6 py-6 sm:flex-row sm:items-end sm:justify-between sm:px-8">
        <div>
          <p className="kicker">{editing ? 'Edit reading' : 'New reading'}</p>
          <h2 className="display mt-2 text-2xl text-ink">
            {editing ? '修改这篇文章' : '把文章放进来'}
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {editing
              ? '改完标题或正文后保存，阅读进度会保留。'
              : '粘贴网页文章，或导入纯文本与 Markdown。提交后会自动保存到阅读库。'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!editing && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={15} strokeWidth={1.8} />
                导入文件
              </button>
              <button type="button" className="btn btn-ghost" onClick={loadSample}>
                <Sparkles size={15} strokeWidth={1.8} />
                试试示例
              </button>
            </>
          )}
          {onCancel && (
            <button
              type="button"
              className="icon-button"
              onClick={onCancel}
              aria-label={editing ? '取消编辑' : '收起编辑器'}
            >
              <X size={18} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>

      <div className="px-6 py-6 sm:px-8">
        <label className="block">
          <span className="text-[11px] font-medium tracking-wide text-muted">标题</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            className="input mt-2"
            placeholder="手动填写标题，留空会使用默认标题"
          />
        </label>

        <label className="mt-5 block">
          <span className="flex items-center justify-between text-[11px] font-medium tracking-wide text-muted">
            <span>正文</span>
            <span className="flex items-center gap-1.5 font-normal text-faint">
              <FileText size={12} strokeWidth={1.8} />
              {source}
            </span>
          </span>
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.currentTarget.value)
              if (error) setError(null)
            }}
            onPaste={handlePaste}
            className="input mt-2 min-h-[18rem] resize-y px-5 py-4 text-[0.95rem] leading-relaxed"
            placeholder="在这里粘贴英文文章。"
            spellCheck={false}
          />
        </label>

        {error && <p className="mt-3 text-xs text-accent">{error}</p>}

        <div className="mt-5 flex flex-col gap-4 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-faint">
            {words > 0 ? `${words.toLocaleString('zh-CN')} 个词 · 约 ${minutes} 分钟` : '还没有内容'}
            {tooLong && <span className="ml-2 text-accent">内容超过 20 万字符</span>}
            <span className="ml-2">· 提交后自动保存</span>
          </p>
          <div className="flex items-center justify-end gap-2">
            <button type="submit" className="btn btn-primary" disabled={!text.trim() || tooLong}>
              {editing ? '保存修改' : '开始阅读'}
              <ArrowRight size={15} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".txt,.md,.markdown,text/plain,text/markdown"
        className="hidden"
        onChange={handleFile}
      />
    </form>
  )
}
