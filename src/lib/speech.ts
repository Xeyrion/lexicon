import type { Accent } from '../types'

export interface SpeechOptions {
  accent: Accent
  rate?: number
  /** Overrides the saved preference; used by the settings preview. */
  voiceURI?: string | null
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

const VOICE_PREF_KEY = 'lexicon:voice-uri'

export function getPreferredVoiceURI(): string | null {
  try {
    return window.localStorage.getItem(VOICE_PREF_KEY)
  } catch {
    return null
  }
}

export function setPreferredVoiceURI(uri: string | null): void {
  try {
    if (uri) window.localStorage.setItem(VOICE_PREF_KEY, uri)
    else window.localStorage.removeItem(VOICE_PREF_KEY)
  } catch {
    // Private mode: the preference just will not stick.
  }
}

/** English voices only; everything else would read English with wrong phonetics. */
export function englishVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'))
}

/** Waits for the browser's lazily populated voice list. */
export function listVoices(): Promise<SpeechSynthesisVoice[]> {
  return waitForVoices()
}

function pickVoice(
  voices: SpeechSynthesisVoice[],
  accent: Accent,
  preferredURI?: string | null,
): SpeechSynthesisVoice | undefined {
  if (preferredURI) {
    const preferred = voices.find((voice) => voice.voiceURI === preferredURI)
    if (preferred) return preferred
  }
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
    const voice = pickVoice(
      voices,
      options.accent,
      options.voiceURI === undefined ? getPreferredVoiceURI() : options.voiceURI,
    )
    // No English voice means a Chinese voice would read English with the wrong
    // phonetics. Staying silent is the honest failure.
    if (!voice) return
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.voice = voice
    utterance.lang = voice.lang
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

export interface Sentence {
  text: string
  start: number
  end: number
}

/** Intl.Segmenter still breaks after these, which makes TTS pause mid-phrase. */
const ABBREVIATION_END = /\b(mr|mrs|ms|dr|prof|st|jr|sr|vs|etc|no|fig|vol|e\.g|i\.e)\.$/i

/**
 * Sentence boundaries for karaoke-style highlighting. Uses Intl.Segmenter when
 * available and falls back to punctuation; both are post-processed so that
 * "Mr." or "e.g." does not become its own utterance.
 */
export function splitSentences(text: string): Sentence[] {
  const source = text.replace(/\r\n?/g, '\n')
  const sentences: Sentence[] = []

  const push = (segment: string, index: number) => {
    const trimmed = segment.trim()
    if (!trimmed) return
    const lead = segment.length - segment.trimStart().length
    sentences.push({
      text: trimmed,
      start: index + lead,
      end: index + lead + trimmed.length,
    })
  }

  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })
    for (const part of segmenter.segment(source)) push(part.segment, part.index)
  } else {
    const pattern = /[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g
    let match: RegExpExecArray | null
    while ((match = pattern.exec(source)) !== null) push(match[0], match.index)
  }

  // Merge an abbreviation back into the sentence that follows it. The text is
  // re-sliced from the source so it still matches exactly for highlighting.
  const merged: Sentence[] = []
  for (const sentence of sentences) {
    const previous = merged[merged.length - 1]
    if (previous && ABBREVIATION_END.test(previous.text)) {
      merged[merged.length - 1] = {
        text: source.slice(previous.start, sentence.end).trim(),
        start: previous.start,
        end: sentence.end,
      }
      continue
    }
    merged.push(sentence)
  }

  return merged
}

export interface PassageOptions {
  accent: Accent
  rate?: number
  voiceURI?: string | null
  /** Index of the sentence being spoken, or null when nothing is playing. */
  onSentence?: (index: number | null) => void
  onEnd?: () => void
  /** No English voice available: the caller should explain how to install one. */
  onUnavailable?: () => void
}

export interface PassageController {
  stop: () => void
  pause: () => void
  resume: () => void
}

/**
 * Reads a passage sentence by sentence. One utterance per sentence keeps the
 * engine's per-utterance length limits out of the picture and makes the
 * highlight exact - the boundary event is not reliable across engines.
 */
export function speakPassage(text: string, options: PassageOptions): PassageController {
  const synth = typeof window === 'undefined' ? null : window.speechSynthesis
  const sentences = splitSentences(text)
  let stopped = false

  const stop = () => {
    stopped = true
    if (synth) synth.cancel()
    options.onSentence?.(null)
  }

  const run = async () => {
    if (!synth) return
    if (sentences.length === 0) {
      options.onEnd?.()
      return
    }

    const voices = await waitForVoices()
    const voice = pickVoice(
      voices,
      options.accent,
      options.voiceURI === undefined ? getPreferredVoiceURI() : options.voiceURI,
    )
    if (!voice) {
      stopped = true
      options.onSentence?.(null)
      options.onUnavailable?.()
      return
    }

    for (let index = 0; index < sentences.length; index += 1) {
      if (stopped) return
      await new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(sentences[index].text)
        utterance.voice = voice
        utterance.lang = voice.lang
        utterance.rate = Math.min(1.5, Math.max(0.5, options.rate ?? 1))
        utterance.pitch = 1
        utterance.onstart = () => options.onSentence?.(index)
        utterance.onend = () => resolve()
        utterance.onerror = () => resolve()
        synth.speak(utterance)
      })
    }

    if (!stopped) {
      options.onSentence?.(null)
      options.onEnd?.()
    }
  }

  if (synth) synth.cancel()
  void run()

  return {
    stop,
    pause: () => synth?.pause(),
    resume: () => synth?.resume(),
  }
}
