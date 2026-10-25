import { Suspense, useSyncExternalStore, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  BookOpenText,
  Flame,
  Home,
  Library,
  Moon,
  Settings,
  Sun,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { dayTotal, dateKey, getStreak } from '../lib/date'
import {
  getCacheWriteFailed,
  getFileStorageError,
  getFileStorageStatus,
  getHydrationWriteBlocked,
  subscribeCacheWriteFailed,
  subscribeFileStorageStatus,
  subscribeHydrationWriteBlocked,
} from '../lib/storage'
import { useIsDark } from '../lib/useIsDark'
import { useAppStore } from '../store/appStore'
import { Logo } from './Logo'
import PageFallback from './PageFallback'

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/', label: '今日', icon: Home },
  { to: '/study', label: '学习', icon: BookOpen },
  { to: '/read', label: '阅读', icon: BookOpenText },
  { to: '/books', label: '词库', icon: Library },
  { to: '/stats', label: '统计', icon: BarChart3 },
  { to: '/settings', label: '设置', icon: Settings },
]

function navClass(active: boolean): string {
  return [
    'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
    active ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:bg-surface/70 hover:text-ink',
  ].join(' ')
}

function Notice({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-xs leading-relaxed text-muted">
      <AlertCircle size={16} className="mt-0.5 shrink-0 text-accent" strokeWidth={1.8} />
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  )
}

function ThemeButton({ wide = false }: { wide?: boolean }) {
  const isDark = useIsDark()
  const setSetting = useAppStore((state) => state.setSetting)
  return (
    <button
      type="button"
      className={
        wide
          ? 'flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs text-muted transition-colors hover:bg-surface-muted hover:text-ink'
          : 'icon-button'
      }
      onClick={() => setSetting('theme', isDark ? 'light' : 'dark')}
      aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
      title={isDark ? '切换到浅色模式' : '切换到深色模式'}
    >
      {isDark ? <Sun size={18} strokeWidth={1.8} /> : <Moon size={18} strokeWidth={1.8} />}
      {wide && <span>{isDark ? '浅色模式' : '深色模式'}</span>}
    </button>
  )
}

export default function Layout() {
  const location = useLocation()
  const days = useAppStore((state) => state.days)
  const reduceMotion = useReducedMotion()
  const streak = getStreak(days)
  const studiedToday = dayTotal(days[dateKey()])
  const isReader = location.pathname.startsWith('/read/')
  const storageStatus = useSyncExternalStore(
    subscribeFileStorageStatus,
    getFileStorageStatus,
    () => 'unknown' as const,
  )
  const storageError = useSyncExternalStore(
    subscribeFileStorageStatus,
    getFileStorageError,
    () => '',
  )
  const hasWriteConflict = storageError.includes('另一个窗口更新')
  const hydrationBlocked = useSyncExternalStore(
    subscribeHydrationWriteBlocked,
    getHydrationWriteBlocked,
    () => false,
  )
  const cacheFailed = useSyncExternalStore(
    subscribeCacheWriteFailed,
    getCacheWriteFailed,
    () => false,
  )

  return (
    <div className="min-h-svh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-paper/70 px-6 py-8 backdrop-blur-xl lg:flex">
        <Logo />

        <nav className="mt-12 flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => navClass(isActive)}
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    size={18}
                    strokeWidth={isActive ? 2 : 1.7}
                    className={isActive ? 'text-accent' : 'text-faint group-hover:text-muted'}
                  />
                  <span>{item.label}</span>
                  {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-4">
          <div className="surface-flat p-4">
            <div className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-muted">
              <Flame size={14} className="text-accent" strokeWidth={1.8} />
              连续学习
            </div>
            <p className="display mt-2 text-[1.8rem] leading-none text-ink">
              {streak}
              <span className="ml-1 font-sans text-[11px] font-normal text-faint">天</span>
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-faint">
              {studiedToday > 0 ? `今天已学习 ${studiedToday} 个词` : '今天还没有开始'}
            </p>
          </div>

          <ThemeButton wide />

          <p className="px-3 text-[10px] leading-relaxed text-faint">
            数据保存在本地文件
            <br />
            断开时自动使用浏览器缓存
          </p>
        </div>
      </aside>

      {!isReader && (
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line/70 bg-paper/85 px-4 py-3 backdrop-blur-xl lg:hidden">
          <Logo />
          <div className="flex items-center gap-1.5">
            <span className="chip">
              <Flame size={12} className="text-accent" strokeWidth={1.9} />
              {streak} 天
            </span>
            <ThemeButton />
          </div>
        </header>
      )}

      <div className="lg:pl-[248px]">
        <main
          className={`mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-10 ${
            isReader
              ? 'pb-10 pt-0 lg:pb-16 lg:pt-10'
              : 'pb-28 pt-7 lg:pb-16 lg:pt-10'
          }`}
        >
          {hydrationBlocked && (
            <Notice
              action={
                <button
                  type="button"
                  className="btn btn-secondary whitespace-nowrap"
                  onClick={() => window.location.reload()}
                >
                  重新加载
                </button>
              }
            >
              数据加载超过 2.5 秒，已暂停保存，以免用未加载完的内容覆盖数据文件。这期间的改动不会保存，请重新加载后再继续。
            </Notice>
          )}
          {cacheFailed && (
            <Notice
              action={
                <Link to="/settings" className="btn btn-secondary whitespace-nowrap">
                  去导出备份
                </Link>
              }
            >
              浏览器缓存写入失败（可能已满），当前更改只保存在内存里，刷新或关闭页面就会丢失。请立即导出备份。
            </Notice>
          )}
          {(storageStatus === 'offline' || storageStatus === 'error') &&
            (!isReader || storageStatus === 'error') && (
            <Notice
              action={
                storageStatus === 'error' ? (
                  <button
                    type="button"
                    className="btn btn-secondary whitespace-nowrap"
                    onClick={() => window.location.reload()}
                  >
                    {hasWriteConflict ? '放弃更改并重新加载' : '重新加载页面'}
                  </button>
                ) : undefined
              }
            >
              {storageStatus === 'offline'
                ? '本地文件服务未连接，更改暂时保存在浏览器缓存中。请通过 start.cmd 启动应用。'
                : hasWriteConflict
                  ? '本地文件已被另一个窗口更新，本页已停止自动写入以避免覆盖。当前未保存的更改不会在刷新后保留；如需保留，请先到设置页导出备份。'
                  : `本地文件读写失败：${storageError || '未知错误'}。更改暂时保存在浏览器缓存中。如果数据文件损坏，请先备份或重命名该文件，然后重新加载页面。`}
            </Notice>
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <Suspense fallback={<PageFallback />}>
                <Outlet />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {!isReader && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
          <div className="flex items-stretch justify-around px-2">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] transition-colors ${
                    isActive ? 'text-accent' : 'text-faint'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                        isActive ? 'bg-accent-wash' : ''
                      }`}
                    >
                      <item.icon size={18} strokeWidth={isActive ? 2 : 1.7} />
                    </span>
                    {item.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}
