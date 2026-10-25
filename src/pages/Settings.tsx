import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Check,
  Database,
  Download,
  Info,
  Monitor,
  Moon,
  RotateCcw,
  Sun,
  Target,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { speakWord } from '../lib/speech'
import { waitForReaderHydration } from '../lib/useReaderHydrated'
import { useAppStore } from '../store/appStore'
import {
  articlesWithProgress,
  useReaderProgressStore,
} from '../store/readerProgressStore'
import { DEFAULT_READER_SETTINGS, useReaderStore } from '../store/readerStore'
import type { Accent, ReaderArticle, ReaderSettings, Snapshot, ThemeMode } from '../types'

interface Message {
  type: 'ok' | 'error'
  text: string
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="surface-card p-6 sm:p-7">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sunken text-muted">
          <Icon size={16} strokeWidth={1.8} />
        </span>
        <div>
          <h2 className="display text-xl text-ink">{title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description: string
}) {
  return (
    <div className="flex items-center justify-between gap-5 py-3">
      <div>
        <p className="text-sm text-ink">{label}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-faint">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-line-strong'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string; icon?: LucideIcon }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-full border border-line bg-surface p-1">
      {options.map((option) => {
        const Icon = option.icon
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors ${
              active ? 'bg-ink text-paper' : 'text-muted hover:bg-sunken hover:text-ink'
            }`}
          >
            {Icon && <Icon size={13} strokeWidth={1.8} />}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
]

const ACCENT_OPTIONS: { value: Accent; label: string }[] = [
  { value: 'us', label: '美式' },
  { value: 'uk', label: '英式' },
]

function parseReaderSnapshot(
  value: unknown,
): { articles: ReaderArticle[]; settings: ReaderSettings } | null {
  if (!value || typeof value !== 'object') return null
  const source = value as { articles?: unknown; settings?: unknown }
  if (!Array.isArray(source.articles)) return null

  const articles: ReaderArticle[] = []
  for (const item of source.articles) {
    if (!item || typeof item !== 'object') return null
    const article = item as Partial<ReaderArticle>
    if (
      typeof article.id !== 'string' ||
      typeof article.title !== 'string' ||
      typeof article.source !== 'string' ||
      typeof article.text !== 'string' ||
      typeof article.createdAt !== 'string' ||
      typeof article.updatedAt !== 'string' ||
      typeof article.progress !== 'number' ||
      !Number.isFinite(article.progress) ||
      typeof article.wordCount !== 'number' ||
      !Number.isFinite(article.wordCount) ||
      (article.lastReadAt !== undefined && typeof article.lastReadAt !== 'string')
    ) {
      return null
    }
    articles.push({
      id: article.id,
      title: article.title,
      source: article.source,
      text: article.text,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
      progress: Math.min(1, Math.max(0, article.progress)),
      wordCount: Math.max(0, Math.round(article.wordCount)),
      ...(article.lastReadAt ? { lastReadAt: article.lastReadAt } : {}),
    })
  }

  const rawSettings =
    source.settings && typeof source.settings === 'object'
      ? (source.settings as Partial<ReaderSettings>)
      : {}
  const fontSize =
    typeof rawSettings.fontSize === 'number' && Number.isFinite(rawSettings.fontSize)
      ? Math.min(26, Math.max(16, Math.round(rawSettings.fontSize)))
      : DEFAULT_READER_SETTINGS.fontSize

  return { articles, settings: { fontSize } }
}

export default function Settings() {
  const settings = useAppStore((state) => state.settings)
  const setSetting = useAppStore((state) => state.setSetting)
  const snapshot = useAppStore((state) => state.snapshot)
  const restore = useAppStore((state) => state.restore)
  const resetProgress = useAppStore((state) => state.resetProgress)
  const resetAll = useAppStore((state) => state.resetAll)

  const importRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [confirm, setConfirm] = useState<'none' | 'progress' | 'all'>('none')

  const handleExport = async () => {
    if (!(await waitForReaderHydration())) {
      setMessage({ type: 'error', text: '阅读库还在加载，请稍后再试。' })
      return
    }
    const reader = useReaderStore.getState()
    const data: Snapshot = {
      ...snapshot(),
      version: 2,
      reader: {
        articles: articlesWithProgress(reader.articles),
        settings: reader.settings,
      },
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `lexicon-backup-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setMessage({ type: 'ok', text: '备份已导出，包含学习记录与阅读库。' })
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    try {
      const data = JSON.parse(await file.text()) as unknown
      const hasReader =
        Boolean(data) &&
        typeof data === 'object' &&
        'reader' in (data as Record<string, unknown>)
      const reader = hasReader
        ? parseReaderSnapshot((data as { reader?: unknown }).reader)
        : null
      if (hasReader && !reader) {
        setMessage({ type: 'error', text: '备份中的阅读库内容不完整。' })
        return
      }
      if (reader && !(await waitForReaderHydration())) {
        setMessage({ type: 'error', text: '阅读库还在加载，请稍后再试。' })
        return
      }
      const error = restore(data)
      if (error) {
        setMessage({ type: 'error', text: error })
        return
      }
      if (reader) {
        useReaderStore.setState({ articles: reader.articles, settings: reader.settings })
        useReaderProgressStore.getState().replaceAll(reader.articles)
      }
      setMessage({
        type: 'ok',
        text: reader ? '备份已恢复，学习记录和阅读库已更新。' : '备份已恢复，学习记录已更新。',
      })
    } catch {
      setMessage({ type: 'error', text: '文件解析失败，请选择词间导出的 JSON 备份。' })
    } finally {
      input.value = ''
    }
  }

  const handleResetProgress = () => {
    if (confirm !== 'progress') {
      setConfirm('progress')
      return
    }
    resetProgress()
    setConfirm('none')
    setMessage({ type: 'ok', text: '学习进度已清空，个人词库保留。' })
  }

  const handleResetAll = async () => {
    if (confirm !== 'all') {
      setConfirm('all')
      return
    }
    await resetAll()
    window.location.reload()
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Preferences"
        title="设置"
        description="调成你习惯的节奏。所有设置与学习记录都保存在本机本地文件中。"
      />

      {message && (
        <p
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs ${
            message.type === 'ok'
              ? 'border-forest/25 bg-forest-soft text-forest'
              : 'border-accent/25 bg-accent-wash text-accent'
          }`}
        >
          <Check size={14} />
          {message.text}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          icon={Target}
          title="学习计划"
          description="每日新词与复习上限，决定今天会排给你多少张卡片。复习上限是软上限，超出的词会留在待复习队列。"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink">每日新词</span>
            <span className="display text-xl text-ink">{settings.dailyNew}</span>
          </div>
          <input
            type="range"
            className="range mt-3"
            min={5}
            max={60}
            step={5}
            value={settings.dailyNew}
            onChange={(event) => setSetting('dailyNew', Number(event.target.value))}
            aria-label="每日新词数量"
          />
          <div className="mt-1 flex justify-between text-[10px] text-faint">
            <span>5</span>
            <span>建议 10–30</span>
            <span>60</span>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <span className="text-sm text-ink">每日复习上限</span>
            <span className="display text-xl text-ink">
              {settings.dailyReview === 0 ? '不限' : settings.dailyReview}
            </span>
          </div>
          <input
            type="range"
            className="range mt-3 disabled:opacity-40"
            min={20}
            max={200}
            step={10}
            value={settings.dailyReview === 0 ? 60 : settings.dailyReview}
            disabled={settings.dailyReview === 0}
            onChange={(event) => setSetting('dailyReview', Number(event.target.value))}
            aria-label="每日复习上限"
          />
          <div className="mt-1 flex justify-between text-[10px] text-faint">
            <span>20</span>
            <span>建议 60–120</span>
            <span>200</span>
          </div>

          <div className="mt-4 divide-y divide-line border-t border-line">
            <Toggle
              checked={settings.dailyReview === 0}
              onChange={(value) => setSetting('dailyReview', value ? 0 : 60)}
              label="不限复习上限"
              description="超出的到期词会留在待复习队列，随时可以继续。"
            />
            <Toggle
              checked={settings.showDefinition}
              onChange={(value) => setSetting('showDefinition', value)}
              label="显示英文释义"
              description="在释义下方折叠展示 ECDICT 的英文解释。"
            />
          </div>
        </Section>

        <Section
          icon={Volume2}
          title="发音"
          description="使用浏览器系统语音（Web Speech API），音色与可用口音取决于你的设备。"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-ink">默认口音</span>
            <Segmented
              value={settings.accent}
              options={ACCENT_OPTIONS}
              onChange={(value) => setSetting('accent', value)}
            />
          </div>

          <div className="mt-6 flex items-center justify-between">
            <span className="text-sm text-ink">语速</span>
            <span className="display text-xl text-ink">{settings.rate.toFixed(2)}×</span>
          </div>
          <input
            type="range"
            className="range mt-3"
            min={0.7}
            max={1.3}
            step={0.05}
            value={settings.rate}
            onChange={(event) => setSetting('rate', Number(event.target.value))}
            aria-label="语音速度"
          />
          <div className="mt-1 flex justify-between text-[10px] text-faint">
            <span>慢</span>
            <span>正常</span>
            <span>快</span>
          </div>

          <div className="mt-4 divide-y divide-line border-t border-line">
            <Toggle
              checked={settings.autoSpeak}
              onChange={(value) => setSetting('autoSpeak', value)}
              label="自动发音"
              description="切换到新卡片时自动朗读单词。"
            />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void speakWord('serendipity', settings.accent, settings.rate)}
            >
              <Volume2 size={15} />
              试听
            </button>
            <span className="text-[10px] text-faint">试听词：serendipity</span>
          </div>
        </Section>

        <Section
          icon={Sun}
          title="外观"
          description="浅色是暖纸与墨色，深色是夜读模式。"
        >
          <Segmented
            value={settings.theme}
            options={THEME_OPTIONS}
            onChange={(value) => setSetting('theme', value)}
          />
          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-line bg-paper p-3">
              <span className="kicker">Paper</span>
              <p className="display mt-2 text-lg text-ink">Aa</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <span className="kicker">Surface</span>
              <p className="display mt-2 text-lg text-ink">Aa</p>
            </div>
            <div className="rounded-xl border border-line bg-sunken p-3">
              <span className="kicker">Accent</span>
              <p className="display mt-2 text-lg text-accent">Aa</p>
            </div>
          </div>
        </Section>

        <Section
          icon={Database}
          title="数据"
          description="数据保存在本地文件中，可导出包含学习记录、个人词库和阅读文章的 JSON 备份。"
        >
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary" onClick={handleExport}>
              <Download size={15} />
              导出备份
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => importRef.current?.click()}>
              <Upload size={15} />
              导入备份
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImport}
            />
          </div>

          <div className="mt-6 space-y-3 border-t border-line pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-ink">清空学习进度</p>
                <p className="mt-0.5 text-[11px] text-faint">保留个人词库与设置。</p>
              </div>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleResetProgress}
                onBlur={() => setConfirm('none')}
              >
                <RotateCcw size={14} />
                {confirm === 'progress' ? '确认清空？' : '清空进度'}
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-ink">清除全部数据</p>
                <p className="mt-0.5 text-[11px] text-faint">设置、进度、个人词库和阅读文章都会删除。</p>
              </div>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleResetAll}
                onBlur={() => setConfirm('none')}
              >
                <Trash2 size={14} />
                {confirm === 'all' ? '再次点击确认' : '全部清除'}
              </button>
            </div>
          </div>
        </Section>
      </div>

      <section className="surface-card p-6 sm:p-7">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sunken text-muted">
            <Info size={16} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h2 className="display text-xl text-ink">关于词间</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              一个安静、克制的英语背单词工具。本地优先，无账号，无广告。
            </p>
          </div>
        </div>
        <div className="mt-6 grid gap-4 text-[11px] leading-relaxed text-muted sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-paper-deep/25 p-4">
            <p className="kicker">数据来源</p>
            <p className="mt-2">
              中文释义与词频来自{' '}
              <a className="text-accent hover:underline" href="https://github.com/skywind3000/ECDICT" target="_blank" rel="noreferrer">
                ECDICT
              </a>
              （MIT）；英美音标来自{' '}
              <a className="text-accent hover:underline" href="https://github.com/open-dict-data/ipa-dict" target="_blank" rel="noreferrer">
                ipa-dict
              </a>
              （MIT）。
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-paper-deep/25 p-4">
            <p className="kicker">技术</p>
            <p className="mt-2">
              记忆算法使用{' '}
              <a className="text-accent hover:underline" href="https://github.com/open-spaced-repetition/ts-fsrs" target="_blank" rel="noreferrer">
                ts-fsrs
              </a>
              ；界面基于 React、Tailwind CSS；发音由 Web Speech API 提供。
            </p>
          </div>
        </div>
        <p className="mt-5 text-[10px] text-faint">词间 Lexicon · v0.1.0 · 数据只属于你</p>
      </section>
    </div>
  )
}
