import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '..')
const ignored = new Set(['node_modules', 'lib', 'dist', '.git', 'data'])

function find(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return []
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return find(path)
    return entry.name === 'AGENTS.md' && directory !== root ? [path.slice(root.length + 1)] : []
  })
}

describe('AGENTS.md index', () => {
  const listed = [...readFileSync(join(root, 'AGENTS.md'), 'utf8').matchAll(/^- `([^`]+\/AGENTS\.md)`/gm)].map((match) => match[1])

  it('lists every subdirectory note', () => {
    expect(listed.sort()).toEqual(find(root).sort())
  })

  it('only lists existing paths', () => {
    for (const path of listed) expect(existsSync(join(root, path)), path).toBe(true)
  })
})
