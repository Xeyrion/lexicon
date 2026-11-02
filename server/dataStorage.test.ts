import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Integration tests for the local storage service. They mount the real
 * middleware on a plain http server pointed at a temp directory, so the whole
 * path is exercised: request parsing, revision checks, atomic writes, backups,
 * quarantine and rollback.
 */

// Injects a rename failure for one specific target file, so the multi-file
// import rollback can be tested without corrupting anything real.
const fault = vi.hoisted(() => ({ failRenameTo: '', failures: 0 }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    rename: async (from: string, to: string) => {
      if (fault.failRenameTo && to.endsWith(fault.failRenameTo)) {
        fault.failures += 1
        throw new Error('injected rename failure')
      }
      return actual.rename(from, to)
    },
  }
})

const { configureStorageDir, createStorageMiddleware } = await import('./dataStorage.ts')

let directory = ''
let server: Server
let base = ''

function envelopeOf(raw: string): {
  appId: string
  kind: string
  revision: number
  data: unknown
} {
  return JSON.parse(raw) as { appId: string; kind: string; revision: number; data: unknown }
}

async function readEnvelopeFile(kind: string): Promise<ReturnType<typeof envelopeOf>> {
  return envelopeOf(await readFile(path.join(directory, `${kind}.json`), 'utf8'))
}

