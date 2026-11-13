import { describe, expect, it } from 'vitest'
import { detectSoftware, isPrivateAddress, parseQuery, parseTarget, QueryError } from '../src/server'
import { parseMotd, plainText } from '../src/motd'
import { parsePlayer, protocolNames, trustedImage } from '../src/mojang'
import { decodeNode, escapeHtml, serverHtml } from '../src/render'
import { fromHtml } from '@takumi-rs/helpers/html'
import type { ServerStatus } from '../src/types'

describe('server address', () => {
  it('parses host, port and bracketed IPv6', () => {
    expect(parseTarget('Play.Example.com')).toEqual({ host: 'play.example.com' })
    expect(parseTarget(' mc.example.com:25566 ')).toEqual({ host: 'mc.example.com', port: 25566 })
    expect(parseTarget('[2001:4860::8888]:19132')).toEqual({ host: '2001:4860::8888', port: 19132 })
  })

  it('rejects malformed input before any network access', () => {
    for (const input of ['', 'bad host', 'a:b:c', 'example.com:0', 'example.com:70000', 'http://example.com', '-x.com']) {
      expect(() => parseTarget(input), input).toThrow(QueryError)
    }
  })

  it('treats loopback, LAN and mapped private addresses as private', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.5.3', '169.254.1.1', '::1', 'fd00::1', 'fe80::1', '::ffff:192.168.1.1']) {
      expect(isPrivateAddress(address), address).toBe(true)
    }
  })

  it('allows public and fake-IP proxy addresses', () => {
    for (const address of ['8.8.8.8', '172.65.197.160', '198.18.40.43', '2606:4700::1', '::ffff:8.8.8.8']) {
      expect(isPrivateAddress(address), address).toBe(false)
    }
  })
})

describe('motd', () => {
  it('parses legacy formatting codes and resets', () => {
    expect(parseMotd('§aHello §lWorld§r!')).toEqual([
      { color: '#55ff55', text: 'Hello ' },
      { color: '#55ff55', bold: true, text: 'World' },
      { text: '!' }
    ])
  })

  it('parses nested JSON components with inherited style', () => {
    const segments = parseMotd({ text: '', extra: [{ text: 'A', color: 'gold', bold: true, extra: ['B', { text: 'C', color: '#123abc' }] }] })
    expect(segments).toEqual([
      { color: '#ffaa00', bold: true, text: 'A' },
      { color: '#ffaa00', bold: true, text: 'B' },
      { color: '#123abc', bold: true, text: 'C' }
    ])
    expect(plainText(segments)).toBe('ABC')
  })

  it('ignores invalid colors and bounds recursion', () => {
    expect(parseMotd({ text: 'x', color: 'url(evil)' })).toEqual([{ text: 'x' }])
    const deep: { text: string; extra: unknown[] } = { text: 'x', extra: [] }
    let cursor = deep
    for (let i = 0; i < 100; i++) {
      const next = { text: 'x', extra: [] }
      cursor.extra.push(next)
      cursor = next
    }
    expect(plainText(parseMotd(deep)).length).toBeLessThan(20)
  })
})

describe('player input', () => {
  it('accepts names and UUIDs only', () => {
    expect(parsePlayer('jeb_')).toEqual({ name: 'jeb_' })
    expect(parsePlayer('853c80ef-3c37-49fd-aa49-938b674adae6')).toEqual({ id: '853c80ef3c3749fdaa49938b674adae6' })
    expect(parsePlayer('853C80EF3C3749FDAA49938B674ADAE6')).toEqual({ id: '853c80ef3c3749fdaa49938b674adae6' })
    for (const input of ['a b', '../x', 'abcdefghijklmnopq', '853c80ef-3c3749fd-aa49-938b674adae6']) expect(parsePlayer(input), input).toBeUndefined()
  })

  it('only trusts known HTTPS image hosts', () => {
    expect(trustedImage('https://textures.minecraft.net/texture/abc')).toBe(true)
    expect(trustedImage('https://mc-heads.net/body/x/240')).toBe(true)
    for (const url of ['http://textures.minecraft.net/x', 'https://evil.com/x', 'https://textures.minecraft.net:8443/x', 'https://u@mc-heads.net/x', 'nope']) {
      expect(trustedImage(url), url).toBe(false)
    }
  })
})

describe('card html', () => {
  const status: ServerStatus = {
    edition: 'java', host: 'mc.example.com', port: 25565, ip: '8.8.8.8', latency: 12, version: '1.21',
    online: 1, max: 20, players: [{ name: 'Steve' }], notes: [[{ text: '<img src=x>' }]], mods: [],
    motd: [{ text: '<b>hi</b>', color: '#55ff55' }]
  }

  it('keeps user text as text nodes after decoding', async () => {
    const { node } = await fromHtml(serverHtml(status, undefined, () => undefined, 'Font'))
    const texts: string[] = []
    const images: string[] = []
    const walk = (current: ReturnType<typeof decodeNode>) => {
      if (current.type === 'text') texts.push(current.text)
      if (current.type === 'image' && typeof current.src === 'string') images.push(current.src)
      if ('children' in current) current.children?.forEach((child) => child && walk(child))
    }
    walk(decodeNode(node))
    expect(texts).toContain('<b>hi</b>')
    expect(texts).toContain('<img src=x>')
    expect(images.every((src) => src.startsWith('data:'))).toBe(true)
    expect(escapeHtml(`"'`)).toBe('&quot;&#39;')
  })
})

describe('server details', () => {
  it('recognizes server software from version names', () => {
    expect(detectSoftware('Velocity 1.7.2-26.3')).toBe('Velocity')
    expect(detectSoftware('Paper 1.21.4')).toBe('Paper')
    expect(detectSoftware('pocketmine-mp 5')).toBe('PocketMine-MP')
    expect(detectSoftware('Requires MC 1.8 / 1.21')).toBeUndefined()
  })

  it('parses a GameSpy4 full stat payload', () => {
    const payload = Buffer.from([
      'hostname', 'A Server', 'gametype', 'SMP', 'plugins', 'Paper on 1.21.4: LuckPerms 5.4; EssentialsX 2.20', 'map', 'world', 'numplayers', '2', '',
      '\x01player_', '', 'Steve', 'Alex', '', ''
    ].join('\0'))
    expect(parseQuery(payload)).toEqual({
      software: 'Paper on 1.21.4', plugins: ['LuckPerms 5.4', 'EssentialsX 2.20'], map: 'world', gametype: 'SMP', players: ['Steve', 'Alex']
    })
  })

  it('names protocol numbers as release ranges', () => {
    const names = protocolNames([
      { minecraftVersion: '26.4-snapshot-7', version: 1073742169, releaseType: 'snapshot' },
      { minecraftVersion: '26.3', version: 777, releaseType: 'release' },
      { minecraftVersion: '26.3-rc-1', version: 777, releaseType: 'snapshot' },
      { minecraftVersion: '1.21.10', version: 773, releaseType: 'release' },
      { minecraftVersion: '1.21.9', version: 773, releaseType: 'release' },
      { bad: true }
    ])
    expect(names.get(777)).toBe('26.3')
    expect(names.get(773)).toBe('1.21.9–1.21.10')
    expect(names.get(1073742169)).toBe('26.4-snapshot-7')
  })
})
