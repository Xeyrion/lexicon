import { memo, useMemo } from 'react'
import { splitParagraphs, tokenizeParagraph } from '../../lib/reader'

/** Title tokens live in their own pseudo-paragraph so anchors never collide. */
export const TITLE_PARAGRAPH = -1

interface TokenPosition {
  paragraph: number
  token: number
}

interface ReaderTextProps {
  text: string
  fontSize: number
  activeToken: TokenPosition | null
  /** Keyboard cursor; separate from activeToken so the two never fight. */
  focusToken?: TokenPosition | null
  /** Exact sentence to highlight, e.g. the one currently being read aloud. */
  highlightText?: string | null
}

export const ReaderText = memo(function ReaderText({
  text,
  fontSize,
  activeToken,
  focusToken = null,
  highlightText = null,
}: ReaderTextProps) {
  const paragraphs = useMemo(
    () => splitParagraphs(text).map((paragraph) => tokenizeParagraph(paragraph)),
    [text],
  )

  return (
    <div className="reader-prose" style={{ fontSize, lineHeight: 1.9 }}>
      {paragraphs.map((tokens, paragraphIndex) => {
        // Sentences never cross a paragraph break, so matching inside the
        // rendered paragraph is exact - no cross-paragraph offset math.
        const paragraphText = tokens.map((token) => token.text).join('')
        const hitStart = highlightText ? paragraphText.indexOf(highlightText) : -1
        const hitEnd = hitStart >= 0 && highlightText ? hitStart + highlightText.length : -1
        let offset = 0

        return (
        <p key={paragraphIndex} className="reader-paragraph">
          {tokens.map((token, tokenIndex) => {
            const start = offset
            offset += token.text.length
            const inSentence = hitStart >= 0 && start < hitEnd && offset > hitStart

            if (token.type === 'text') {
              return (
                <span key={tokenIndex} className={inSentence ? 'reader-sentence' : undefined}>
                  {token.text}
                </span>
              )
            }
            const active =
              activeToken?.paragraph === paragraphIndex && activeToken.token === tokenIndex
            const focused =
              focusToken?.paragraph === paragraphIndex && focusToken.token === tokenIndex
            return (
              <span
                key={tokenIndex}
                data-word={token.text}
                data-paragraph={paragraphIndex}
                data-token={tokenIndex}
                className={`reader-word${active ? ' reader-word-active' : ''}${
                  focused ? ' reader-word-focus' : ''
                }${inSentence ? ' reader-sentence' : ''}`}
              >
                {token.text}
              </span>
            )
          })}
        </p>
        )
      })}
    </div>
  )
})

/**
 * The title is tokenised the same way as the body so words in it can be looked
 * up too. It renders inline (no wrapper element) to keep the heading's layout.
 */
export const ReaderTitle = memo(function ReaderTitle({
  text,
  activeToken,
  focusToken = null,
}: {
  text: string
  activeToken: TokenPosition | null
  focusToken?: TokenPosition | null
}) {
  const tokens = useMemo(() => tokenizeParagraph(text), [text])

  return (
    <>
      {tokens.map((token, tokenIndex) => {
        if (token.type === 'text') {
          return <span key={tokenIndex}>{token.text}</span>
        }
        const active =
          activeToken?.paragraph === TITLE_PARAGRAPH && activeToken.token === tokenIndex
        const focused =
          focusToken?.paragraph === TITLE_PARAGRAPH && focusToken.token === tokenIndex
        return (
          <span
            key={tokenIndex}
            data-word={token.text}
            data-paragraph={TITLE_PARAGRAPH}
            data-token={tokenIndex}
            className={`reader-word${active ? ' reader-word-active' : ''}${
              focused ? ' reader-word-focus' : ''
            }`}
          >
            {token.text}
          </span>
        )
      })}
    </>
  )
})

/**
 * One line of text whose words can be looked up, without the block layout of
 * ReaderText. Used for story choices, where the surrounding element still has
 * its own click behaviour.
 */
export const InlineWords = memo(function InlineWords({
  text,
  paragraph,
  activeToken,
  wordClassName = '',
}: {
  text: string
  paragraph: number
  activeToken: TokenPosition | null
  /** Extra class on each word, e.g. a louder hover inside clickable rows. */
  wordClassName?: string
}) {
  const tokens = useMemo(() => tokenizeParagraph(text), [text])

  return (
    <>
      {tokens.map((token, tokenIndex) => {
        if (token.type === 'text') {
          return <span key={tokenIndex}>{token.text}</span>
        }
        const active =
          activeToken?.paragraph === paragraph && activeToken.token === tokenIndex
        return (
          <span
            key={tokenIndex}
            data-word={token.text}
            data-paragraph={paragraph}
            data-token={tokenIndex}
            className={`reader-word${active ? ' reader-word-active' : ''}${
              wordClassName ? ` ${wordClassName}` : ''
            }`}
          >
            {token.text}
          </span>
        )
      })}
    </>
  )
})
