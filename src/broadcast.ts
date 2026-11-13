import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Context } from 'cordis'
import { routeOf } from '@chatluna/satori'
import type {} from '@chatluna/chat'
import type { Config } from './config'
import type { Toolbox } from './toolbox'
import type { VersionEntry } from './types'

interface SeenVersions {
  release: string
  snapshot: string
}

async function load(file: string): Promise<SeenVersions | undefined> {
  const raw = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined
    throw error
  })
  if (raw === undefined) return
  const data: unknown = JSON.parse(raw)
  if (typeof data !== 'object' || data === null || !('release' in data) || !('snapshot' in data)) return
  if (typeof data.release !== 'string' || typeof data.snapshot !== 'string') return
  return { release: data.release, snapshot: data.snapshot }
}

async function save(file: string, seen: SeenVersions) {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(`${file}.tmp`, JSON.stringify(seen))
  await rename(`${file}.tmp`, file)
}

/** Picks the versions to announce. A new release also becomes the latest snapshot; it is announced once, as a release. */
export function pendingUpdates(seen: SeenVersions, latest: { release: VersionEntry; snapshot: VersionEntry }, config: Pick<Config, 'broadcastRelease' | 'broadcastSnapshot'>): VersionEntry[] {
  return [
    ...config.broadcastRelease && latest.release.id !== seen.release ? [latest.release] : [],
    ...config.broadcastSnapshot && latest.snapshot.id !== seen.snapshot && latest.snapshot.id !== latest.release.id ? [latest.snapshot] : []
  ]
}

export function startBroadcast(ctx: Context, config: Config, toolbox: Toolbox, file: string) {
  let checking = false
  async function check() {
    if (checking) return
    checking = true
    try {
      const latest = await toolbox.versions()
      const seen = await load(file)
      await save(file, { release: latest.release.id, snapshot: latest.snapshot.id })
      // The first run only records a baseline, so enabling the feature does not announce an old version.
      if (!seen) return
      for (const version of pendingUpdates(seen, latest, config)) {
        ctx.logger.info('new %s %s', version.type, version.id)
        const message = await toolbox.updateMessage(await toolbox.update(version), config.output)
        for (const target of config.targets) {
          const route = routeOf({ platform: target.platform, selfId: target.selfId, isDirect: false, guildId: target.channelId, channelId: target.channelId, userId: '' })
          await ctx.chat.send(route, message, { hold: true }).catch((error: unknown) => {
            ctx.logger.warn('broadcast to %s:%s failed: %s', target.platform, target.channelId, error)
          })
        }
      }
    } catch (error) {
      ctx.logger.warn('version check failed: %s', error)
    } finally {
      checking = false
    }
  }
  ctx.effect(() => {
    void check()
    const timer = setInterval(() => void check(), config.interval * 60 * 1000)
    timer.unref()
    return () => clearInterval(timer)
  })
}
