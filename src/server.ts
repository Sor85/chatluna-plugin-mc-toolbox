import { createSocket } from 'node:dgram'
import { BlockList, isIP, Socket } from 'node:net'
import { lookup, resolveSrv } from 'node:dns/promises'
import { randomBytes } from 'node:crypto'
import type { Edition, ModInfo, QueryDetails, ServerStatus, TextSegment } from './types'
import { parseMotd, plainText } from './motd'

export interface ServerTarget {
  host: string
  port?: number
}

export interface QueryOptions {
  timeout: number
  allowPrivate: boolean
  /** Also try the GameSpy4 query protocol, which answers only when the server enables it. */
  query: boolean
  signal: AbortSignal
}

// 198.18.0.0/15 stays allowed: fake-IP proxies (Clash, Surge) answer every lookup from it.
const privateRanges = new BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
] as const) privateRanges.addSubnet(network, prefix, 'ipv4')
for (const [network, prefix] of [
  // IPv4-mapped addresses are unwrapped in isPrivateAddress: a ::ffff:0:0/96 rule would match every IPv4 address.
  ['::', 128], ['::1', 128], ['100::', 64], ['2001:db8::', 32],
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]
] as const) privateRanges.addSubnet(network, prefix, 'ipv6')

const hostPattern = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i
const maxPacket = 512 * 1024
const bedrockMagic = Buffer.from('00ffff00fefefefefdfdfdfd12345678', 'hex')

export class QueryError extends Error {}

/** Parses `host`, `host:port`, `[ipv6]` or `[ipv6]:port`; anything else is rejected before any network access. */
export function parseTarget(input: string): ServerTarget {
  const value = input.trim()
  const match = /^\[([0-9a-f:.]+)\](?::(\d{1,5}))?$/i.exec(value) ?? /^([^:\s]+)(?::(\d{1,5}))?$/.exec(value)
  if (!match) throw new QueryError('服务器地址格式无效')
  const host = match[1].toLowerCase()
  if (!isIP(host) && !hostPattern.test(host)) throw new QueryError('服务器地址格式无效')
  if (match[2] === undefined) return { host }
  const port = Number(match[2])
  if (port < 1 || port > 65535) throw new QueryError('端口超出范围')
  return { host, port }
}

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address) === 6 ? 'ipv6' : 'ipv4'
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
  if (mapped) return privateRanges.check(mapped[1], 'ipv4')
  return privateRanges.check(address, family)
}

async function resolveAddress(host: string, options: QueryOptions): Promise<string> {
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => [])
  if (!addresses.length) throw new QueryError('无法解析服务器地址')
  // Every record is checked so a public A record cannot smuggle a private AAAA one past the guard.
  if (!options.allowPrivate && addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new QueryError('不允许查询内网或保留地址')
  }
  return addresses[0].address
}

function writeVarInt(value: number): Buffer {
  const bytes: number[] = []
  let rest = value >>> 0
  do {
    const byte = rest & 0x7f
    rest >>>= 7
    bytes.push(rest ? byte | 0x80 : byte)
  } while (rest)
  return Buffer.from(bytes)
}

function readVarInt(buffer: Buffer, offset: number): [value: number, next: number] | undefined {
  let value = 0
  for (let i = 0; i < 5; i++) {
    if (offset + i >= buffer.length) return
    const byte = buffer[offset + i]
    value |= (byte & 0x7f) << (7 * i)
    if (!(byte & 0x80)) return [value, offset + i + 1]
  }
  throw new QueryError('服务器返回了无效数据')
}

function packet(id: number, ...fields: Buffer[]): Buffer {
  const body = Buffer.concat([writeVarInt(id), ...fields])
  return Buffer.concat([writeVarInt(body.length), body])
}

function mcString(value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8')
  return Buffer.concat([writeVarInt(bytes.length), bytes])
}

interface JavaResponse {
  version?: { name?: unknown; protocol?: unknown }
  players?: { online?: unknown; max?: unknown; sample?: unknown }
  description?: unknown
  favicon?: unknown
  modinfo?: { type?: unknown; modList?: unknown }
  forgeData?: { mods?: unknown }
  isModded?: unknown
  enforcesSecureChat?: unknown
  preventsChatReports?: unknown
}

