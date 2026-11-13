# AGENTS.md — chatluna-plugin-mc-toolbox

ChatLuna v2 的 Minecraft 工具箱插件（服务器查询、玩家查询、Java 版更新播报），使用 Cordis 4 生命周期、Koishi 兼容指令与 `@chatluna/tool`。MIT 协议。

## 开发与验证

- 当前目录是唯一源码，单向同步到 ChatLuna v2 的 `external/mc-toolbox`；禁止直接编辑运行副本。
- 源码不安装依赖、不生成锁文件。执行 `node scripts/sync-to-v2.mjs --once`；宿主默认 `../../chatluna-v2-mirror`，可通过 `CHATLUNA_V2_ROOT` 指定。
- 首次同步或依赖变化后在宿主执行 `yarn install`；构建执行 `yarn yakumo build mc-toolbox`。在宿主插件目录执行 `yarn typecheck`、`yarn test`。
- 宿主 `yarn dev` 会热重载 `external/` 下的源码与 `chatluna.yml`；新增依赖后需完整重启 launcher 与 worker。
- 端到端测试只使用独立 onebot-sandbox 测试空间。令牌只从环境变量传入，不写进源码或测试报告。
- 不自行创建分支、提交或发布。

## 跨领域约定

- 配置使用 `@chatluna/schema`，经 `Config` 进入 `apply`；不使用 Zod、环境变量或读取宿主配置。
- 必需服务为 `http`、`koishi`、`chat`；`tools` 可选，经 `ctx.inject` 子作用域注册。网络请求与定时器绑定插件生命周期，卸载时取消。
- 无 `any`、常规类型断言；外部响应一律按 `unknown` 校验后使用。
- README 面向使用者，说明功能、配置与限制；实现决策记录在 `.agents/notes/implemented/feature/2026-11-13-mc-toolbox.{zh,en}.md`。

## 子目录说明

- `src/AGENTS.md`：查询协议、网络边界、卡片渲染、指令、AI 工具与版本播报。
- `scripts/AGENTS.md`：单向同步、沙盒验收和 npm 发布脚本。
- `tests/AGENTS.md`：单元测试范围与约定。
