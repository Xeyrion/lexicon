import { useRef, useState, useSyncExternalStore, type ChangeEvent } from 'react'
import { Download, Upload } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { ReadingTabs } from '../components/ReadingTabs'
import { EndingAtlas } from '../components/story/EndingAtlas'
import { StoryCard } from '../components/story/StoryCard'
import { countUnlocked } from '../components/story/endings'
import { downloadStoryTemplate } from '../components/story/storyTemplate'
import { LIGHTHOUSE_STORY } from '../data/lighthouse'
import { validateStory } from '../lib/story'
import { parseImportedStory } from '../lib/validation'
import { useStoryStore } from '../store/storyStore'
import type { Story } from '../types'

const DESCRIPTION = '选一条路走到底。查词和生词本照样可用。'

interface Notice {
  tone: 'error' | 'ok'
  message: string
  details?: string[]
  more?: number
}

function useStoriesHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useStoryStore.persist.onFinishHydration(onChange),
    () => useStoryStore.persist.hasHydrated(),
    () => false,
  )
}

function StoriesSkeleton() {
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Stories" title="故事" description={DESCRIPTION} />
      <ReadingTabs />
      <div className="grid animate-pulse gap-4 sm:grid-cols-2">
        <div className="h-40 rounded-[1.25rem] bg-sunken/70" />
        <div className="h-40 rounded-[1.25rem] bg-sunken/70" />
      </div>
    </div>
  )
}

export default function Stories() {
  const hydrated = useStoriesHydrated()
  const imported = useStoryStore((state) => state.stories)
  const saves = useStoryStore((state) => state.saves)
  const meta = useStoryStore((state) => state.meta)
  const importStory = useStoryStore((state) => state.importStory)
  const removeStory = useStoryStore((state) => state.removeStory)

  const fileRef = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  /**
   * An imported story may reuse the built-in id. Rendering the plain
   * `[builtin, ...imported]` concat would then show two cards with one id (and
   * duplicate React keys), so the import takes the built-in's slot — which is
   * what the overwrite warning promises. Deleting it brings the built-in back.
   */
  const builtinOverride = imported.find((story) => story.id === LIGHTHOUSE_STORY.id)
  const stories: Story[] = [
    builtinOverride ?? LIGHTHOUSE_STORY,
    ...imported.filter((story) => story.id !== LIGHTHOUSE_STORY.id),
  ]
  const importedIds = new Set(imported.map((story) => story.id))

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    setNotice(null)

    let text: string
    try {
      text = await file.text()
    } catch {
      setNotice({ tone: 'error', message: '读取文件失败，请重试。' })
      return
    }

    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      setNotice({ tone: 'error', message: '文件不是有效的 JSON。' })
      return
    }

    const story = parseImportedStory(raw)
    if (!story) {
      setNotice({ tone: 'error', message: '这个文件不是故事格式。' })
      return
    }

    const errors = validateStory(story)
    if (errors.length > 0) {
      setNotice({
        tone: 'error',
        message: `这个故事有 ${errors.length} 处问题，已拒绝导入：`,
        details: errors.slice(0, 3),
        more: errors.length - 3,
      })
      return
    }

    const exists = [LIGHTHOUSE_STORY, ...imported].some((item) => item.id === story.id)
    if (exists && !window.confirm(`已有一部同名 id 的故事（${story.id}），导入会覆盖。继续？`)) {
      return
    }

    importStory(story)
    setNotice({
      tone: 'ok',
      message: `已导入《${story.title}》：${story.nodes.length} 个节点，${story.endings.length} 个结局。`,
    })
  }

  if (!hydrated) return <StoriesSkeleton />

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Stories" title="故事" description={DESCRIPTION} />

      <ReadingTabs />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={15} strokeWidth={1.8} />
          导入故事
        </button>
        <button type="button" className="btn btn-secondary" onClick={downloadStoryTemplate}>
          <Download size={15} strokeWidth={1.8} />
          导出模板
        </button>
        <span className="text-[11px] text-faint sm:ml-auto">{stories.length} 部故事</span>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`rounded-xl border px-4 py-3 ${
            notice.tone === 'error'
              ? 'border-accent/25 bg-accent-wash'
              : 'border-line bg-sunken/60'
          }`}
        >
          <p
            className={`text-xs leading-relaxed ${
              notice.tone === 'error' ? 'text-accent' : 'text-ink'
            }`}
          >
            {notice.message}
          </p>
          {notice.details && notice.details.length > 0 && (
            <ul className="mt-2 space-y-1">
              {notice.details.map((detail, index) => (
                <li
                  key={`${index}-${detail}`}
                  className="text-[11px] leading-relaxed text-accent/80"
                >
                  · {detail}
                </li>
              ))}
            </ul>
          )}
          {notice.more ? (
            <p className="mt-1.5 text-[10px] text-accent/70">还有 {notice.more} 条未列出。</p>
          ) : null}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {stories.map((story) => (
          <StoryCard
            key={story.id}
            story={story}
            unlocked={countUnlocked(story, meta[story.id]?.unlockedEndings ?? [])}
            hasSave={Boolean(saves[story.id])}
            onDelete={
              importedIds.has(story.id)
                ? () => {
                    if (
                      window.confirm(
                        `删除《${story.title}》？它的存档和结局进度也会一起删除。`,
                      )
                    ) {
                      removeStory(story.id)
                    }
                  }
                : undefined
            }
          />
        ))}
      </div>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="kicker">Endings</p>
            <h2 className="display mt-2 text-2xl text-ink">结局图鉴</h2>
          </div>
          <p className="text-xs text-faint">隐藏结局只计入进度</p>
        </div>

        <div className="space-y-3">
          {stories.map((story) => (
            <EndingAtlas
              key={story.id}
              story={story}
              unlocked={meta[story.id]?.unlockedEndings ?? []}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
