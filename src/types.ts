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

export interface SamplePlayer {
  name: string
  /** Undashed UUID; absent for the zero UUID servers use to show text lines in the player list. */
  id?: string
}

export interface ModInfo {
  id: string
  version?: string
}

/** Extra details from the GameSpy4 query protocol, only answered by servers with `enable-query`. */
export interface QueryDetails {
  software?: string
  plugins: string[]
  map?: string
  gametype?: string
  players: string[]
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
  /** Release names that use `protocol`, filled from the protocol table when it is reachable. */
  protocolName?: string
  /** Server or proxy software recognized from the version name or the query response. */
  software?: string
  online: number
  max: number
  players: SamplePlayer[]
  /** Text lines servers put in the player sample instead of players. */
  notes: TextSegment[][]
  motd: TextSegment[]
  /** Validated `data:image/png;base64,` icon. */
  favicon?: string
  modLoader?: string
  mods: ModInfo[]
  secureChat?: boolean
  preventsChatReports?: boolean
  query?: QueryDetails
  gamemode?: string
  levelName?: string
  /** Bedrock: `MCPE` or `MCEE` (Education Edition). */
  bedrockEdition?: string
  serverId?: string
  portV4?: number
  portV6?: number
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
