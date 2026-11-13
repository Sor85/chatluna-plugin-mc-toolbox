import { Schema } from '@chatluna/schema'
import type { Edition } from './types'

export type Output = 'image' | 'text'

export interface ServerAlias {
  name: string
  address: string
  edition: Edition | 'auto'
}

export interface BroadcastTarget {
  platform: string
  selfId: string
  channelId: string
}

export interface Config {
  output: Output
  edition: Edition | 'auto'
  servers: ServerAlias[]
  queryTimeout: number
  allowPrivate: boolean
  query: boolean
  renderer: 'mc-heads' | 'crafatar'
  broadcast: boolean
  broadcastRelease: boolean
  broadcastSnapshot: boolean
  interval: number
  targets: BroadcastTarget[]
  tools: boolean
  requestTimeout: number
}

const edition = Schema.union([
  Schema.const('auto').description('自动'),
  Schema.const('java').description('Java 版'),
  Schema.const('bedrock').description('基岩版')
])

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    output: Schema.union([
      Schema.const('image').description('图片'),
      Schema.const('text').description('文字')
    ]).role('radio').label('默认输出').description('指令可用 -t / -i 临时切换').default('image')
  }).description('基础设置'),
  Schema.object({
    edition: edition.label('默认版本').description('自动模式同时查询 Java 版与基岩版，均有响应时显示 Java 版').default('auto'),
    servers: Schema.array(Schema.object({
      name: Schema.string().label('名称').required(),
      address: Schema.string().label('地址').description('host 或 host:port').required(),
      edition: edition.label('版本').default('auto')
    })).role('table').label('常用服务器').description('mc.server 不带参数时查询全部，也可用名称代替地址').default([]),
    queryTimeout: Schema.number().min(1).max(30).label('查询超时（秒）').default(5),
    allowPrivate: Schema.boolean().label('允许查询内网地址')
      .description('开启后可查询局域网、本机等地址，群成员也能借此探测这些地址').default(false),
    query: Schema.boolean().label('尝试 Query 协议')
      .description('服务器开启 enable-query 时可获取完整玩家列表、插件与地图；未开启时每次查询多等待约 1.5 秒').default(true)
  }).description('服务器查询'),
  Schema.object({
    renderer: Schema.union([
      Schema.const('mc-heads').description('mc-heads.net'),
      Schema.const('crafatar').description('crafatar.com')
    ]).role('radio').label('皮肤渲染服务').default('mc-heads')
  }).description('玩家查询'),
  Schema.object({
    broadcast: Schema.boolean().label('启用版本播报').description('检测 Java 版新版本并推送到下方频道').default(false),
    broadcastRelease: Schema.boolean().label('播报正式版').default(true),
    broadcastSnapshot: Schema.boolean().label('播报快照').default(true),
    interval: Schema.number().min(1).max(1440).label('检查间隔（分钟）').default(10),
    targets: Schema.array(Schema.object({
      platform: Schema.string().label('平台').default('onebot'),
      selfId: Schema.string().label('机器人 ID').required(),
      channelId: Schema.string().label('频道 ID').description('群号或频道号').required()
    })).role('table').label('推送频道').default([])
  }).description('版本播报'),
  Schema.object({
    tools: Schema.boolean().label('注册 AI 工具').description('允许模型查询服务器、玩家与最新版本').default(true)
  }).description('AI 工具'),
  Schema.object({
    requestTimeout: Schema.number().min(1).max(60).label('API 请求超时（秒）').default(15)
  }).description('网络').collapse()
])
