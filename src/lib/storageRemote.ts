import { del, get, set } from 'idb-keyval'

/**
 * Which place the app actually persists to.
 *
 * - `file`  the local service (`/api/storage` → Node → JSON files). Only exists
 *           when the app is started with `npm run dev` / `start.cmd` / the exe.
 * - `idb`   IndexedDB. This is what a hosted copy (GitHub Pages, PWA) uses: no
 *           server to talk to, but the browser can still keep the data.
 */
export type Backend = 'file' | 'idb'

const CACHE_KEY = 'lexicon:backend'
const PROBE_TIMEOUT = 800

let resolved: Backend | null = null
let inFlight: Promise<Backend> | null = null

function readCached(): Backend | null {
  try {
    const value = localStorage.getItem(CACHE_KEY)
    return value === 'file' || value === 'idb' ? value : null
  } catch {
    return null
  }
}

function writeCached(backend: Backend): void {
  try {
    localStorage.setItem(CACHE_KEY, backend)
  } catch {
    // Private mode: the answer just is not remembered, no harm.
  }
}

/**
 * A static host answers unknown paths with the SPA shell (200 + HTML), so
 * `response.ok` alone would happily report a working file service. Require JSON.
 */
async function probe(): Promise<Backend> {
  if (typeof fetch !== 'function') return 'idb'
  const abort = new AbortController()
  const timer = window.setTimeout(() => abort.abort(), PROBE_TIMEOUT)
  try {
    const response = await fetch('/api/storage', {
      signal: abort.signal,
      headers: { accept: 'application/json' },
    })
    const type = response.headers.get('content-type') ?? ''
    return response.ok && type.includes('application/json') ? 'file' : 'idb'
  } catch {
    return 'idb'
  } finally {
    window.clearTimeout(timer)
  }
}

/**
 * Pick a backend once per page. A remembered answer is used straight away so
 * hydration is not delayed, and a background probe corrects it for next time
 * (the local service may have been started since).
 */
export function detectBackend(): Promise<Backend> {
  if (resolved) return Promise.resolve(resolved)
  if (inFlight) return inFlight

  const cached = readCached()
  if (cached) {
    resolved = cached
    void probe().then((actual) => {
      if (actual !== cached) writeCached(actual)
    })
    return Promise.resolve(cached)
  }

  inFlight = probe().then((backend) => {
    resolved = backend
    inFlight = null
    writeCached(backend)
    return backend
  })
  return inFlight
}

/* ------------------------------------------------------------------ *
 * The IndexedDB side of the same three operations the file service has
 * ------------------------------------------------------------------ */

/**
 * The cache key doubles as the storage key: without a server there is no
 * "remote copy" to fall back to, so the cached snapshot *is* the record.
 */
export async function idbLoad(key: string, legacyKey?: string): Promise<string | null> {
  const current = await get<string>(key)
  if (current != null) return current
  if (!legacyKey) return null
  const legacy = await get<string>(legacyKey)
  if (legacy != null) {
    await set(key, legacy)
    return legacy
  }
  return null
}

export async function idbSave(key: string, value: string): Promise<boolean> {
  try {
    await set(key, value)
    return true
  } catch {
    return false
  }
}

export async function idbRemove(key: string, legacyKey?: string): Promise<boolean> {
  try {
    await del(key)
    if (legacyKey) await del(legacyKey)
    return true
  } catch {
    return false
  }
}
