import { del, get, set } from 'idb-keyval'
import type { StateStorage } from 'zustand/middleware'

const API_BASE = '/api/storage'
const APP_ID = 'lexicon'
const PENDING_PREFIX = 'lexicon:pending:'
const DELETED_PREFIX = 'lexicon:deleted:'

type Kind = 'study' | 'reader' | 'reader-progress'

const CACHE_KEYS: Record<Kind, { current: string; legacy?: string }> = {
  study: { current: 'lexicon-study-v1', legacy: 'learnword-state-v1' },
  reader: { current: 'lexicon-reader-v1', legacy: 'learnword-reader-v1' },
  'reader-progress': { current: 'lexicon-reader-progress-v1' },
}

interface Controller {
  kind: Kind
  cacheKey: string
  legacyCacheKey?: string
  debounceMs: number
  revision: number
  idbBroken: boolean
  pending: string | null
  timer: number | null
  chain: Promise<void>
}

interface FileEnvelope {
  appId?: string
  kind?: string
  revision?: number
  data?: unknown
}

type FileResult =
  | { status: 'ok'; data: unknown; revision: number }
  | { status: 'missing' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }

export type FileStorageStatus = 'unknown' | 'online' | 'offline' | 'error'

const controllers = new Set<Controller>()
const statusListeners = new Set<() => void>()
const kindStatuses = new Map<Kind, { status: FileStorageStatus; error: string }>()
let listenersInstalled = false
let warnedOffline = false
let writerEnabled = true
let fileStorageStatus: FileStorageStatus = 'unknown'
let fileStorageError = ''

const STATUS_RANK: Record<FileStorageStatus, number> = {
  unknown: 0,
  online: 1,
  offline: 2,
  error: 3,
}

function reportFileStatus(
  kind: Kind,
  status: FileStorageStatus,
  error = '',
): void {
  const detail = error.trim()
  const normalized =
    detail && !detail.includes(`${kind}.json`)
      ? `${kind}.json：${detail}`
      : detail
  kindStatuses.set(kind, { status, error: normalized })

  let next: FileStorageStatus = 'unknown'
  const errors: string[] = []
  for (const entry of kindStatuses.values()) {
    if (STATUS_RANK[entry.status] > STATUS_RANK[next]) next = entry.status
    if (entry.status === 'error' && entry.error) errors.push(entry.error)
  }
  const message = errors.join('；')
  if (fileStorageStatus === next && fileStorageError === message) return
  fileStorageStatus = next
  fileStorageError = message
  statusListeners.forEach((listener) => listener())
}

export function getFileStorageStatus(): FileStorageStatus {
  return fileStorageStatus
}

export function getFileStorageError(): string {
  return fileStorageError
}

