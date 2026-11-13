import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { h } from '@satorijs/core'
import { extractResourceUrls, type ImageSource, type Node, Renderer } from '@takumi-rs/core'
import { fromHtml } from '@takumi-rs/helpers/html'
import { formatUuid, type MojangClient } from './mojang'
import type { PlayerProfile, ServerStatus, TextSegment, VersionEntry, VersionUpdate } from './types'

const width = 640
const missingImage = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#2b2d31"/></svg>')
const dateTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
})
// Tabler Icons (MIT) outline paths, stroked with the injected color.
const icons = {
  server: '<path d="M3 7a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v2a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-2"/><path d="M3 15a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v2a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3l0 -2"/><path d="M7 8l0 .01"/><path d="M7 16l0 .01"/><path d="M11 8h6"/><path d="M11 16h6"/>',
  users: '<path d="M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0 -3 -3.85"/>',
  signal: '<path d="M6 18l0 -3"/><path d="M10 18l0 -6"/><path d="M14 18l0 -9"/><path d="M18 18l0 -12"/>',
  versions: '<path d="M10 7a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2l0 -10"/><path d="M7 7l0 10"/><path d="M4 8l0 8"/>',
  world: '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M3.6 9h16.8"/><path d="M3.6 15h16.8"/><path d="M11.5 3a17 17 0 0 0 0 18"/><path d="M12.5 3a17 17 0 0 1 0 18"/>',
  id: '<path d="M3 7a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v10a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3l0 -10"/><path d="M7 10a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M15 8l2 0"/><path d="M15 12l2 0"/><path d="M7 16l10 0"/>',
  shirt: '<path d="M15 4l6 2v5h-3v8a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1v-8h-3v-5l6 -2a3 3 0 0 0 6 0"/>',
  flag: '<path d="M5 14h14v-9h-14v16"/>',
  calendar: '<path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12"/><path d="M16 3l0 4"/><path d="M8 3l0 4"/><path d="M4 11l16 0"/><path d="M8 15h2v2h-2l0 -2"/>',
  package: '<path d="M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5"/><path d="M12 12l8 -4.5"/><path d="M12 12l0 9"/><path d="M12 12l-8 -4.5"/><path d="M16 5.25l-8 4.5"/>',
  shield: '<path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3"/><path d="M11 11a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M12 12l0 2.5"/>'
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function clipped(value: string, length: number): string {
  const chars = Array.from(value)
  return chars.length > length ? `${chars.slice(0, length).join('')}…` : value
}

export function formatTime(value: string | number | Date): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '未知' : dateTime.format(date)
}

export function serverAddress(status: ServerStatus): string {
  const host = status.host.includes(':') ? `[${status.host}]` : status.host
  return status.port === (status.edition === 'java' ? 25565 : 19132) ? host : `${host}:${status.port}`
}

function icon(name: keyof typeof icons, color = '#9a9ca3', size = 18): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`
  return `<img class="icon" style="width: ${size}px; height: ${size}px" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" />`
}

function motdHtml(segments: TextSegment[]): string {
  return segments.map((segment) => {
    const style = [
      `color: ${segment.color ?? '#aaaaaa'}`,
      segment.bold ? 'font-weight: 700' : '',
      segment.italic ? 'font-style: italic' : '',
      segment.underlined || segment.strikethrough
        ? `text-decoration: ${[segment.underlined ? 'underline' : '', segment.strikethrough ? 'line-through' : ''].join(' ').trim()}` : ''
    ].filter(Boolean).join('; ')
    return `<span style="${style}">${escapeHtml(segment.text)}</span>`
  }).join('')
}

function stat(name: keyof typeof icons, label: string, value: string, extra = ''): string {
  return `<div class="stat"><div class="stat-label">${icon(name, '#9a9ca3', 16)}<span>${label}</span></div><div class="stat-value">${value}</div>${extra}</div>`
}

