import type { ReaderAnchor } from '../../types'

/** Restoring puts the anchor token this far below the viewport top. */
export const ANCHOR_OFFSET = 96

/**
 * Finds the first word the reader can actually see. Probing by point beats
 * walking every token: one layout read per frame instead of hundreds.
 */
export function readAnchor(container: HTMLElement): ReaderAnchor | null {
  const rect = container.getBoundingClientRect()
  const x = rect.left + rect.width / 2
  if (x < 0 || x > window.innerWidth) return null
  const start = Math.max(rect.top, ANCHOR_OFFSET)
  for (let y = start + 12; y < start + 160; y += 24) {
    if (y > window.innerHeight) break
    const element = document.elementFromPoint(x, y)
    const word = element?.closest<HTMLElement>('[data-word]')
    if (!word) continue
    const paragraph = Number(word.dataset.paragraph)
    const token = Number(word.dataset.token)
    if (Number.isInteger(paragraph) && Number.isInteger(token) && token >= 0) {
      return { paragraph, token }
    }
  }
  return null
}
