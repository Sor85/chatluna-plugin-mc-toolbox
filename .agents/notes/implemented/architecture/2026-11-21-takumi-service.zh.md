# Agent Note: 卡片改用 takumi 服务渲染

Status: implemented

## Problem

本插件内置 Takumi Renderer 与 Noto Sans SC、DejaVu 字体。与 B 站卡片、impart、meme-generator 同时启用时，字体与原生 Renderer 常驻多份，节点解码代码也在多个插件里重复。

## Decision

- `takumi` 作为必需服务：`package.json` 以 peerDependency 声明 `chatluna-plugin-takumi`，`cordis.service.required` 与 `inject` 列出 `takumi`，`CardRenderer` 直接接收 `ctx.takumi`。渲染失败时由 `Toolbox.present` 降级为文字。移除 `@takumi-rs/*` 与字体依赖。
- 实体解码改用服务的 `parseHtml` / `decodeNode`，删除本地 `decodeNode`。
- 远程图片仍只经 `MojangClient.image` 与 `trustedImage` 白名单下载；下载失败时本插件返回原深色占位，保持卡片外观。

## Alternatives considered

- 可选服务（`cordis.service.optional` 加每次渲染时 `ctx.get`，缺少时输出文字）：最初采用。宿主 WebUI 的「服务依赖」面板只读 `inject`，可选服务不显示，用户看不出需要安装 takumi；而 Cordis 4 把 `inject` 的每一项都当作必需，写成 `{ takumi: { required: false } }` 面板显示「可选」，实际缺少服务时插件不启动。改为必需。

## Consequences

- 未启用 takumi 时服务器查询、AI 工具与版本播报都不可用。takumi 字体按需加载，不渲染时只占约 13 MB；迁移前插件自带 Takumi，行为与此一致。
