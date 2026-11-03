/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lookupCandidates } from '../reader'
import type { ReaderLexicon } from '../../types'

/**
 * Guards the shipped dictionary, not the script that builds it.
 *
 * Both gaps found on 2026-11-03 were silent: `internet` and `were` were simply
 * absent from the file, nothing threw, and the only symptom was a reader
 * concluding the dictionary was bad. These assertions are the cheapest way to
 * notice a rebuild that drops a word everyone expects to find.
 */
const lexicon = JSON.parse(
  readFileSync(new URL('../../../public/data/reader/lexicon.json', import.meta.url), 'utf8'),
) as ReaderLexicon

const words = new Map(lexicon.words.map((word) => [word[1], word]))

/** Same order the reader uses: exact match, then the alias table. */
function resolve(raw: string): string | null {
  for (const candidate of lookupCandidates(raw)) {
    if (words.has(candidate)) return candidate
    const alias = lexicon.aliases[candidate]
    if (alias && words.has(alias)) return alias
  }
  return null
}

describe('reader lexicon', () => {
  it('词条 key 已归一化（小写、无首尾空白）', () => {
    const bad = lexicon.words.filter((word) => word[1] !== word[1].toLowerCase().trim())
    expect(bad.slice(0, 5)).toEqual([])
  })

  it('每个别名都指向存在的词条', () => {
    const dangling = Object.entries(lexicon.aliases).filter(([, target]) => !words.has(target))
    expect(dangling.slice(0, 5)).toEqual([])
  })

  it('别名不指向自己', () => {
    const selfReferencing = Object.keys(lexicon.aliases).filter(
      (key) => lexicon.aliases[key] === key,
    )
    expect(selfReferencing.slice(0, 5)).toEqual([])
  })

  // 2026-11-03 之前实际查不到的词，逐条钉住。
  const regression: [string, string][] = [
    // exchange 字段损坏，词元只能从译文 "be的过去式" 恢复
    ['were', 'be'],
    // 译文只有 [计] 这类域标注，曾被整条丢弃
    ['internet', 'internet'],
    ['online', 'online'],
    ['download', 'download'],
    ['laptop', 'laptop'],
    ['app', 'app'],
    ['globalization', 'globalization'],
    // 走别名表，确认没有退化成「自己查自己」
    ['went', 'go'],
  ]

  for (const [word, expected] of regression) {
    it(`${word} 能查到`, () => {
      expect(resolve(word)).toBe(expected)
    })
  }

  it('屈折变化回退到词干', () => {
    expect(resolve('bigger')).toBe('big')
  })
})
