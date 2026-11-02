import { normalizePos } from './labels'

/** One translation line: the part-of-speech chip plus the meaning itself. */
export function MeaningLine({ line }: { line: string }) {
  const match = line.match(/^([a-zA-Z]+\.|\[[^\]]+\])\s*(.+)$/)
  const pos = match?.[1] ?? ''
  const text = match?.[2] ?? line
  return (
    <div className="flex items-start gap-3 text-left">
      {pos ? (
        <span className="mt-0.5 inline-flex h-5 min-w-[2.4rem] shrink-0 items-center justify-center rounded-md bg-sunken px-1.5 text-[10px] font-medium text-muted">
          {normalizePos(pos)}
        </span>
      ) : (
        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
      )}
      <p className="text-[0.95rem] leading-relaxed text-ink-soft">{text}</p>
    </div>
  )
}