const baseStyle = (fontFamily: string) => `
* { box-sizing: border-box; }
.card { display: flex; flex-direction: column; width: ${width}px; padding: 28px; border-radius: 20px; color: #e8e9eb; background: #1b1c1f; font-family: ${fontFamily}, sans-serif; font-size: 16px; line-height: 1.5; }
.icon { display: block; flex-shrink: 0; }
.header { display: flex; align-items: center; gap: 16px; }
.header-main { display: flex; flex-direction: column; flex: 1; min-width: 0; }
h1 { margin: 0; font-size: 24px; line-height: 1.35; font-weight: 700; word-break: break-all; }
.sub { display: flex; align-items: center; gap: 8px; margin-top: 4px; color: #9a9ca3; font-size: 15px; }
.badge { display: flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; font-size: 14px; font-weight: 600; white-space: nowrap; }
.badge-ok { color: #8fd16a; background: rgba(108, 192, 74, .14); }
.badge-snapshot { color: #f5c451; background: rgba(245, 196, 81, .14); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #6cc04a; }
.stats { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
.stat { display: flex; flex-direction: column; width: 286px; padding: 14px 16px; border-radius: 14px; background: #25262a; }
.stat-label { display: flex; align-items: center; gap: 6px; color: #9a9ca3; font-size: 14px; }
.stat-value { margin-top: 4px; font-size: 18px; font-weight: 600; word-break: break-all; }
.bar { height: 6px; margin-top: 10px; border-radius: 3px; background: #34363b; }
.bar-fill { height: 6px; border-radius: 3px; background: #6cc04a; }
.section { display: flex; flex-direction: column; margin-top: 20px; }
.section-title { margin-bottom: 10px; color: #9a9ca3; font-size: 14px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { padding: 5px 11px; border-radius: 8px; color: #d4d5d8; background: #25262a; font-size: 14px; }
.footer { margin-top: 22px; color: #6d7076; font-size: 13px; }
`

export class CardRenderer {
  private engine?: { renderer: Renderer; fontFamily: string }

  constructor(private client: Pick<MojangClient, 'image'>, private signal: AbortSignal) {}

  private getEngine() {
    if (this.engine) return this.engine
    const require = createRequire(import.meta.url)
    const fonts = ['@fontsource-variable/noto-sans-sc', '@fontsource/dejavu-sans'].flatMap((pkg, i) => {
      const directory = resolve(dirname(require.resolve(`${pkg}/package.json`)), 'files')
      return readdirSync(directory).filter((name) => name.endsWith('.woff2')).sort().map((name, j) => ({
        name: `McFont${i}_${j}`, data: readFileSync(resolve(directory, name))
      }))
    })
    return this.engine = { renderer: new Renderer({ fonts, loadDefaultFonts: true }), fontFamily: fonts.map((font) => `'${font.name}'`).join(',') }
  }

  private async render(html: (fontFamily: string) => string): Promise<Buffer> {
    this.signal.throwIfAborted()
    const { renderer, fontFamily } = this.getEngine()
    const parsed = fromHtml(html(fontFamily))
    const node = decodeNode(parsed.node)
    const fetchedResources: ImageSource[] = await Promise.all([...new Set(extractResourceUrls(node))]
      .filter((src) => !src.startsWith('data:'))
      .map(async (src) => ({ src, data: await this.client.image(src).catch(() => missingImage) })))
    this.signal.throwIfAborted()
    return renderer.render(node, { width, format: 'png', stylesheets: parsed.stylesheets, fetchedResources }, this.signal)
  }

  server(status: ServerStatus, label?: string): Promise<Buffer> {
    return this.render((fontFamily) => serverHtml(status, label, fontFamily))
  }

  player(profile: PlayerProfile, renders: { body: string; head: string }): Promise<Buffer> {
    return this.render((fontFamily) => playerHtml(profile, renders, fontFamily))
  }

