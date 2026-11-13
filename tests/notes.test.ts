import { describe, expect, it } from 'vitest'
import { parseMotd } from '../src/motd'
import { classifyNote, noteText } from '../src/notes'

const classify = (line: string) => {
  const { kind, category, label } = classifyNote(parseMotd(line))
  return { kind, category, label }
}

describe('server info notes', () => {
  it('translates known keys and turns numbers into metrics', () => {
    expect(classify('§6In-game: §a516')).toEqual({ kind: 'metric', category: 'game', label: '游戏中' })
    expect(classify('Queue: 637')).toEqual({ kind: 'metric', category: 'queue', label: '排队中' })
    expect(classify('Priority queue: 1')).toEqual({ kind: 'metric', category: 'priority', label: '优先队列' })
  })

  it('recognizes links by key or by domain', () => {
    expect(classify('§6Forums §f> cubecraft.net')).toEqual({ kind: 'link', category: 'forums', label: '论坛' })
    expect(classify('» DISCORD: discord.gg/abc')).toEqual({ kind: 'link', category: 'discord', label: 'Discord' })
    expect(classify('Join us: discord.gg/abc')).toEqual({ kind: 'link', category: 'discord', label: 'Join us' })
    expect(classify('https://store.example.com')).toEqual({ kind: 'link', category: 'store', label: '商店' })
  })

  it('keeps unknown keys and plain lines', () => {
    expect(classify('QQ群: 123456789')).toEqual({ kind: 'text', category: 'qq', label: 'QQ 群' })
    expect(classify('Mode: Survival')).toEqual({ kind: 'text', category: 'info', label: 'Mode' })
    expect(classify('||CubeCraft||')).toEqual({ kind: 'line', category: 'info', label: undefined })
    expect(noteText(classifyNote(parseMotd('§7Queue: §e12')))).toBe('排队中：12')
  })
})
