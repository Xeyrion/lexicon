import { createReadStream, createWriteStream, statSync } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import path from 'node:path'
import os from 'node:os'
import { parse } from 'csv-parse'

const ROOT = path.resolve(import.meta.dirname, '..')
const RAW_DIR = process.env.LEARNWORD_RAW_DIR ?? path.join(os.tmpdir(), 'opencode', 'learnword-data')
const OUT_DIR = path.join(ROOT, 'public', 'data', 'reader')

const SOURCES = {
  ecdict: 'https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv',
  ipaUS: 'https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/en_US.txt',
  ipaUK: 'https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/en_UK.txt',
}

const WORD_LIMIT = 60000
const PHRASE_LIMIT = 12000
const STOPWORDS = new Set(
  'a an the of to in on at for and or but is are was were be been being it this that these those i you he she we they my your his her our their as by with from into over under about after before between through during without within upon than then so if not no do does did have has had will would can could should may might must'.split(
    ' ',
  ),
)

const SINGLE_WORD = /^[A-Za-z][A-Za-z'’-]*$/
const PHRASE_WORD = /^[A-Za-z][A-Za-z'’-]*$/
const PHONETIC_FIRST = /^\/+|\/+$/g

const PHRASE_NOISE_WORDS = new Set([
  'sb',
  'sth',
  'somebody',
  'something',
  'someone',
  'oneself',
  "one's",
  "sb's",
  "someone's",
  'esp',
  'etc',
  'pl',
  'abbr',
  'usu',
  'lit',
  'fig',
])

const NOISY_PHRASE_KEYS = new Set([
  'say of',
  'go and',
  'have the say',
  'i say',
  'say to',
  'say for',
  'say about',
  'say with',
  'say from',
  'say in',
  'say on',
  'say at',
  'say by',
  'do so',
  'do it',
  'be able',
  'be about',
  'be of',
  'be to',
  'be on',
  'be in',
  'be at',
  'be by',
  'be for',
  'be with',
  'be from',
])

const CURATED_PHRASES = [
  ['scarce resource', '稀缺资源', 'n.'],
  ['natural resource', '自然资源', 'n.'],
  ['human resource', '人力资源', 'n.'],
  ['common sense', '常识', 'n.'],
  ['public opinion', '舆论', 'n.'],
  ['social media', '社交媒体', 'n.'],
  ['climate change', '气候变化', 'n.'],
  ['mental health', '心理健康', 'n.'],
  ['physical health', '身体健康', 'n.'],
  ['economic growth', '经济增长', 'n.'],
  ['living standard', '生活水平', 'n.'],
  ['quality of life', '生活质量', 'n.'],
  ['decision making', '决策', 'n.'],
  ['problem solving', '解决问题', 'n.'],
  ['critical thinking', '批判性思维', 'n.'],
  ['time management', '时间管理', 'n.'],
  ['work environment', '工作环境', 'n.'],
  ['learning process', '学习过程', 'n.'],
  ['research method', '研究方法', 'n.'],
  ['case study', '案例研究', 'n.'],
  ['point of view', '观点', 'n.'],
  ['side effect', '副作用', 'n.'],
  ['long term', '长期', 'n.'],
  ['short term', '短期', 'n.'],
  ['high quality', '高质量', 'n.'],
  ['low cost', '低成本', 'n.'],
  ['free time', '空闲时间', 'n.'],
  ['daily life', '日常生活', 'n.'],
  ['human being', '人类', 'n.'],
  ['first impression', '第一印象', 'n.'],
  ['take notice', '注意；留意', 'v.'],
  ['pay attention', '注意', 'v.'],
  ['pay attention to', '注意；关注', 'v.'],
  ['take care', '小心；保重', 'v.'],
  ['take care of', '照顾；处理', 'v.'],
  ['take place', '发生；举行', 'v.'],
  ['take part', '参加', 'v.'],
  ['take part in', '参加', 'v.'],
  ['take advantage of', '利用', 'v.'],
  ['take responsibility', '承担责任', 'v.'],
  ['take action', '采取行动', 'v.'],
  ['take effect', '生效', 'v.'],
  ['take turns', '轮流', 'v.'],
  ['take steps', '采取措施', 'v.'],
  ['take risks', '冒险', 'v.'],
  ['take seriously', '认真对待', 'v.'],
  ['take for granted', '认为理所当然', 'v.'],
  ['make a difference', '产生影响', 'v.'],
  ['make sense', '有意义；讲得通', 'v.'],
  ['make progress', '取得进步', 'v.'],
  ['make an effort', '努力', 'v.'],
  ['make a decision', '做决定', 'v.'],
  ['make sure', '确保', 'v.'],
  ['make use of', '利用', 'v.'],
  ['make room for', '为…腾出空间', 'v.'],
  ['make friends', '交朋友', 'v.'],
  ['make a living', '谋生', 'v.'],
  ['make a mistake', '犯错误', 'v.'],
  ['make up for', '弥补', 'v.'],
  ['give up', '放弃', 'v.'],
  ['give in', '屈服；让步', 'v.'],
  ['give way', '让步；让路', 'v.'],
  ['give rise to', '引起；导致', 'v.'],
  ['give advice', '提出建议', 'v.'],
  ['give permission', '允许', 'v.'],
  ['give priority to', '优先考虑', 'v.'],
  ['carry out', '执行；实施', 'v.'],
  ['carry on', '继续', 'v.'],
  ['come up with', '想出；提出', 'v.'],
  ['come across', '偶然遇到', 'v.'],
  ['come true', '实现', 'v.'],
  ['come into being', '形成；产生', 'v.'],
  ['come into effect', '生效', 'v.'],
  ['come to terms with', '接受；妥协', 'v.'],
  ['get rid of', '摆脱；去除', 'v.'],
  ['get used to', '习惯于', 'v.'],
  ['get in touch', '取得联系', 'v.'],
  ['get along with', '与…相处', 'v.'],
  ['get ready', '准备好', 'v.'],
  ['get involved', '参与', 'v.'],
  ['get access to', '获得；接近', 'v.'],
  ['get away with', '逃脱惩罚', 'v.'],
  ['get down to', '开始认真处理', 'v.'],
  ['keep in mind', '记住', 'v.'],
  ['keep track of', '跟踪；记录', 'v.'],
  ['keep up with', '跟上', 'v.'],
  ['keep away from', '远离', 'v.'],
  ['keep in touch', '保持联系', 'v.'],
  ['keep an eye on', '照看；留意', 'v.'],
  ['look after', '照顾', 'v.'],
  ['look for', '寻找', 'v.'],
  ['look forward to', '期待', 'v.'],
  ['look into', '调查', 'v.'],
  ['look up', '查阅；抬头看', 'v.'],
  ['look up to', '尊敬', 'v.'],
  ['look down on', '轻视', 'v.'],
  ['look out', '小心', 'v.'],
  ['put off', '推迟', 'v.'],
  ['put up with', '忍受', 'v.'],
  ['put forward', '提出', 'v.'],
  ['put into practice', '付诸实践', 'v.'],
  ['put an end to', '结束', 'v.'],
  ['put emphasis on', '强调', 'v.'],
  ['set up', '建立；设置', 'v.'],
  ['set out', '出发；着手', 'v.'],
  ['set off', '出发；引发', 'v.'],
  ['set aside', '留出；搁置', 'v.'],
  ['set an example', '树立榜样', 'v.'],
  ['turn out', '结果是；证明是', 'v.'],
  ['turn into', '变成', 'v.'],
  ['turn down', '拒绝；调低', 'v.'],
  ['turn up', '出现；调高', 'v.'],
  ['turn to', '求助于；转向', 'v.'],
  ['turn around', '好转；转身', 'v.'],
  ['work out', '解决；锻炼', 'v.'],
  ['work on', '从事；致力于', 'v.'],
  ['find out', '查明；发现', 'v.'],
  ['figure out', '弄清楚', 'v.'],
  ['point out', '指出', 'v.'],
  ['pick up', '拿起；接人；学会', 'v.'],
  ['bring about', '引起；带来', 'v.'],
  ['bring up', '抚养；提出', 'v.'],
  ['break down', '出故障；分解', 'v.'],
  ['break out', '爆发', 'v.'],
  ['break through', '突破', 'v.'],
  ['call for', '需要；要求', 'v.'],
  ['call off', '取消', 'v.'],
  ['depend on', '依靠；取决于', 'v.'],
  ['rely on', '依赖', 'v.'],
  ['focus on', '专注于', 'v.'],
  ['refer to', '提到；参考', 'v.'],
  ['result in', '导致', 'v.'],
  ['lead to', '导致', 'v.'],
  ['contribute to', '有助于；促成', 'v.'],
  ['adapt to', '适应', 'v.'],
  ['respond to', '回应', 'v.'],
  ['belong to', '属于', 'v.'],
  ['apply for', '申请', 'v.'],
  ['apply to', '适用于', 'v.'],
  ['account for', '解释；占…', 'v.'],
  ['allow for', '考虑到；允许', 'v.'],
  ['cope with', '应对', 'v.'],
  ['deal with', '处理', 'v.'],
  ['agree with', '同意', 'v.'],
  ['compare with', '与…比较', 'v.'],
  ['compete with', '与…竞争', 'v.'],
  ['connect with', '与…联系', 'v.'],
  ['engage in', '从事；参与', 'v.'],
  ['participate in', '参加', 'v.'],
  ['succeed in', '成功做…', 'v.'],
  ['insist on', '坚持', 'v.'],
  ['concentrate on', '专注于', 'v.'],
  ['decide on', '决定', 'v.'],
  ['base on', '基于', 'v.'],
  ['in terms of', '就…而言', 'prep.'],
  ['in addition to', '除…之外', 'prep.'],
  ['in contrast to', '与…形成对比', 'prep.'],
  ['in response to', '回应', 'prep.'],
  ['in relation to', '关于；与…有关', 'prep.'],
  ['in favor of', '支持', 'prep.'],
  ['in charge of', '负责', 'prep.'],
  ['in need of', '需要', 'prep.'],
  ['in spite of', '尽管', 'prep.'],
  ['on behalf of', '代表', 'prep.'],
  ['on average', '平均', 'adv.'],
  ['on purpose', '故意', 'adv.'],
  ['on time', '准时', 'adv.'],
  ['in time', '及时', 'adv.'],
  ['at least', '至少', 'adv.'],
  ['at most', '最多', 'adv.'],
  ['at first', '起初', 'adv.'],
  ['at last', '最后', 'adv.'],
  ['at present', '目前', 'adv.'],
  ['for example', '例如', 'adv.'],
  ['for instance', '例如', 'adv.'],
  ['for the first time', '第一次', 'adv.'],
  ['by chance', '偶然', 'adv.'],
  ['by contrast', '相比之下', 'adv.'],
  ['by means of', '通过', 'prep.'],
  ['as a result', '结果', 'adv.'],
  ['as a whole', '总体上', 'adv.'],
  ['as well as', '以及', 'prep.'],
  ['apart from', '除…之外', 'prep.'],
  ['according to', '根据', 'prep.'],
  ['due to', '由于', 'prep.'],
  ['thanks to', '多亏', 'prep.'],
  ['rather than', '而不是', 'prep.'],
  ['more or less', '或多或少', 'adv.'],
  ['sooner or later', '迟早', 'adv.'],
  ['once again', '再一次', 'adv.'],
  ['in other words', '换句话说', 'adv.'],
  ['in short', '简言之', 'adv.'],
  ['in general', '一般来说', 'adv.'],
  ['in particular', '尤其', 'adv.'],
  ['in fact', '事实上', 'adv.'],
  ['in case', '以防', 'adv.'],
  ['in advance', '提前', 'adv.'],
  ['in detail', '详细地', 'adv.'],
  ['in public', '公开地', 'adv.'],
  ['in private', '私下', 'adv.'],
  ['in common', '共同', 'adv.'],
  ['in conclusion', '总之', 'adv.'],
  ['in summary', '总之', 'adv.'],
  ['first of all', '首先', 'adv.'],
  ['last but not least', '最后但同样重要', 'adv.'],
  ['as far as', '就…而言', 'prep.'],
  ['as long as', '只要', 'conj.'],
  ['as soon as', '一…就…', 'conj.'],
  ['no longer', '不再', 'adv.'],
  ['no doubt', '无疑', 'adv.'],
  ['such as', '例如', 'prep.'],
  ['so far', '到目前为止', 'adv.'],
  ['because of', '因为', 'prep.'],
  ['instead of', '代替', 'prep.'],
  ['regardless of', '不管', 'prep.'],
  ['prior to', '在…之前', 'prep.'],
  ['similar to', '与…相似', 'prep.'],
  ['different from', '与…不同', 'prep.'],
  ['familiar with', '熟悉', 'adj.'],
  ['aware of', '意识到', 'adj.'],
  ['capable of', '能够', 'adj.'],
  ['responsible for', '对…负责', 'adj.'],
  ['suitable for', '适合', 'adj.'],
  ['essential for', '对…必要', 'adj.'],
  ['important to', '对…重要', 'adj.'],
  ['interested in', '对…感兴趣', 'adj.'],
  ['involved in', '参与', 'adj.'],
  ['known as', '被称为', 'adj.'],
  ['referred to as', '被称为', 'adj.'],
  ['regarded as', '被视为', 'adj.'],
  ['considered as', '被认为是', 'adj.'],
  ['seen as', '被视为', 'adj.'],
  ['known for', '以…闻名', 'adj.'],
  ['famous for', '以…著名', 'adj.'],
  ['good at', '擅长', 'adj.'],
  ['poor at', '不擅长', 'adj.'],
  ['afraid of', '害怕', 'adj.'],
  ['proud of', '为…骄傲', 'adj.'],
  ['tired of', '厌倦', 'adj.'],
  ['full of', '充满', 'adj.'],
  ['short of', '缺少', 'adj.'],
  ['free from', '免于', 'adj.'],
  ['dependent on', '依赖', 'adj.'],
  ['independent of', '独立于', 'adj.'],
  ['close to', '接近', 'prep.'],
  ['far from', '远离；远非', 'prep.'],
  ['along with', '连同', 'prep.'],
  ['together with', '与…一起', 'prep.'],
  ['other than', '除了', 'prep.'],
  ['except for', '除了', 'prep.'],
  ['but for', '要不是', 'prep.'],
  ['in front of', '在…前面', 'prep.'],
  ['in the middle of', '在…中间', 'prep.'],
  ['on the other hand', '另一方面', 'adv.'],
  ['on the contrary', '相反', 'adv.'],
  ['on the whole', '总体上', 'adv.'],
  ['on the basis of', '基于', 'prep.'],
  ['with respect to', '关于', 'prep.'],
  ['with regard to', '关于', 'prep.'],
  ['without doubt', '无疑', 'adv.'],
  ['without exception', '无例外', 'adv.'],
  ['at the same time', '同时', 'adv.'],
  ['at the end of', '在…末尾', 'prep.'],
  ['at the beginning of', '在…开始', 'prep.'],
  ['in the end', '最终', 'adv.'],
  ['in the long run', '从长远看', 'adv.'],
  ['in the short term', '短期内', 'adv.'],
  ['in the meantime', '与此同时', 'adv.'],
  ['a lot of', '许多', 'det.'],
  ['a number of', '许多', 'det.'],
  ['a variety of', '各种各样的', 'det.'],
  ['a range of', '一系列', 'det.'],
  ['a series of', '一系列', 'det.'],
  ['a set of', '一套', 'det.'],
  ['a pair of', '一双', 'det.'],
  ['a piece of', '一块；一条', 'det.'],
  ['a bit of', '一点', 'det.'],
  ['a great deal of', '大量', 'det.'],
  ['plenty of', '大量', 'det.'],
  ['lots of', '许多', 'det.'],
  ['most of', '大多数', 'det.'],
  ['some of', '一些', 'det.'],
  ['none of', '没有一个', 'det.'],
  ['either of', '两者之一', 'det.'],
  ['neither of', '两者都不', 'det.'],
  ['both of', '两者都', 'det.'],
  ['all of', '全部', 'det.'],
  ['one of', '之一', 'det.'],
  ['each other', '互相', 'pron.'],
  ['one another', '互相', 'pron.'],
  ['the same as', '与…相同', 'prep.'],
  ['the ability to', '做…的能力', 'n.'],
  ['the need for', '对…的需要', 'n.'],
  ['the risk of', '…的风险', 'n.'],
  ['the impact of', '…的影响', 'n.'],
  ['the effect of', '…的效果', 'n.'],
  ['the cause of', '…的原因', 'n.'],
  ['the purpose of', '…的目的', 'n.'],
  ['the value of', '…的价值', 'n.'],
  ['the importance of', '…的重要性', 'n.'],
  ['the role of', '…的作用', 'n.'],
  ['the number of', '…的数量', 'n.'],
  ['the amount of', '…的数量', 'n.'],
  ['the quality of', '…的质量', 'n.'],
  ['the lack of', '缺乏', 'n.'],
  ['the loss of', '失去', 'n.'],
  ['the growth of', '…的增长', 'n.'],
  ['the development of', '…的发展', 'n.'],
  ['the use of', '…的使用', 'n.'],
  ['the idea of', '…的想法', 'n.'],
  ['the problem of', '…的问题', 'n.'],
  ['the possibility of', '…的可能性', 'n.'],
  ['the chance of', '…的机会', 'n.'],
  ['the opportunity to', '做…的机会', 'n.'],
  ['the right to', '做…的权利', 'n.'],
  ['the way to', '做…的方法', 'n.'],
  ['the key to', '…的关键', 'n.'],
  ['the answer to', '…的答案', 'n.'],
  ['the solution to', '…的解决办法', 'n.'],
  ['the reason for', '…的原因', 'n.'],
  ['the demand for', '对…的需求', 'n.'],
  ['the search for', '对…的寻找', 'n.'],
  ['the need to', '需要做…', 'n.'],
  ['the failure to', '未能做…', 'n.'],
  ['the decision to', '做…的决定', 'n.'],
  ['the attempt to', '尝试做…', 'n.'],
  ['the effort to', '努力做…', 'n.'],
  ['the cost of', '…的成本', 'n.'],
  ['the benefit of', '…的好处', 'n.'],
]

function cleanPhonetic(raw) {
  if (!raw) return ''
  const first = raw.trim().split(',')[0]?.trim() ?? ''
  if (!first) return ''
  return `/${first.replace(PHONETIC_FIRST, '')}/`
}

function cleanTranslation(raw) {
  if (!raw) return []
  return raw
    .replace(/\r/g, '')
    .split(/\n|\\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((line) => /[\u4e00-\u9fff]/.test(line))
    .filter((line) => !/^\[[^\]]+\]/.test(line))
    .filter((line, index, arr) => arr.indexOf(line) === index)
    .slice(0, 4)
}

function normalizeWord(raw) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
}

function isNoisyPhrase(keys) {
  if (keys.some((key) => PHRASE_NOISE_WORDS.has(key))) return true
  if (NOISY_PHRASE_KEYS.has(keys.join(' '))) return true
  if (keys.length === 2 && ['and', 'or', 'but'].includes(keys[1])) return true
  if (keys[0] === 'say' && STOPWORDS.has(keys[1])) return true
  if (keys[0] === 'be' && keys.length === 2 && STOPWORDS.has(keys[1])) return true
  if (keys[0] === 'do' && (keys[1] === 'it' || keys[1] === 'so')) return true
  return false
}

function curatedPhraseEntries() {
  return CURATED_PHRASES.map(([word, translation, pos = 'phr.']) => ({
    word,
    key: normalizeWord(word),
    trans: [translation],
    pos,
    tags: [],
    rank: 0,
  }))
}

function rankOf(entry) {
  if (entry.frq > 0) return entry.frq
  if (entry.bnc > 0) return entry.bnc + 1_000_000
  return 9_999_999
}

function parseExchange(raw) {
  const forms = []
  for (const part of (raw ?? '').split('/')) {
    const colon = part.indexOf(':')
    if (colon < 0) continue
    const code = part.slice(0, colon)
    const form = part.slice(colon + 1).trim()
    if (!form) continue
    if (['p', 'd', 'i', '3', 's', 'r', 't'].includes(code)) forms.push(form)
  }
  return forms
}

async function download(url, target) {
  try {
    const info = await stat(target)
    if (info.size > 1000) return
  } catch {
    // Download when the local source is missing.
  }
  console.log(`Downloading ${url}`)
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`Download failed ${response.status}: ${url}`)
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target))
}

