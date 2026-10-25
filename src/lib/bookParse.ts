import { unzipSync } from 'fflate'

export interface ParsedChapter {
  title: string
  text: string
}

export interface ParsedBook {
  title: string
  author: string
  source: 'epub' | 'markdown'
  chapters: ParsedChapter[]
}

/**
 * Kept in sync with MAX_CHAPTER_CHARS in src/store/libraryStore.ts.
 * That module pulls zustand + a window-bound storage adapter at import time,
 * so importing it here would break the node-side test run.
 */
const MAX_CHAPTER_CHARS = 200_000
const TRUNCATED_NOTE = '（本章过长，已截断）'
const MIN_BOOK_CHARS = 200
const UNKNOWN_AUTHOR = '未知作者'

/* ------------------------------------------------------------------ */
/* 文本工具                                                             */
/* ------------------------------------------------------------------ */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  middot: '·',
  times: '×',
  copy: '©',
  reg: '®',
  trade: '™',
}

function decodeEntities(input: string): string {
  if (!input.includes('&')) return input
  return input.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X'
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10)
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match
      try {
        return String.fromCodePoint(code)
      } catch {
        return match
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match
  })
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, ''))
}

/** 折叠空白：行内连续空白变一个空格，行首尾 trim，空行最多保留一行。 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/* ------------------------------------------------------------------ */
/* 属性 / 标签解析（不假设属性顺序，也不要求自闭合）                      */
/* ------------------------------------------------------------------ */

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) {
    const name = match[1].toLowerCase()
    attrs[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '')
  }
  return attrs
}

/** 收集所有同名标签的属性，允许 `opf:` 之类的前缀，也兼容 `<item ... />`。 */
function tagAttrs(xml: string, tag: string): Array<Record<string, string>> {
  const re = new RegExp(`<(?:\\w+:)?${tag}\\b([^>]*)>`, 'gi')
  const out: Array<Record<string, string>> = []
  let match: RegExpExecArray | null
  while ((match = re.exec(xml)) !== null) out.push(parseAttrs(match[1]))
  return out
}

interface Element {
  attrs: Record<string, string>
  inner: string
}

function elements(xml: string, tag: string): Element[] {
  const re = new RegExp(`<(?:\\w+:)?${tag}\\b([^>]*)>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}\\s*>`, 'gi')
  const out: Element[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(xml)) !== null) {
    out.push({ attrs: parseAttrs(match[1]), inner: match[2] })
  }
  return out
}

