export interface BookPalette {
  bg: string
  ink: string
  accent: string
  initial: string
}

export const BOOK_PALETTES: Record<string, BookPalette> = {
  cet4: { bg: '#b8432f', ink: '#fff4e8', accent: '#f0c5a2', initial: '4' },
  cet6: { bg: '#365d49', ink: '#f2f6ec', accent: '#bcd6c2', initial: '6' },
  ky: { bg: '#26221c', ink: '#f2e9d8', accent: '#d2a35c', initial: '研' },
  ielts: { bg: '#33566f', ink: '#eef5f8', accent: '#a9c9d8', initial: 'I' },
  toefl: { bg: '#6e4a3a', ink: '#fbf0e8', accent: '#d9b09a', initial: 'T' },
  oxford3000: { bg: '#d8c59c', ink: '#2a241b', accent: '#7c5628', initial: 'O' },
  personal: { bg: '#e7dfd0', ink: '#29241d', accent: '#b8432f', initial: 'P' },
}

export function paletteFor(id: string): BookPalette {
  return BOOK_PALETTES[id] ?? BOOK_PALETTES.personal
}
