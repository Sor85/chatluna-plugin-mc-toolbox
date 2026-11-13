# Agent Note: Minecraft 工具箱插件

Status: implemented

## Problem

ChatLuna v2 需要一个 Minecraft 工具箱：查询服务器状态、查询玩家信息、播报 Java 版更新，结果可选文字或图片，并供 AI 调用。查询目标由群成员输入，插件必须防止被用来探测宿主所在的局域网。

## Decision

- 指令使用宿主 `koishi` 兼容服务的 `ctx.command`（`mc.server`、`mc.player`、`mc.version`），AI 工具使用 `ctx.tools.define`，经 `ctx.inject(['tools'])` 可选注册。三者共用 `src/toolbox.ts` 的 `Toolbox`。
- 服务器查询在 `src/server.ts` 自行实现 Java SLP（含 SRV）与基岩版 RakNet Ping，`auto` 模式并行查询两种协议，Java 优先。不依赖 mcsrvstat 等第三方 API。
- 地址经 `parseTarget` 白名单校验；所有解析结果都通过 `isPrivateAddress` 才连接，连接使用已检查的 IP。`allowPrivate` 配置默认关闭。`198.18.0.0/15` 不拦截，因为代理 fake-ip 模式把所有域名解析到该网段（开发宿主即是如此）。不使用 `::ffff:0:0/96` 规则，因为 Node `BlockList` 会用它匹配所有 IPv4。
- 玩家查询走 Mojang 官方接口，皮肤渲染图来自可配置的 mc-heads / crafatar；所有图片域名在 `trustedImage` 白名单内。
- 卡片在 `src/render.ts` 用 Takumi 渲染，沿用 bilibili 插件的转义/节点解码方式与 Noto Sans SC 字体。渲染失败降级为文字。
- 版本播报读取 piston-meta 版本清单，状态存于 `data/chatluna/mc-toolbox/versions.json`。首次只记录基线；先写状态再推送；推送用 `routeOf` 构造群路由，并以 `hold: true` 交给宿主暂存。更新日志来自 launchercontent 的 `javaPatchNotes.json`，缺失时只推送版本信息。

## Alternatives considered

- 使用 mcsrvstat.us 等第三方查询 API：省去协议实现，但多一层可用性依赖，也看不到真实延迟，拒绝。
- 不做内网拦截：群成员可以借机器人扫描宿主局域网端口，拒绝；改为默认拦截、可配置放开。
- 把每个工具做成独立开关：宿主已有工具策略与路由级 allow/deny，重复配置，拒绝。
- 播报用数据库表存状态：只有两个字符串，JSON 文件足够，不引入 database 依赖。

## Consequences

- 插件可在无 AI 工具服务的宿主中运行，只是不注册工具。
- fake-ip 环境下内网拦截只覆盖本机解析，代理侧解析出的内网地址无法拦截；README 已说明。
- 停机期间错过的版本在下次启动时一次性播报，不会重复。
