import { useRef, useState } from 'react'
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
import { BackupPanel } from '../components/settings/BackupPanel'
import { LocalDataPanel } from '../components/settings/LocalDataPanel'
import {
  ImportLimitDialog,
  ResetAllDialog,
  ResetProgressDialog,
  RestoreBackupDialog,
} from '../components/settings/dialogs'
import { Section, Segmented, Toggle } from '../components/settings/primitives'
import { useStorageData } from '../hooks/useStorageData'
import { speakWord } from '../lib/speech'
import { useAppStore } from '../store/appStore'
import type { Accent, ThemeMode } from '../types'

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
]

const ACCENT_OPTIONS: { value: Accent; label: string }[] = [
  { value: 'us', label: '美式' },
  { value: 'uk', label: '英式' },
]

export default function Settings() {
  const settings = useAppStore((state) => state.settings)
  const setSetting = useAppStore((state) => state.setSetting)
  const resetProgress = useAppStore((state) => state.resetProgress)
  const resetAll = useAppStore((state) => state.resetAll)
  const {
    message,
    setMessage,
    storageInfo,
    storageLoading,
    storageError,
    backupList,
    backupLoading,
    backupError,
    restoreTarget,
    restoreBusy,
    importBusy,
    quarantineBusy,
    refreshStorageInfo,
    refreshBackups,
    handleExport,
    handleImport,
    handleQuarantine,
    requestRestore,
    cancelRestore,
    confirmRestore,
    pendingLimit,
    limitBusy,
    requestLimitChange,
    cancelLimitChange,
    confirmLimitChange,
  } = useStorageData()

  const importRef = useRef<HTMLInputElement>(null)
  const [resetAllOpen, setResetAllOpen] = useState(false)
  const [resetProgressOpen, setResetProgressOpen] = useState(false)

  const handleResetProgress = () => {
    setResetProgressOpen(false)
    resetProgress()
    setMessage({ type: 'ok', text: '学习进度已清空，个人词库保留。' })
  }

  const handleResetAll = async () => {
    setResetAllOpen(false)
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
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => importRef.current?.click()}
              disabled={importBusy}
            >
              <Upload size={15} />
              {importBusy ? '导入中…' : '导入备份'}
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImport}
            />
          </div>

          <LocalDataPanel
            info={storageInfo}
            loading={storageLoading}
            error={storageError}
            onRefresh={refreshStorageInfo}
            onQuarantine={handleQuarantine}
            quarantineBusy={quarantineBusy}
            onChangeLimit={requestLimitChange}
            limitBusy={limitBusy}
          />
          <BackupPanel
            list={backupList}
            loading={backupLoading}
            error={backupError}
            onRefresh={refreshBackups}
            onRestore={requestRestore}
          />

          <div className="mt-6 space-y-3 border-t border-line pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-ink">清空学习进度</p>
                <p className="mt-0.5 text-[11px] text-faint">保留个人词库与设置。</p>
              </div>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setResetProgressOpen(true)}
              >
                <RotateCcw size={14} />
                清空进度
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-ink">清除全部数据</p>
                <p className="mt-0.5 text-[11px] text-faint">
                  设置、进度、个人词库和阅读文章都会删除，备份目录会保留。
                </p>
              </div>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setResetAllOpen(true)}
              >
                <Trash2 size={14} />
                全部清除
              </button>
            </div>
          </div>
        </Section>
      </div>

      {resetAllOpen && (
        <ResetAllDialog
          info={storageInfo}
          onCancel={() => setResetAllOpen(false)}
          onConfirm={handleResetAll}
        />
      )}
      {resetProgressOpen && (
        <ResetProgressDialog
          onCancel={() => setResetProgressOpen(false)}
          onConfirm={handleResetProgress}
        />
      )}
      {pendingLimit !== null && (
        <ImportLimitDialog
          from={storageInfo?.maxImportBytes ?? pendingLimit}
          to={pendingLimit}
          busy={limitBusy}
          onCancel={cancelLimitChange}
          onConfirm={() => void confirmLimitChange()}
        />
      )}
      {restoreTarget && (
        <RestoreBackupDialog
          entry={restoreTarget}
          busy={restoreBusy}
          onCancel={cancelRestore}
          onConfirm={confirmRestore}
        />
      )}

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
        <p className="mt-5 text-[10px] text-faint">
          词间 Lexicon · v{__APP_VERSION__} · 数据只属于你
        </p>
      </section>
    </div>
  )
}
