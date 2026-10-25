import { useRef, useState, type ChangeEvent } from 'react'
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Merge,
  Trash2,
  Upload,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { parseEpubBook, parseMarkdownBook } from '../lib/bookParse'
import { countWords } from '../lib/reader'
import { useImportDraft } from '../store/importDraft'
import { useLibraryStore } from '../store/libraryStore'

const MAX_FILE_BYTES = 40 * 1024 * 1024

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

export default function ImportBook() {
  const draft = useImportDraft((state) => state.draft)
  const setDraft = useImportDraft((state) => state.setDraft)
  const patchChapter = useImportDraft((state) => state.patchChapter)
  const removeChapter = useImportDraft((state) => state.removeChapter)
  const mergeIntoPrevious = useImportDraft((state) => state.mergeIntoPrevious)
  const moveChapter = useImportDraft((state) => state.moveChapter)
  const setMeta = useImportDraft((state) => state.setMeta)
  const addBook = useLibraryStore((state) => state.addBook)
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Kept so the split level can be re-applied without re-picking the file.
  const [markdown, setMarkdown] = useState<{ text: string; name: string } | null>(null)
  const [splitLevel, setSplitLevel] = useState('auto')

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    setError(null)
    if (file.size > MAX_FILE_BYTES) {
      setError(`文件约 ${Math.round(file.size / 1024 / 1024)} MB，超过 40 MB。`)
      input.value = ''
      return
    }
    setBusy(true)
    try {
      const fallback = stripExtension(file.name)
      let parsed
      if (/\.epub$/i.test(file.name)) {
        setMarkdown(null)
        parsed = parseEpubBook(new Uint8Array(await file.arrayBuffer()), fallback)
      } else {
        const text = await file.text()
        setMarkdown({ text, name: fallback })
        setSplitLevel('auto')
        parsed = parseMarkdownBook(text, fallback)
      }
      if (parsed.chapters.length === 0) {
        setError('这个文件里没有找到章节内容。')
        return
      }
      setDraft(parsed)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '解析失败，请换一个文件。')
    } finally {
      input.value = ''
      setBusy(false)
    }
  }

  const applySplitLevel = (value: string) => {
    if (!markdown) return
    setSplitLevel(value)
    setError(null)
    try {
      const level = value === 'auto' ? undefined : value === 'none' ? null : Number(value)
      setDraft(parseMarkdownBook(markdown.text, markdown.name, { level }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '重新切分失败。')
    }
  }

  const confirm = () => {
    if (!draft || draft.chapters.length === 0) return
    const book = addBook({
      title: draft.title,
      author: draft.author,
      source: draft.source,
      chapters: draft.chapters,
    })
    setDraft(null)
    navigate(`/library/${book.id}`)
  }

  const totalWords = draft
    ? draft.chapters.reduce((sum, chapter) => sum + countWords(chapter.text), 0)
    : 0

  return (
    <div className="space-y-6">
      <Link
        to="/library"
        className="inline-flex items-center gap-2 text-xs text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} strokeWidth={1.8} />
        回到书架
      </Link>

      <PageHeader
        eyebrow="Import"
        title={draft ? '确认目录' : '导入书籍'}
        description={
          draft
            ? '导入前先看一眼章节。切错了可以改名、合并、删除或调整顺序；确认之后才会写进书架。'
            : '支持 EPUB 和 Markdown。EPUB 的目录写在文件里，所以能直接切好；Markdown 按标题层级推断。'
        }
      />

      {error && (
        <p className="rounded-xl border border-accent/25 bg-accent-wash px-4 py-3 text-xs leading-relaxed text-accent">
          {error}
        </p>
      )}

      {!draft ? (
        <section className="surface-card p-6 sm:p-8">
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sunken text-muted">
              <BookOpen size={22} strokeWidth={1.6} />
            </span>
            <div>
              <p className="text-sm text-ink">选择一本 EPUB 或 Markdown 文件</p>
              <p className="mt-1 text-[11px] leading-relaxed text-faint">
                扫描版或带 DRM 的 EPUB 提取不出文字，会在这一步直接告诉你。
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              <Upload size={15} />
              {busy ? '解析中…' : '选择文件'}
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".epub,.md,.markdown,text/markdown"
            className="hidden"
            onChange={handleFile}
          />
        </section>
      ) : (
        <>
          <section className="surface-card p-6 sm:p-7">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-[11px] font-medium tracking-wide text-muted">书名</span>
                <input
                  className="input mt-2"
                  value={draft.title}
                  onChange={(event) => setMeta({ title: event.currentTarget.value })}
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium tracking-wide text-muted">作者</span>
                <input
                  className="input mt-2"
                  value={draft.author}
                  placeholder="可以留空"
                  onChange={(event) => setMeta({ author: event.currentTarget.value })}
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] text-faint">
                {draft.chapters.length} 章 · 约 {totalWords.toLocaleString('zh-CN')} 词 · 来源{' '}
                {draft.source === 'epub' ? 'EPUB' : 'Markdown'}
              </p>
              {markdown && (
                <label className="flex items-center gap-2 text-[11px] text-muted">
                  按哪一级标题切
                  <select
                    className="input w-auto py-1 text-[11px]"
                    value={splitLevel}
                    onChange={(event) => applySplitLevel(event.currentTarget.value)}
                  >
                    <option value="auto">自动推断</option>
                    <option value="1"># 一级</option>
                    <option value="2">## 二级</option>
                    <option value="3">### 三级</option>
                    <option value="4">#### 四级</option>
                    <option value="none">不切分</option>
                  </select>
                </label>
              )}
            </div>
          </section>

          <section className="surface-card overflow-hidden">
            <ul className="divide-y divide-line/70">
              {draft.chapters.map((chapter, index) => (
                <li key={`${index}-${chapter.title}`} className="px-5 py-3 sm:px-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-faint">
                      {index + 1}
                    </span>
                    <input
                      className="input min-w-0 flex-1 py-1.5 text-sm"
                      value={chapter.title}
                      onChange={(event) => patchChapter(index, event.currentTarget.value)}
                    />
                    <span className="shrink-0 text-[10px] tabular-nums text-faint">
                      {countWords(chapter.text).toLocaleString('zh-CN')} 词
                    </span>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        className="icon-button h-8 w-8"
                        onClick={() => moveChapter(index, -1)}
                        disabled={index === 0}
                        aria-label="上移"
                      >
                        <ArrowUp size={14} strokeWidth={1.8} />
                      </button>
                      <button
                        type="button"
                        className="icon-button h-8 w-8"
                        onClick={() => moveChapter(index, 1)}
                        disabled={index === draft.chapters.length - 1}
                        aria-label="下移"
                      >
                        <ArrowDown size={14} strokeWidth={1.8} />
                      </button>
                      <button
                        type="button"
                        className="icon-button h-8 w-8"
                        onClick={() => mergeIntoPrevious(index)}
                        disabled={index === 0}
                        aria-label="合并到上一章"
                        title="合并到上一章"
                      >
                        <Merge size={14} strokeWidth={1.8} />
                      </button>
                      <button
                        type="button"
                        className="icon-button h-8 w-8 text-accent"
                        onClick={() => removeChapter(index)}
                        disabled={draft.chapters.length <= 1}
                        aria-label="删除这一章"
                      >
                        <Trash2 size={14} strokeWidth={1.8} />
                      </button>
                    </div>
                  </div>
                  <p className="mt-1.5 line-clamp-2 pl-9 text-[10px] leading-relaxed text-faint">
                    {chapter.text.slice(0, 160)}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDraft(null)}
            >
              换一个文件
            </button>
            <button type="button" className="btn btn-primary" onClick={confirm}>
              <Check size={15} />
              导入 {draft.chapters.length} 章
            </button>
          </div>
        </>
      )}
    </div>
  )
}