function innerOf(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}\\s*>`, 'i')
  const match = re.exec(xml)
  return match ? match[1] : null
}

/* ------------------------------------------------------------------ */
/* EPUB 路径工具                                                        */
/* ------------------------------------------------------------------ */

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function normalizePath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  const out: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') {
      out.pop()
      continue
    }
    out.push(part)
  }
  return out.join('/')
}

function dirOf(path: string): string {
  const index = path.lastIndexOf('/')
  return index < 0 ? '' : path.slice(0, index)
}

/** href 去掉 #fragment / ?query，URL 解码后按 baseDir 解析成 zip 内的规范路径。 */
function resolveHref(baseDir: string, href: string): string {
  const clean = safeDecode(href.split('#')[0].split('?')[0])
  if (!clean) return ''
  return normalizePath(baseDir ? `${baseDir}/${clean}` : clean)
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '')
}

interface Archive {
  files: Map<string, Uint8Array>
  lower: Map<string, Uint8Array>
}

function buildArchive(files: Record<string, Uint8Array>): Archive {
  const map = new Map<string, Uint8Array>()
  const lower = new Map<string, Uint8Array>()
  for (const [name, bytes] of Object.entries(files)) {
    if (name.endsWith('/')) continue
    const key = normalizePath(name)
    if (!key) continue
    map.set(key, bytes)
    const folded = key.toLowerCase()
    if (!lower.has(folded)) lower.set(folded, bytes)
  }
  return { files: map, lower }
}

function readArchive(archive: Archive, path: string): Uint8Array | undefined {
  const key = normalizePath(path)
  return archive.files.get(key) ?? archive.lower.get(key.toLowerCase())
}

/* ------------------------------------------------------------------ */
/* EPUB 内容提取                                                        */
/* ------------------------------------------------------------------ */

const BLOCK_END = /<\/(p|div|h[1-6]|li|blockquote|tr|section|article|pre|table|ul|ol|dl|dd|dt|figure|figcaption|header|footer|aside|main|nav)\s*>/gi

/** XHTML body → 纯文本：块级标签换行、段落之间空一行、去掉标签并解码实体。 */
/**
 * EPUB bodies usually repeat the chapter title as an <h1>. The reader renders
 * the title itself, so a leading line that duplicates it is dropped.
 */
function stripLeadingTitle(text: string, title: string): string {
  if (!title) return text
  const normalized = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase()
  const [first, ...rest] = text.split('\n')
  if (normalized(first) !== normalized(title)) return text
  return rest.join('\n').trim()
}

function htmlToText(html: string): string {
  const withoutHidden = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|head|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')

  const spaced = withoutHidden
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n\n')
    .replace(BLOCK_END, '\n\n')
    .replace(/<\/t[dh]\s*>/gi, ' ')

  return normalizeWhitespace(stripTags(spaced))
}

function headingTitle(html: string): string {
  const match = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1\s*>/i.exec(html)
  return match ? collapse(stripTags(match[2])) : ''
}

function clampChapterText(text: string): string {
  if (text.length <= MAX_CHAPTER_CHARS) return text
  const room = Math.max(0, MAX_CHAPTER_CHARS - TRUNCATED_NOTE.length - 2)
  return `${text.slice(0, room).trimEnd()}\n\n${TRUNCATED_NOTE}`
}

function metaText(opf: string, name: string): string {
  const match = new RegExp(
    `<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${name}\\s*>`,
    'i',
  ).exec(opf)
  return match ? collapse(stripTags(match[1])) : ''
}

function parseNavTitles(xml: string, navPath: string): Map<string, string> {
  const titles = new Map<string, string>()
  const navs = elements(xml, 'nav')
  if (navs.length === 0) return titles
  const toc =
    navs.find((nav) => /\btoc\b/.test(`${nav.attrs['epub:type'] ?? ''} ${nav.attrs.type ?? ''} ${nav.attrs.role ?? ''}`)) ??
    navs[0]
  const baseDir = dirOf(navPath)
  for (const anchor of elements(toc.inner, 'a')) {
    const href = anchor.attrs.href
    if (!href) continue
    const title = collapse(stripTags(anchor.inner))
    if (!title) continue
    const key = resolveHref(baseDir, href)
    if (key && !titles.has(key)) titles.set(key, title)
  }
  return titles
}

function parseNcxTitles(xml: string, ncxPath: string): Map<string, string> {
  const titles = new Map<string, string>()
  const baseDir = dirOf(ncxPath)
  const re = /<text\b[^>]*>([\s\S]*?)<\/text>|<content\b([^>]*)>/gi
  let pending = ''
  let match: RegExpExecArray | null
  while ((match = re.exec(xml)) !== null) {
    if (match[1] !== undefined) {
      pending = collapse(stripTags(match[1]))
      continue
    }
    const src = parseAttrs(match[2] ?? '').src
    if (!src || !pending) continue
    const key = resolveHref(baseDir, src)
    if (key && !titles.has(key)) titles.set(key, pending)
    pending = ''
  }
  return titles
}

interface ManifestItem {
  id: string
  path: string
  mediaType: string
  properties: string
}

export function parseEpubBook(data: Uint8Array, fallbackTitle: string): ParsedBook {
  let unzipped: Record<string, Uint8Array>
  try {
    unzipped = unzipSync(data)
  } catch {
    throw new Error('无法打开这个文件，它不是有效的 EPUB（ZIP 解压失败）')
  }

  const archive = buildArchive(unzipped)

  const containerBytes = readArchive(archive, 'META-INF/container.xml')
  if (!containerBytes) {
    throw new Error('这个 EPUB 缺少 META-INF/container.xml，无法定位书籍内容')
  }
  const containerXml = decodeUtf8(containerBytes)

  const rootfile = tagAttrs(containerXml, 'rootfile')[0]?.['full-path']
  if (!rootfile) {
    throw new Error('这个 EPUB 的 container.xml 里没有指明 OPF 文件路径')
  }

  const opfPath = normalizePath(safeDecode(rootfile))
  const opfBytes = readArchive(archive, opfPath)
  if (!opfBytes) {
    throw new Error('这个 EPUB 里没有找到 OPF 内容清单文件')
  }
  const opf = decodeUtf8(opfBytes)
  const opfDir = dirOf(opfPath)

  const manifestBlock = innerOf(opf, 'manifest') ?? opf
  const manifest: ManifestItem[] = []
  const byId = new Map<string, ManifestItem>()
  for (const attrs of tagAttrs(manifestBlock, 'item')) {
    const id = attrs.id
    const href = attrs.href
    if (!id || !href) continue
    const item: ManifestItem = {
      id,
      path: resolveHref(opfDir, href),
      mediaType: (attrs['media-type'] ?? '').toLowerCase(),
      properties: (attrs.properties ?? '').toLowerCase(),
    }
    manifest.push(item)
    if (!byId.has(id)) byId.set(id, item)
  }

  const spineBlock = innerOf(opf, 'spine')
  if (!spineBlock) {
    throw new Error('这个 EPUB 没有 spine，读不到章节顺序')
  }
  const itemrefs = tagAttrs(spineBlock, 'itemref')
  if (itemrefs.length === 0) {
    throw new Error('这个 EPUB 的 spine 是空的，里面没有章节')
  }

  const navItem = manifest.find((item) => /\bnav\b/.test(item.properties))
  const ncxItem = manifest.find(
    (item) => item.mediaType.includes('dtbncx') || item.path.toLowerCase().endsWith('.ncx'),
  )

  let titles = new Map<string, string>()
  if (navItem) {
    const navBytes = readArchive(archive, navItem.path)
    if (navBytes) titles = parseNavTitles(decodeUtf8(navBytes), navItem.path)
  }
  if (titles.size === 0 && ncxItem) {
    const ncxBytes = readArchive(archive, ncxItem.path)
    if (ncxBytes) titles = parseNcxTitles(decodeUtf8(ncxBytes), ncxItem.path)
  }

  const skipped = new Set<string>()
  if (navItem) skipped.add(navItem.path)
  if (ncxItem) skipped.add(ncxItem.path)

  const chapters: ParsedChapter[] = []
  for (const itemref of itemrefs) {
    const idref = itemref.idref
    if (!idref) continue
    const item = byId.get(idref)
    if (!item || !item.path) continue
    if (skipped.has(item.path)) continue
    if (/\bnav\b/.test(item.properties)) continue
    if (!/\.x?html?$/i.test(item.path)) continue
    if (/(^|\/)(nav|toc)\.x?html?$/i.test(item.path)) continue

    const bytes = readArchive(archive, item.path)
    if (!bytes) continue
    const doc = decodeUtf8(bytes)
    const body = innerOf(doc, 'body') ?? doc
    const text = htmlToText(body)
    if (!text) continue

    const title = titles.get(item.path) ?? headingTitle(body) ?? ''
    const chapterTitle = title || `第 ${chapters.length + 1} 章`
    chapters.push({
      title: chapterTitle,
      text: clampChapterText(stripLeadingTitle(text, chapterTitle)),
    })
  }

  const totalChars = chapters.reduce((sum, chapter) => sum + chapter.text.length, 0)
  if (totalChars < MIN_BOOK_CHARS) {
    throw new Error('这本书里没有可提取的文字，可能是扫描版或受 DRM 保护')
  }

  return {
    title: metaText(opf, 'title') || fallbackTitle.trim() || '未命名书籍',
    author: metaText(opf, 'creator') || UNKNOWN_AUTHOR,
    source: 'epub',
    chapters,
  }
}

/* ------------------------------------------------------------------ */
/* Markdown                                                            */
/* ------------------------------------------------------------------ */

interface MarkdownHeading {
  level: number
  text: string
  line: number
}

function cleanHeading(text: string): string {
  return collapse(
    text
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]+/g, '')
      .replace(/<[^>]*>/g, ''),
  )
}

/** 逐行扫描 ATX 标题；``` / ~~~ 围栏内的 # 不算标题。 */
function scanHeadings(lines: string[]): MarkdownHeading[] {
  const headings: MarkdownHeading[] = []
  let fence: string | null = null
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (fence === null) fence = marker
      else if (fence === marker) fence = null
      continue
    }
    if (fence !== null) continue

    const match = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line)
    if (!match) continue
    const text = cleanHeading(match[2])
    if (!text) continue
    headings.push({ level: match[1].length, text, line: i })
  }
  return headings
}

