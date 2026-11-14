import type { Context } from 'cordis'
import { h } from '@satorijs/core'
import { Schema } from '@chatluna/schema'
import type { ToolCallContext } from '@chatluna/tool'
import type {} from '@chatluna/chat'
import type { Config } from './config'
import { formatUuid } from './mojang'
import { plainText } from './motd'
import { serverAddress } from './render'
import type { Toolbox } from './toolbox'
import type { Edition } from './types'

const cardNote = 'An image card with these details has already been sent to the user; reply briefly without repeating every field.'

export function registerTools(ctx: Context, config: Config, toolbox: Toolbox, lifetime: AbortSignal) {
  /** Sends the card to the calling conversation only; the route comes from the call, never from model arguments. */
  async function sendCard(call: ToolCallContext, card: () => Promise<h | h[]>): Promise<boolean> {
    if (config.output !== 'image') return false
    const session = call.routeId ? ctx.chat.inbound(call.routeId) : undefined
    if (!session) return false
    await ctx.chat.send(session.route, await card())
    return true
  }

  ctx.tools.define<{ address: string; edition: Edition | 'auto' }>({
    name: 'mc_server_status',
    description: 'Query the live status of a Minecraft Java or Bedrock server: MOTD, version, online players, latency.',
    locales: {
      zh: {
        description: '查询 Minecraft Java 版或基岩版服务器的实时状态：MOTD、版本、在线人数与延迟。',
        args: { address: '服务器地址，host、host:port 或配置中的常用服务器名称', edition: '服务器版本，auto 时同时尝试两种' }
      }
    },
    args: Schema.object({
      address: Schema.string().min(1).required().description('Server address as host, host:port, or a configured server name'),
      edition: Schema.union(['auto', 'java', 'bedrock']).default('auto').description('Server edition; auto tries both')
    }),
    traits: { effect: 'read', parallel: true, background: false, timeout: 30000 },
    async run({ address, edition }, call) {
      const signal = AbortSignal.any([lifetime, call.signal])
      const [result] = await toolbox.servers(address, edition === 'auto' ? undefined : edition, signal)
      const { status } = result
      if (!status) throw new Error(result.error)
      const sent = await sendCard(call, () => toolbox.serverMessage([result], 'image'))
      return {
        address: serverAddress(status),
        edition: status.edition,
        motd: plainText(status.motd),
        version: status.version,
        protocol: status.protocol ?? null,
        online: status.online,
        max: status.max,
        latencyMs: status.latency,
        protocolName: status.protocolName ?? null,
        software: status.software ?? null,
        modLoader: status.modLoader ?? null,
        players: status.query?.players.length ? status.query.players : status.players.map((player) => player.name),
        notes: status.notes.map((line) => plainText(line)),
        mods: status.mods.map((mod) => mod.id).slice(0, 50),
        plugins: status.query?.plugins.slice(0, 50) ?? [],
        ...status.gamemode ? { gamemode: status.gamemode } : {},
        ...status.query?.map ? { map: status.query.map } : {},
        ...sent ? { note: cardNote } : {}
      }
    }
  })

  ctx.tools.define<{ player: string }>({
    name: 'mc_player_profile',
    description: 'Look up a Minecraft Java Edition player by name or UUID: canonical name, UUID, skin model and cape.',
    locales: { zh: { description: '按玩家名或 UUID 查询 Minecraft Java 版玩家：正式名称、UUID、皮肤模型与披风。', args: { player: '玩家名或 UUID' } } },
    args: Schema.object({ player: Schema.string().min(1).required().description('Player name or UUID') }),
    traits: { effect: 'read', parallel: true, background: false, timeout: 30000 },
    async run({ player }, call) {
      const profile = await toolbox.player(player)
      if (!profile) return { found: false }
      const sent = await sendCard(call, () => toolbox.playerMessage(profile, 'image'))
      return {
        found: true,
        name: profile.name,
        uuid: formatUuid(profile.id),
        skinModel: profile.skin ? (profile.slim ? 'slim' : 'classic') : 'default',
        cape: Boolean(profile.cape),
        ...sent ? { note: cardNote } : {}
      }
    }
  })
}
