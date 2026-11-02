import type { Plugin } from 'vite'
import { dataDir } from './storage/core.ts'
import { createStorageMiddleware } from './storage/http.ts'

export { configureStorageDir } from './storage/index.ts'
export { createStorageMiddleware } from './storage/http.ts'

export function lexiconStorage(): Plugin {
  return {
    name: 'lexicon-storage',
    configureServer(server) {
      server.config.logger.info(`  Lexicon data: ${dataDir}`)
      server.middlewares.use(createStorageMiddleware())
    },
    configurePreviewServer(server) {
      server.config.logger.info(`  Lexicon data: ${dataDir}`)
      server.middlewares.use(createStorageMiddleware())
    },
  }
}
