# src 说明

适用范围：`src/`。同时遵守根 `AGENTS.md`；测试见 `tests/AGENTS.md`，脚本见 `scripts/AGENTS.md`。

- 入口只装配 Config、依赖与生命周期。`Toolbox`（`toolbox.ts`）是指令、AI 工具与播报共用的查询和呈现层，三者不各自实现查询逻辑。
- 服务器查询（`server.ts`）自行实现 Java SLP 与基岩版 RakNet Ping，不引入第三方查询 API。地址先经 `parseTarget` 白名单校验；解析出的全部 IP 都要通过 `isPrivateAddress`，只要有一条落在保留网段就拒绝，连接使用已检查的 IP，避免 DNS 重绑定。
- 保留网段不含 `198.18.0.0/15`（代理 fake-ip 网段，宿主开发机即在此环境），也不能加入 `::ffff:0:0/96`：Node `BlockList` 的这条规则会匹配所有 IPv4。映射地址在 `isPrivateAddress` 中拆出 IPv4 再判断。
- 协议响应有包大小上限与超时；`abortable` 保证每次查询只结算一次并清理 socket。favicon 仅接受 `data:image/png;base64,` 且限长。
- Mojang 接口（`mojang.ts`）只访问官方域名与 `trustedImage` 白名单中的图片域名；玩家输入只接受玩家名或 UUID，不拼接任意路径。
- 卡片（`render.ts`）用 Takumi 渲染，不启动浏览器。用户文本先 HTML 转义，解析后在节点树里解码（`decodeNode`），不让文本变成标签。远程图片失败显示占位色块。图标为 Tabler Icons 路径。
- 图片渲染失败时降级为文字（`Toolbox.present`），回复不因渲染器错误丢失。
- AI 工具只把卡片发到 `call.routeId` 对应的会话，不接受模型参数指定发送目标。工具启用与权限交给宿主工具策略，插件只提供总开关。
- 版本播报（`broadcast.ts`）：首次运行只记录基线；先写状态再推送，推送失败不重复播报；新正式版同时是最新快照时只按正式版播报一次。推送使用 `hold: true` 由宿主暂存离线机器人的消息。
