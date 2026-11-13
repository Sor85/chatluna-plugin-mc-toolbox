# src 说明

适用范围：`src/`。同时遵守根 `AGENTS.md`；测试见 `tests/AGENTS.md`，脚本见 `scripts/AGENTS.md`。

- 入口只装配 Config、依赖与生命周期。`Toolbox`（`toolbox.ts`）是指令、AI 工具与播报共用的查询和呈现层，三者不各自实现查询逻辑。
- 服务器查询（`server.ts`）自行实现 Java SLP 与基岩版 RakNet Ping，不引入第三方查询 API。地址先经 `parseTarget` 白名单校验；解析出的全部 IP 都要通过 `isPrivateAddress`，只要有一条落在保留网段就拒绝，连接使用已检查的 IP，避免 DNS 重绑定。
- 保留网段不含 `198.18.0.0/15`（代理 fake-ip 网段，宿主开发机即在此环境），也不能加入 `::ffff:0:0/96`：Node `BlockList` 的这条规则会匹配所有 IPv4。映射地址在 `isPrivateAddress` 中拆出 IPv4 再判断。
- 协议响应有包大小上限与超时；`abortable` 保证每次查询只结算一次并清理 socket。favicon 仅接受 `data:image/png;base64,` 且限长。
- Java 握手发送协议号 `-1`：发送具体协议号时，Velocity、Hypixel 等代理会原样回显，协议号失去意义。只有 `forgeData` 或非空模组列表才算模组服，CubeCraft 等代理会伪造空的 `FML` 标记。
- 玩家样本中 UUID 为全零或名称不是合法玩家名的条目是服务器说明文字，归入 `notes` 并保留颜色。`notes.ts` 的 `classifyNote` 先用 `noteEntry` 拆出 `键: 值` / `键 > 值`，再按内置对照表把常见键名译成中文并归类：数量值做成指标卡片，域名或链接按键名或域名配品牌图标，联系方式等编号不算数量；开头的无标签行作为标题。未识别的键名原样保留，不猜测翻译。
- GameSpy4 Query（`gs4Query`）与状态查询并行、尽力而为：超时 1.5 秒，失败返回 `undefined`，不影响主结果；可由配置关闭。
- `auto` 模式 Java 版成功即返回并取消基岩版；基岩版先成功时最多再等 Java 版 `bedrockGrace` 毫秒，避免 fake-ip 环境下 Java 端口挂起拖住回复。
- 协议号对照表来自 PrismarineJS minecraft-data，`MojangClient.protocolName` 内存缓存一天，失败下次重试；卡片和文字只在有结果时显示版本名。
- Mojang 接口（`mojang.ts`）只访问官方域名与 `trustedImage` 白名单中的图片域名；玩家输入只接受玩家名或 UUID，不拼接任意路径。
- 卡片（`render.ts`）用 Takumi 渲染，不启动浏览器。用户文本先 HTML 转义，解析后在节点树里解码（`decodeNode`），不让文本变成标签。远程图片失败显示占位色块。图标为 Tabler Icons 路径。
- Takumi 限制：绝对定位的裁剪容器内再放带负偏移的绝对定位子元素会整层丢失，所以服务器卡片的模糊背景和遮罩直接挂在卡片上；`filter: blur` 会溢出元素边缘，遮罩须比背景更高并提前变为不透明。
- 像素图（favicon、皮肤、披风）用 `image-rendering: pixelated`。玩家头像由 `skinCrop` 从皮肤贴图裁出脸部与帽子层，不依赖第三方头像服务。
- fake-ip 网段的 IP 对用户没有意义，卡片和文字都不显示（`isFakeIp`）。
- 图片渲染失败时降级为文字（`Toolbox.present`），回复不因渲染器错误丢失。
- AI 工具只把卡片发到 `call.routeId` 对应的会话，不接受模型参数指定发送目标。工具启用与权限交给宿主工具策略，插件只提供总开关。
- 版本播报（`broadcast.ts`）：首次运行只记录基线；先写状态再推送，推送失败不重复播报；新正式版同时是最新快照时只按正式版播报一次。推送使用 `hold: true` 由宿主暂存离线机器人的消息。
