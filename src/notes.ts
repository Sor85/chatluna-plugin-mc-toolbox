import { noteEntry, plainText } from './motd'
import type { TextSegment } from './types'

export type NoteCategory =
  | 'game' | 'queue' | 'priority' | 'players' | 'discord' | 'twitter' | 'youtube' | 'tiktok' | 'instagram' | 'telegram'
  | 'qq' | 'bilibili' | 'store' | 'forums' | 'rules' | 'website' | 'wiki' | 'vote' | 'mail' | 'support' | 'version'
  | 'map' | 'time' | 'event' | 'staff' | 'rank' | 'info'

export interface NoteItem {
  /** `metric` is a numeric value shown as a tile, `link` a domain or URL, `text` any other labelled value, `line` an unlabelled line. */
  kind: 'metric' | 'link' | 'text' | 'line'
  category: NoteCategory
  /** Chinese label when the key is recognized, otherwise the key as written. */
  label?: string
  value: TextSegment[]
}

// Keys are matched after lowercasing and stripping decoration, so `» Discord:` and `DISCORD` both hit.
const dictionary: [RegExp, string, NoteCategory][] = [
  [/^(in[- ]?game|playing|in game players)$/, '游戏中', 'game'],
  [/^(queue|in queue|queued|queue size|waiting)$/, '排队中', 'queue'],
  [/^(prio(rity)?|prio(rity)? queue|priority queue size)$/, '优先队列', 'priority'],
  [/^(online|players|players online|online players|player count)$/, '在线玩家', 'players'],
  [/^(max|max players|slots)$/, '最大人数', 'players'],
  [/^discord$/, 'Discord', 'discord'],
  [/^(twitter|x|twitter \/ x)$/, 'Twitter / X', 'twitter'],
  [/^(youtube|yt)$/, 'YouTube', 'youtube'],
  [/^tiktok$/, 'TikTok', 'tiktok'],
  [/^(instagram|ig)$/, 'Instagram', 'instagram'],
  [/^telegram$/, 'Telegram', 'telegram'],
  [/^(qq|qq群|qq 群|qq group|qq群号)$/, 'QQ 群', 'qq'],
  [/^(bilibili|b站|哔哩哔哩)$/, '哔哩哔哩', 'bilibili'],
  [/^(store|shop|webstore|buy|donate|商店|商城)$/, '商店', 'store'],
  [/^(forums?|论坛)$/, '论坛', 'forums'],
  [/^(rules?|规则)$/, '规则', 'rules'],
  [/^(website|site|web|homepage|home|官网|网站)$/, '官网', 'website'],
  [/^(wiki|guide|百科)$/, '百科', 'wiki'],
  [/^(vote|voting|投票)$/, '投票', 'vote'],
  [/^(email|e-mail|mail|contact|邮箱)$/, '联系邮箱', 'mail'],
  [/^(support|help|appeals?|帮助)$/, '帮助支持', 'support'],
  [/^(version|versions|supported versions?|版本)$/, '支持版本', 'version'],
  [/^(ip|address|server ip|地址)$/, '服务器地址', 'website'],
  [/^(map|world|地图)$/, '地图', 'map'],
  [/^(uptime|运行时间)$/, '运行时间', 'time'],
  [/^(season|赛季)$/, '赛季', 'event'],
  [/^(events?|活动)$/, '活动', 'event'],
  [/^(staff|team|管理)$/, '管理团队', 'staff'],
  [/^(owner|服主)$/, '服主', 'staff'],
  [/^(tps)$/, 'TPS', 'time'],
  [/^(ping|latency)$/, '延迟', 'time'],
  [/^(region|location|地区)$/, '地区', 'map'],
  [/^(rank|ranks|vip)$/, '会员', 'rank']
]

const domains: [RegExp, NoteCategory][] = [
  [/(^|\.)discord\.(gg|com)\b/, 'discord'],
  [/(^|\.)(twitter|x)\.com\b/, 'twitter'],
  [/(^|\.)(youtube\.com|youtu\.be)\b/, 'youtube'],
  [/(^|\.)tiktok\.com\b/, 'tiktok'],
  [/(^|\.)instagram\.com\b/, 'instagram'],
  [/(^|\.)t\.me\b/, 'telegram'],
  [/(^|\.)bilibili\.com\b/, 'bilibili'],
  [/^(store|shop|buy)\.|tebex\.io\b/, 'store'],
  [/^(forums?)\.|\/forums?\b/, 'forums'],
  [/\/rules\b/, 'rules'],
  [/^wiki\.|\/wiki\b/, 'wiki'],
  [/^vote\.|\/vote\b/, 'vote']
]

const defaultLabels: Partial<Record<NoteCategory, string>> = {
  discord: 'Discord', twitter: 'Twitter / X', youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', telegram: 'Telegram',
  bilibili: '哔哩哔哩', store: '商店', forums: '论坛', rules: '规则', wiki: '百科', vote: '投票', website: '链接'
}

const linkPattern = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i
const metricPattern = /^[+-]?\d[\d,.\s]*(%|ms|k|m|w|万)?$/i
// Contact numbers (QQ groups, phone numbers) are identifiers, not quantities.
const identifierCategories = new Set<NoteCategory>(['qq', 'mail', 'support', 'staff'])

/** Strips list bullets and wrappers such as `»`, `•`, `▸`, `[` and `]` around a key. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').replace(/\s+/g, ' ')
}

function linkCategory(value: string): NoteCategory {
  const url = value.toLowerCase().replace(/^https?:\/\//, '')
  return domains.find(([pattern]) => pattern.test(url))?.[1] ?? 'website'
}

export function classifyNote(line: TextSegment[]): NoteItem {
  const { key, value } = noteEntry(line)
  const text = plainText(value).trim()
  if (!key) {
    if (!linkPattern.test(text)) return { kind: 'line', category: 'info', value }
    const category = linkCategory(text)
    return { kind: 'link', category, label: defaultLabels[category], value }
  }
  const raw = plainText(key).trim()
  const known = dictionary.find(([pattern]) => pattern.test(normalizeKey(raw)))
  const label = known?.[1] ?? raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})）]+$/gu, '')
  const category = known?.[2] ?? 'info'
  if (metricPattern.test(text) && text.replace(/\D/g, '').length <= 7 && !identifierCategories.has(category)) return { kind: 'metric', category, label, value }
  if (linkPattern.test(text)) return { kind: 'link', category: known?.[2] ?? linkCategory(text), label, value }
  return { kind: 'text', category, label, value }
}

export function noteText(item: NoteItem): string {
  const value = plainText(item.value).trim()
  return item.label ? `${item.label}：${value}` : value
}
