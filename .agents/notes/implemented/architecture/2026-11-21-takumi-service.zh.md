# Agent Note: 卡片改用 takumi 服务渲染

Status: implemented

## Problem

本插件内置 Takumi Renderer 与 Noto Sans SC、DejaVu 字体。与 B 站卡片、impart、meme-generator 同时启用时，字体与原生 Renderer 常驻多份，节点解码代码也在多个插件里重复。

## Decision

- `takumi` 作为可选服务：`package.json` 以 peerDependency 声明 `chatluna-plugin-takumi`，`cordis.service.optional` 列出 `takumi`。`CardRenderer` 每次渲染经 `() => ctx.get('takumi')` 取用；未启用时抛错，由 `Toolbox.present` 降级为文字。移除 `@takumi-rs/*` 与字体依赖。
- 实体解码改用服务的 `parseHtml` / `decodeNode`，删除本地 `decodeNode`。
- 远程图片仍只经 `MojangClient.image` 与 `trustedImage` 白名单下载；下载失败时本插件返回原深色占位，保持卡片外观。

## Alternatives considered

- 设为必需服务：未启用 takumi 时服务器查询、AI 工具与版本播报全部停用，而文字输出本身可用，拒绝。

## Consequences

- 默认输出为图片但未启用 takumi 时，回复以文字发送并记录警告。
