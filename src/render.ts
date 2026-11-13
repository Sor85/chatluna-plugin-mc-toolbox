import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { h } from '@satorijs/core'
import { extractResourceUrls, type ImageSource, type Node, Renderer } from '@takumi-rs/core'
import { fromHtml } from '@takumi-rs/helpers/html'
import { formatUuid, type MojangClient } from './mojang'
import type { PlayerProfile, ServerStatus, TextSegment, VersionEntry, VersionUpdate } from './types'

const width = 680
const missingImage = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#2a2b31"/></svg>')
const dateTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
})
const accents = { java: '#6cc04a', bedrock: '#4fa8e0', release: '#6cc04a', snapshot: '#f5b942' }
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
  shield: '<path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3"/><path d="M11 11a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M12 12l0 2.5"/>',
  cpu: '<path d="M5 6a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1l0 -12"/><path d="M9 9h6v6h-6l0 -6"/><path d="M3 10h2"/><path d="M3 14h2"/><path d="M10 3v2"/><path d="M14 3v2"/><path d="M21 10h-2"/><path d="M21 14h-2"/><path d="M14 21v-2"/><path d="M10 21v-2"/>',
  map: '<path d="M3 7l6 -3l6 3l6 -3v13l-6 3l-6 -3l-6 3v-13"/><path d="M9 4v13"/><path d="M15 7v13"/>',
  plug: '<path d="M9.785 6l8.215 8.215l-2.054 2.054a5.81 5.81 0 1 1 -8.215 -8.215l2.054 -2.054"/><path d="M4 20l3.5 -3.5"/><path d="M15 4l-3.5 3.5"/><path d="M20 9l-3.5 3.5"/>',
  message: '<path d="M8 9h8"/><path d="M8 13h6"/><path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12"/>',
  route: '<path d="M3 19a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"/><path d="M19 7a2 2 0 1 0 0 -4a2 2 0 0 0 0 4"/><path d="M11 19h5.5a3.5 3.5 0 0 0 0 -7h-8a3.5 3.5 0 0 1 0 -7h4.5"/>',
  sparkles: '<path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6"/>',
  cube: '<path d="M21 16.008v-8.018a1.98 1.98 0 0 0 -1 -1.717l-7 -4.008a2.016 2.016 0 0 0 -2 0l-7 4.008c-.619 .355 -1 1.01 -1 1.718v8.018c0 .709 .381 1.363 1 1.717l7 4.008a2.016 2.016 0 0 0 2 0l7 -4.008c.619 -.355 1 -1.01 1 -1.718"/><path d="M12 22v-10"/><path d="M12 12l8.73 -5.04"/><path d="M3.27 6.96l8.73 5.04"/>'
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

function formatCount(value: number): string {
  return value.toLocaleString('en-US')
}

export function daysAgo(value: string, now = Date.now()): string {
  const days = Math.floor((now - new Date(value).getTime()) / 86400000)
  if (Number.isNaN(days)) return ''
  return days <= 0 ? '今天' : `${days} 天前`
}

export function serverAddress(status: ServerStatus): string {
  const host = status.host.includes(':') ? `[${status.host}]` : status.host
  return status.port === (status.edition === 'java' ? 25565 : 19132) ? host : `${host}:${status.port}`
}

/** Fake-IP proxies answer every lookup from 198.18.0.0/15; such an address says nothing about the server. */
export function isFakeIp(address: string): boolean {
  return /^198\.1[89]\./.test(address)
}

export function latencyColor(latency: number): string {
  return latency < 100 ? '#6cc04a' : latency < 250 ? '#f5b942' : '#ef5b5b'
}

function icon(name: keyof typeof icons, color = '#8b8e96', size = 18): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`
  return `<img class="icon" style="width: ${size}px; height: ${size}px" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" />`
}

function motdHtml(segments: TextSegment[], fallback: string): string {
  return segments.map((segment) => {
    const style = [
      `color: ${segment.color ?? fallback}`,
      segment.bold ? 'font-weight: 700' : '',
      segment.italic ? 'font-style: italic' : '',
      segment.underlined || segment.strikethrough
        ? `text-decoration: ${[segment.underlined ? 'underline' : '', segment.strikethrough ? 'line-through' : ''].join(' ').trim()}` : ''
    ].filter(Boolean).join('; ')
    return `<span style="${style}">${escapeHtml(segment.text)}</span>`
  }).join('')
}

function tag(text: string, color: string): string {
  return `<span class="tag" style="color: ${color}; border-color: ${color}55; background-color: ${color}1f">${escapeHtml(text)}</span>`
}

