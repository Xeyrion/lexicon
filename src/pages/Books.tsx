import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  Download,
  FileDown,
  Library,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { BookCard } from '../components/BookCard'
import { BookCover } from '../components/BookCover'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { useRegistry } from '../hooks/useRegistry'
import { personalMeta } from '../lib/books'
import { parseImport } from '../lib/import'
import { PERSONAL_TEMPLATE, personalWordsToCsv } from '../lib/personal'
import { useAppStore } from '../store/appStore'

interface Message {
  type: 'ok' | 'error'
  text: string
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function downloadTemplate() {
  downloadCsv('learnword-template.csv', PERSONAL_TEMPLATE)
}

export default function Books() {
  const { registry, error } = useRegistry()
  const currentBookId = useAppStore((state) => state.currentBookId)
  const progress = useAppStore((state) => state.progress)
  const personalWords = useAppStore((state) => state.personalWords)
  const setCurrentBook = useAppStore((state) => state.setCurrentBook)
  const addPersonalWord = useAppStore((state) => state.addPersonalWord)
  const importPersonalWords = useAppStore((state) => state.importPersonalWords)
  const removePersonalWord = useAppStore((state) => state.removePersonalWord)

  const fileRef = useRef<HTMLInputElement>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [word, setWord] = useState('')
  const [meaning, setMeaning] = useState('')
  const [phoneticUS, setPhoneticUS] = useState('')
  const [phoneticUK, setPhoneticUK] = useState('')
  const [message, setMessage] = useState<Message | null>(null)

  const personal = personalMeta(personalWords)
  const personalLearned = Math.min(
    personal.wordCount,
    Object.values(progress).filter((record) => record.bookId === 'personal').length,
  )
  const personalPercent =
    personal.wordCount === 0 ? 0 : Math.round((personalLearned / personal.wordCount) * 100)

  const learnedFor = (bookId: string, wordCount: number) =>
    Math.min(
      wordCount,
      Object.values(progress).filter((record) => record.bookId === bookId).length,
    )

  const submitWord = (event: FormEvent) => {
    event.preventDefault()
    const errorMessage = addPersonalWord({
      word,
      trans: meaning.split(/\n|\||[;；]/),
      phoneticUS,
      phoneticUK,
    })
    if (errorMessage) {
      setMessage({ type: 'error', text: errorMessage })
      return
    }
    setMessage({ type: 'ok', text: `已添加「${word.trim()}」` })
    setWord('')
    setMeaning('')
    setPhoneticUS('')
    setPhoneticUK('')
  }

  const handleExport = () => {
    if (personalWords.length === 0) {
      setMessage({ type: 'error', text: '词库还没有单词，先添加或导入一些吧。' })
      return
    }
    downloadCsv(
      `learnword-personal-${new Date().toISOString().slice(0, 10)}.csv`,
      personalWordsToCsv(personalWords),
    )
    setMessage({ type: 'ok', text: `已导出 ${personalWords.length} 个单词。` })
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const result = parseImport(text, file.name)
      if (result.words.length === 0) {
        setMessage({ type: 'error', text: '没有读到可导入的单词，请检查文件格式。' })
        return
      }
      const added = importPersonalWords(result.words)
      const duplicates = result.words.length - added
      setMessage({
        type: added > 0 ? 'ok' : 'error',
        text:
          added > 0
            ? `已导入 ${added} 个单词${result.skipped + duplicates > 0 ? `，跳过 ${result.skipped + duplicates} 个` : ''}。`
            : `没有新增单词，${result.skipped + duplicates} 个重复或无效。`,
      })
    } catch {
      setMessage({ type: 'error', text: '文件解析失败，请使用 CSV 或 JSON 格式。' })
    } finally {
      input.value = ''
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Library"
        title="词书架"
        description="选一本词书，或者把自己的单词收进来。所有词书共享同一套记忆节奏，进度各自独立。"
      />

      {error ? (
        <EmptyState
          icon={Library}
          title="内置词书加载失败"
          description={error}
          action={
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              重新加载
            </button>
          }
        />
      ) : !registry ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-[8.6rem] animate-pulse rounded-[1.6rem] bg-sunken/70" />
          ))}
        </div>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {registry.books.map((meta) => (
            <BookCard
              key={meta.id}
              book={meta}
              active={meta.id === currentBookId}
              learned={learnedFor(meta.id, meta.wordCount)}
              onSelect={setCurrentBook}
            />
          ))}
        </section>
      )}

      <section className="surface-card overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <BookCover
              id="personal"
              name="Personal"
              nameZh="我的词库"
              level="自定义"
              large
              className="h-[8.4rem] w-[6.2rem]"
            />
            <div>
              <p className="kicker">Custom deck</p>
              <h2 className="display mt-2 text-2xl text-ink">我的词库</h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
                手动添加或导入自己的单词。适合整理阅读中遇到的生词，也可以只背自己的专业词汇。
              </p>
              <p className="mt-3 text-xs text-faint">
                {personal.wordCount} 个词 · 已学 {personalLearned} 个
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowAdd((value) => !value)}
            >
              <Plus size={15} />
              添加单词
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
              <Upload size={15} />
              导入
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.json,.txt,text/csv,application/json,text/plain"
              className="hidden"
              onChange={handleImport}
            />
            <button
              type="button"
              className="btn btn-secondary disabled:opacity-40"
              onClick={handleExport}
              disabled={personalWords.length === 0}
            >
              <Download size={15} />
              导出
            </button>
            <button type="button" className="btn btn-ghost" onClick={downloadTemplate}>
              <FileDown size={15} />
              CSV 模板
            </button>
          </div>
        </div>

        {message && (
          <p
            className={`mt-4 rounded-xl border px-3 py-2 text-xs ${
              message.type === 'ok'
                ? 'border-forest/25 bg-forest-soft text-forest'
                : 'border-accent/25 bg-accent-wash text-accent'
            }`}
          >
            {message.text}
          </p>
        )}

        {showAdd && (
          <form onSubmit={submitWord} className="mt-6 rounded-2xl border border-line bg-paper-deep/30 p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-muted">单词</span>
                <input
                  className="input"
                  value={word}
                  onChange={(event) => setWord(event.target.value)}
                  placeholder="serendipity"
                  required
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-muted">释义（每行一条）</span>
                <textarea
                  className="input min-h-[2.8rem] resize-y"
                  value={meaning}
                  onChange={(event) => setMeaning(event.target.value)}
                  placeholder="意外发现美好事物的运气"
                  rows={2}
                  required
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-muted">美式音标（可选）</span>
                <input
                  className="input"
                  value={phoneticUS}
                  onChange={(event) => setPhoneticUS(event.target.value)}
                  placeholder="/ˌserənˈdɪpəti/"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-muted">英式音标（可选）</span>
                <input
                  className="input"
                  value={phoneticUK}
                  onChange={(event) => setPhoneticUK(event.target.value)}
                  placeholder="/ˌserənˈdɪpəti/"
                />
              </label>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setShowAdd(false)}>
                收起
              </button>
              <button type="submit" className="btn btn-primary">
                添加
              </button>
            </div>
          </form>
        )}

        <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="flex items-center justify-between">
              <p className="kicker">词条</p>
              <span className="text-[10px] text-faint">
                {personalWords.length > 12 ? '仅显示前 12 个' : `${personalWords.length} 个`}
              </span>
            </div>
            {personalWords.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed border-line px-4 py-8 text-center text-xs text-faint">
                还没有自己的单词。添加一个，或导入 CSV / JSON。
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface/60">
                {personalWords.slice(0, 12).map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="display truncate text-[0.98rem] text-ink">{item.word}</p>
                      <p className="truncate text-[11px] text-faint">{item.trans[0]}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePersonalWord(item.id)}
                      className="icon-button h-8 w-8 shrink-0 hover:text-accent"
                      aria-label={`删除 ${item.word}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-paper-deep/25 p-5">
            <p className="kicker">开始学习</p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              自建词库也会按 FSRS 安排复习。先添加几个词，再开始。
            </p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-sunken">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-700"
                style={{ width: `${personalPercent}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-faint">
              <span>
                {personalLearned} / {personal.wordCount}
              </span>
              <span>{personalPercent}%</span>
            </div>
            {personal.wordCount > 0 ? (
              <Link
                to="/study?book=personal"
                onClick={() => setCurrentBook('personal')}
                className="btn btn-primary mt-5 w-full"
              >
                <Sparkles size={15} />
                学习我的词库
              </Link>
            ) : (
              <span className="btn btn-secondary mt-5 w-full cursor-not-allowed opacity-50">
                先添加单词
              </span>
            )}
            <p className="mt-4 text-[10px] leading-relaxed text-faint">
              CSV 列：word, meaning, phoneticUS, phoneticUK。也支持 JSON 数组或 {'{ words: [] }'}。
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
