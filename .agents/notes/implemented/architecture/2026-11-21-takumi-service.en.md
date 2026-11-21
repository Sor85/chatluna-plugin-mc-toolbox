# Agent Note: Render cards through the takumi service

Status: implemented

## Problem

This plugin embedded a Takumi Renderer with Noto Sans SC and DejaVu fonts. Enabled alongside the Bilibili card, impart and meme-generator plugins, fonts and native renderers stayed resident several times, and the node decoding code was duplicated across plugins.

## Decision

- `takumi` is a required service: `package.json` declares `chatluna-plugin-takumi` as a peer dependency, `cordis.service.required` and `inject` list `takumi`, and `CardRenderer` receives `ctx.takumi` directly. A failed render falls back to text in `Toolbox.present`. The `@takumi-rs/*` and font dependencies are gone.
- Entity decoding uses the service's `parseHtml` / `decodeNode`; the local `decodeNode` is removed.
- Remote images still download only through `MojangClient.image` and the `trustedImage` allowlist; on failure this plugin returns its dark placeholder so the card keeps its look.

## Alternatives considered

- An optional service (`cordis.service.optional` plus `ctx.get` per render, text when missing): the first version. The host WebUI's service dependency panel reads only `inject`, so optional services are not listed and users cannot tell takumi is needed. Cordis 4 treats every `inject` entry as required: `{ takumi: { required: false } }` shows as optional in the panel, yet the plugin does not start without the service. Switched to required.

## Consequences

- Without takumi, server queries, AI tools and the version broadcast are unavailable. takumi loads fonts on demand and takes about 13 MB while idle; before the migration the plugin bundled Takumi, so behaviour matches.
