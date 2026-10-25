import type { Accent } from '../types'

export interface SpeechOptions {
  accent: Accent
  rate?: number
}

export interface SpeechProvider {
  id: string
  available(): boolean
  speak(text: string, options: SpeechOptions): Promise<void>
  stop(): void
}

const VOICE_HINTS: Record<Accent, string[]> = {
  us: [
    'Google US English',
    'Samantha',
    'Ava',
    'Allison',
    'Microsoft Aria',
    'Microsoft Jenny',
    'Microsoft Zira',
    'Microsoft Guy',
    'Alex',
  ],
  uk: [
    'Google UK English Female',
    'Google UK English Male',
    'Daniel',
    'Serena',
    'Kate',
    'Microsoft Sonia',
    'Microsoft Libby',
    'Microsoft Ryan',
    'Microsoft Hazel',
  ],
}

function waitForVoices(timeout = 1200): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve([])
  }
  const synth = window.speechSynthesis
  const existing = synth.getVoices()
  if (existing.length > 0) return Promise.resolve(existing)

  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      synth.removeEventListener('voiceschanged', finish)
      resolve(synth.getVoices())
    }
    synth.addEventListener('voiceschanged', finish)
    window.setTimeout(finish, timeout)
  })
}

function pickVoice(voices: SpeechSynthesisVoice[], accent: Accent): SpeechSynthesisVoice | undefined {
  const lang = accent === 'us' ? 'en-us' : 'en-gb'
  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'))
  const matching = english.filter((voice) => voice.lang.toLowerCase().replace('_', '-').startsWith(lang))
  const pool = matching.length > 0 ? matching : english
  const hints = VOICE_HINTS[accent]

  return [...pool].sort((a, b) => {
    const score = (voice: SpeechSynthesisVoice) => {
      const name = voice.name.toLowerCase()
      const hintIndex = hints.findIndex((hint) => name.includes(hint.toLowerCase()))
      return (hintIndex >= 0 ? 100 - hintIndex : 0) + (voice.localService ? 5 : 0)
    }
    return score(b) - score(a)
  })[0]
}

class WebSpeechProvider implements SpeechProvider {
  id = 'webspeech'

  available(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
  }

  async speak(text: string, options: SpeechOptions): Promise<void> {
    if (!this.available() || !text.trim()) return
    const synth = window.speechSynthesis
    synth.cancel()

    const voices = await waitForVoices()
    const voice = pickVoice(voices, options.accent)
    const utterance = new SpeechSynthesisUtterance(text)
    if (voice) utterance.voice = voice
    utterance.lang = voice?.lang ?? (options.accent === 'us' ? 'en-US' : 'en-GB')
    utterance.rate = Math.min(1.5, Math.max(0.5, options.rate ?? 1))
    utterance.pitch = 1

    await new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        resolve()
      }
      utterance.onend = finish
      utterance.onerror = finish
      window.setTimeout(finish, 15000)
      synth.speak(utterance)
    })
  }

  stop(): void {
    if (this.available()) window.speechSynthesis.cancel()
  }
}

export const speech: SpeechProvider = new WebSpeechProvider()

export function speakWord(word: string, accent: Accent, rate: number): Promise<void> {
  return speech.speak(word, { accent, rate }).catch(() => undefined)
}
