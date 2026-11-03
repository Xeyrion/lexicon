import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { lexiconStorage } from './server/dataStorage.ts'

export default defineConfig(({ mode }) => {
  // GitHub Pages serves a project site from /<repo>/, so the asset base has to
  // change per target. Dev, start.cmd and the standalone server all stay at '/',
  // which is why this is read from the mode instead of being hard-coded.
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_BASE || '/'

  return {
    base,
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0'),
    },
    resolve: {
      alias: {
        '@remake/core': fileURLToPath(new URL('./src/game/remake/core/src', import.meta.url)),
        '@remake/condition': fileURLToPath(new URL('./src/game/remake/condition', import.meta.url)),
        '@remake/vitex': fileURLToPath(new URL('./src/game/remake/vitex', import.meta.url)),
        '@remake/data': fileURLToPath(new URL('./src/game/data', import.meta.url)),
      },
    },
    plugins: [
      lexiconStorage(),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: '词间 Lexicon',
          short_name: '词间',
          description: '安静、克制的英语背单词工具。',
          theme_color: '#F5F1E8',
          background_color: '#F5F1E8',
          display: 'standalone',
          lang: 'zh-CN',
          start_url: './',
          scope: './',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
          navigateFallback: 'index.html',
          // Dictionaries are rebuilt occasionally (`npm run dicts` /
          // `reader-data`). With CacheFirst an installed copy would keep serving
          // the old file for up to a year, so the rebuild would look like it did
          // nothing. StaleWhileRevalidate still answers from cache offline but
          // refreshes in the background, so the next visit gets the new file.
          runtimeCaching: [
            {
              urlPattern: /\/data\/books\/.*\.json$/,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'word-books',
                expiration: {
                  maxEntries: 12,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
              },
            },
            {
              urlPattern: /\/data\/reader\/.*\.json$/,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'reader-data',
                expiration: {
                  maxEntries: 4,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
              },
            },
          ],
        },
      }),
    ],
  }
})
