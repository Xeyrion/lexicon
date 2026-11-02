import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// 刻意不 extend vite.config.ts：那里的 lexiconStorage() 插件会读环境变量并创建目录。
export default defineConfig({
  resolve: {
    alias: {
      '@remake/core': fileURLToPath(new URL('./src/game/remake/core/src', import.meta.url)),
      '@remake/condition': fileURLToPath(new URL('./src/game/remake/condition', import.meta.url)),
      '@remake/vitex': fileURLToPath(new URL('./src/game/remake/vitex', import.meta.url)),
      '@remake/data': fileURLToPath(new URL('./src/game/data', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
})