const knownSoftware = /\b(Paper|Purpur|Folia|Pufferfish|Leaves|Leaf|Spigot|CraftBukkit|Velocity|BungeeCord|Waterfall|FlameCord|Travertine|Arclight|Mohist|CatServer|Magma|Youer|Banner|Ketting|NeoForge|Forge|Fabric|Quilt|Sponge|Geyser|Nukkit|PowerNukkit|PocketMine-MP|Glowstone|Minestom)\b/i
const zeroUuid = /^0{8}-?0{4}-?0{4}-?0{4}-?0{12}$/
const queryTimeout = 1500
const bedrockGrace = 1000

export function detectSoftware(text: string): string | undefined {
  const match = knownSoftware.exec(text)
  if (!match) return
  return match[1].toLowerCase() === 'pocketmine-mp' ? 'PocketMine-MP' : match[1][0].toUpperCase() + match[1].slice(1)
}

interface Settle<T> {
  resolve: (value: T) => void
  reject: (error: Error) => void
}

function abortable<T>(options: QueryOptions, run: (settle: Settle<T>) => () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    options.signal.throwIfAborted()
    let settled = false
    let cleanup = () => {}
    const settle = (done: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      options.signal.removeEventListener('abort', onAbort)
      cleanup()
      done()
    }
    const onAbort = () => settle(() => reject(new QueryError('查询已取消')))
    const timer = setTimeout(() => settle(() => reject(new QueryError('连接超时'))), options.timeout)
    options.signal.addEventListener('abort', onAbort, { once: true })
    cleanup = run({
      resolve: (value) => settle(() => resolve(value)),
      reject: (error) => settle(() => reject(error))
    })
  })
}

async function javaPing(target: ServerTarget, options: QueryOptions): Promise<ServerStatus> {
  let host = target.host
  let port = target.port ?? 25565
  let srv: string | undefined
  if (target.port === undefined && !isIP(host)) {
    const [record] = await resolveSrv(`_minecraft._tcp.${host}`).catch(() => [])
    if (record && hostPattern.test(record.name)) {
      srv = `${record.name}:${record.port}`
      host = record.name.toLowerCase()
      port = record.port
    }
  }
  const ip = await resolveAddress(host, options)
  const query = gs4Query(ip, port, options)
  const started = Date.now()
  const status = await abortable<ServerStatus>(options, ({ resolve, reject }) => {
    const socket = new Socket()
    let buffer = Buffer.alloc(0)
    let response: JavaResponse | undefined
    let statusLatency = 0
    let pingSent = 0
    const complete = (latency: number) => {
      if (!response) return reject(new QueryError('无法连接到服务器'))
      resolve(javaStatus(response, { host: target.host, port, ip, srv, latency }))
    }
    socket.on('connect', () => {
      socket.write(Buffer.concat([
        packet(0, writeVarInt(-1), mcString(target.host), Buffer.from([port >> 8, port & 0xff]), writeVarInt(1)),
        packet(0)
      ]))
    })
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      if (buffer.length > maxPacket) return reject(new QueryError('服务器响应过大'))
      try {
        while (true) {
          const length = readVarInt(buffer, 0)
          if (!length || buffer.length < length[1] + length[0]) return
          const body = buffer.subarray(length[1], length[1] + length[0])
          buffer = buffer.subarray(length[1] + length[0])
          const id = readVarInt(body, 0)
          if (!id) throw new QueryError('服务器返回了无效数据')
          if (id[0] === 1 && response) return complete(Date.now() - pingSent)
          if (id[0] !== 0 || response) throw new QueryError('服务器返回了无效数据')
          const size = readVarInt(body, id[1])
          if (!size) throw new QueryError('服务器返回了无效数据')
          const parsed: unknown = JSON.parse(body.subarray(size[1], size[1] + size[0]).toString('utf8'))
          if (typeof parsed !== 'object' || parsed === null) throw new QueryError('服务器返回了无效数据')
          response = parsed
          statusLatency = Date.now() - started
          pingSent = Date.now()
          socket.write(packet(1, randomBytes(8)))
        }
      } catch (error) {
        reject(error instanceof QueryError ? error : new QueryError('服务器返回了无效数据'))
      }
    })
    // Some proxies close the connection instead of answering the ping; the status itself is still valid.
    socket.on('close', () => complete(statusLatency))
    socket.on('error', () => response ? complete(statusLatency) : reject(new QueryError('无法连接到服务器')))
    socket.connect(port, ip)
    return () => socket.destroy()
  })
  return withQuery(status, await query)
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return
  return Object.fromEntries(Object.entries(value))
}

