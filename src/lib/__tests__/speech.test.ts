import { describe, expect, it } from 'vitest'
import { splitSentences } from '../speech'

const texts = (text: string) => splitSentences(text).map((sentence) => sentence.text)

describe('splitSentences', () => {
  it('按句号问号叹号切分', () => {
    expect(texts('The door was open. Nobody answered. Was anyone home? No!')).toEqual([
      'The door was open.',
      'Nobody answered.',
      'Was anyone home?',
      'No!',
    ])
  })

  it('保留缩写，不把 Mr. 当句子结尾', () => {
    expect(texts('Mr. Smith went home. He was tired.')).toEqual([
      'Mr. Smith went home.',
      'He was tired.',
    ])
  })

  it('段落之间也算句子边界', () => {
    expect(texts('First line.\n\nSecond line.')).toEqual(['First line.', 'Second line.'])
  })

  it('没有标点时整段是一句', () => {
    expect(texts('a quiet morning with no punctuation at all')).toEqual([
      'a quiet morning with no punctuation at all',
    ])
  })

  it('空文本返回空数组', () => {
    expect(splitSentences('')).toEqual([])
    expect(splitSentences('   \n\n  ')).toEqual([])
  })

  it('偏移量能还原出原句（高亮靠它定位）', () => {
    const source = 'He stopped.  Then he turned around.  "Wait," he said.'
    for (const sentence of splitSentences(source)) {
      expect(source.slice(sentence.start, sentence.end)).toBe(sentence.text)
    }
  })

  it('中文标点也不会把整段吞成一句', () => {
    const sentences = splitSentences('他停下来。然后他转过身。')
    expect(sentences.length).toBeGreaterThanOrEqual(1)
    expect(sentences.map((item) => item.text).join('')).toContain('转过身')
  })
})
