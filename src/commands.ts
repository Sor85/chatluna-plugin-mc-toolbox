import type { Context } from 'cordis'
import { h } from '@satorijs/core'
import type {} from 'koishi'
import type { Config, Output } from './config'
import { errorMessage, type Toolbox } from './toolbox'
import type { Edition } from './types'

interface OutputOptions {
  text?: boolean
  image?: boolean
}

function outputOf(options: OutputOptions | undefined, config: Config): Output {
  if (options?.text) return 'text'
  if (options?.image) return 'image'
  return config.output
}

export function registerCommands(ctx: Context, config: Config, toolbox: Toolbox) {
  ctx.command('mc', 'Minecraft 工具箱')

  ctx.command('mc.server [address:string]', '查询 Minecraft 服务器状态')
    .alias('查服')
    .option('java', '-j 仅查询 Java 版')
    .option('bedrock', '-b 仅查询基岩版')
    .option('text', '-t 输出文字')
    .option('image', '-i 输出图片')
    .usage('地址格式为 host、host:port 或 [IPv6]:port；不带地址时查询配置中的常用服务器，也可直接使用常用服务器名称。')
    .example('mc.server mc.hypixel.net')
    .example('mc.server -b play.cubecraft.net')
    .action(async ({ options }, address) => {
      if (address === undefined && !config.servers.length) return '请提供服务器地址'
      const edition: Edition | undefined = options?.java ? 'java' : options?.bedrock ? 'bedrock' : undefined
      return toolbox.serverMessage(await toolbox.servers(address, edition), outputOf(options, config))
    })

  ctx.command('mc.player <player:string>', '查询 Minecraft Java 版玩家信息')
    .alias('mc玩家')
    .option('text', '-t 输出文字')
    .option('image', '-i 输出图片')
    .usage('支持正版玩家名或 UUID。')
    .example('mc.player jeb_')
    .action(async ({ options }, player) => {
      if (!player) return '请提供玩家名或 UUID'
      try {
        const profile = await toolbox.player(player)
        if (!profile) return h.escape(`未找到玩家 ${player}`)
        return await toolbox.playerMessage(profile, outputOf(options, config))
      } catch (error) {
        return h.escape(errorMessage(error, ctx.logger))
      }
    })

  ctx.command('mc.version', '查询 Minecraft Java 版最新版本')
    .alias('mc版本')
    .option('text', '-t 输出文字')
    .option('image', '-i 输出图片')
    .action(async ({ options }) => {
      try {
        return await toolbox.versionsMessage(outputOf(options, config))
      } catch (error) {
        return h.escape(errorMessage(error, ctx.logger))
      }
    })
}