async function ensureSources() {
  await mkdir(RAW_DIR, { recursive: true })
  await download(SOURCES.ecdict, path.join(RAW_DIR, 'ecdict.csv'))
  await download(SOURCES.ipaUS, path.join(RAW_DIR, 'en_US.txt'))
  await download(SOURCES.ipaUK, path.join(RAW_DIR, 'en_UK.txt'))
}

async function loadIpa(filename) {
  const map = new Map()
  const rl = createInterface({
    input: createReadStream(path.join(RAW_DIR, filename), 'utf8'),
    crlfDelay: Infinity,
  })
  for await (const line of rl) {
    const tab = line.indexOf('\t')
    if (tab < 0) continue
    const word = normalizeWord(line.slice(0, tab))
    const phonetic = cleanPhonetic(line.slice(tab + 1))
    if (word && phonetic && !map.has(word)) map.set(word, phonetic)
  }
  return map
}

async function streamRows(onRow) {
  const parser = createReadStream(path.join(RAW_DIR, 'ecdict.csv')).pipe(
    parse({
      columns: true,
      relax_quotes: true,
      relax_column_count: true,
      skip_empty_lines: true,
    }),
  )
  for await (const row of parser) {
    await onRow(row)
  }
}

async function collectWords() {
  const rows = []
  await streamRows((row) => {
    const word = (row.word ?? '').trim()
    if (!word || !SINGLE_WORD.test(word) || word.length > 40) return
    const trans = cleanTranslation(row.translation)
    if (trans.length === 0) return
    const tags = (row.tag ?? '').split(/\s+/).filter(Boolean)
    const collins = Number(row.collins) || 0
    const oxford = (row.oxford ?? '').trim() === '1'
    const bnc = Number(row.bnc) || 0
    const frq = Number(row.frq) || 0
    if (!frq && !bnc && tags.length === 0 && !oxford && !collins) return
    rows.push({
      word,
      key: normalizeWord(word),
      phoneticAlt: cleanPhonetic(row.phonetic),
      trans,
      pos: (row.pos ?? '').trim(),
      tags,
      collins,
      oxford,
      bnc,
      frq,
      exchange: row.exchange ?? '',
      rank: rankOf({ frq, bnc }),
    })
  })

  rows.sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key))
  const seen = new Set()
  const selected = []
  for (const row of rows) {
    if (seen.has(row.key)) continue
    seen.add(row.key)
    selected.push(row)
    if (selected.length >= WORD_LIMIT) break
  }
  return selected
}

