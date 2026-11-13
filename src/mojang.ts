import type { PatchNote, PlayerProfile, VersionEntry } from './types'

export interface MojangOptions {
  timeout: number
  signal: AbortSignal
}

const imageHosts = ['textures.minecraft.net', 'mc-heads.net', 'crafatar.com', 'launchercontent.mojang.com']
const maxJson = 2 * 1024 * 1024
const maxImage = 4 * 1024 * 1024

export class LookupError extends Error {}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new LookupError('接口返回了无效数据')
  return Object.fromEntries(Object.entries(value))
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function formatUuid(id: string): string {
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`
}

/** Accepts a Java player name or a dashed / undashed UUID. */
export function parsePlayer(input: string): { name: string } | { id: string } | undefined {
  const value = input.trim()
  if (/^[A-Za-z0-9_]{1,16}$/.test(value)) return { name: value }
  const id = value.replace(/-/g, '').toLowerCase()
  if (/^[0-9a-f]{32}$/.test(id) && (value.length === 32 || /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value))) return { id }
}

export function trustedImage(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.port && imageHosts.includes(parsed.hostname)
  } catch {
    return false
  }
}

export class MojangClient {
  constructor(private fetch: typeof globalThis.fetch, private options: MojangOptions) {}

  private async request(url: string, limit: number): Promise<{ status: number; body: Buffer }> {
    const response = await this.fetch(url, {
      headers: { 'User-Agent': 'chatluna-plugin-mc-toolbox' },
      signal: AbortSignal.any([this.options.signal, AbortSignal.timeout(this.options.timeout)])
    }).catch((error: unknown) => {
      this.options.signal.throwIfAborted()
      throw new LookupError(error instanceof Error && error.name === 'TimeoutError' ? '请求超时' : '网络请求失败')
    })
    if (Number(response.headers.get('content-length')) > limit) {
      await response.body?.cancel()
      throw new LookupError('响应过大')
    }
    const body = Buffer.from(await response.arrayBuffer())
    if (body.length > limit) throw new LookupError('响应过大')
    return { status: response.status, body }
  }

  private async json(url: string): Promise<unknown> {
    const { status, body } = await this.request(url, maxJson)
    if (status === 204 || status === 404) return
    if (status === 429) throw new LookupError('请求过于频繁，请稍后再试')
    if (status < 200 || status >= 300) throw new LookupError(`接口返回状态 ${status}`)
    try {
      return JSON.parse(body.toString('utf8'))
    } catch {
      throw new LookupError('接口返回了无效数据')
    }
  }

  async image(url: string): Promise<Buffer> {
    if (!trustedImage(url)) throw new LookupError('图片地址不受信任')
    const { status, body } = await this.request(url, maxImage)
    if (status !== 200) throw new LookupError(`图片返回状态 ${status}`)
    return body
  }

  async profile(input: string): Promise<PlayerProfile | undefined> {
    const target = parsePlayer(input)
    if (!target) throw new LookupError('玩家名或 UUID 格式无效')
    let id: string
    if ('id' in target) id = target.id
    else {
      const found = await this.json(`https://api.minecraftservices.com/minecraft/profile/lookup/name/${target.name}`)
      if (found === undefined) return
      id = text(record(found)['id'])
      if (!/^[0-9a-f]{32}$/.test(id)) throw new LookupError('接口返回了无效数据')
    }
    const data = await this.json(`https://sessionserver.mojang.com/session/minecraft/profile/${id}`)
    if (data === undefined) return
    const profile = record(data)
    const properties = Array.isArray(profile['properties']) ? profile['properties'].map(record) : []
    const encoded = text(properties.find((item) => item['name'] === 'textures')?.['value'])
    const textures = encoded ? record(record(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')))['textures']) : {}
    const skin = textures['SKIN'] === undefined ? undefined : record(textures['SKIN'])
    const cape = textures['CAPE'] === undefined ? undefined : record(textures['CAPE'])
    const skinUrl = text(skin?.['url']).replace(/^http:/, 'https:')
    const capeUrl = text(cape?.['url']).replace(/^http:/, 'https:')
    return {
      id: text(profile['id']) || id,
      name: text(profile['name']),
      skin: trustedImage(skinUrl) ? skinUrl : undefined,
      cape: trustedImage(capeUrl) ? capeUrl : undefined,
      slim: skin?.['metadata'] !== undefined && record(skin['metadata'])['model'] === 'slim',
      legacy: profile['legacy'] === true
    }
  }

  async versions(): Promise<{ release: VersionEntry; snapshot: VersionEntry }> {
    const manifest = record(await this.json('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'))
    const latest = record(manifest['latest'])
    const versions = (Array.isArray(manifest['versions']) ? manifest['versions'] : []).map(record)
    const find = (type: VersionEntry['type']): VersionEntry => {
      const id = text(latest[type])
      const entry = versions.find((item) => item['id'] === id)
      if (!id || !entry) throw new LookupError('版本清单缺少最新版本')
      return { id, type, releaseTime: text(entry['releaseTime']) }
    }
    return { release: find('release'), snapshot: find('snapshot') }
  }

  /** Patch notes are published on a separate feed that can lag the manifest; absence is not an error. */
  async patchNote(version: string): Promise<PatchNote | undefined> {
    const feed = record(await this.json('https://launchercontent.mojang.com/v2/javaPatchNotes.json'))
    const entries = (Array.isArray(feed['entries']) ? feed['entries'] : []).map(record)
    const entry = entries.find((item) => item['version'] === version)
    if (!entry) return
    const image = text(entry['image'] === undefined ? undefined : record(entry['image'])['url'])
    const imageUrl = image.startsWith('/') ? `https://launchercontent.mojang.com${image}` : image
    return {
      title: text(entry['title']),
      version,
      type: text(entry['type']),
      date: text(entry['date']),
      shortText: text(entry['shortText']),
      image: trustedImage(imageUrl) ? imageUrl : undefined
    }
  }
}