  versions(latest: { release: VersionEntry; snapshot: VersionEntry }): Promise<Buffer> {
    return this.render((fontFamily) => versionsHtml(latest, fontFamily))
  }

  update(update: VersionUpdate): Promise<Buffer> {
    return this.render((fontFamily) => updateHtml(update, fontFamily))
  }
}

/** fromHtml keeps entities; decoding the parsed tree, never the raw HTML, keeps user text from becoming markup. */
export function decodeNode(node: Node): Node {
  if (node.type === 'text') return { ...node, text: h.unescape(node.text) }
  if (node.type === 'image') return { ...node, src: typeof node.src === 'string' ? h.unescape(node.src) : node.src }
  return { ...node, children: node.children?.map((child) => child ? decodeNode(child) : child) }
}

export function serverHtml(status: ServerStatus, label: string | undefined, fontFamily: string): string {
  const percent = status.max > 0 ? Math.min(100, Math.round(status.online / status.max * 100)) : 0
  const edition = status.edition === 'java' ? 'Java 版' : '基岩版'
  const favicon = status.favicon
    ? `<img class="favicon" src="${status.favicon}" />`
    : `<div class="favicon favicon-empty">${icon('server', '#6d7076', 36)}</div>`
  const stats = [
    stat('users', '在线人数', `${status.online} / ${status.max}`, `<div class="bar"><div class="bar-fill" style="width: ${percent}%"></div></div>`),
    stat('signal', '延迟', `${status.latency} ms`),
    stat('versions', '版本', escapeHtml(clipped(status.version || '未知', 60)) + (status.protocol === undefined ? '' : `<span class="muted">（协议 ${status.protocol}）</span>`)),
    stat('world', '解析地址', escapeHtml(status.srv ? `SRV → ${status.srv}` : status.ip)),
    ...status.gamemode ? [stat('package', '游戏模式', escapeHtml(clipped(status.gamemode, 40)))] : [],
    ...status.mods === undefined ? [] : [stat('package', '模组数量', String(status.mods))],
    ...status.secureChat === undefined ? [] : [stat('shield', '安全聊天', status.secureChat ? '强制' : '不强制')]
  ]
  return `<style>${baseStyle(fontFamily)}
.favicon { width: 64px; height: 64px; border-radius: 10px; flex-shrink: 0; }
.favicon-empty { display: flex; align-items: center; justify-content: center; background: #25262a; }
.motd { margin-top: 20px; padding: 14px 18px; border-radius: 14px; background: #0f1012; font-size: 17px; line-height: 1.6; white-space: pre-wrap; word-break: break-all; }
.muted { color: #9a9ca3; font-size: 14px; font-weight: 400; margin-left: 4px; white-space: nowrap; }
</style>
<main class="card">
  <div class="header">${favicon}<div class="header-main"><h1>${escapeHtml(clipped(label ?? serverAddress(status), 60))}</h1><div class="sub"><span>${edition}</span>${label ? `<span>·</span><span>${escapeHtml(serverAddress(status))}</span>` : ''}</div></div><div class="badge badge-ok"><div class="dot"></div>在线</div></div>
  <div class="motd">${status.motd.length ? motdHtml(status.motd) : '<span style="color: #6d7076">无服务器描述</span>'}</div>
  <div class="stats">${stats.join('')}</div>
  ${status.players.length ? `<div class="section"><div class="section-title">在线玩家（显示 ${status.players.length} 名）</div><div class="chips">${status.players.map((name) => `<span class="chip">${escapeHtml(clipped(name, 32))}</span>`).join('')}</div></div>` : ''}
  <div class="footer">查询于 ${formatTime(Date.now())}</div>
</main>`
}

