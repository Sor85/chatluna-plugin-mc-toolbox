# Agent Note: Render cards through the takumi service

Status: implemented

## Problem

This plugin embedded a Takumi Renderer with Noto Sans SC and DejaVu fonts. Enabled alongside the Bilibili card, impart and meme-generator plugins, fonts and native renderers stayed resident several times, and the node decoding code was duplicated across plugins.

## Decision

- `takumi` is an optional service: `package.json` declares `chatluna-plugin-takumi` as a peer dependency and `cordis.service.optional` lists `takumi`. `CardRenderer` reads it per render through `() => ctx.get('takumi')`; when it is missing the render throws and `Toolbox.present` falls back to text. The `@takumi-rs/*` and font dependencies are gone.
- Entity decoding uses the service's `parseHtml` / `decodeNode`; the local `decodeNode` is removed.
- Remote images still download only through `MojangClient.image` and the `trustedImage` allowlist; on failure this plugin returns its dark placeholder so the card keeps its look.

## Alternatives considered

- A required service: without takumi, server queries, AI tools and the version broadcast would all stop although text output works; rejected.

## Consequences

- With image output as the default and takumi disabled, replies are sent as text and a warning is logged.
