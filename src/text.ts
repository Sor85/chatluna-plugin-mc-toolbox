import { formatUuid } from './mojang'
import { daysAgo, formatTime, isFakeIp, serverAddress } from './render'
import { plainText } from './motd'
import type { PlayerProfile, ServerStatus, VersionEntry, VersionUpdate } from './types'

function limited(items: string[], limit: number): string {
  return items.length > limit ? `${items.slice(0, limit).join('、')} 等 ${items.length} 项` : items.join('、')
}

export function serverText(status: ServerStatus, label?: string): string {
  const motd = plainText(status.motd).split('\n').map((line) => line.trim()).filter(Boolean).join('\n')
  const players = status.query?.players.length ? status.query.players : status.players.map((player) => player.name)
  const notes = status.notes.map((line) => plainText(line).trim()).filter(Boolean)
  return [
    `【${label ?? serverAddress(status)}】${status.edition === 'java' ? 'Java 版' : '基岩版'} · 在线`,
    ...label ? [`地址：${serverAddress(status)}`] : [],
    ...motd ? [motd] : [],
    `版本：${status.version || '未知'}`,
    ...status.protocol === undefined ? [] : [`协议：${status.protocol}${status.protocolName ? `（${status.protocolName}）` : ''}`],
    ...status.software ? [`服务端：${status.software}`] : [],
    ...status.modLoader ? [`模组加载器：${status.modLoader}`] : [],
    `在线人数：${status.online} / ${status.max}`,
    `延迟：${status.latency} ms`,
    ...status.srv ? [`SRV：${status.srv}`] : [],
    ...isFakeIp(status.ip) ? [] : [`IP：${status.ip}`],
    ...status.gamemode ? [`游戏模式：${status.gamemode}`] : [],
    ...status.levelName ? [`世界名称：${status.levelName}`] : [],
    ...status.query?.map ? [`地图：${status.query.map}`] : [],
    ...status.secureChat === undefined ? [] : [`安全聊天：${status.secureChat ? '强制签名' : '不强制'}`],
    ...status.preventsChatReports ? ['聊天举报：已屏蔽（NoChatReports）'] : [],
    ...players.length ? [`在线玩家：${limited(players, 30)}`] : [],
    ...notes.length ? [`服务器信息：\n${notes.slice(0, 12).join('\n')}`] : [],
    ...status.mods.length ? [`模组（${status.mods.length}）：${limited(status.mods.map((mod) => mod.id), 30)}`] : [],
    ...status.query?.plugins.length ? [`插件（${status.query.plugins.length}）：${limited(status.query.plugins, 30)}`] : []
  ].join('\n')
}

export function playerText(profile: PlayerProfile): string {
  return [
    `【${profile.name}】Minecraft Java 版玩家`,
    `UUID：${formatUuid(profile.id)}`,
    `皮肤模型：${profile.skin ? (profile.slim ? '纤细（Alex）' : '经典（Steve）') : '默认皮肤'}`,
    `官方披风：${profile.cape ? '已装备' : '未装备'}`,
    ...profile.legacy ? ['账号类型：旧版账号（未迁移）'] : [],
    ...profile.skin ? [`皮肤文件：${profile.skin}`] : []
  ].join('\n')
}

function versionLine(entry: VersionEntry): string {
  return `${entry.type === 'release' ? '正式版' : '快照'}：${entry.id}（${formatTime(entry.releaseTime)} 发布，${daysAgo(entry.releaseTime)}）`
}

export function versionsText(latest: { release: VersionEntry; snapshot: VersionEntry }): string {
  return ['Minecraft Java 版最新版本', versionLine(latest.release), ...latest.snapshot.id === latest.release.id ? [] : [versionLine(latest.snapshot)]].join('\n')
}

export function updateText({ version, note }: VersionUpdate): string {
  return [
    `Minecraft Java 版发布了新${version.type === 'release' ? '正式版' : '快照'}：${version.id}`,
    `发布时间：${formatTime(version.releaseTime)}`,
    ...note ? [note.title, note.shortText] : []
  ].join('\n')
}
