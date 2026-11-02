/**
 * Standalone runtime: `dist/` plus the local storage API, no Vite involved.
 *
 * This is the same process shape a packaged build needs — an Electron main
 * process or a Node SEA binary can start exactly this — and it is also the
 * quickest way to smoke-test a production build without `vite preview`.
 *
 *   npm run build
 *   node server/standalone.ts                 # http://127.0.0.1:5173
 *   LEXICON_PORT=0 node server/standalone.ts  # pick a free port
 *
 * Requires Node with type stripping (22.18+); the packaged builds bundle it.
 */
import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createServer, type ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dataDir } from './storage/core.ts'
import { createStorageMiddleware } from './storage/http.ts'

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Where the built SPA lives. A packaged build puts the executable next to
 * `dist/`, while running from source keeps `dist-server/` beside it, so try
 * both before falling back.
 */
function resolveWebRoot(): string {
  const fromEnv = process.env.LEXICON_WEB_ROOT
  if (fromEnv) return path.resolve(fromEnv)
  const candidates = [
    path.join(here, 'dist'),
    path.join(here, '..', 'dist'),
    path.resolve('dist'),
  ]
  return candidates.find((dir) => existsSync(path.join(dir, 'index.html'))) ?? candidates[0]
}

const webRoot = resolveWebRoot()
const host = process.env.LEXICON_HOST ?? '127.0.0.1'
const port = Number(process.env.LEXICON_PORT ?? 5173)

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

function sendStatus(response: ServerResponse, status: number, text: string): void {
  response.statusCode = status
  response.setHeader('content-type', 'text/plain; charset=utf-8')
  response.end(text)
}

/** Resolve a request path inside webRoot, or null when it escapes. */
function resolveStatic(urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/')
  const candidate = path.resolve(webRoot, `.${decoded}`)
  const relative = path.relative(webRoot, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null
  return candidate
}

async function serveStatic(requestPath: string, response: ServerResponse): Promise<void> {
  const file = resolveStatic(requestPath)
  if (!file) {
    sendStatus(response, 403, 'Forbidden')
    return
  }

  let target = file
  let info = await stat(target).catch(() => null)
  if (info?.isDirectory()) {
    target = path.join(target, 'index.html')
    info = await stat(target).catch(() => null)
  }
  // Unknown path with no extension: the SPA owns routing, hand it index.html.
  if (!info && !path.extname(target)) {
    target = path.join(webRoot, 'index.html')
    info = await stat(target).catch(() => null)
  }
  if (!info?.isFile()) {
    sendStatus(response, 404, 'Not found')
    return
  }

  response.statusCode = 200
  response.setHeader('content-type', MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream')
  response.setHeader('content-length', info.size)
  // Hashed asset names are immutable; index.html and the service worker are not.
  const hashed = /-[A-Za-z0-9_]{8}\./.test(path.basename(target))
  response.setHeader('cache-control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache')
  createReadStream(target).pipe(response)
}

const storage = createStorageMiddleware()

const server = createServer((request, response) => {
  storage(request, response, () => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendStatus(response, 405, 'Method not allowed')
      return
    }
    void serveStatic(request.url ?? '/', response).catch((error: unknown) => {
      if (response.headersSent) return
      sendStatus(response, 500, error instanceof Error ? error.message : 'Server error')
    })
  })
})

/** Hand the URL to the default browser; `LEXICON_OPEN=0` turns it off. */
function openBrowser(url: string): void {
  if (process.env.LEXICON_OPEN === '0') return
  const command =
    process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url]
  try {
    spawn(command, args, { detached: true, stdio: 'ignore' }).unref()
  } catch {
    // No browser is not fatal: the URL is printed either way.
  }
}

server.on('error', (error: NodeJS.ErrnoException) => {
  // Double-clicking the packaged app twice should land on the running copy.
  if (error.code === 'EADDRINUSE') {
    console.log(`端口 ${port} 已被占用，正在打开已运行的那一份。`)
    openBrowser(`http://${host}:${port}`)
    process.exit(0)
  }
  throw error
})

server.listen(port, host, () => {
  const address = server.address()
  const actual = typeof address === 'object' && address ? address.port : port
  const url = `http://${host}:${actual}`
  console.log(`Lexicon 数据目录：${dataDir}`)
  console.log(`Lexicon 已启动：${url}`)
  openBrowser(url)
})
