import { formatUuid } from './mojang'
import { formatTime, serverAddress } from './render'
import { plainText } from './motd'
import type { PlayerProfile, ServerStatus, VersionEntry, VersionUpdate } from './types'

export function serverText(status: ServerStatus, label?: string): string {
  const motd = plainText(status.motd).split('\n').map((line) => line.trim()).filter(Boolean).join('\n')
  return [
    `【${label ?? serverAddress(status)}】${status.edition === 'java' ? 'Java 版' : '基岩版'} · 在线`,
    ...label ? [`地址：${serverAddress(status)}`] : [],
    ...motd ? [motd] : [],
    `版本：${status.version || '未知'}${status.protocol === undefined ? '' : `（协议 ${status.protocol}）`}`,
    `在线人数：${status.online} / ${status.max}`,
    `延迟：${status.latency} ms`,
    ...status.srv ? [`SRV：${status.srv}`] : [],
    ...status.gamemode ? [`游戏模式：${status.gamemode}`] : [],
    ...status.mods === undefined ? [] : [`模组数量：${status.mods}`],
    ...status.players.length ? [`在线玩家：${status.players.join('、')}`] : []
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
  return `${entry.type === 'release' ? '正式版' : '快照'}：${entry.id}（${formatTime(entry.releaseTime)} 发布）`
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
