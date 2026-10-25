import { defineConfig } from 'vitest/config'

// 刻意不 extend vite.config.ts：那里的 lexiconStorage() 插件会读环境变量并创建目录。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
