import type { TextSegment } from './types'

const codeColors: Record<string, string> = {
  0: '#000000', 1: '#0000aa', 2: '#00aa00', 3: '#00aaaa', 4: '#aa0000', 5: '#aa00aa', 6: '#ffaa00', 7: '#aaaaaa',
  8: '#555555', 9: '#5555ff', a: '#55ff55', b: '#55ffff', c: '#ff5555', d: '#ff55ff', e: '#ffff55', f: '#ffffff',
  g: '#ddd605'
}

const namedColors: Record<string, string> = {
  black: '#000000', dark_blue: '#0000aa', dark_green: '#00aa00', dark_aqua: '#00aaaa', dark_red: '#aa0000',
  dark_purple: '#aa00aa', gold: '#ffaa00', gray: '#aaaaaa', dark_gray: '#555555', blue: '#5555ff', green: '#55ff55',
  aqua: '#55ffff', red: '#ff5555', light_purple: '#ff55ff', yellow: '#ffff55', white: '#ffffff'
}

type Style = Omit<TextSegment, 'text'>

/** Splits legacy `§` formatting into styled segments, inheriting the style of the enclosing component. */
function parseLegacy(text: string, base: Style): TextSegment[] {
  const segments: TextSegment[] = []
  let style = { ...base }
  let current = ''
  const flush = () => {
    if (current) segments.push({ ...style, text: current })
    current = ''
  }
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '§' || i + 1 >= text.length) {
      current += text[i]
      continue
    }
    const code = text[++i].toLowerCase()
    flush()
    if (code in codeColors) style = { color: codeColors[code] }
    else if (code === 'l') style = { ...style, bold: true }
    else if (code === 'o') style = { ...style, italic: true }
    else if (code === 'n') style = { ...style, underlined: true }
    else if (code === 'm') style = { ...style, strikethrough: true }
    else if (code === 'k') style = { ...style, obfuscated: true }
    else if (code === 'r') style = { ...base }
  }
  flush()
  return segments
}

function parseComponent(value: unknown, base: Style, depth: number): TextSegment[] {
  if (depth > 16) return []
  if (typeof value === 'string') return parseLegacy(value, base)
  if (typeof value === 'number' || typeof value === 'boolean') return parseLegacy(String(value), base)
  if (Array.isArray(value)) return value.flatMap((item) => parseComponent(item, base, depth + 1))
  if (typeof value !== 'object' || value === null) return []
  const fields = new Map(Object.entries(value))
  const style = { ...base }
  const color = fields.get('color')
  if (typeof color === 'string') {
    const resolved = namedColors[color] ?? (/^#[0-9a-f]{6}$/i.test(color) ? color : undefined)
    if (resolved) style.color = resolved
  }
  for (const key of ['bold', 'italic', 'underlined', 'strikethrough', 'obfuscated'] as const) {
    const flag = fields.get(key)
    if (typeof flag === 'boolean') style[key] = flag
  }
  const translate = fields.get('translate')
  const extra = fields.get('extra')
  const text = fields.has('text') ? parseComponent(fields.get('text'), style, depth + 1)
    : typeof translate === 'string' ? parseLegacy(translate, style) : []
  return [...text, ...Array.isArray(extra) ? extra.flatMap((item: unknown) => parseComponent(item, style, depth + 1)) : []]
}

/** Accepts a legacy string or a JSON text component, as returned by Java and Bedrock status responses. */
export function parseMotd(value: unknown): TextSegment[] {
  return parseComponent(value, {}, 0)
}

export function plainText(segments: TextSegment[]): string {
  return segments.map((segment) => segment.text).join('')
}

function sliceSegments(segments: TextSegment[], start: number, end: number): TextSegment[] {
  let offset = 0
  return segments.flatMap((segment) => {
    const from = offset
    offset += segment.text.length
    const text = segment.text.slice(Math.max(0, start - from), Math.max(0, end - from))
    return text ? [{ ...segment, text }] : []
  })
}

function trimSegments(segments: TextSegment[]): TextSegment[] {
  const text = plainText(segments)
  const start = text.length - text.trimStart().length
  return sliceSegments(segments, start, text.trimEnd().length)
}

/** Splits a `key: value` (or `key > value`) line of server info into a labelled entry, keeping colors; other lines stay a plain item. */
export function noteEntry(line: TextSegment[]): { key?: TextSegment[]; value: TextSegment[] } {
  const text = plainText(line)
  const separator = /\s*[:：]\s*|\s+[>»]\s+/.exec(text)
  const key = separator ? text.slice(0, separator.index).trim() : ''
  const rest = separator ? text.slice(separator.index + separator[0].length).trim() : ''
  // `https://…` is a link, not a label; long or empty halves are a sentence that happens to contain a colon.
  if (!separator || !key || !rest || Array.from(key).length > 32 || /^https?$/i.test(key)) return { value: trimSegments(line) }
  return {
    key: trimSegments(sliceSegments(line, 0, separator.index)),
    value: trimSegments(sliceSegments(line, separator.index + separator[0].length, text.length))
  }
}
