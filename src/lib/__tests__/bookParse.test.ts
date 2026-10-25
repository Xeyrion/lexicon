import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { parseEpubBook, parseMarkdownBook } from '../bookParse'

/* ------------------------------------------------------------------ */
/* 现场构造最小 EPUB                                                    */
/* ------------------------------------------------------------------ */

const encoder = new TextEncoder()

function buildEpub(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {}
  for (const [name, content] of Object.entries(files)) {
    entries[name] = encoder.encode(content)
  }
  return zipSync(entries)
}

const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`

// 属性顺序刻意打乱：id / media-type / href / properties 不按常规排列。
const OPF = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:test-book</dc:identifier>
    <dc:title>测试之书</dc:title>
    <dc:creator>某作者</dc:creator>
    <dc:language>zh</dc:language>
  </metadata>
  <manifest>
    <item properties="nav" id="nav" media-type="application/xhtml+xml" href="nav.xhtml"/>
    <item id="c2" media-type="application/xhtml+xml" href="text/ch2.xhtml"/>
    <item href="text/ch1.xhtml" id="c1" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="c2"/>
    <itemref idref="nav"/>
    <itemref idref="c1"/>
  </spine>
</package>`

const NAV = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目录</title><style>nav { color: red }</style></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>目录</h1>
    <ol>
      <li><a href="text/ch1.xhtml#top">第一章 开始</a></li>
      <li><a href="text/ch2.xhtml">第二章 继续</a></li>
    </ol>
  </nav>
</body>
</html>`

const CH1 = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>一</title><style>p { color: red }</style></head>
<body>
  <h1>第一章 开始</h1>
  <script>var leaked = 'script'</script>
  <p>Tom &amp; Jerry 在 2026 年的春天出发，&#8220;带上地图&#8221;，沿着河边的小路一直往北走。</p>
  <p>他们路过了三座桥、两片麦田和一个很小很小的火车站，站台上没有人，只有一只打盹的猫&nbsp;。</p>
  <div><p>天色暗下来的时候，他们在一棵老橡树下停了下来，把毯子铺在草地上，听着远处的风。</p></div>
</body>
</html>`

const CH2 = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>二</title></head>
<body>
  <h1>第二章 继续</h1>
  <p>第二天清晨，雾还没有散去，他们就收拾好东西继续赶路了。路边的野花上挂着露水，空气里有一点潮湿的泥土味。</p>
  <p>走到中午，他们遇见了一个卖苹果的老人，老人说前面的山口今年冬天关得特别早，最好绕道走南边。</p>
  <blockquote>于是他们改变了方向，朝着南边那片从没去过的森林走去，心里既紧张又期待。</blockquote>