async function collectPhrases(commonWords) {
  const rows = []
  await streamRows((row) => {
    const word = (row.word ?? '').trim().replace(/\s+/g, ' ')
    if (!word || word.length > 40) return
    const parts = word.split(' ')
    if (parts.length < 2 || parts.length > 4) return
    if (!parts.every((part) => PHRASE_WORD.test(part))) return
    const keys = parts.map(normalizeWord)
    if (!keys.every((key) => commonWords.has(key))) return
    if (keys.every((key) => STOPWORDS.has(key))) return
    if (isNoisyPhrase(keys)) return
    const trans = cleanTranslation(row.translation)
    if (trans.length === 0) return
    const rank = keys.reduce((sum, key) => sum + (commonWords.get(key) ?? 9_999_999), 0)
    rows.push({
      word,
      key: normalizeWord(word),
      trans,
      pos: (row.pos ?? '').trim(),
      tags: (row.tag ?? '').split(/\s+/).filter(Boolean),
      rank,
    })
  })

  rows.sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key))
  const seen = new Set()
  const selected = []
  for (const row of rows) {
    if (seen.has(row.key)) continue
    seen.add(row.key)
    selected.push(row)
    if (selected.length >= PHRASE_LIMIT) break
  }
  return selected
}

function wordTuple(entry, ipaUS, ipaUK) {
  return [
    entry.word,
    entry.key,
    ipaUS.get(entry.key) ?? '',
    ipaUK.get(entry.key) ?? '',
    entry.phoneticAlt,
    entry.trans,
    entry.pos,
    entry.tags,
    entry.rank,
  ]
}

