import { ChevronDown, Volume2 } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { PhoneticLine } from '../../components/PhoneticLine'
import type { Accent, GradeKey, SessionStage, WordEntry } from '../../types'
import { speakWord } from '../../lib/speech'
import { GRADES, STAGE_LABELS } from './labels'
import { MeaningLine } from './MeaningLine'

interface SessionCardProps {
  word: WordEntry
  stage: SessionStage
  remaining: number
  revealed: boolean
  meanings: string[]
  hiddenMeanings: number
  showDefinition: boolean
  preview: Record<GradeKey, string> | null
  accent: Accent
  rate: number
  /** Changes per card so the enter/exit animation replays. */
  animationKey: string
  onReveal: () => void
  onRate: (grade: GradeKey) => void
  onShowAll: () => void
  onAccent: (accent: Accent) => void
}

export function SessionCard({
  word,
  stage,
  remaining,
  revealed,
  meanings,
  hiddenMeanings,
  showDefinition,
  preview,
  accent,
  rate,
  animationKey,
  onReveal,
  onRate,
  onShowAll,
  onAccent,
}: SessionCardProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      key={animationKey}
      initial={reduceMotion ? false : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, x: -24 }}
      transition={{ duration: 0.26, ease: [0.2, 0.7, 0.2, 1] }}
    >
      <div
        role="presentation"
        onClick={onReveal}
        className={`surface-card relative mt-4 flex min-h-[29rem] flex-col p-6 sm:min-h-[33rem] sm:p-9 ${
          revealed ? '' : 'cursor-pointer'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={`chip ${stage === 'new' ? 'chip-accent' : ''}`}>
              {STAGE_LABELS[stage]}
            </span>
            {word.tags.includes('personal') && <span className="chip">自建</span>}
          </div>
          <span className="text-[10px] tabular-nums text-faint">剩余 {remaining}</span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center sm:py-10">
          <p className="display max-w-full break-words text-[clamp(2.5rem,9vw,4.9rem)] leading-[1.02] text-ink">
            {word.word}
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <PhoneticLine
              word={word.word}
              us={word.phoneticUS}
              uk={word.phoneticUK}
              alt={word.phoneticAlt}
              accent={accent}
              rate={rate}
              size="lg"
              onAccent={onAccent}
            />
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                void speakWord(word.word, accent, rate)
              }}
              className="icon-button icon-button-bordered h-9 w-9"
              aria-label="播放发音"
              title="播放发音"
            >
              <Volume2 size={15} strokeWidth={1.8} />
            </button>
          </div>

          <AnimatePresence initial={false}>
            {revealed ? (
              <motion.div
                key="answer"
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0 }}
                transition={{ duration: 0.24 }}
                className="mt-9 w-full max-w-xl"
              >
                <div className="space-y-2.5">
                  {meanings.map((line) => (
                    <MeaningLine key={line} line={line} />
                  ))}
                </div>
                {hiddenMeanings > 0 && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onShowAll()
                    }}
                    className="mt-3 inline-flex items-center gap-1 text-[11px] text-faint transition-colors hover:text-accent"
                  >
                    还有 {hiddenMeanings} 条释义
                    <ChevronDown size={12} />
                  </button>
                )}
                {showDefinition && word.definition.length > 0 && (
                  <details className="mt-5 text-left" onClick={(event) => event.stopPropagation()}>
                    <summary className="cursor-pointer text-[11px] text-faint transition-colors hover:text-muted">
                      英文释义
                    </summary>
                    <div className="mt-2 space-y-1.5 border-l border-line pl-3">
                      {word.definition.slice(0, 3).map((line) => (
                        <p key={line} className="text-xs leading-relaxed text-muted">
                          {line.replace(/\\n/g, ' ')}
                        </p>
                      ))}
                    </div>
                  </details>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="hint"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0 }}
                className="mt-12 flex flex-col items-center gap-2 text-faint"
              >
                <span className="h-px w-10 bg-line-strong" />
                <span className="kicker">
                  <span className="hidden sm:inline">点击卡片或按空格查看释义</span>
                  <span className="sm:hidden">轻触卡片查看释义</span>
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {revealed && preview && (
          <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {GRADES.map((grade) => (
              <button
                key={grade.key}
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onRate(grade.key)
                }}
                className={`group relative flex flex-col items-start justify-between gap-4 overflow-hidden rounded-2xl border px-4 py-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] active:translate-y-0 active:scale-[0.995] ${grade.card}`}
              >
                <span
                  className={`absolute inset-y-3 left-0 w-[2px] rounded-r-full opacity-80 transition-opacity group-hover:opacity-100 ${grade.accent}`}
                />
                <span className="flex w-full items-center justify-between gap-2 pl-2.5">
                  <span className="display text-[1.02rem] leading-none text-ink">{grade.label}</span>
                  <span className="flex h-5 w-5 items-center justify-center rounded-md border border-line bg-paper/70 text-[9px] tabular-nums text-faint transition-colors group-hover:border-line-strong group-hover:text-muted">
                    {grade.keyHint}
                  </span>
                </span>
                <span className="pl-2.5 text-[10px] tracking-wide text-muted">
                  {preview[grade.key]}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