function modList(data: JavaResponse): ModInfo[] {
  // Proxies such as CubeCraft advertise an empty FML list, so only listed mods count.
  const mods = Array.isArray(data.forgeData?.mods) ? data.forgeData.mods : Array.isArray(data.modinfo?.modList) ? data.modinfo.modList : []
  return mods.flatMap((item: unknown) => {
    const mod = record(item)
    const id = mod?.['modId'] ?? mod?.['modid']
    if (typeof id !== 'string' || !id) return []
    const version = mod?.['modmarker'] ?? mod?.['version']
    return [{ id: id.slice(0, 64), version: typeof version === 'string' && version ? version.slice(0, 32) : undefined }]
  }).slice(0, 300)
}

function javaStatus(data: JavaResponse, meta: { host: string; port: number; ip: string; srv?: string; latency: number }): ServerStatus {
  const sample = (Array.isArray(data.players?.sample) ? data.players.sample : []).slice(0, 40).flatMap((item: unknown) => {
    const entry = record(item)
    const name = entry?.['name']
    if (typeof name !== 'string') return []
    const id = typeof entry?.['id'] === 'string' ? entry['id'] : ''
    return [{ name, id }]
  })
  const favicon = typeof data.favicon === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=\s]+$/.test(data.favicon) && data.favicon.length < 256 * 1024
    ? data.favicon.replace(/\s/g, '') : undefined
  const version = plainText(parseMotd(data.version?.name)).trim()
  const mods = modList(data)
  const forge = data.forgeData !== undefined || mods.length > 0
  return {
    edition: 'java',
    host: meta.host,
    port: meta.port,
    ip: meta.ip,
    srv: meta.srv,
    latency: meta.latency,
    version,
    protocol: typeof data.version?.protocol === 'number' && data.version.protocol > 0 ? data.version.protocol : undefined,
    software: detectSoftware(version),
    online: typeof data.players?.online === 'number' ? data.players.online : 0,
    max: typeof data.players?.max === 'number' ? data.players.max : 0,
    // A real player has a non-zero UUID and a plain name; anything else is a text line drawn in the player list.
    players: sample.flatMap(({ name, id }) => !zeroUuid.test(id) && /^[A-Za-z0-9_]{1,16}$/.test(name) && /^[0-9a-f-]{32,36}$/i.test(id)
      ? [{ name, id: id.replace(/-/g, '').toLowerCase() }] : []),
    notes: sample.flatMap(({ name, id }) => !zeroUuid.test(id) && /^[A-Za-z0-9_]{1,16}$/.test(name) ? [] : [parseMotd(name)])
      .filter((line) => plainText(line).trim()),
    motd: parseMotd(data.description),
    favicon,
    modLoader: mods.some((mod) => mod.id === 'neoforge') || (data.isModded === true && !forge) ? 'NeoForge' : forge ? 'Forge' : undefined,
    mods,
    secureChat: typeof data.enforcesSecureChat === 'boolean' ? data.enforcesSecureChat : undefined,
    preventsChatReports: typeof data.preventsChatReports === 'boolean' ? data.preventsChatReports : undefined
  }
}

/** Parses a GameSpy4 full-stat payload (after the type, session id and 11-byte padding). */
export function parseQuery(payload: Buffer): QueryDetails {
  const parts = payload.toString('utf8').split('\0')
  const values = new Map<string, string>()
  let index = 0
  for (; index + 1 < parts.length && parts[index] !== ''; index += 2) values.set(parts[index], parts[index + 1])
  const marker = parts.indexOf('\x01player_', index)
  const players: string[] = []
  for (let i = marker + 2; marker >= 0 && i < parts.length && parts[i] !== ''; i++) players.push(parts[i])
  const plugins = values.get('plugins') ?? ''
  const separator = plugins.indexOf(':')
  return {
    software: (separator < 0 ? plugins : plugins.slice(0, separator)).trim() || undefined,
    plugins: separator < 0 ? [] : plugins.slice(separator + 1).split(';').map((item) => item.trim()).filter(Boolean).slice(0, 100),
    map: values.get('map') || undefined,
    gametype: values.get('gametype') || undefined,
    players: players.slice(0, 100)
  }
}