async function main() {
  await ensureSources()
  console.log('Loading IPA dictionaries...')
  const ipaUS = await loadIpa('en_US.txt')
  const ipaUK = await loadIpa('en_UK.txt')
  console.log(`IPA entries: US ${ipaUS.size}, UK ${ipaUK.size}`)

  console.log('Selecting reader words...')
  const words = await collectWords()
  const commonWords = new Map(words.map((word) => [word.key, word.rank]))
  console.log(`Reader words: ${words.length}`)

  console.log('Selecting common phrases...')
  const phrases = await collectPhrases(commonWords)
  console.log(`ECDICT phrases: ${phrases.length}`)

  const curatedPhrases = curatedPhraseEntries()
  const phraseMap = new Map(phrases.map((phrase) => [phrase.key, phrase]))
  for (const phrase of curatedPhrases) phraseMap.set(phrase.key, phrase)
  const mergedPhrases = [...phraseMap.values()].sort(
    (a, b) => a.rank - b.rank || a.key.localeCompare(b.key),
  )
  console.log(`Reader phrases: ${mergedPhrases.length} (${curatedPhrases.length} curated)`)

  const aliases = {}
  for (const word of words) {
    for (const form of parseExchange(word.exchange)) {
      const key = normalizeWord(form)
      if (!key || key === word.key) continue
      const current = aliases[key]
      const currentRank = current ? (commonWords.get(current) ?? 9_999_999) : Infinity
      if (word.rank < currentRank) aliases[key] = word.key
    }
  }

  await mkdir(OUT_DIR, { recursive: true })
  const lexicon = {
    generatedAt: new Date().toISOString(),
    sources: [
      { name: 'ECDICT', url: 'https://github.com/skywind3000/ECDICT', license: 'MIT' },
      { name: 'ipa-dict', url: 'https://github.com/open-dict-data/ipa-dict', license: 'MIT' },
    ],
    words: words.map((word) => wordTuple(word, ipaUS, ipaUK)),
    aliases,
  }
  const phraseData = {
    generatedAt: new Date().toISOString(),
    phrases: mergedPhrases.map((phrase) => [
      phrase.word,
      phrase.key,
      phrase.trans,
      phrase.pos,
      phrase.tags,
      phrase.rank,
    ]),
  }

  await writeFile(path.join(OUT_DIR, 'lexicon.json'), JSON.stringify(lexicon))
  await writeFile(path.join(OUT_DIR, 'phrases.json'), JSON.stringify(phraseData))

  const lexiconSize = statSync(path.join(OUT_DIR, 'lexicon.json')).size
  const phraseSize = statSync(path.join(OUT_DIR, 'phrases.json')).size
  console.log(`Done. Lexicon ${(lexiconSize / 1024 / 1024).toFixed(2)} MB, phrases ${(phraseSize / 1024 / 1024).toFixed(2)} MB`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
