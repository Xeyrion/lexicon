import { useCallback, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { ArrowLeft, RotateCcw, Undo2 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { ReaderText } from '../components/reader/ReaderText'
import { WordPanel } from '../components/reader/WordPanel'
import { LIGHTHOUSE_STORY } from '../data/lighthouse'
import { useReaderDictionary } from '../hooks/useReaderDictionary'
import { findNode, isChoiceAvailable, resolveNodeText } from '../lib/story'
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

  const story = useMemo(
    () => [LIGHTHOUSE_STORY, ...imported].find((item) => item.id === storyId),
    [imported, storyId],
  )
  const save = story ? saves[story.id] : undefined
  const storyMeta = story ? meta[story.id] : undefined
  const node = story && save ? findNode(story, save.nodeId) : undefined

  const panel = useMemo<ReaderLookup | null>(() => {
    if (!panelQuery) return null
    return { kind: 'word', query: panelQuery, entry: lookupWord(panelQuery), words: [] }
  }, [lookupWord, panelQuery])

  const closePanel = useCallback(() => {
    setPanelQuery(null)
    setActiveToken(null)
  }, [])

  const handleClick = (event: ReactMouseEvent<HTMLElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-word]')
    if (!target) return
    const raw = target.dataset.word
    if (!raw) return
    setPanelQuery(raw)
    setActiveToken({
      paragraph: Number(target.dataset.paragraph),
      token: Number(target.dataset.token),
    })
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
          <article
            className="surface-card px-6 py-8 sm:px-10 sm:py-10"
            onClick={handleClick}
          >
            <div className="mx-auto max-w-[42rem]">
              <ReaderText
                text={resolveNodeText(node, save.vars)}
                fontSize={fontSize}
                activeToken={activeToken}
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
              {choices.map((choice) => {
                const available = isChoiceAvailable(choice, save.vars)
                return (
                  <button
                    key={choice.id}
                    type="button"
                    disabled={!available}
                    onClick={() => choose(story, choice.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition-colors ${
                      available
                        ? 'border-line bg-surface text-ink hover:border-accent/40 hover:bg-accent-wash'
                        : 'cursor-not-allowed border-line/60 bg-sunken/40 text-faint'
                    }`}
                  >
                    {choice.label}
                    {!available && (
                      <span className="ml-2 text-[10px] text-faint">（条件还不满足）</span>
                    )}
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