function put(kind: string, data: unknown, baseRevision: number, init: RequestInit = {}) {
  return fetch(`${base}/api/storage/${kind}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    body: JSON.stringify({ baseRevision, data }),
    ...init,
  })
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'lexicon-storage-'))
  configureStorageDir(directory)
  fault.failRenameTo = ''
  fault.failures = 0
  const middleware = createStorageMiddleware()
  server = createServer((request, response) => {
    middleware(request, response, () => {
      response.statusCode = 404
      response.end('not the storage api')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  base = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  fault.failRenameTo = ''
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await rm(directory, { recursive: true, force: true })
})

describe('status', () => {
  it('reports the directory and an empty install', async () => {
    const response = await fetch(`${base}/api/storage`)
    expect(response.status).toBe(200)
    const payload = await json(response)
    expect(payload.appId).toBe('lexicon')
    expect(payload.directory).toBe(directory)
    expect(payload.maxImportBytes).toBe(64 * 1024 * 1024)
    const files = payload.files as Record<string, { exists: boolean }>
    expect(Object.values(files).every((file) => file.exists === false)).toBe(true)
    expect(payload.backups).toMatchObject({ total: 0, bytes: 0 })
  })

  it('rejects an unknown kind and a foreign origin', async () => {
    expect((await fetch(`${base}/api/storage/nope`)).status).toBe(404)
    const forbidden = await fetch(`${base}/api/storage`, {
      headers: { origin: 'https://evil.example' },
    })
    expect(forbidden.status).toBe(403)
  })

  it('lets the loopback origin through', async () => {
    const response = await fetch(`${base}/api/storage`, {
      headers: { origin: 'http://127.0.0.1:5173' },
    })
    expect(response.status).toBe(200)
  })
})

describe('single file writes', () => {
  it('creates a file at revision 1 and reads it back', async () => {
    const created = await put('study', { settings: { dailyNew: 20 } }, 0)
    expect(created.status).toBe(200)
    expect(await json(created)).toMatchObject({ revision: 1 })

    const fetched = await fetch(`${base}/api/storage/study`)
    expect(fetched.status).toBe(200)
    const envelope = await json(fetched)
    expect(envelope).toMatchObject({ appId: 'lexicon', kind: 'study', revision: 1 })
    expect(envelope.data).toEqual({ settings: { dailyNew: 20 } })

    const onDisk = await readEnvelopeFile('study')
    expect(onDisk.revision).toBe(1)
    expect(onDisk.data).toEqual({ settings: { dailyNew: 20 } })
  })

  it('refuses a stale base revision and reports the current one', async () => {
    await put('study', { a: 1 }, 0)
    const stale = await put('study', { a: 2 }, 0)
    expect(stale.status).toBe(409)
    expect(await json(stale)).toMatchObject({ revision: 1 })
    expect((await readEnvelopeFile('study')).data).toEqual({ a: 1 })
  })

  it('validates the request body', async () => {
    expect((await fetch(`${base}/api/storage/study`, { method: 'PUT', body: 'nope' })).status).toBe(
      400,
    )
    const noRevision = await fetch(`${base}/api/storage/study`, {
      method: 'PUT',
      body: JSON.stringify({ data: { a: 1 } }),
    })
    expect(noRevision.status).toBe(400)
    const arrayData = await fetch(`${base}/api/storage/study`, {
      method: 'PUT',
      body: JSON.stringify({ baseRevision: 0, data: [1, 2] }),
    })
    expect(arrayData.status).toBe(400)
  })

  it('rejects a body over the configured import cap', async () => {
    await writeFile(
      path.join(directory, 'config.json'),
      JSON.stringify({ maxImportBytes: 8 * 1024 * 1024 }),
      'utf8',
    )
    const oversized = await fetch(`${base}/api/storage/study`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseRevision: 0,
        data: { blob: 'x'.repeat(8 * 1024 * 1024 + 1024) },
      }),
    })
    expect(oversized.status).toBe(413)
    await expect(stat(path.join(directory, 'study.json'))).rejects.toThrow()
  })

  it('reports a corrupted file as an error without losing it', async () => {
    await writeFile(path.join(directory, 'study.json'), '{ this is not json', 'utf8')
    const response = await fetch(`${base}/api/storage/study`)
    expect(response.status).toBe(500)
    expect(String((await json(response)).error)).toContain('不是合法的 JSON')

    const status = await json(await fetch(`${base}/api/storage`))
    const files = status.files as Record<string, { corrupted?: boolean; bytes?: number }>
    expect(files.study.corrupted).toBe(true)
    expect(files.study.bytes).toBeGreaterThan(0)
  })
})

describe('deletes, backups and restore', () => {
  it('backs up once per day, deletes, and restores', async () => {
    await put('study', { a: 1 }, 0)
    await put('study', { a: 2 }, 1)
    const backups = await readdir(path.join(directory, 'backups'))
    expect(backups).toHaveLength(1)
    expect(backups[0]).toMatch(/^study-\d{4}-\d{2}-\d{2}\.json$/)

    const removed = await fetch(`${base}/api/storage/study`, { method: 'DELETE' })
    expect(removed.status).toBe(204)
    expect((await fetch(`${base}/api/storage/study`)).status).toBe(404)

    const afterDelete = await readdir(path.join(directory, 'backups'))
    expect(afterDelete).toHaveLength(1)

    const listed = await json(await fetch(`${base}/api/storage/backups`))
    const entries = listed.backups as { name: string; kind: string }[]
    expect(entries).toHaveLength(1)
    expect(entries[0].kind).toBe('study')

    const restored = await fetch(`${base}/api/storage/backups/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'study', name: entries[0].name }),
    })
    expect(restored.status).toBe(200)
    const result = await json(restored)
    expect(result).toMatchObject({ revision: 1, restoredFrom: entries[0].name })
    expect(result.safetyBackup).toBeNull()
    expect((await readEnvelopeFile('study')).data).toEqual({ a: 1 })
  })

  it('rejects a backup name from another kind or with a path', async () => {
    const traversal = await fetch(`${base}/api/storage/backups/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'study', name: '../study-2026-01-01.json' }),
    })
    expect(traversal.status).toBe(400)
  })

  it('quarantines a corrupted file, then refuses to quarantine a healthy one', async () => {
    await writeFile(path.join(directory, 'reader.json'), 'broken', 'utf8')
    const quarantined = await fetch(`${base}/api/storage/reader/quarantine`, { method: 'POST' })
    expect(quarantined.status).toBe(200)
    const payload = await json(quarantined)
    expect(String(payload.quarantined)).toMatch(/reader\.corrupt-.*\.json$/)
    expect((await fetch(`${base}/api/storage/reader`)).status).toBe(404)

    await put('reader', { a: 1 }, 0)
    const healthy = await fetch(`${base}/api/storage/reader/quarantine`, { method: 'POST' })
    expect(healthy.status).toBe(400)
  })
})

describe('multi-file import', () => {
  it('writes every kind in one request', async () => {
    const response = await fetch(`${base}/api/storage/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseRevisions: { study: 0, reader: 0 },
        data: { study: { a: 1 }, reader: { b: 2 } },
      }),
    })
    expect(response.status).toBe(200)
    expect(await json(response)).toMatchObject({ revisions: { study: 1, reader: 1 } })
    expect((await readEnvelopeFile('study')).data).toEqual({ a: 1 })
    expect((await readEnvelopeFile('reader')).data).toEqual({ b: 2 })
  })

  it('changes nothing when one base revision is stale', async () => {
    await put('study', { a: 1 }, 0)
    const response = await fetch(`${base}/api/storage/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseRevisions: { study: 0, reader: 0 },
        data: { study: { a: 2 }, reader: { b: 2 } },
      }),
    })
    expect(response.status).toBe(409)
    expect((await readEnvelopeFile('study')).data).toEqual({ a: 1 })
    await expect(stat(path.join(directory, 'reader.json'))).rejects.toThrow()
  })

  it('rolls back the files it already replaced when a later write fails', async () => {
    await put('study', { a: 1 }, 0)
    fault.failRenameTo = 'reader.json'

    const response = await fetch(`${base}/api/storage/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseRevisions: { study: 1, reader: 0 },
        data: { study: { a: 2 }, reader: { b: 2 } },
      }),
    })
    expect(response.status).toBe(500)
    expect(fault.failures).toBe(1)
    expect((await readEnvelopeFile('study')).data).toEqual({ a: 1 })
    await expect(stat(path.join(directory, 'reader.json'))).rejects.toThrow()
    const leftovers = (await readdir(directory)).filter((name) => name.endsWith('.tmp'))
    expect(leftovers).toEqual([])
  })

  it('quarantines a corrupted target instead of refusing the import', async () => {
    await writeFile(path.join(directory, 'library.json'), 'broken', 'utf8')
    const response = await fetch(`${base}/api/storage/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: { library: { books: [] } } }),
    })
    expect(response.status).toBe(200)
    const payload = await json(response)
    expect((payload.quarantined as string[]).length).toBe(1)
    expect((await readEnvelopeFile('library')).data).toEqual({ books: [] })
  })

  it('rejects an empty or malformed payload', async () => {
    const empty = await fetch(`${base}/api/storage/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: {} }),
    })
    expect(empty.status).toBe(400)

    const wrongShape = await fetch(`${base}/api/storage/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: { study: [1, 2, 3] } }),
    })
    expect(wrongShape.status).toBe(400)
  })
})

describe('config', () => {
  it('persists the import cap and clamps it', async () => {
    const saved = await fetch(`${base}/api/storage/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ maxImportBytes: 128 * 1024 * 1024 }),
    })
    expect(saved.status).toBe(200)
    expect(await json(saved)).toEqual({ maxImportBytes: 128 * 1024 * 1024 })

    const status = await json(await fetch(`${base}/api/storage`))
    expect(status.maxImportBytes).toBe(128 * 1024 * 1024)
    expect(await readFile(path.join(directory, 'config.json'), 'utf8')).toContain('134217728')

    const tooSmall = await fetch(`${base}/api/storage/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ maxImportBytes: 1024 }),
    })
    expect(await json(tooSmall)).toEqual({ maxImportBytes: 8 * 1024 * 1024 })
  })

  it('rejects a non-numeric cap', async () => {
    const response = await fetch(`${base}/api/storage/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ maxImportBytes: 'lots' }),
    })
    expect(response.status).toBe(400)
  })
})

describe('unsupported methods', () => {
  it('answers 405 rather than hanging', async () => {
    const response = await fetch(`${base}/api/storage`, { method: 'POST' })
    expect(response.status).toBe(405)
    const nested = await fetch(`${base}/api/storage/study/unknown`, { method: 'PUT' })
    expect(nested.status).toBe(404)
  })
})
