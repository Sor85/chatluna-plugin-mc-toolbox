import type { Context } from 'cordis'
import { httpFetch, resolveFromBaseUrl } from '@chatluna/utils'
import type {} from '@cordisjs/plugin-http'
import type {} from '@chatluna/tool'
import { Config } from './config'
import { MojangClient } from './mojang'
import { CardRenderer } from './render'
import { Toolbox } from './toolbox'
import { registerCommands } from './commands'
import { registerTools } from './tools'
import { startBroadcast } from './broadcast'

export const name = 'chatluna-mc-toolbox'
export { Config }
export const inject = ['http', 'koishi', 'chat']

export function apply(ctx: Context, config: Config) {
  const lifetime = new AbortController()
  ctx.effect(() => () => lifetime.abort())
  const mojang = new MojangClient(httpFetch(ctx.http), { timeout: config.requestTimeout * 1000, signal: lifetime.signal })
  const toolbox = new Toolbox(config, mojang, new CardRenderer(mojang, lifetime.signal), ctx.logger, lifetime.signal)
  registerCommands(ctx, config, toolbox)
  if (config.tools) ctx.inject(['tools'], (ctx) => registerTools(ctx, config, toolbox, lifetime.signal))
  if (config.broadcast) startBroadcast(ctx, config, toolbox, resolveFromBaseUrl(ctx.baseUrl, 'data/chatluna/mc-toolbox/versions.json'))
}
