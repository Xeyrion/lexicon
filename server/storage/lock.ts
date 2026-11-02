import type { Kind } from './core.ts'

export let writeQueue: Promise<unknown> = Promise.resolve()

export function resetLock(): void {
  writeQueue = Promise.resolve()
}

export function withLock<T>(_kind: Kind | null, task: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(task, task)
  writeQueue = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}
