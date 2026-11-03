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
  const [all, setAll] = useState<SpeechSynthesisVoice[] | null>(null)
  const [nonce, setNonce] = useState(0)
  const [selected, setSelected] = useState(() => getPreferredVoiceURI() ?? '')

  useEffect(() => {
    let cancelled = false
    void listVoices().then((voices) => {
      if (!cancelled) setAll(voices)
    })
    return () => {
      cancelled = true
    }
  }, [nonce])

  // The raw list matters: "0 voices" and "6 voices, none English" are different
  // problems, and on a phone this panel is the only way to tell them apart.
  const voices = all === null ? null : englishVoices(all)

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

      {all !== null && voices !== null && voices.length === 0 && all.length === 0 && (
        <div className="mt-3 rounded-xl border border-line bg-paper-deep/40 px-3 py-2.5 text-[10px] leading-relaxed text-muted">
          <p className="font-medium text-ink">浏览器没有报告任何语音。</p>
          <p className="mt-1">
            安卓上很常见：系统的语音引擎能用，只是不向浏览器列举。点下面的「试听这句」确认能不能出声。
          </p>
          <button
            type="button"
            className="btn btn-ghost mt-2 text-[11px]"
            onClick={() => {
              setAll(null)
              setNonce((value) => value + 1)
            }}
          >
            重新检测
          </button>
        </div>
      )}

      {all !== null && voices !== null && voices.length === 0 && all.length > 0 && (
        <div className="mt-3 rounded-xl border border-accent/25 bg-accent-wash px-3 py-2.5 text-[10px] leading-relaxed text-accent">
          <p className="font-medium">
            浏览器报告了 {all.length} 个语音，其中英文 0 个。
          </p>
          <p className="mt-1 opacity-80">
            看到的是：{all.slice(0, 6).map((voice) => `${voice.name} (${voice.lang})`).join('、')}
          </p>
          <p className="mt-1">
            引擎在，但缺英文包。安卓：设置 → 辅助功能 → 文字转语音输出 → 引擎设置 → 安装语音数据 →
            English。iPhone：设置 → 辅助功能 → 朗读内容 → 声音 → 英语。
          </p>
          <button
            type="button"
            className="btn btn-ghost mt-2 text-[11px]"
            onClick={() => {
              setAll(null)
              setNonce((value) => value + 1)
            }}
          >
            重新检测
          </button>
        </div>
      )}

      {voices !== null && (voices.length > 0 || all?.length === 0) && (
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
