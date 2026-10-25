import { lazy, useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import { useHydrated } from './lib/useHydrated'
import { useAppStore } from './store/appStore'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Study = lazy(() => import('./pages/Study'))
const Reading = lazy(() => import('./pages/Reading'))
const EditArticle = lazy(() => import('./pages/EditArticle'))
const Reader = lazy(() => import('./pages/Reader'))
const Books = lazy(() => import('./pages/Books'))
const Stats = lazy(() => import('./pages/Stats'))
const Settings = lazy(() => import('./pages/Settings'))

function ThemeSync() {
  const theme = useAppStore((state) => state.settings.theme)

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      root.classList.toggle('dark', dark)
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#131210' : '#F5F1E8')
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  return null
}

function ScrollToTop() {
  const location = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname])
  return null
}

function BootSplash() {
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

export default function App() {
  const hydration = useHydrated()

  return (
    <>
      <ThemeSync />
      {hydration === 'loading' ? (
        <BootSplash />
      ) : (
        <HashRouter>
          <ScrollToTop />
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="study" element={<Study />} />
              <Route path="read" element={<Reading />} />
              <Route path="read/:articleId/edit" element={<EditArticle />} />
              <Route path="read/:articleId" element={<Reader />} />
              <Route path="books" element={<Books />} />
              <Route path="stats" element={<Stats />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      )}
    </>
  )
}
