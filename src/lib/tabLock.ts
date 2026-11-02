import {
  flushPersistedStorage,
  setStorageWriterEnabled,
} from './storage'

const LOCK_NAME = 'lexicon-writer'
const CHANNEL_NAME = 'lexicon-tab'

export type TabLockState = 'checking' | 'writer' | 'follower' | 'unsupported'

const listeners = new Set<() => void>()
let state: TabLockState = 'checking'
let started = false
let releaseLock: (() => void) | null = null
let channel: BroadcastChannel | null = null
let retryTimer: number | null = null
let retryDelay = 2000
let retryNotBefore = 0
let takeoverInFlight = false
// A tab the player just opened is almost always the one they mean to use, so it
// asks once for the writer to step down. Manual takeover stays as the fallback.
let autoAttempted = false
let autoTimer: number | null = null
let autoPending = false

function setAutoPending(next: boolean): void {
  if (autoPending === next) return
  autoPending = next
  listeners.forEach((listener) => listener())
}

/** True while an automatic takeover is still in flight. */
export function isTakeoverPending(): boolean {
  return autoPending
}

function setState(next: TabLockState): void {
  if (state === next) return
  state = next
  listeners.forEach((listener) => listener())
}

export function getTabLockState(): TabLockState {
  return state
}

export function subscribeTabLockState(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function clearRetry(): void {
  if (retryTimer !== null) {
    window.clearTimeout(retryTimer)
    retryTimer = null
  }
}

function scheduleRetry(delay: number): void {
  clearRetry()
  retryDelay = delay
  retryTimer = window.setTimeout(() => {
    retryTimer = null
    void attemptAcquire()
  }, delay)
}

function canUseLocks(): boolean {
  if (typeof navigator === 'undefined') return false
  try {
    return typeof navigator.locks?.request === 'function'
  } catch {
    return false
  }
}

function acquire(): Promise<boolean> {
  if (!canUseLocks()) return Promise.resolve(false)
  return new Promise<boolean>((resolve) => {
    let settled = false
    try {
      void navigator.locks
        .request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, (lock) => {
          if (!lock) {
            if (!settled) {
              settled = true
              resolve(false)
            }
            return
          }
          return new Promise<void>((release) => {
            releaseLock = () => {
              releaseLock = null
              release()
            }
            if (!settled) {
              settled = true
              resolve(true)
            }
          })
        })
        .catch(() => {
          if (!settled) {
            settled = true
            resolve(false)
          }
        })
    } catch {
      if (!settled) {
        settled = true
        resolve(false)
      }
    }
  })
}

async function attemptAcquire(): Promise<void> {
  if (state === 'writer' || state === 'unsupported' || takeoverInFlight) return
  if (Date.now() < retryNotBefore) {
    scheduleRetry(retryNotBefore - Date.now())
    return
  }
  const acquired = await acquire()
  if (!acquired) {
    scheduleRetry(retryDelay)
    return
  }
  clearRetry()
  if (autoTimer !== null) {
    window.clearTimeout(autoTimer)
    autoTimer = null
  }
  setAutoPending(false)
  retryDelay = 2000
  if (state === 'follower') {
    setStorageWriterEnabled(false)
    window.location.reload()
    return
  }
  setStorageWriterEnabled(true)
  setState('writer')
}

async function yieldToOtherTab(): Promise<void> {
  if (state !== 'writer' || takeoverInFlight) return
  takeoverInFlight = true
  setStorageWriterEnabled(false)
  try {
    await flushPersistedStorage()
  } finally {
    releaseLock?.()
    retryNotBefore = Date.now() + 3000
    setState('follower')
    scheduleRetry(3000)
    takeoverInFlight = false
    channel?.postMessage({ type: 'takeover-ready' })
  }
}

function handleMessage(event: MessageEvent): void {
  const data = event.data as { type?: string } | null
  if (!data) return
  if (data.type === 'takeover-request' && state === 'writer') {
    void yieldToOtherTab()
  }
}

/**
 * When a tab loads and finds the lock held, it asks the current writer to flush
 * and step down — but only once, and only if this tab is the one on screen.
 * Opening a bookmark or restoring from the notification shade on a phone used
 * to strand the player on a "已在另一个标签页打开" wall; this makes the newest
 * visible tab win instead, with the manual screen kept as a fallback.
 */
function scheduleAutoTakeover(): void {
  if (autoAttempted) return
  if (typeof document === 'undefined' || document.visibilityState !== 'visible') return
  autoAttempted = true
  setAutoPending(true)
  channel?.postMessage({ type: 'takeover-request' })
  retryNotBefore = 0
  retryDelay = 300
  scheduleRetry(300)
  autoTimer = window.setTimeout(() => {
    autoTimer = null
    if (state !== 'follower') return
    // The other tab did not step down: stop hammering and show the manual screen.
    setAutoPending(false)
    retryDelay = 2000
    scheduleRetry(2000)
  }, 2500)
}

export async function startTabWriter(): Promise<void> {
  if (started) return
  started = true
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.addEventListener('message', handleMessage)
  }

  if (!canUseLocks()) {
    // 没有 Web Locks 时不自动降级为 writer，先让用户了解风险并明确选择。
    setStorageWriterEnabled(false)
    setState('unsupported')
    return
  }

  const acquired = await acquire()
  if (acquired) {
    setStorageWriterEnabled(true)
    setState('writer')
    return
  }

  setStorageWriterEnabled(false)
  setState('follower')
  scheduleAutoTakeover()
  if (state === 'follower') scheduleRetry(retryDelay)
}

export function enterWithoutLock(): void {
  if (state !== 'unsupported') return
  setStorageWriterEnabled(true)
  setState('writer')
}

export function requestTakeover(): void {
  if (state !== 'follower') return
  channel?.postMessage({ type: 'takeover-request' })
  retryNotBefore = 0
  retryDelay = 300
  scheduleRetry(300)
}

export function retryTabLock(): void {
  if (state !== 'follower') return
  retryNotBefore = 0
  retryDelay = 500
  scheduleRetry(0)
}
