import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import {
  getTabLockState,
  requestTakeover,
  retryTabLock,
  startTabWriter,
  subscribeTabLockState,
} from '../lib/tabLock'

const App = lazy(() => import('../App'))

function StartupScreen() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-paper">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-paper shadow-lg">
        <span className="display text-2xl">词</span>
      </div>
      <div className="text-center">
        <p className="display text-2xl text-ink">词间</p>
        <p className="kicker mt-2">Lexicon</p>
      </div>
      <span className="h-1 w-16 overflow-hidden rounded-full bg-line">
        <span className="block h-full w-1/2 animate-pulse rounded-full bg-accent" />
      </span>
    </div>
  )
}

function BlockedScreen() {
  const [message, setMessage] = useState('')

  return (
    <div className="flex min-h-svh items-center justify-center bg-paper px-6">
      <div className="surface-card w-full max-w-md p-8 text-center">
        <p className="kicker">Lexicon</p>
        <h1 className="display mt-3 text-2xl text-ink">已在另一个标签页打开</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          为避免两个页面互相覆盖数据，同一时间只允许一个页面写入。可以接管此页，或关闭另一个标签页后重试。
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setMessage('正在请求另一个标签页让出写入权…')
              requestTakeover()
            }}
          >
            在此页接管
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setMessage('正在重新检查…')
              retryTabLock()
            }}
          >
            重试
          </button>
        </div>
        {message && <p className="mt-4 text-[11px] text-faint">{message}</p>}
      </div>
    </div>
  )
}

export default function TabGate() {
  const state = useSyncExternalStore(
    subscribeTabLockState,
    getTabLockState,
    () => 'checking' as const,
  )

  useEffect(() => {
    void startTabWriter()
  }, [])

  if (state === 'checking') return <StartupScreen />
  if (state === 'follower') return <BlockedScreen />

  return (
    <Suspense fallback={<StartupScreen />}>
      <App />
    </Suspense>
  )
}
