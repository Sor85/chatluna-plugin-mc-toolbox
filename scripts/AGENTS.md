# scripts 说明

适用范围：`scripts/`。同时遵守根 `AGENTS.md`；测试约定见 `tests/AGENTS.md`。

- 脚本只依赖 Node 内置模块，用 node 直接运行。同步目标固定为宿主 `external/mc-toolbox`，`CHATLUNA_V2_ROOT` 可指定宿主；拒绝符号链接，忽略 .git、.env、依赖、数据和构建产物。
- `sandbox-test.mjs` 的凭证只通过 `SANDBOX_TOKEN` 提供，所有写操作只在本次创建的测试空间执行，结束时清理测试预设与机器人路由。用例访问真实公网服务器与 Mojang 接口，失败时先区分网络原因与插件缺陷。
- 版本播报依赖宿主配置中的推送目标，脚本不改宿主配置；用 `--keep` 保留空间后手动配置目标并验证，结束后恢复配置并结束空间。
- `publish.mjs` 在本机发布到 npm：`--dry-run` 只演练，两步验证用 `--otp=<验证码>`。发布前清空副本 `lib`、`dist` 与 `tsconfig.tsbuildinfo`，用 `yarn pack` 改写 `workspace:*`，解压后从目录 `npm publish`。