export function subscribeFileStorageStatus(listener: () => void): () => void {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

export function setStorageWriterEnabled(enabled: boolean): void {
  writerEnabled = enabled
  if (enabled) return
  controllers.forEach((controller) => {
    if (controller.timer !== null) {
      window.clearTimeout(controller.timer)
      controller.timer = null
    }
  })
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function readLocal(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLocal(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage can be unavailable or full.
  }
}

function removeLocal(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Ignore unavailable storage.
  }
}

function readFlag(prefix: string, kind: Kind): boolean {
  return readLocal(`${prefix}${kind}`) === '1'
}

function writeFlag(prefix: string, kind: Kind, value: boolean): void {
  const key = `${prefix}${kind}`
  if (value) writeLocal(key, '1')
  else removeLocal(key)
}

function setPending(kind: Kind, value: boolean): void {
  writeFlag(PENDING_PREFIX, kind, value)
}

function setDeleted(kind: Kind, value: boolean): void {
  writeFlag(DELETED_PREFIX, kind, value)
}

function installListeners(): void {
  if (listenersInstalled || typeof window === 'undefined') return
  listenersInstalled = true
  window.addEventListener('pagehide', () => {
    void flushPersistedStorage()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushPersistedStorage()
  })
}

async function readCache(controller: Controller): Promise<string | null> {
  if (!controller.idbBroken) {
    try {
      const current = await withTimeout(get<string>(controller.cacheKey), 1000)
      if (current != null) return current
      if (controller.legacyCacheKey) {
        const legacy = await withTimeout(
          get<string>(controller.legacyCacheKey),
          1000,
        )
        if (legacy != null) {
          void withTimeout(set(controller.cacheKey, legacy), 1000).catch(
            () => undefined,
          )
          return legacy
        }
      }
    } catch {
      controller.idbBroken = true
    }
  }
  return (
    readLocal(controller.cacheKey) ??
    (controller.legacyCacheKey ? readLocal(controller.legacyCacheKey) : null)
  )
}

async function writeCache(controller: Controller, value: string): Promise<void> {
  if (!controller.idbBroken) {
    try {
      await withTimeout(set(controller.cacheKey, value), 1000)
      return
    } catch {
      controller.idbBroken = true
    }
  }
  writeLocal(controller.cacheKey, value)
}

async function clearCache(keys: { current: string; legacy?: string }): Promise<void> {
  await Promise.allSettled([
    withTimeout(del(keys.current), 1000),
    ...(keys.legacy ? [withTimeout(del(keys.legacy), 1000)] : []),
  ])
  removeLocal(keys.current)
  if (keys.legacy) removeLocal(keys.legacy)
}

async function readFile(controller: Controller): Promise<FileResult> {
  const abort = new AbortController()
  const timeout = window.setTimeout(() => abort.abort(), 1200)
  try {
    const response = await fetch(`${API_BASE}/${controller.kind}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: abort.signal,
    })
    if (response.status === 404) {
      reportFileStatus(controller.kind, 'online')
      return { status: 'missing' }
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: unknown
      } | null
      const message =
        typeof payload?.error === 'string'
          ? payload.error
          : `本地存储服务返回 ${response.status}`
      reportFileStatus(controller.kind, 'error', message)
      return { status: 'error', message }
    }
    const payload = (await response.json()) as FileEnvelope
    if (
      payload.appId !== APP_ID ||
      payload.kind !== controller.kind ||
      typeof payload.revision !== 'number' ||
      !('data' in payload)
    ) {
      const message = `${controller.kind}.json 格式不正确。`
      reportFileStatus(controller.kind, 'error', message)
      return { status: 'error', message }
    }
    reportFileStatus(controller.kind, 'online')
    controller.revision = payload.revision
    return { status: 'ok', data: payload.data, revision: payload.revision }
  } catch {
    reportFileStatus(controller.kind, 'offline')
    return { status: 'unavailable' }
  } finally {
    window.clearTimeout(timeout)
  }
}

async function writeFile(controller: Controller, value: string): Promise<boolean> {
  let data: unknown
  try {
    data = JSON.parse(value)
  } catch {
    setPending(controller.kind, true)
    return false
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const body = JSON.stringify({ baseRevision: controller.revision, data })
    const keepalive = new TextEncoder().encode(body).length < 60_000
    const abort = new AbortController()
    const timeout = window.setTimeout(() => abort.abort(), 3000)
    try {
      const response = await fetch(`${API_BASE}/${controller.kind}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body,
        cache: 'no-store',
        keepalive,
        signal: abort.signal,
      })
      if (response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          revision?: unknown
        } | null
        if (payload && typeof payload.revision === 'number') {
          controller.revision = payload.revision
        }
        setPending(controller.kind, false)
        reportFileStatus(controller.kind, 'online')
        return true
      }
      const payload = (await response.json().catch(() => null)) as {
        revision?: unknown
        error?: unknown
      } | null
      if (response.status === 409 && attempt === 0) {
        if (payload && typeof payload.revision === 'number') {
          controller.revision = payload.revision
          continue
        }
      }
      const message =
        typeof payload?.error === 'string'
          ? payload.error
          : `本地存储服务返回 ${response.status}`
      reportFileStatus(controller.kind, 'error', message)
      break
    } catch {
      reportFileStatus(controller.kind, 'offline')
      break
    } finally {
      window.clearTimeout(timeout)
    }
  }

  setPending(controller.kind, true)
  return false
}

async function deleteFile(kind: Kind): Promise<boolean> {
  const abort = new AbortController()
  const timeout = window.setTimeout(() => abort.abort(), 3000)
  try {
    const response = await fetch(`${API_BASE}/${kind}`, {
      method: 'DELETE',
      cache: 'no-store',
      keepalive: true,
      signal: abort.signal,
    })
    if (response.ok || response.status === 404) {
      reportFileStatus(kind, 'online')
      return true
    }
    const payload = (await response.json().catch(() => null)) as {
      error?: unknown
    } | null
    const message =
      typeof payload?.error === 'string'
        ? payload.error
        : `删除本地数据失败：${response.status}`
    reportFileStatus(kind, 'error', message)
    return false
  } catch {
    reportFileStatus(kind, 'offline')
    return false
  } finally {
    window.clearTimeout(timeout)
  }
}