function field(name: keyof typeof icons, label: string, value: string): string {
  return `<div class="field"><div class="field-label">${icon(name, '#8b8e96', 15)}<span>${label}</span></div><div class="field-value">${value}</div></div>`
}

function section(name: keyof typeof icons, title: string, body: string, extra = ''): string {
  return `<div class="section"><div class="section-title">${icon(name, '#8b8e96', 16)}<span>${title}</span>${extra ? `<span class="section-extra">${extra}</span>` : ''}</div>${body}</div>`
}

function chips(items: string[], limit: number): string {
  const shown = items.slice(0, limit).map((item) => `<span class="chip">${escapeHtml(clipped(item, 40))}</span>`).join('')
  return `<div class="chips">${shown}${items.length > limit ? `<span class="chip chip-more">等 ${items.length} 项</span>` : ''}</div>`
}

/** Crops one face of a 64×64 skin by scaling the whole texture inside a clipped box; `pixelated` keeps texels sharp. */
function skinCrop(texture: string, x: number, y: number, w: number, h: number, scale: number, extra = ''): string {
  return `<div class="crop" style="width: ${w * scale}px; height: ${h * scale}px; ${extra}"><img src="${escapeHtml(texture)}" style="left: ${-x * scale}px; top: ${-y * scale}px; width: ${64 * scale}px" /></div>`
}

function pixelHead(texture: string, size: number): string {
  const scale = size / 8
  return `<div class="pixel-head" style="width: ${size}px; height: ${size}px">${skinCrop(texture, 8, 8, 8, 8, scale)}${skinCrop(texture, 40, 8, 8, 8, scale, 'position: absolute; left: 0; top: 0')}</div>`
}

const baseStyle = (fontFamily: string) => `
* { box-sizing: border-box; }
.card { position: relative; display: flex; flex-direction: column; width: ${width}px; overflow: hidden; border-radius: 24px; color: #ecedef; background-color: #111214; font-family: ${fontFamily}, sans-serif; font-size: 16px; line-height: 1.5; }
.icon { display: block; flex-shrink: 0; }
/* Backdrop layers sit directly on the card: Takumi drops absolute children of an absolute clipping box. */
/* The blur bleeds past the image edge, so the shade runs well below it and is opaque before it ends. */
.hero-bg { position: absolute; left: -40px; top: -380px; width: 760px; height: 760px; filter: blur(64px); opacity: .55; }
.hero-shade { position: absolute; left: 0; top: 0; width: ${width}px; height: 560px; background-image: linear-gradient(180deg, rgba(17, 18, 20, .1) 0%, rgba(17, 18, 20, .6) 40%, #111214 78%); }
.hero-content { position: relative; display: flex; flex-direction: column; padding: 30px 30px 6px; }
.body { position: relative; display: flex; flex-direction: column; gap: 14px; padding: 18px 30px 0; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.tag { padding: 2px 10px; border: 1px solid; border-radius: 999px; font-size: 13px; font-weight: 600; line-height: 1.6; }
.panel { display: flex; flex-direction: column; padding: 16px 18px; border: 1px solid rgba(255, 255, 255, .06); border-radius: 16px; background-color: #1a1b1f; }
.fields { display: flex; flex-wrap: wrap; gap: 10px; }
.field { display: flex; flex-direction: column; width: 304px; padding: 12px 16px; border: 1px solid rgba(255, 255, 255, .06); border-radius: 14px; background-color: #1a1b1f; }
.field-label { display: flex; align-items: center; gap: 6px; color: #8b8e96; font-size: 13px; }
.field-value { margin-top: 3px; font-size: 16px; font-weight: 600; word-break: break-all; }
.section { display: flex; flex-direction: column; }
.section-title { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; color: #8b8e96; font-size: 14px; font-weight: 600; }
.section-extra { margin-left: auto; color: #5f626b; font-weight: 400; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { padding: 4px 10px; border-radius: 8px; color: #c9cbd0; background-color: #1f2025; font-size: 13px; }
.chip-more { color: #8b8e96; }
.crop { position: relative; overflow: hidden; flex-shrink: 0; }
.crop img { position: absolute; image-rendering: pixelated; }
.pixel-head { position: relative; display: flex; flex-shrink: 0; }
.footer { position: relative; display: flex; align-items: center; gap: 6px; margin-top: 18px; padding: 14px 30px 18px; border-top: 1px solid rgba(255, 255, 255, .05); color: #5f626b; font-size: 13px; }
.footer-time { margin-left: auto; }
`

