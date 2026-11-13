export type Edition = 'java' | 'bedrock'

export interface TextSegment {
  text: string
  color?: string
  bold?: boolean
  italic?: boolean
  underlined?: boolean
  strikethrough?: boolean
  obfuscated?: boolean
}

export interface ServerStatus {
  edition: Edition
  host: string
  port: number
  ip: string
  /** `target:port` from the `_minecraft._tcp` SRV record, when one redirected the query. */
  srv?: string
  latency: number
  version: string
  protocol?: number
  online: number
  max: number
  players: string[]
  motd: TextSegment[]
  /** Validated `data:image/png;base64,` icon. */
  favicon?: string
  mods?: number
  secureChat?: boolean
  gamemode?: string
  levelName?: string
}

export interface PlayerProfile {
  id: string
  name: string
  skin?: string
  cape?: string
  slim: boolean
  legacy: boolean
}

export interface VersionEntry {
  id: string
  type: 'release' | 'snapshot'
  releaseTime: string
}

export interface PatchNote {
  title: string
  version: string
  type: string
  date: string
  shortText: string
  image?: string
}

export interface VersionUpdate {
  version: VersionEntry
  note?: PatchNote
}
