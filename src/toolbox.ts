import { h } from '@satorijs/core'
import type { Context } from 'cordis'
import type { Config, Output } from './config'
import { LookupError, type MojangClient } from './mojang'
import type { Avatar, CardRenderer } from './render'
import { parseTarget, QueryError, queryServer } from './server'
import { playerText, serverText, updateText, versionsText } from './text'
import type { Edition, PlayerProfile, ServerStatus, VersionUpdate } from './types'

export interface ServerResult {
  label?: string
  address: string
  status?: ServerStatus
  error?: string
}

export type Logger = Pick<Context['logger'], 'warn' | 'debug'>

export function errorMessage(error: unknown, logger: Logger): string {
  if (error instanceof QueryError || error instanceof LookupError) return error.message
  logger.warn(error)
  return '查询失败，请稍后再试'
}

/** Query and presentation shared by commands, agent tools and the version broadcast. */
export class Toolbox {
  constructor(
    private config: Config,
    private mojang: MojangClient,
    private renderer: CardRenderer,
    private logger: Logger,
    private signal: AbortSignal
  ) {}

  /** Without input, queries every configured server; a configured name stands in for its address. */
  async servers(input: string | undefined, edition?: Edition, signal = this.signal): Promise<ServerResult[]> {
    const alias = input === undefined ? undefined : this.config.servers.find((server) => server.name === input.trim())
    const targets = input === undefined || alias
      ? (alias ? [alias] : this.config.servers).map((server) => ({ label: server.name, address: server.address, edition: edition ?? server.edition }))
      : [{ label: undefined, address: input, edition: edition ?? this.config.edition }]
    const options = { timeout: this.config.queryTimeout * 1000, allowPrivate: this.config.allowPrivate, query: this.config.query, signal }
    return Promise.all(targets.slice(0, 10).map(async ({ label, address, edition }) => {
      try {
        const status = await queryServer(parseTarget(address), edition, options)
        if (status.edition === 'bedrock' || status.protocol === undefined) return { label, address, status }
        const protocolName = await this.mojang.protocolName(status.protocol).catch((error: unknown) => {
          signal.throwIfAborted()
          this.logger.debug('protocol table unavailable: %s', error)
          return undefined
        })
        return { label, address, status: { ...status, protocolName } }
      } catch (error) {
        signal.throwIfAborted()
        return { label, address, error: errorMessage(error, this.logger) }
      }
    }))
  }

  player(input: string): Promise<PlayerProfile | undefined> {
    return this.mojang.profile(input)
  }

  renders(profile: PlayerProfile): { body: string; head: string } {
    return this.config.renderer === 'crafatar'
      ? { body: `https://crafatar.com/renders/body/${profile.id}?overlay&scale=10`, head: `https://crafatar.com/avatars/${profile.id}?overlay&size=112` }
      : { body: `https://mc-heads.net/body/${profile.id}/240`, head: `https://mc-heads.net/avatar/${profile.id}/112` }
  }

  /** crafatar only serves UUIDs; mc-heads also accepts names, which the query protocol returns without UUIDs. */
  avatar: Avatar = ({ name, id }) => {
    if (this.config.renderer === 'crafatar') return id ? `https://crafatar.com/avatars/${id}?overlay&size=48` : undefined
    const key = id ?? (/^[A-Za-z0-9_]{1,16}$/.test(name) ? name : undefined)
    return key ? `https://mc-heads.net/avatar/${key}/48` : undefined
  }

  versions() {
    return this.mojang.versions()
  }

  async update(version: VersionUpdate['version']): Promise<VersionUpdate> {
    const note = await this.mojang.patchNote(version.id).catch((error: unknown) => {
      this.signal.throwIfAborted()
      this.logger.debug('patch note unavailable: %s', error)
      return undefined
    })
    return { version, note }
  }

  /** Image output degrades to text when rendering fails, so a reply is never lost to a renderer error. */
  private async present(output: Output, text: string, image: () => Promise<Buffer>): Promise<h> {
    if (output === 'text') return h.text(text)
    try {
      return h.image(await image(), 'image/png')
    } catch (error) {
      this.signal.throwIfAborted()
      this.logger.warn('card render failed: %s', error)
      return h.text(text)
    }
  }

  serverMessage(results: ServerResult[], output: Output): Promise<h[]> {
    const describe = ({ status, label, address, error }: ServerResult) => status ? serverText(status, label) : `${label ?? address}：${error}`
    if (output === 'text') return Promise.resolve([h.text(results.map(describe).join('\n\n'))])
    return Promise.all(results.map(({ status, label, address, error }) => status
      ? this.present(output, serverText(status, label), () => this.renderer.server(status, label, this.avatar))
      : h.text(describe({ label, address, error }))))
  }

  playerMessage(profile: PlayerProfile, output: Output): Promise<h> {
    return this.present(output, playerText(profile), () => this.renderer.player(profile, this.renders(profile)))
  }

  async versionsMessage(output: Output): Promise<h> {
    const latest = await this.versions()
    return this.present(output, versionsText(latest), () => this.renderer.versions(latest))
  }

  updateMessage(update: VersionUpdate, output: Output): Promise<h> {
    return this.present(output, updateText(update), () => this.renderer.update(update))
  }
}
