import { useRef, useState } from 'react'
import { Pencil } from 'lucide-react'

interface InlineEditProps {
  value: string
  /** 读屏与提示用的字段名，例如「书名」。 */
  label: string
  placeholder: string
  /** 未填写时显示的文字，留空则显示 placeholder。 */
  emptyText?: string
  className?: string
  onSubmit: (value: string) => void
}

/** 点铅笔就地编辑，回车或失焦保存，Esc 放弃。 */
export function InlineEdit({
  value,
  label,
  placeholder,
  emptyText,
  className = '',
  onSubmit,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const cancelled = useRef(false)

  if (editing) {
    return (
      <input
        value={draft}
        autoFocus
        aria-label={label}
        placeholder={placeholder}
        className={`input ${className}`}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => {
          setEditing(false)
          if (cancelled.current) {
            cancelled.current = false
            setDraft(value)
            return
          }
          const next = draft.trim()
          if (next !== value) onSubmit(next)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            cancelled.current = true
            event.currentTarget.blur()
          }
        }}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value)
        setEditing(true)
      }}
      className="group/inline flex max-w-full items-center gap-1.5 text-left"
      title={`编辑${label}`}
      aria-label={`编辑${label}`}
    >
      <span className={`${className} ${value ? '' : 'text-faint'}`.trim()}>
        {value || emptyText || placeholder}
      </span>
      <Pencil
        size={13}
        strokeWidth={1.8}
        className="shrink-0 text-faint opacity-0 transition-opacity group-hover/inline:opacity-100 group-focus-visible/inline:opacity-100"
      />
    </button>
  )
}
