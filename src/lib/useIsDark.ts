import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'

export function useIsDark(): boolean {
  const theme = useAppStore((state) => state.settings.theme)
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemDark(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return theme === 'dark' || (theme === 'system' && systemDark)
}
