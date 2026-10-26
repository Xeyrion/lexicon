import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw, Square, Undo2 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { InlineWords, ReaderText } from '../components/reader/ReaderText'
import { WordPanel } from '../components/reader/WordPanel'
import { LIGHTHOUSE_STORY } from '../data/lighthouse'
import { useReaderDictionary } from '../hooks/useReaderDictionary'
import { findNode, isChoiceAvailable, resolveNodeText } from '../lib/story'
import {
  englishVoices,
  listVoices,
  speakPassage,
  splitSentences,
  type PassageController,
} from '../lib/speech'
import { useAppStore } from '../store/appStore'
import { useStoryStore } from '../store/storyStore'
import { useReaderStore } from '../store/readerStore'
import type { ReaderLookup } from '../components/reader/types'
import type { Story, StorySave } from '../types'

function pathLabels(story: Story, save: StorySave): string[] {
  const labels: string[] = []
  for (const step of save.history) {
    const node = findNode(story, step.nodeId)
    const choice = node?.choices?.find((item) => item.id === step.choiceId)
    if (choice) labels.push(choice.label)
  }
  return labels
}

export default function StoryReader() {
  const { storyId } = useParams<{ storyId: string }>()
  const imported = useStoryStore((state) => state.stories)
  const saves = useStoryStore((state) => state.saves)
  const meta = useStoryStore((state) => state.meta)
  const startStory = useStoryStore((state) => state.startStory)
  const choose = useStoryStore((state) => state.choose)
  const undo = useStoryStore((state) => state.undo)

  const fontSize = useReaderStore((state) => state.settings.fontSize)
  const accent = useAppStore((state) => state.settings.accent)
  const rate = useAppStore((state) => state.settings.rate)
  const personalWords = useAppStore((state) => state.personalWords)
  const addPersonalWord = useAppStore((state) => state.addPersonalWord)

  const {
    lookupWord,
    loading: dictionaryLoading,
    wordLoading,
    wordError,
    retry: retryDictionary,
  } = useReaderDictionary()

  const [panelQuery, setPanelQuery] = useState<string | null>(null)
  const [activeToken, setActiveToken] = useState<{ paragraph: number; token: number } | null>(null)
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  const [voiceMissing, setVoiceMissing] = useState(false)
  const playerRef = useRef<PassageController | null>(null)

  const story = useMemo(
    () => [LIGHTHOUSE_STORY, ...imported].find((item) => item.id === storyId),
    [imported, storyId],
  )
  const save = story ? saves[story.id] : undefined
  const storyMeta = story ? meta[story.id] : undefined
  const node = story && save ? findNode(story, save.nodeId) : undefined

  const nodeText = node && save ? resolveNodeText(node, save.vars) : ''
  const sentences = splitSentences(nodeText)

  const stopSpeaking = useCallback(() => {
    playerRef.current?.stop()
    playerRef.current = null
    setSpeakingIndex(null)
    setPaused(false)
  }, [])

  // Changing node or leaving the page must not keep talking. Cleanup only, so
  // this never sets state during render/effect.
  useEffect(() => {
    return () => {
      playerRef.current?.stop()
      playerRef.current = null
    }
  }, [node?.id])

  const startSpeaking = async () => {
    const voices = await listVoices()
    if (englishVoices(voices).length === 0) {
      setVoiceMissing(true)
      return
    }
    setVoiceMissing(false)
    setPaused(false)
    playerRef.current = speakPassage(nodeText, {
      accent,
      rate,
      onSentence: (index) => setSpeakingIndex(index),
      onEnd: () => {
        setSpeakingIndex(null)
        setPaused(false)
      },
      onUnavailable: () => {
        setSpeakingIndex(null)
        setVoiceMissing(true)
      },
    })
  }

  const toggleSpeaking = () => {
    if (speakingIndex === null) {
      void startSpeaking()
      return
    }
    if (paused) {
      playerRef.current?.resume()
      setPaused(false)
    } else {
      playerRef.current?.pause()
      setPaused(true)
    }
  }

  const panel = useMemo<ReaderLookup | null>(() => {
    if (!panelQuery) return null
    return { kind: 'word', query: panelQuery, entry: lookupWord(panelQuery), words: [] }
  }, [lookupWord, panelQuery])

  const closePanel = useCallback(() => {
    setPanelQuery(null)
    setActiveToken(null)
  }, [])

  const openWordAt = (target: HTMLElement) => {
    const raw = target.dataset.word
    if (!raw) return
    setPanelQuery(raw)
    setActiveToken({
      paragraph: Number(target.dataset.paragraph),
      token: Number(target.dataset.token),
    })
  }

  const handleClick = (event: ReactMouseEvent<HTMLElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-word]')
    if (target) openWordAt(target)
  }

  const addEntry = useCallback(
    (entry: Parameters<typeof addPersonalWord>[0]) => addPersonalWord(entry),
    [addPersonalWord],
  )

  if (!story) {
    return (
      <EmptyState
        icon={RotateCcw}
        title="故事没有找到"
        description="它可能已经被删除，或者链接不完整。"
        action={
          <Link to="/stories" className="btn btn-primary">
            回到故事列表
          </Link>
        }
      />
    )
  }

  const ending = node?.ending
    ? story.endings.find((item) => item.id === node.ending)
    : undefined
  const choices = node?.choices ?? []
  const path = save ? pathLabels(story, save) : []
  const totalNodes = story.nodes.length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/stories"
          className="inline-flex items-center gap-2 text-xs text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} strokeWidth={1.8} />
          故事
        </Link>
        <span className="text-[11px] text-faint">·</span>
        <p className="text-xs text-muted">{story.title}</p>
        {story.level && <span className="chip">{story.level}</span>}
        {save && (
          <span className="ml-auto text-[10px] tabular-nums text-faint">
            已探索 {save.visited.length}/{totalNodes} 个节点
          </span>
        )}
      </div>

      {!save && (
        <section className="surface-card p-6 sm:p-8">
          <p className="kicker">Story</p>
          <h1 className="display mt-3 text-[2rem] leading-tight text-ink">{story.title}</h1>
          {story.author && <p className="mt-1 text-xs text-muted">{story.author}</p>}
          {story.description && (
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">{story.description}</p>
          )}
          <p className="mt-4 text-[11px] leading-relaxed text-faint">
            {story.nodes.length} 个段落 · {story.endings.length} 个结局 · 点击正文里的单词可以查词
          </p>
          <button
            type="button"
            className="btn btn-primary mt-6"
            onClick={() => startStory(story)}
          >
            开始
          </button>
        </section>
      )}

      {save && !node && (
        <section className="surface-card p-6 sm:p-8">
          <p className="text-sm text-ink">这个故事更新过，旧的存档对不上了。</p>
          <p className="mt-1 text-[11px] leading-relaxed text-faint">
            为了不把你的进度接到错误的位置，这里没有自动修复。你可以重新开始。
          </p>
          <button
            type="button"
            className="btn btn-primary mt-5"
            onClick={() => startStory(story)}
          >
            重新开始
          </button>
        </section>
      )}

      {save && node && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary text-xs"
              onClick={toggleSpeaking}
              aria-label={speakingIndex === null ? '朗读这一段' : paused ? '继续朗读' : '暂停朗读'}
            >
              {speakingIndex !== null && !paused ? <Pause size={14} /> : <Play size={14} />}
              {speakingIndex === null ? '朗读' : paused ? '继续' : '暂停'}
            </button>
            {speakingIndex !== null && (
              <button
                type="button"
                className="btn btn-ghost text-xs"
                onClick={stopSpeaking}
                aria-label="停止朗读"
              >
                <Square size={12} />
                停止
              </button>
            )}
            {speakingIndex !== null && sentences[speakingIndex] && (
              <span className="text-[10px] tabular-nums text-faint">
                {speakingIndex + 1} / {sentences.length}
              </span>
            )}
          </div>

          {voiceMissing && (
            <p className="rounded-xl border border-accent/25 bg-accent-wash px-4 py-3 text-[11px] leading-relaxed text-accent">
              系统里没有英文语音，朗读用不了（现在也不会拿中文语音去念英文）。Windows：设置 →
              时间和语言 → 语音 → 添加语音 → English (United States)。macOS：系统设置 →
              辅助功能 → 朗读内容 → 系统声音 → 管理声音。
            </p>
          )}

          <article
            className="surface-card px-6 py-8 sm:px-10 sm:py-10"
            onClick={handleClick}
          >
            <div className="mx-auto max-w-[42rem]">
              <ReaderText
                text={nodeText}
                fontSize={fontSize}
                activeToken={activeToken}
                highlightText={
                  speakingIndex !== null ? (sentences[speakingIndex]?.text ?? null) : null
                }
              />
            </div>
          </article>

          {ending ? (
            <section className="surface-card p-6 sm:p-8">
              <p className="kicker">Ending</p>
              <h2 className="display mt-2 text-2xl text-ink">{ending.name}</h2>
              {path.length > 0 && (
                <p className="mt-3 text-[11px] leading-relaxed text-faint">
                  你走过的路：{path.join(' → ')}
                </p>
              )}
              <p className="mt-4 text-[11px] text-faint">
                已解锁 {storyMeta?.unlockedEndings.length ?? 0}/{story.endings.length} 个结局
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => startStory(story)}
                >
                  再玩一次
                </button>
                <Link to="/stories" className="btn btn-secondary">
                  回到故事列表
                </Link>
              </div>
            </section>
          ) : (
            <section className="space-y-2">
              <p className="px-1 text-[10px] text-faint">
                整行都能点选；只有点到单词时是查词（单词会亮一下）。
              </p>
              {choices.map((choice, index) => {
                const available = isChoiceAvailable(choice, save.vars)
                return (
                  <button
                    key={choice.id}
                    type="button"
                    data-choice={choice.id}
                    disabled={!available}
                    // Whole row chooses; only a click that lands on a word is a
                    // lookup. Words highlight on hover, so the split is visible.
                    onClick={(event) => {
                      const word = (event.target as HTMLElement).closest<HTMLElement>(
                        '[data-word]',
                      )
                      if (word) {
                        openWordAt(word)
                        return
                      }
                      choose(story, choice.id)
                    }}
                    className={`group flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm leading-relaxed transition-colors ${
                      available
                        // No row background on hover: the word's own wash has to
                        // stay the only highlight, or "am I on a word?" is unreadable.
                        ? 'border-line bg-surface text-ink hover:border-accent/40'
                        : 'cursor-not-allowed border-line/60 bg-sunken/40 text-faint'
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <InlineWords
                        text={choice.label}
                        paragraph={-10 - index}
                        activeToken={activeToken}
                        wordClassName="choice-word"
                      />
                      {!available && (
                        <span className="ml-1 text-[10px] text-faint">（条件还不满足）</span>
                      )}
                    </span>
                    <ArrowRight
                      size={16}
                      strokeWidth={1.8}
                      aria-hidden="true"
                      className={`shrink-0 transition-transform ${
                        available
                          ? 'text-faint group-hover:translate-x-0.5 group-hover:text-accent'
                          : 'text-faint'
                      }`}
                    />
                  </button>
                )
              })}
            </section>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <button
              type="button"
              className="btn btn-ghost text-xs disabled:opacity-40"
              onClick={() => undo(story)}
              disabled={save.history.length === 0}
            >
              <Undo2 size={14} />
              撤销一步
            </button>
            <button
              type="button"
              className="btn btn-ghost text-xs text-accent"
              onClick={() => {
                if (window.confirm('重新开始会丢掉当前这一周目的进度，确定吗？')) startStory(story)
              }}
            >
              重新开始
            </button>
            <span className="ml-auto text-[10px] text-faint">
              {dictionaryLoading
                ? '正在加载词典…'
                : wordError
                  ? '词典加载失败，查词不可用'
                  : '点击单词查看释义'}
            </span>
          </div>
        </>
      )}

      {panel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[1.75rem] border border-line bg-surface p-6 shadow-[var(--shadow-float)]">
            <WordPanel
              key={`word:${panel.query}`}
              lookup={panel}
              accent={accent}
              rate={rate}
              personalWords={personalWords}
              loading={wordLoading}
              error={wordError}
              onRetry={retryDictionary}
              onAdd={addEntry}
              onOpenWord={(raw) => setPanelQuery(raw)}
              onClose={closePanel}
            />
          </div>
        </div>
      )}
    </div>
  )
}