async function load(controller: Controller): Promise<string | null> {
  const keys = CACHE_KEYS[controller.kind]

  if (readFlag(DELETED_PREFIX, controller.kind)) {
    const deleted = await deleteFile(controller.kind)
    if (deleted) setDeleted(controller.kind, false)
    await clearCache(keys)
    return null
  }

  const cached = await readCache(controller)

  if (readFlag(PENDING_PREFIX, controller.kind) && cached != null) {
    await writeFile(controller, cached)
    return cached
  }

  const remote = await readFile(controller)

  if (remote.status === 'ok') {
    const value = JSON.stringify(remote.data)
    setPending(controller.kind, false)
    warnedOffline = false
    await writeCache(controller, value)
    return value
  }

  if (remote.status === 'missing') {
    controller.revision = 0
    warnedOffline = false
    if (cached != null) {
      await writeFile(controller, cached)
      return cached
    }
    return null
  }

  if (remote.status === 'error') {
    console.warn(`本地数据文件读取失败：${remote.message}`)
    return cached
  }

  if (!warnedOffline) {
    warnedOffline = true
    console.warn('本地存储服务未连接，已使用浏览器缓存。')
  }
  return cached
}

async function flush(controller: Controller): Promise<void> {
  if (controller.timer !== null) {
    window.clearTimeout(controller.timer)
    controller.timer = null
  }
  const value = controller.pending
  if (value == null) return
  controller.pending = null
  await writeCache(controller, value)
  await writeFile(controller, value)
}

function schedule(controller: Controller, value: string): void {
  if (!writerEnabled) return
  controller.pending = value
  setDeleted(controller.kind, false)
  if (controller.timer !== null) window.clearTimeout(controller.timer)
  controller.timer = window.setTimeout(() => {
    controller.chain = controller.chain.then(
      () => flush(controller),
      () => flush(controller),
    )
  }, controller.debounceMs)
}

async function remove(controller: Controller): Promise<void> {
  if (controller.timer !== null) {
    window.clearTimeout(controller.timer)
    controller.timer = null
  }
  controller.pending = null
  setDeleted(controller.kind, true)
  const deleted = await deleteFile(controller.kind)
  if (deleted) setDeleted(controller.kind, false)
  const keys = CACHE_KEYS[controller.kind]
  await clearCache(keys)
  setPending(controller.kind, false)
  controller.chain = Promise.resolve()
}

export function createFileBackedStorage(options: {
  kind: Kind
  debounceMs?: number
}): StateStorage {
  const keys = CACHE_KEYS[options.kind]
  const controller: Controller = {
    kind: options.kind,
    cacheKey: keys.current,
    legacyCacheKey: keys.legacy,
    debounceMs: options.debounceMs ?? 400,
    revision: 0,
    idbBroken: false,
    pending: null,
    timer: null,
    chain: Promise.resolve(),
  }
  controllers.add(controller)
  installListeners()

  return {
    getItem: () => load(controller),
    setItem: (_name, value) => schedule(controller, value),
    removeItem: () => remove(controller),
  }
}

export async function clearPersistedKind(kind: Kind): Promise<void> {
  const keys = CACHE_KEYS[kind]
  for (const controller of controllers) {
    if (controller.kind !== kind) continue
    if (controller.timer !== null) {
      window.clearTimeout(controller.timer)
      controller.timer = null
    }
    controller.pending = null
    controller.chain = Promise.resolve()
  }
  setDeleted(kind, true)
  const deleted = await deleteFile(kind)
  if (deleted) setDeleted(kind, false)
  await clearCache(keys)
  setPending(kind, false)
}

export function flushPersistedStorage(): Promise<void> {
  const tasks = [...controllers].map((controller) => {
    controller.chain = controller.chain.then(
      () => flush(controller),
      () => flush(controller),
    )
    return controller.chain
  })
  return Promise.all(tasks).then(() => undefined)
}
