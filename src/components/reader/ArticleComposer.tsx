import { useRef, useState, type ChangeEvent, type ClipboardEvent, type FormEvent } from 'react'
import { ArrowRight, FileText, Sparkles, Upload, X } from 'lucide-react'
import type { ReaderArticle } from '../../types'
import {
  MAX_ARTICLE_CHARS,
  countWords,
  defaultArticleTitle,
  prepareArticleBody,
  readingMinutes,
} from '../../lib/reader'
import { useReaderStore } from '../../store/readerStore'

const SAMPLE = {
  title: 'The Quiet Practice of Noticing',
  body: `In the age of constant notification, attention has become a scarce resource. We move through the day with our eyes fixed on screens, answering messages before we have finished a thought. Yet the world is still there, waiting to be noticed.

A short walk without headphones can change the texture of an afternoon. You hear the dry leaves, the distant train, the pause between two conversations. You see how light falls across a wall. None of this is useful in the ordinary sense, and that is precisely the point.

Noticing is not the same as concentration. Concentration is a task; noticing is a mood. It asks us to look forward to the unknown rather than rush past it. In spite of its quietness, it can make a day feel larger.

Try it for ten minutes. Leave the phone in your pocket. Let one thing surprise you.`,
}

interface ArticleComposerProps {
  article?: ReaderArticle
  onSave: (article: ReaderArticle) => void
  onCancel?: () => void
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
    setTitle(SAMPLE.title)
    setText(SAMPLE.body)
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
      onSave(updated)
      return
    }
    onSave(createArticle(payload))
  }

  return (
    <form onSubmit={submit} className="surface-card overflow-hidden">
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
