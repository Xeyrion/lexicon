import { useMemo } from 'react'
import { splitParagraphs, tokenizeParagraph } from '../../lib/reader'

interface ReaderTextProps {
  text: string
  fontSize: number
  activeToken: { paragraph: number; token: number } | null
}

export function ReaderText({ text, fontSize, activeToken }: ReaderTextProps) {
  const paragraphs = useMemo(
    () => splitParagraphs(text).map((paragraph) => tokenizeParagraph(paragraph)),
    [text],
  )

  return (
    <div className="reader-prose" style={{ fontSize, lineHeight: 1.9 }}>
      {paragraphs.map((tokens, paragraphIndex) => (
        <p key={paragraphIndex} className="reader-paragraph">
          {tokens.map((token, tokenIndex) => {
            if (token.type === 'text') {
              return <span key={tokenIndex}>{token.text}</span>
            }
            const active =
              activeToken?.paragraph === paragraphIndex && activeToken.token === tokenIndex
            return (
              <span
                key={tokenIndex}
                data-word={token.text}
                data-paragraph={paragraphIndex}
                data-token={tokenIndex}
                className={`reader-word${active ? ' reader-word-active' : ''}`}
              >
                {token.text}
              </span>
            )
          })}
        </p>
      ))}
    </div>
  )
}