function footer(label: string): string {
  return `<div class="footer">${icon('cube', '#5f626b', 15)}<span>Minecraft 工具箱</span><span class="footer-time">${label} ${formatTime(Date.now())}</span></div>`
}

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

  server(status: ServerStatus, label: string | undefined, avatar: Avatar): Promise<Buffer> {
    return this.render((fontFamily) => serverHtml(status, label, avatar, fontFamily))
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

/** Returns an avatar URL for a player UUID or name, or nothing when the configured service cannot serve it. */
export type Avatar = (player: { name: string; id?: string }) => string | undefined

/** fromHtml keeps entities; decoding the parsed tree, never the raw HTML, keeps user text from becoming markup. */
export function decodeNode(node: Node): Node {
  if (node.type === 'text') return { ...node, text: h.unescape(node.text) }
  if (node.type === 'image') return { ...node, src: typeof node.src === 'string' ? h.unescape(node.src) : node.src }
  return { ...node, children: node.children?.map((child) => child ? decodeNode(child) : child) }
}

export function serverHtml(status: ServerStatus, label: string | undefined, avatar: Avatar, fontFamily: string): string {
  const accent = accents[status.edition]
  const percent = status.max > 0 ? Math.min(100, Math.round(status.online / status.max * 100)) : 0
  const queryPlayers = status.query?.players ?? []
  const players = queryPlayers.length ? queryPlayers.map((name) => ({ name, id: undefined })) : status.players
  const address = serverAddress(status)
  const fields = [
    field('versions', '版本', escapeHtml(clipped(status.version || '未知', 48))),
    ...status.protocol === undefined ? [] : [field('cpu', '协议', `${status.protocol}${status.protocolName ? ` <span class="soft">· ${escapeHtml(status.protocolName)}</span>` : ''}`)],
    ...status.srv ? [field('route', 'SRV 记录', escapeHtml(status.srv))] : [],
    ...isFakeIp(status.ip) ? [] : [field('world', 'IP 地址', escapeHtml(status.ip))],
    ...status.gamemode ? [field('package', '游戏模式', escapeHtml(clipped(status.gamemode, 32)))] : [],
    ...status.levelName ? [field('map', '世界名称', escapeHtml(clipped(status.levelName, 40)))] : [],
    ...status.query?.map ? [field('map', '地图', escapeHtml(clipped(status.query.map, 40)))] : [],
    ...status.bedrockEdition === 'MCEE' ? [field('cube', '客户端类型', '教育版')] : [],
    ...status.portV4 || status.portV6 ? [field('plug', '端口', escapeHtml([status.portV4 ? `IPv4 ${status.portV4}` : '', status.portV6 ? `IPv6 ${status.portV6}` : ''].filter(Boolean).join(' · ')))] : [],
    ...status.secureChat === undefined ? [] : [field('message', '安全聊天', status.secureChat ? '强制签名' : '不强制')],
    ...status.preventsChatReports ? [field('shield', '聊天举报', '已屏蔽（NoChatReports）')] : [],
    ...status.serverId ? [field('id', '服务器 ID', escapeHtml(clipped(status.serverId, 24)))] : []
  ]
  const shown = players.slice(0, 16)
  const playerList = shown.length ? `<div class="players">${shown.map((player) => {
    const url = avatar(player)
    return `<div class="player">${url ? `<img class="player-head" src="${escapeHtml(url)}" />` : `<div class="player-head"></div>`}<span>${escapeHtml(player.name)}</span></div>`
  }).join('')}${players.length > shown.length ? `<div class="player player-more">等 ${players.length} 人</div>` : ''}</div>` : ''
  const icon64 = status.favicon
    ? `<img class="favicon" src="${status.favicon}" />`
    : `<div class="favicon favicon-empty">${icon(status.edition === 'java' ? 'server' : 'cube', accent, 38)}</div>`
  return `<style>${baseStyle(fontFamily)}
.head { display: flex; align-items: center; gap: 18px; }
.favicon { width: 84px; height: 84px; border-radius: 16px; flex-shrink: 0; image-rendering: pixelated; box-shadow: 0 10px 30px rgba(0, 0, 0, .45), 0 0 0 1px rgba(255, 255, 255, .12); }
.favicon-empty { display: flex; align-items: center; justify-content: center; background-color: #1f2025; }
.title-block { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.title { font-size: 28px; line-height: 1.25; font-weight: 800; word-break: break-all; }
.address { margin-top: 2px; color: #a3a6ad; font-size: 14px; }
.status { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0; }
.online { display: flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; color: #8fd16a; background-color: rgba(108, 192, 74, .16); font-size: 13px; font-weight: 700; }
.dot { width: 8px; height: 8px; border-radius: 50%; background-color: #6cc04a; box-shadow: 0 0 8px #6cc04a; }
.latency { display: flex; align-items: center; gap: 5px; font-size: 15px; font-weight: 700; }
.motd { margin-top: 20px; padding: 14px 18px; border: 1px solid rgba(255, 255, 255, .08); border-radius: 14px; background-color: rgba(0, 0, 0, .5); font-size: 17px; line-height: 1.55; white-space: pre-wrap; word-break: break-all; }
.count-row { display: flex; align-items: baseline; gap: 8px; }
.count { font-size: 30px; font-weight: 800; line-height: 1.2; }
.count-max { color: #8b8e96; font-size: 15px; }
.percent { margin-left: auto; color: #8b8e96; font-size: 14px; }
.bar { height: 8px; margin-top: 10px; border-radius: 4px; background-color: #26272c; }
.fill { height: 8px; border-radius: 4px; background-image: linear-gradient(90deg, ${accent}aa, ${accent}); }
.players { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.player { display: flex; align-items: center; gap: 7px; padding: 4px 10px 4px 4px; border-radius: 9px; background-color: #23242a; font-size: 13px; }
.player-head { width: 22px; height: 22px; border-radius: 5px; background-color: #2f3036; }
.player-more { padding: 4px 10px; color: #8b8e96; }
.soft { color: #8b8e96; font-weight: 500; }
.tooltip { display: flex; flex-direction: column; padding: 12px 16px; border: 2px solid #3d1a8a; border-radius: 10px; background-color: #120a1c; font-size: 15px; line-height: 1.6; }
</style>
<main class="card">
  ${status.favicon ? `<img class="hero-bg" src="${status.favicon}" />` : `<div class="hero-bg" style="background-image: radial-gradient(circle, ${accent}88, transparent 70%)"></div>`}
  <div class="hero-shade"></div>
  <section class="hero-content">
      <div class="head">
        ${icon64}
        <div class="title-block">
          <div class="title">${escapeHtml(clipped(label ?? address, 40))}</div>
          ${label ? `<div class="address">${escapeHtml(address)}</div>` : ''}
          <div class="tags">${[
            tag(status.edition === 'java' ? 'Java 版' : '基岩版', accent),
            ...status.software ? [tag(status.software, '#c792ea')] : [],
            ...status.modLoader ? [tag(status.modLoader, '#f78c6c')] : [],
            ...status.protocolName ? [tag(status.protocolName, '#82aaff')] : [],
            ...status.edition === 'bedrock' && /^\d+(\.\d+)+$/.test(status.version) ? [tag(status.version, '#82aaff')] : []
          ].join('')}</div>
        </div>
        <div class="status">
          <div class="online"><div class="dot"></div>在线</div>
          <div class="latency" style="color: ${latencyColor(status.latency)}">${icon('signal', latencyColor(status.latency), 17)}<span>${status.latency} ms</span></div>
        </div>
      </div>
      <div class="motd">${status.motd.length ? motdHtml(status.motd, status.edition === 'java' ? '#aaaaaa' : '#ffffff') : '<span style="color: #5f626b">无服务器描述</span>'}</div>
  </section>
  <section class="body">
    <div class="panel">
      <div class="count-row"><span class="count">${formatCount(status.online)}</span><span class="count-max">/ ${formatCount(status.max)} 在线</span><span class="percent">${percent}%</span></div>
      <div class="bar"><div class="fill" style="width: ${Math.max(percent, status.online > 0 ? 2 : 0)}%"></div></div>
      ${playerList}
    </div>
    <div class="fields">${fields.join('')}</div>
    ${status.notes.length ? section('message', '服务器信息', `<div class="tooltip">${status.notes.slice(0, 12).map((line) => `<div>${motdHtml(line, '#aaaaaa')}</div>`).join('')}</div>`) : ''}
    ${status.mods.length ? section('package', '模组', chips(status.mods.map((mod) => mod.version && mod.version !== 'ANY' ? `${mod.id} ${mod.version}` : mod.id), 40), `${status.mods.length} 个`) : ''}
    ${status.query?.plugins.length ? section('plug', '插件', chips(status.query.plugins, 40), `${status.query.plugins.length} 个`) : ''}
  </section>
  ${footer('查询于')}
</main>`
}

export function playerHtml(profile: PlayerProfile, renders: { body: string; head: string }, fontFamily: string): string {
  const fields = [
    field('shirt', '皮肤模型', profile.skin ? (profile.slim ? '纤细（Alex）' : '经典（Steve）') : '默认皮肤'),
    field('flag', '官方披风', profile.cape ? '已装备' : '未装备'),
    field('shield', '账号类型', profile.legacy ? '旧版账号（未迁移）' : '微软账号')
  ]
  const head = profile.skin ? pixelHead(profile.skin, 76) : `<img class="head-img" src="${escapeHtml(renders.head)}" />`
  const textures = profile.skin ? section('sparkles', '皮肤与披风', `<div class="textures">
    <div class="texture-box"><img class="skin-texture" src="${escapeHtml(profile.skin)}" /><span>皮肤贴图</span></div>
    ${profile.cape ? `<div class="texture-box">${skinCrop(profile.cape, 1, 1, 10, 16, 8)}<span>披风正面</span></div>` : ''}
  </div>`) : ''
  return `<style>${baseStyle(fontFamily)}
.layout { position: relative; display: flex; gap: 24px; padding: 30px 30px 0; }
.showcase { position: relative; display: flex; align-items: center; justify-content: center; width: 230px; height: 400px; overflow: hidden; border: 1px solid rgba(255, 255, 255, .06); border-radius: 20px; background-color: #17181c; flex-shrink: 0; }
.glow { position: absolute; left: -60px; top: 20px; width: 350px; height: 350px; background-image: radial-gradient(circle, rgba(108, 192, 74, .35), transparent 65%); }
.floor { position: absolute; left: 35px; bottom: 34px; width: 160px; height: 22px; border-radius: 50%; background-color: rgba(0, 0, 0, .45); filter: blur(6px); }
.body-img { position: relative; width: 170px; height: 344px; object-fit: contain; }
.info { display: flex; flex-direction: column; flex: 1; min-width: 0; gap: 14px; }
.head-row { display: flex; align-items: center; gap: 16px; }
.pixel-head, .head-img { width: 76px; height: 76px; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 26px rgba(0, 0, 0, .5), 0 0 0 1px rgba(255, 255, 255, .12); }
.name { font-size: 30px; line-height: 1.2; font-weight: 800; word-break: break-all; }
.sub { margin-top: 4px; color: #8b8e96; font-size: 14px; }
.uuid { display: flex; flex-direction: column; padding: 12px 16px; border: 1px solid rgba(255, 255, 255, .06); border-radius: 14px; background-color: #1a1b1f; }
.uuid-value { margin-top: 3px; font-size: 15px; font-weight: 600; }
.info .field { width: 100%; }
.textures { display: flex; gap: 14px; }
.texture-box { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 16px 20px 10px; border: 1px solid rgba(255, 255, 255, .06); border-radius: 14px; background-color: #1a1b1f; color: #8b8e96; font-size: 12px; }
.skin-texture { width: 160px; height: 160px; image-rendering: pixelated; }
.body { padding-top: 16px; }
</style>
<main class="card">
  <div class="layout">
    <div class="showcase"><div class="glow"></div><div class="floor"></div><img class="body-img" src="${escapeHtml(renders.body)}" /></div>
    <div class="info">
      <div class="head-row">${head}<div class="title-block"><div class="name">${escapeHtml(profile.name)}</div><div class="sub">Minecraft Java 版正版玩家</div></div></div>
      <div class="uuid"><div class="field-label">${icon('id', '#8b8e96', 15)}<span>UUID</span></div><div class="uuid-value">${formatUuid(profile.id)}</div></div>
      ${fields.join('')}
    </div>
  </div>
  ${textures ? `<section class="body">${textures}</section>` : ''}
  ${footer('查询于')}
</main>`
}

function versionTile(entry: VersionEntry, wide: boolean): string {
  const snapshot = entry.type === 'snapshot'
  const accent = snapshot ? accents.snapshot : accents.release
  return `<div class="tile" style="${wide ? 'width: 100%' : ''}; border-color: ${accent}40">
    <div class="tile-glow" style="background-image: radial-gradient(circle, ${accent}38, transparent 65%)"></div>
    <div class="tile-top">${icon(snapshot ? 'package' : 'versions', accent, 22)}<span style="color: ${accent}">${snapshot ? '最新快照' : '最新正式版'}</span></div>
    <div class="tile-id">${escapeHtml(entry.id)}</div>
    <div class="tile-date">${icon('calendar', '#8b8e96', 14)}<span>${formatTime(entry.releaseTime)}</span><span class="tile-ago">${daysAgo(entry.releaseTime)}</span></div>
  </div>`
}

const versionStyle = `
.tiles { display: flex; gap: 14px; padding: 0 30px; }
.tile { position: relative; display: flex; flex-direction: column; width: 303px; overflow: hidden; padding: 20px 22px; border: 1px solid; border-radius: 18px; background-color: #1a1b1f; }
.tile-glow { position: absolute; right: -90px; top: -90px; width: 240px; height: 240px; }
.tile-top { position: relative; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; }
.tile-id { position: relative; margin-top: 14px; font-size: 32px; line-height: 1.15; font-weight: 800; word-break: break-all; }
.tile-date { position: relative; display: flex; align-items: center; gap: 6px; margin-top: 12px; color: #8b8e96; font-size: 13px; }
.tile-ago { margin-left: auto; padding: 1px 8px; border-radius: 6px; background-color: #26272c; color: #a3a6ad; }
.heading { display: flex; align-items: center; gap: 12px; padding: 30px 30px 20px; }
.heading-title { font-size: 26px; font-weight: 800; line-height: 1.2; }
.heading-sub { margin-top: 2px; color: #8b8e96; font-size: 14px; }
`

export function versionsHtml(latest: { release: VersionEntry; snapshot: VersionEntry }, fontFamily: string): string {
  const same = latest.snapshot.id === latest.release.id
  return `<style>${baseStyle(fontFamily)}${versionStyle}</style>
<main class="card">
  <div class="heading">${icon('cube', accents.release, 40)}<div><div class="heading-title">Minecraft Java 版</div><div class="heading-sub">官方版本清单中的最新版本</div></div></div>
  <div class="tiles">${versionTile(latest.release, same)}${same ? '' : versionTile(latest.snapshot, false)}</div>
  ${footer('查询于')}
</main>`
}

export function updateHtml({ version, note }: VersionUpdate, fontFamily: string): string {
  const snapshot = version.type === 'snapshot'
  const accent = snapshot ? accents.snapshot : accents.release
  const banner = note?.image
    ? `<img class="banner-img" src="${escapeHtml(note.image)}" />`
    : `<div class="banner-img" style="background-image: radial-gradient(circle at 30% 20%, ${accent}66, transparent 60%), linear-gradient(135deg, #1d2a1c, #111214)"></div>`
  return `<style>${baseStyle(fontFamily)}
.banner { position: relative; display: flex; height: 280px; overflow: hidden; }
.banner-img { position: absolute; left: 0; top: -200px; width: ${width}px; height: ${width}px; object-fit: cover; }
.banner-shade { position: absolute; left: 0; top: 0; right: 0; bottom: 0; background-image: linear-gradient(180deg, rgba(17, 18, 20, 0) 30%, rgba(17, 18, 20, .75) 72%, #111214 100%); }
.banner-content { position: absolute; left: 30px; right: 30px; bottom: 6px; display: flex; flex-direction: column; }
.badge { display: flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 700; color: #111214; background-color: ${accent}; }
.version-id { margin-top: 10px; font-size: 38px; line-height: 1.15; font-weight: 800; text-shadow: 0 2px 12px rgba(0, 0, 0, .6); word-break: break-all; }
.meta { display: flex; align-items: center; gap: 6px; margin-top: 6px; color: #c9cbd0; font-size: 14px; }
.note-title { font-size: 19px; font-weight: 700; }
.note-text { margin-top: 6px; color: #b8bac0; font-size: 15px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; }
</style>
<main class="card">
  <div class="banner">
    ${banner}
    <div class="banner-shade"></div>
    <div class="banner-content">
      <div style="display: flex"><div class="badge">${icon('sparkles', '#111214', 15)}<span>${snapshot ? '新快照' : '新正式版'}</span></div></div>
      <div class="version-id">Minecraft ${escapeHtml(version.id)}</div>
      <div class="meta">${icon('calendar', '#c9cbd0', 15)}<span>${formatTime(version.releaseTime)} 发布 · Java 版</span></div>
    </div>
  </div>
  ${note ? `<section class="body"><div class="panel"><div class="note-title">${escapeHtml(clipped(note.title, 80))}</div><div class="note-text">${escapeHtml(clipped(note.shortText.replace(/\r\n/g, '\n').trim(), 420))}</div></div></section>` : ''}
  ${footer('推送于')}
</main>`
}