</body>
</html>`

function fullBook(overrides: Record<string, string> = {}): Uint8Array {
  return buildEpub({
    'META-INF/container.xml': CONTAINER,
    'OEBPS/content.opf': OPF,
    'OEBPS/nav.xhtml': NAV,
    'OEBPS/text/ch1.xhtml': CH1,
    'OEBPS/text/ch2.xhtml': CH2,
    ...overrides,
  })
}

describe('parseEpubBook', () => {
  it('解析书名、作者、spine 顺序与 nav 标题', () => {
    const book = parseEpubBook(fullBook(), '兜底书名')

    expect(book.title).toBe('测试之书')
    expect(book.author).toBe('某作者')
    expect(book.source).toBe('epub')
    expect(book.chapters.map((chapter) => chapter.title)).toEqual(['第二章 继续', '第一章 开始'])
  })

  it('正文去掉标签、脚本与样式，并解码实体', () => {
    const chapters = parseEpubBook(fullBook(), '兜底书名').chapters
    const first = chapters.find((chapter) => chapter.title === '第一章 开始')
    const second = chapters.find((chapter) => chapter.title === '第二章 继续')

    expect(first?.text).toContain('Tom & Jerry')
    expect(first?.text).toContain('“带上地图”')
    expect(first?.text).not.toMatch(/<[a-z!/]/i)
    expect(first?.text).not.toContain('leaked')
    expect(first?.text).not.toContain('color: red')
    expect(second?.text).toContain('第二天清晨')
    expect(second?.text).toContain('南边')
  })

  it('正文开头重复的章节标题会被去掉', () => {
    const chapters = parseEpubBook(fullBook(), '兜底书名').chapters
    for (const chapter of chapters) {
      expect(chapter.text.split('\n')[0].trim()).not.toBe(chapter.title)
    }
  })

  it('跳过 spine 里的 nav 文档，正文里不出现目录', () => {
    const book = parseEpubBook(fullBook(), '兜底书名')
    expect(book.chapters).toHaveLength(2)
    expect(book.chapters.some((chapter) => chapter.text.includes('目录'))).toBe(false)
  })

  it('缺少 container.xml 时抛出可读提示', () => {
    const data = buildEpub({ 'OEBPS/content.opf': OPF })
    expect(() => parseEpubBook(data, '兜底书名')).toThrow(/container\.xml/)
  })

  it('不是 ZIP 时抛出可读提示', () => {
    expect(() => parseEpubBook(encoder.encode('definitely not a zip'), '兜底书名')).toThrow(/EPUB/)
  })

  it('扫描版（body 只有图片）提示没有可提取的文字', () => {
    const data = buildEpub({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': OPF,
      'OEBPS/nav.xhtml': NAV,
      'OEBPS/text/ch1.xhtml': '<html><body><div><img src="page1.jpg" alt="第 1 页"/></div></body></html>',
      'OEBPS/text/ch2.xhtml': '<html><body><div><img src="page2.jpg" alt="第 2 页"/></div></body></html>',
    })

    expect(() => parseEpubBook(data, '兜底书名')).toThrow(/没有可提取的文字/)
  })

  it('单章超过上限时截断并加提示，而不是抛错', () => {
    const longText = 'a'.repeat(250_000)
    const data = buildEpub({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': OPF,
      'OEBPS/nav.xhtml': NAV,
      'OEBPS/text/ch1.xhtml': `<html><body><h1>长章</h1><p>${longText}</p></body></html>`,
      'OEBPS/text/ch2.xhtml': CH2,
    })

    const book = parseEpubBook(data, '兜底书名')
    const longChapter = book.chapters.find((chapter) => chapter.text.length > 100_000)

    expect(longChapter).toBeDefined()
    expect(longChapter?.text.length).toBeLessThanOrEqual(200_000)
    expect(longChapter?.text.endsWith('（本章过长，已截断）')).toBe(true)
  })
})

describe('parseMarkdownBook 手动指定层级', () => {
  const text = '# Book Title\n\nintro\n\n## One\n\nalpha\n\n## Two\n\nbeta\n\n### Deep\n\ngamma\n'

  it('指定层级后按该层级切分，之上的内容保留为前言', () => {
    const book = parseMarkdownBook(text, '兜底', { level: 3 })
    expect(book.chapters.map((chapter) => chapter.title)).toEqual(['前言', 'Deep'])
    expect(book.chapters[0].text).toContain('alpha')
    expect(book.title).toBe('Book Title')
  })

  it('level 为 null 时整篇一章', () => {
    const book = parseMarkdownBook(text, '兜底', { level: null })
    expect(book.chapters).toHaveLength(1)
  })
})

describe('parseMarkdownBook', () => {
  it('单个 H1 + 多个 H2：H1 当书名，按 H2 切章', () => {
    const markdown = [
      '# 了不起的盖茨比',
      '',
      '## 第一章',
      '',
      '尼克搬到了西卵。',
      '',
      '## 第二章',
      '',
      '灰烬之谷。',
    ].join('\n')

    const book = parseMarkdownBook(markdown, '兜底书名')

    expect(book.title).toBe('了不起的盖茨比')
    expect(book.source).toBe('markdown')
    expect(book.chapters.map((chapter) => chapter.title)).toEqual(['第一章', '第二章'])
    expect(book.chapters[0].text).toBe('尼克搬到了西卵。')
    expect(book.chapters[0].text).not.toContain('## 第一章')
  })

  it('多个 H1：按 H1 切章，书名回落到 fallbackTitle', () => {
    const markdown = ['# 第一章 起点', '', '甲。', '', '# 第二章 终点', '', '乙。'].join('\n')

    const book = parseMarkdownBook(markdown, '我的书')

    expect(book.title).toBe('我的书')
    expect(book.chapters.map((chapter) => chapter.title)).toEqual(['第一章 起点', '第二章 终点'])
    expect(book.chapters[1].text).toBe('乙。')
  })

  it('一个标题都没有：整篇一章，标题用 fallbackTitle', () => {
    const book = parseMarkdownBook('只有一段正文，没有任何标题。', '兜底书名')

    expect(book.chapters).toHaveLength(1)
    expect(book.chapters[0].title).toBe('兜底书名')
    expect(book.chapters[0].text).toBe('只有一段正文，没有任何标题。')
  })

  it('代码块里的 # 不当作标题', () => {
    const markdown = [
      '# 第一章',
      '',
      '正文一。',
      '',
      '```bash',
      '# 这不是标题',
      'echo hi',
      '```',
      '',
      '# 第二章',
      '',
      '正文二。',
    ].join('\n')

    const book = parseMarkdownBook(markdown, '兜底书名')

    expect(book.chapters.map((chapter) => chapter.title)).toEqual(['第一章', '第二章'])
    expect(book.chapters[0].text).toContain('# 这不是标题')
  })

  it('第一个标题之前的正文单独成「前言」', () => {
    const markdown = [
      '这是前言内容。',
      '',
      '# 第一章',
      '',
      '正文一。',
      '',
      '# 第二章',
      '',
      '正文二。',
    ].join('\n')

    const book = parseMarkdownBook(markdown, '兜底书名')

    expect(book.chapters.map((chapter) => chapter.title)).toEqual(['前言', '第一章', '第二章'])
    expect(book.chapters[0].text).toBe('这是前言内容。')
  })

  it('H1 当书名时，书名与首个 H2 之间的正文成为前言', () => {
    const markdown = [
      '# 书名',
      '',
      '写在前面的话。',
      '',
      '## 第一章',
      '',
      '正文一。',
      '',
      '## 第二章',
      '',
      '正文二。',
    ].join('\n')

    const book = parseMarkdownBook(markdown, '兜底书名')

    expect(book.title).toBe('书名')
    expect(book.chapters.map((chapter) => chapter.title)).toEqual(['前言', '第一章', '第二章'])
    expect(book.chapters[0].text).toBe('写在前面的话。')
  })
})