function pickSplitLevel(headings: MarkdownHeading[]): number | null {
  const counts = new Map<number, number>()
  for (const heading of headings) {
    counts.set(heading.level, (counts.get(heading.level) ?? 0) + 1)
  }
  const candidates = [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([level]) => level)
    .sort((a, b) => a - b)
  return candidates.length > 0 ? candidates[0] : null
}

export interface MarkdownSplitOptions {
  /** undefined = infer from structure, null = one chapter, 1-6 = force that level. */
  level?: number | null
}

export function parseMarkdownBook(
  text: string,
  fallbackTitle: string,
  options: MarkdownSplitOptions = {},
): ParsedBook {
  const source = text.replace(/\r\n?/g, '\n')
  const lines = source.split('\n')
  const headings = scanHeadings(lines)
  const fallback = fallbackTitle.trim() || '未命名书籍'

  const h1 = headings.filter((heading) => heading.level === 1)
  const h2 = headings.filter((heading) => heading.level === 2)

  let splitLevel: number | null
  let bookTitle = fallback
  let titleLine = -1

  const forced = options.level
  if (forced === null) {
    splitLevel = null
  } else if (typeof forced === 'number' && Number.isFinite(forced)) {
    splitLevel = Math.min(6, Math.max(1, Math.round(forced)))
    // A lone H1 above the split level is the book title, not a chapter.
    if (splitLevel > 1 && h1.length === 1) {
      bookTitle = h1[0].text || fallback
      titleLine = h1[0].line
    }
  } else if (h1.length >= 2) {
    splitLevel = 1
  } else if (h1.length === 1 && h2.length >= 2) {
    splitLevel = 2
    bookTitle = h1[0].text || fallback
    titleLine = h1[0].line
  } else {
    splitLevel = pickSplitLevel(headings)
  }

  const wholeBook = (): ParsedBook => {
    const body = source.trim()
    if (!body) throw new Error('这个文件里没有可读取的文字')
    return {
      title: bookTitle,
      author: UNKNOWN_AUTHOR,
      source: 'markdown',
      chapters: [{ title: fallback, text: body }],
    }
  }

  if (splitLevel === null) return wholeBook()

  const splitHeadings = headings.filter((heading) => heading.level === splitLevel)
  if (splitHeadings.length === 0) return wholeBook()

  const chapters: ParsedChapter[] = []

  const preamble = lines.slice(0, splitHeadings[0].line)
  if (titleLine >= 0) preamble.splice(titleLine, 1)
  const preambleText = preamble.join('\n').trim()
  if (preambleText) chapters.push({ title: '前言', text: preambleText })

  let chapterNo = 0
  splitHeadings.forEach((heading, index) => {
    const end = splitHeadings[index + 1]?.line ?? lines.length
    const body = lines.slice(heading.line + 1, end).join('\n').trim()
    if (!body) return
    chapterNo += 1
    chapters.push({ title: heading.text || `第 ${chapterNo} 章`, text: body })
  })

  if (chapters.length === 0) return wholeBook()

  return {
    title: bookTitle,
    author: UNKNOWN_AUTHOR,
    source: 'markdown',
    chapters,
  }
}
