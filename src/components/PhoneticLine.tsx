import { Volume2 } from 'lucide-react'
import type { MouseEvent } from 'react'
import type { Accent } from '../types'
import { speakWord } from '../lib/speech'

interface PhoneticLineProps {
  word: string
  us?: string
  uk?: string
  alt?: string
  accent: Accent
  rate: number
  size?: 'sm' | 'lg'
  onAccent?: (accent: Accent) => void
}

export function PhoneticLine({
  word,
  us,
  uk,
  alt,
  accent,
  rate,
  size = 'sm',
  onAccent,
}: PhoneticLineProps) {
  const speak = (event: MouseEvent, next: Accent) => {
    event.stopPropagation()
    onAccent?.(next)
    void speakWord(word, next, rate)
  }

  const textSize = size === 'lg' ? 'text-[1.05rem]' : 'text-[0.82rem]'
  const labelSize = size === 'lg' ? 'text-[10px]' : 'text-[9px]'

  if (!us && !uk && alt) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          void speakWord(word, accent, rate)
        }}
        className={`phonetic inline-flex items-center gap-2 text-faint transition-colors hover:text-ink ${textSize}`}
        title="点击发音"
      >
        <span className="uppercase tracking-[0.14em] text-faint">IPA</span>
        {alt}
        <Volume2 size={size === 'lg' ? 15 : 12} strokeWidth={1.8} />
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {us && (
        <button
          type="button"
          onClick={(event) => speak(event, 'us')}
          className={`phonetic inline-flex items-baseline gap-1.5 transition-colors ${
            accent === 'us' ? 'text-ink' : 'text-faint hover:text-muted'
          } ${textSize}`}
          title="美式发音"
        >
          <span className={`uppercase tracking-[0.14em] ${labelSize} ${accent === 'us' ? 'text-accent' : ''}`}>
            US
          </span>
          {us}
        </button>
      )}
      {uk && (
        <button
          type="button"
          onClick={(event) => speak(event, 'uk')}
          className={`phonetic inline-flex items-baseline gap-1.5 transition-colors ${
            accent === 'uk' ? 'text-ink' : 'text-faint hover:text-muted'
          } ${textSize}`}
          title="英式发音"
        >
          <span className={`uppercase tracking-[0.14em] ${labelSize} ${accent === 'uk' ? 'text-accent' : ''}`}>
            UK
          </span>
          {uk}
        </button>
      )}
      {!us && !uk && alt && (
        <span className={`phonetic text-faint ${textSize}`}>{alt}</span>
      )}
    </div>
  )
}
