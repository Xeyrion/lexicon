import { paletteFor } from '../lib/palette'

interface BookCoverProps {
  id: string
  name: string
  nameZh: string
  level: string
  large?: boolean
  className?: string
}

export function BookCover({ id, name, nameZh, level, large = false, className = '' }: BookCoverProps) {
  const palette = paletteFor(id)
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-2xl ${className}`}
      style={{ background: palette.bg, color: palette.ink }}
    >
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: `radial-gradient(130% 90% at 100% 0%, ${palette.accent}66, transparent 58%), linear-gradient(165deg, transparent 35%, rgba(0,0,0,0.22))`,
        }}
      />
      <div
        className={`absolute -bottom-6 -right-3 select-none leading-none opacity-20 display ${
          large ? 'text-[10rem]' : 'text-[6.5rem]'
        }`}
      >
        {palette.initial}
      </div>
      <div className="absolute left-4 top-4 h-px w-7" style={{ background: palette.accent }} />
      <div className="relative flex h-full flex-col justify-between p-4">
        <span className={`uppercase tracking-[0.2em] opacity-60 ${large ? 'text-[10px]' : 'text-[8px]'}`}>
          {level}
        </span>
        <div>
          <p className={`display leading-none ${large ? 'text-2xl' : 'text-lg'}`}>{name}</p>
          <p className={`mt-1 opacity-60 ${large ? 'text-xs' : 'text-[10px]'}`}>{nameZh}</p>
        </div>
      </div>
    </div>
  )
}
