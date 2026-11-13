import { createSocket } from 'node:dgram'
import { BlockList, isIP, Socket } from 'node:net'
import { lookup, resolveSrv } from 'node:dns/promises'
import { randomBytes } from 'node:crypto'
import type { Edition, ServerStatus, TextSegment } from './types'
import { parseMotd, plainText } from './motd'

export interface ServerTarget {
  host: string
  port?: number
}

export interface QueryOptions {
  timeout: number
  allowPrivate: boolean
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
  modinfo?: { modList?: unknown }
  forgeData?: { mods?: unknown }
  enforcesSecureChat?: unknown
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
  const started = Date.now()
  return abortable<ServerStatus>(options, ({ resolve, reject }) => {
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
        packet(0, writeVarInt(767), mcString(target.host), Buffer.from([port >> 8, port & 0xff]), writeVarInt(1)),
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
}

function javaStatus(data: JavaResponse, meta: { host: string; port: number; ip: string; srv?: string; latency: number }): ServerStatus {
  const sample = Array.isArray(data.players?.sample) ? data.players.sample : []
  const mods = data.forgeData?.mods ?? data.modinfo?.modList
  const favicon = typeof data.favicon === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=\s]+$/.test(data.favicon) && data.favicon.length < 256 * 1024
    ? data.favicon.replace(/\s/g, '') : undefined
  return {
    edition: 'java',
    host: meta.host,
    port: meta.port,
    ip: meta.ip,
    srv: meta.srv,
    latency: meta.latency,
    version: plainText(parseMotd(data.version?.name)),
    protocol: typeof data.version?.protocol === 'number' ? data.version.protocol : undefined,
    online: typeof data.players?.online === 'number' ? data.players.online : 0,
    max: typeof data.players?.max === 'number' ? data.players.max : 0,
    players: sample.flatMap((item: unknown) => {
      if (typeof item !== 'object' || item === null || !('name' in item) || typeof item.name !== 'string') return []
      const name = plainText(parseMotd(item.name)).trim()
      return name ? [name] : []
    }).slice(0, 20),
    motd: parseMotd(data.description),
    favicon,
    mods: Array.isArray(mods) ? mods.length : undefined,
    secureChat: typeof data.enforcesSecureChat === 'boolean' ? data.enforcesSecureChat : undefined
  }
}

async function bedrockPing(target: ServerTarget, options: QueryOptions): Promise<ServerStatus> {
  const port = target.port ?? 19132
  const ip = await resolveAddress(target.host, options)
  return abortable<ServerStatus>(options, ({ resolve, reject }) => {
    const socket = createSocket(isIP(ip) === 6 ? 'udp6' : 'udp4')
    const started = Date.now()
    socket.on('message', (message) => {
      if (message[0] !== 0x1c || message.length < 35 || !message.subarray(17, 33).equals(bedrockMagic)) return
      const length = message.readUInt16BE(33)
      const fields = message.subarray(35, 35 + length).toString('utf8').split(';')
      if (fields.length < 6) return reject(new QueryError('服务器返回了无效数据'))
      const motd: TextSegment[] = [...parseMotd(fields[1]), ...(fields[7] ? [{ text: '\n' }, ...parseMotd(fields[7])] : [])]
      resolve({
        edition: 'bedrock',
        host: target.host,
        port,
        ip,
        latency: Date.now() - started,
        version: fields[3],
        protocol: Number(fields[2]) || undefined,
        online: Number(fields[4]) || 0,
        max: Number(fields[5]) || 0,
        players: [],
        motd,
        gamemode: fields[8] || undefined,
        levelName: fields[7] || undefined
      })
    })
    socket.on('error', () => reject(new QueryError('无法连接到服务器')))
    const time = Buffer.alloc(8)
    time.writeBigInt64BE(BigInt(started))
    socket.send(Buffer.concat([Buffer.from([0x01]), time, bedrockMagic, randomBytes(8)]), port, ip)
    return () => socket.close()
  })
}

/** Queries one edition, or both in parallel when `auto`, preferring Java when both answer. */
export async function queryServer(target: ServerTarget, edition: Edition | 'auto', options: QueryOptions): Promise<ServerStatus> {
  if (edition === 'java') return javaPing(target, options)
  if (edition === 'bedrock') return bedrockPing(target, options)
  const [java, bedrock] = await Promise.allSettled([javaPing(target, options), bedrockPing(target, options)])
  if (java.status === 'fulfilled') return java.value
  if (bedrock.status === 'fulfilled') return bedrock.value
  // A guard rejection is the same for both editions and is more useful than a generic timeout.
  throw java.reason instanceof QueryError ? java.reason : new QueryError('无法连接到服务器')
}
