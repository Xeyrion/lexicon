import { useEffect, useState } from 'react'
import { Volume2 } from 'lucide-react'
import {
  englishVoices,
  getPreferredVoiceURI,
  listVoices,
  setPreferredVoiceURI,
  speech,
} from '../../lib/speech'
import type { Accent } from '../../types'

const SAMPLE = 'The rain had been falling since noon.'

/**
 * Web Speech API has no voices of its own: it borrows the operating system's.
 * On a Chinese Windows install that can mean zero English voices, which used to
 * fail silently (a Chinese voice reading English). This panel makes that
 * visible and lets the user pick among the voices that do exist.
 */
export function VoicePanel({ accent, rate }: { accent: Accent; rate: number }) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[] | null>(null)
  const [selected, setSelected] = useState(() => getPreferredVoiceURI() ?? '')

  useEffect(() => {
    let cancelled = false
    void listVoices().then((all) => {
      if (!cancelled) setVoices(englishVoices(all))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const choose = (uri: string) => {
    setSelected(uri)
    setPreferredVoiceURI(uri || null)
  }

  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ink">朗读语音</p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-faint">
            来自操作系统的语音，不是浏览器自带的。
          </p>
        </div>
        <select
          className="input w-auto min-w-[13rem] py-1.5 text-xs"
          value={selected}
          onChange={(event) => choose(event.currentTarget.value)}
          disabled={!voices || voices.length === 0}
          aria-label="选择朗读语音"
        >
          <option value="">自动选择</option>
          {(voices ?? []).map((voice) => (
            <option key={voice.voiceURI} value={voice.voiceURI}>
              {voice.name} ({voice.lang})
            </option>
          ))}
        </select>
      </div>

      {voices === null && (
        <p className="mt-3 text-[10px] text-faint">正在读取系统语音…</p>
      )}

      {voices !== null && voices.length === 0 && (
        <div className="mt-3 rounded-xl border border-accent/25 bg-accent-wash px-3 py-2.5 text-[10px] leading-relaxed text-accent">
          <p className="font-medium">没有找到英文语音，发音和朗读都用不了。</p>
          <p className="mt-1">
            Windows：设置 → 时间和语言 → 语音 → 添加语音 → English (United States)。
          </p>
          <p className="mt-0.5">
            macOS：系统设置 → 辅助功能 → 朗读内容 → 系统声音 → 管理声音。
          </p>
          <p className="mt-1 opacity-80">
            装完重启浏览器即可，不用重装本应用。没装英文语音时不会用中文语音去念英文。
          </p>
        </div>
      )}

      {voices !== null && voices.length > 0 && (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            className="btn btn-ghost text-xs"
            onClick={() =>
              void speech.speak(SAMPLE, { accent, rate, voiceURI: selected || null })
            }
          >
            <Volume2 size={13} />
            试听这句
          </button>
          <span className="truncate text-[10px] text-faint">{SAMPLE}</span>
        </div>
      )}
    </div>
  )
}