export function playerHtml(profile: PlayerProfile, renders: { body: string; head: string }, fontFamily: string): string {
  const stats = [
    stat('id', 'UUID', `<span class="mono">${formatUuid(profile.id)}</span>`),
    stat('shirt', '皮肤模型', profile.skin ? (profile.slim ? '纤细（Alex）' : '经典（Steve）') : '默认皮肤'),
    stat('flag', '官方披风', profile.cape ? '已装备' : '未装备'),
    stat('shield', '账号类型', profile.legacy ? '旧版账号（未迁移）' : '微软账号')
  ]
  return `<style>${baseStyle(fontFamily)}
.layout { display: flex; gap: 24px; }
.body { display: flex; align-items: center; justify-content: center; width: 200px; height: 360px; border-radius: 16px; background: #25262a; flex-shrink: 0; }
.body img { width: 160px; height: 324px; object-fit: contain; }
.info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.head { width: 56px; height: 56px; border-radius: 10px; }
.info .stats { margin-top: 16px; }
.info .stat { width: 100%; padding: 10px 14px; }
.info .stat-value { font-size: 16px; }
.mono { font-size: 14px; }
</style>
<main class="card">
  <div class="layout">
    <div class="body"><img src="${escapeHtml(renders.body)}" /></div>
    <div class="info">
      <div class="header"><img class="head" src="${escapeHtml(renders.head)}" /><div class="header-main"><h1>${escapeHtml(profile.name)}</h1><div class="sub">Minecraft Java 版玩家</div></div></div>
      <div class="stats">${stats.join('')}</div>
    </div>
  </div>
  <div class="footer">查询于 ${formatTime(Date.now())}</div>
</main>`
}

function versionRow(entry: VersionEntry): string {
  const snapshot = entry.type === 'snapshot'
  return `<div class="row">${icon(snapshot ? 'package' : 'versions', snapshot ? '#f5c451' : '#8fd16a', 28)}<div class="row-main"><div class="row-title">${escapeHtml(entry.id)}</div><div class="sub">${icon('calendar', '#9a9ca3', 15)}<span>${formatTime(entry.releaseTime)} 发布</span></div></div><div class="badge ${snapshot ? 'badge-snapshot' : 'badge-ok'}">${snapshot ? '快照' : '正式版'}</div></div>`
}

const versionStyle = `
.row { display: flex; align-items: center; gap: 16px; margin-top: 16px; padding: 16px 18px; border-radius: 14px; background: #25262a; }
.row-main { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.row-title { font-size: 22px; font-weight: 700; }
`

export function versionsHtml(latest: { release: VersionEntry; snapshot: VersionEntry }, fontFamily: string): string {
  return `<style>${baseStyle(fontFamily)}${versionStyle}</style>
<main class="card">
  <h1>Minecraft Java 版最新版本</h1>
  ${versionRow(latest.release)}${latest.snapshot.id === latest.release.id ? '' : versionRow(latest.snapshot)}
  <div class="footer">数据来自 Mojang 版本清单 · 查询于 ${formatTime(Date.now())}</div>
</main>`
}

export function updateHtml({ version, note }: VersionUpdate, fontFamily: string): string {
  return `<style>${baseStyle(fontFamily)}${versionStyle}
.note { display: flex; gap: 18px; margin-top: 16px; }
.note img { width: 140px; height: 140px; border-radius: 12px; object-fit: cover; flex-shrink: 0; }
.note-main { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.note-title { font-size: 18px; font-weight: 700; }
.note-text { margin-top: 6px; color: #c4c6ca; font-size: 15px; line-height: 1.6; word-break: break-word; }
</style>
<main class="card">
  <div class="header"><h1>Minecraft Java 版更新</h1></div>
  ${versionRow(version)}
  ${note ? `<div class="note">${note.image ? `<img src="${escapeHtml(note.image)}" />` : ''}<div class="note-main"><div class="note-title">${escapeHtml(clipped(note.title, 80))}</div><div class="note-text">${escapeHtml(clipped(note.shortText, 360))}</div></div></div>` : ''}
  <div class="footer">数据来自 Mojang 版本清单 · 推送于 ${formatTime(Date.now())}</div>
</main>`
}
