import { setDataDir } from './core.ts'
import { resetConfigCache } from './config.ts'
import { resetLock } from './lock.ts'

/**
 * Points the storage layer at another directory. Only used by the integration
 * tests, which run against a throwaway temp folder: the plugin resolves the
 * directory once at import time.
 */
export function configureStorageDir(directory: string): void {
  setDataDir(directory)
  resetConfigCache()
  resetLock()
}
