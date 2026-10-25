import {
  flushPersistedStorage,
  setStorageWriterEnabled,
} from './storage'

const LOCK_NAME = 'lexicon-writer'
const CHANNEL_NAME = 'lexicon-tab'

export type TabLockState = 'checking' | 'writer' | 'follower'

const listeners = new Set<() => void>()
let state: TabLockState = 'checking'
let started = false
let releaseLock: (() => void) | null = null
let channel: BroadcastChannel | null = null
let retryTimer: number | null = null
let retryDelay = 2000
let retryNotBefore = 0
let takeoverInFlight = false

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
  return typeof navigator !== 'undefined' && 'locks' in navigator
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
  if (state === 'writer' || takeoverInFlight) return
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

export async function startTabWriter(): Promise<void> {
  if (started) return
  started = true

  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.addEventListener('message', handleMessage)
  }

  if (!canUseLocks()) {
    setStorageWriterEnabled(true)
    setState('writer')
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
  scheduleRetry(retryDelay)
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
