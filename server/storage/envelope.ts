import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { APP_ID, CORRUPT_HINT, dataDir, fileFor, httpError, type Kind } from './core.ts'

export interface Envelope {
  appId: string
  schemaVersion: number
  kind: Kind
  revision: number
  updatedAt: string
  data: unknown
}

export function parseEnvelope(raw: string, file: string, kind: Kind): Envelope {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw httpError(
      500,
      `数据文件 ${file} 不是合法的 JSON（${detail}）。${CORRUPT_HINT}`,
    )
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw httpError(
      500,
      `数据文件 ${file} 格式不正确（顶层应为包含 appId、kind、revision、data 的对象）。${CORRUPT_HINT}`,
    )
  }

  const envelope = parsed as Partial<Envelope>
  if (
    envelope.appId !== APP_ID ||
    envelope.kind !== kind ||
    typeof envelope.revision !== 'number' ||
    !('data' in envelope)
  ) {
    throw httpError(
      500,
      `数据文件 ${file} 格式不正确（缺少 appId、kind、revision 或 data 等必要字段）。${CORRUPT_HINT}`,
    )
  }
  return envelope as Envelope
}

export async function readEnvelopeAt(file: string, kind: Kind): Promise<Envelope> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw httpError(404, `数据文件 ${file} 不存在。`)
    }
    const detail = error instanceof Error ? error.message : String(error)
    throw httpError(500, `无法读取数据文件 ${file}：${detail}。`)
  }
  return parseEnvelope(raw, file, kind)
}

export async function readEnvelope(kind: Kind): Promise<Envelope | null> {
  const file = fileFor(kind)
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    const detail = error instanceof Error ? error.message : String(error)
    throw httpError(500, `无法读取数据文件 ${file}：${detail}。${CORRUPT_HINT}`)
  }
  return parseEnvelope(raw, file, kind)
}

export async function readRawFile(kind: Kind): Promise<string | null> {
  try {
    return await readFile(fileFor(kind), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export function quarantineName(kind: Kind): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${kind}.corrupt-${stamp}-${process.pid}.json`
}

export async function quarantineFile(kind: Kind): Promise<string | null> {
  const target = fileFor(kind)
  try {
    await stat(target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  const destination = path.join(dataDir, quarantineName(kind))
  await rename(target, destination)
  return destination
}

export async function writeEnvelopeAtomic(kind: Kind, envelope: Envelope): Promise<void> {
  await mkdir(dataDir, { recursive: true })
  const target = fileFor(kind)
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temp, `${JSON.stringify(envelope)}\n`, 'utf8')
  try {
    await rename(temp, target)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}
