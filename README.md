# chatluna-plugin-mc-toolbox

ChatLuna v2 的 Minecraft 工具箱：服务器状态查询、Java 版玩家信息查询、Java 版更新播报。结果可输出为文字或 Takumi 渲染的 PNG 卡片。

## 功能

| 指令 | 别名 | 说明 |
| --- | --- | --- |
| `mc.server [地址]` | `查服` | 查询服务器 MOTD、版本、在线人数、延迟与玩家样本。`-j` 仅查 Java 版，`-b` 仅查基岩版；不带地址时查询配置中的全部常用服务器。 |
| `mc.player <玩家名或 UUID>` | `mc玩家` | 查询正版玩家的 UUID、皮肤模型、披风与皮肤渲染图。 |
| `mc.version` | `mc版本` | 查询 Java 版最新正式版与快照。 |

所有指令支持 `-t` 输出文字、`-i` 输出图片，未指定时使用配置中的「默认输出」。

- **服务器查询**直接实现 Java 版 Server List Ping 与基岩版 RakNet Ping，不依赖第三方查询 API。支持 `_minecraft._tcp` SRV 记录、`host:port` 与 `[IPv6]:port`。
- **版本播报**定时读取 Mojang 官方版本清单，发现新正式版或快照时向配置的频道推送，附带官方更新日志摘要（日志发布晚于清单时仅推送版本信息）。首次启用只记录当前版本，不推送旧版本。
- **AI 工具**：`mc_server_status`、`mc_player_profile`、`mc_latest_version`。默认输出为图片时，服务器和玩家工具会把卡片发送到当前会话。工具启用与权限沿用宿主的工具策略。

## 配置

| 分组 | 配置项 | 说明 |
| --- | --- | --- |
| 基础设置 | 默认输出 | 图片或文字 |
| 服务器查询 | 默认版本 | 自动（同时查询，均有响应时显示 Java 版）、Java 版、基岩版 |
| | 常用服务器 | 名称、地址、版本；名称可代替地址使用 |
| | 查询超时 | 单次连接超时，默认 5 秒 |
| | 允许查询内网地址 | 默认关闭，见下方「限制」 |
| 玩家查询 | 皮肤渲染服务 | mc-heads.net 或 crafatar.com |
| 版本播报 | 启用、播报正式版、播报快照、检查间隔 | 默认关闭，间隔 10 分钟 |
| | 推送频道 | 平台、机器人 ID、频道 ID（OneBot 群填群号） |
| AI 工具 | 注册 AI 工具 | 默认开启 |

## 限制

- 默认拒绝解析到内网、本机、链路本地、组播等保留地址的服务器，防止借机器人探测局域网。查询局域网内的服务器需开启「允许查询内网地址」，开启后群成员也能探测这些地址。
- 代理软件 fake-ip 模式使用的 `198.18.0.0/15` 不在拦截范围内。fake-ip 环境下实际连接由代理完成，内网拦截无法覆盖代理侧的解析结果。
- 玩家查询只支持 Java 版正版账号。皮肤渲染图来自第三方渲染服务，不可用时卡片显示占位色块。
- 播报状态保存在 `data/chatluna/mc-toolbox/versions.json`。机器人离线时消息由宿主暂存，最长 6 小时。

## 开发

源码不安装依赖，同步到 ChatLuna v2 的 `external/mc-toolbox` 后在宿主中构建与测试：

```sh
node scripts/sync-to-v2.mjs --once
cd ../../chatluna-v2-mirror && yarn install && yarn yakumo build mc-toolbox
cd external/mc-toolbox && yarn typecheck && yarn test
SANDBOX_TOKEN=<令牌> node scripts/sandbox-test.mjs
```

## 许可

MIT。卡片图标来自 [Tabler Icons](https://tabler.io/icons)（MIT）。