/** Best effort: most servers keep query disabled, so silence or garbage resolves to `undefined` after a short wait. */
function gs4Query(ip: string, port: number, options: QueryOptions): Promise<QueryDetails | undefined> {
  if (!options.query) return Promise.resolve(undefined)
  return abortable<QueryDetails | undefined>({ ...options, timeout: Math.min(options.timeout, queryTimeout) }, ({ resolve }) => {
    const socket = createSocket(isIP(ip) === 6 ? 'udp6' : 'udp4')
    const session = randomBytes(4).readUInt32BE() & 0x0f0f0f0f
    const header = (type: number) => {
      const buffer = Buffer.alloc(7)
      buffer.writeUInt16BE(0xfefd)
      buffer[2] = type
      buffer.writeUInt32BE(session, 3)
      return buffer
    }
    socket.on('message', (message) => {
      if (message.length < 5 || message.readUInt32BE(1) !== session) return
      if (message[0] === 0x09) {
        const token = Number.parseInt(message.subarray(5).toString('latin1').split('\0')[0], 10)
        if (!Number.isSafeInteger(token)) return resolve(undefined)
        const request = Buffer.alloc(8)
        request.writeInt32BE(token | 0)
        return socket.send(Buffer.concat([header(0x00), request]), port, ip)
      }
      if (message[0] === 0x00 && message.length > 16) resolve(parseQuery(message.subarray(16)))
    })
    socket.on('error', () => resolve(undefined))
    socket.send(header(0x09), port, ip)
    return () => socket.close()
  }).catch(() => undefined)
}

async function bedrockPing(target: ServerTarget, options: QueryOptions): Promise<ServerStatus> {
  const port = target.port ?? 19132
  const ip = await resolveAddress(target.host, options)
  const query = gs4Query(ip, port, options)
  const status = await abortable<ServerStatus>(options, ({ resolve, reject }) => {
    const socket = createSocket(isIP(ip) === 6 ? 'udp6' : 'udp4')
    const started = Date.now()
    socket.on('message', (message) => {
      if (message[0] !== 0x1c || message.length < 35 || !message.subarray(17, 33).equals(bedrockMagic)) return
      const length = message.readUInt16BE(33)
      const fields = message.subarray(35, 35 + length).toString('utf8').split(';')
      if (fields.length < 6) return reject(new QueryError('服务器返回了无效数据'))
      const motd: TextSegment[] = [...parseMotd(fields[1]), ...(fields[7] ? [{ text: '\n' }, ...parseMotd(fields[7])] : [])]
      const number = (value: string | undefined) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : undefined
      resolve({
        edition: 'bedrock',
        host: target.host,
        port,
        ip,
        latency: Date.now() - started,
        version: fields[3],
        protocol: number(fields[2]),
        online: number(fields[4]) ?? 0,
        max: number(fields[5]) ?? 0,
        players: [],
        notes: [],
        motd,
        mods: [],
        gamemode: fields[8] || undefined,
        levelName: plainText(parseMotd(fields[7])) || undefined,
        bedrockEdition: fields[0] || undefined,
        serverId: fields[6] || undefined,
        portV4: number(fields[10]),
        portV6: number(fields[11])
      })
    })
    socket.on('error', () => reject(new QueryError('无法连接到服务器')))
    const time = Buffer.alloc(8)
    time.writeBigInt64BE(BigInt(started))
    socket.send(Buffer.concat([Buffer.from([0x01]), time, bedrockMagic, randomBytes(8)]), port, ip)
    return () => socket.close()
  })
  return withQuery(status, await query)
}

function withQuery(status: ServerStatus, query: QueryDetails | undefined): ServerStatus {
  if (!query) return status
  return { ...status, query, software: status.software ?? (query.software ? detectSoftware(query.software) ?? query.software : undefined) }
}

/** Queries one edition, or both in parallel when `auto`. Java wins when it answers; a Bedrock answer waits briefly for Java. */
export async function queryServer(target: ServerTarget, edition: Edition | 'auto', options: QueryOptions): Promise<ServerStatus> {
  if (edition === 'java') return javaPing(target, options)
  if (edition === 'bedrock') return bedrockPing(target, options)
  const controller = new AbortController()
  const signal = AbortSignal.any([options.signal, controller.signal])
  const java = javaPing(target, { ...options, signal })
  const bedrock = bedrockPing(target, { ...options, signal })
  try {
    return await Promise.any([
      java,
      bedrock.then(async (status) => {
        // Hybrid servers (Geyser) answer both; give Java a moment, but a dead Java port must not hold the reply.
        const grace = new Promise<ServerStatus>((resolve) => setTimeout(resolve, bedrockGrace, status).unref())
        return Promise.race([java.catch(() => status), grace])
      })
    ])
  } catch {
    options.signal.throwIfAborted()
    // A guard rejection is the same for both editions and is more useful than a generic timeout.
    const reason = await java.catch((error: unknown) => error)
    throw reason instanceof QueryError ? reason : new QueryError('无法连接到服务器')
  } finally {
    controller.abort()
  }
}
