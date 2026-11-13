# Agent Note: Minecraft toolbox plugin

Status: implemented

## Problem

ChatLuna v2 needs a Minecraft toolbox: server status, player profiles and Java Edition update broadcasts, rendered as text or images and available to the model as tools. Query targets come from chat members, so the plugin must not become a probe into the host's local network.

## Decision

- Commands use the host's Koishi-compatible `ctx.command` (`mc.server`, `mc.player`, `mc.version`). Agent tools use `ctx.tools.define` and are registered optionally through `ctx.inject(['tools'])`. All three share `Toolbox` in `src/toolbox.ts`.
- `src/server.ts` implements Java SLP (with SRV) and the Bedrock RakNet ping itself; `auto` queries both in parallel and prefers Java. No third-party status API.
- Addresses pass the `parseTarget` allowlist, every resolved address must pass `isPrivateAddress`, and the socket connects to the checked IP. `allowPrivate` defaults to off. `198.18.0.0/15` is not blocked because fake-IP proxies resolve every name into it (the development host does). There is no `::ffff:0:0/96` rule because Node's `BlockList` matches every IPv4 address with it.
- The handshake sends protocol `-1` so proxies do not echo the client protocol back. Server details come from the status response (software detection, mods, sample players and text lines, NoChatReports), the optional GameSpy4 query (plugins, full player list, map), and the PrismarineJS minecraft-data protocol table (cached for a day).
- Player lookups use the official Mojang APIs; body renders come from configurable mc-heads / crafatar, while the looked-up player's head is cropped from the skin texture. Every image host is in the `trustedImage` allowlist.
- `src/render.ts` renders cards with Takumi, reusing the bilibili plugin's escape-then-decode-the-node-tree approach and Noto Sans SC. Server cards use the blurred favicon as a backdrop, and pixel art scales with `pixelated`. A render failure degrades to text.
- The broadcast reads the piston-meta manifest and stores state in `data/chatluna/mc-toolbox/versions.json`. The first run only records a baseline; state is written before sending; sends use a `routeOf` group route with `hold: true`. Patch notes come from launchercontent `javaPatchNotes.json`; without one only the version is announced.

## Alternatives considered

- A third-party status API such as mcsrvstat.us: avoids protocol code but adds an availability dependency and hides real latency. Rejected.
- No private-address guard: members could port-scan the host LAN through the bot. Rejected in favour of a default-on guard with an opt-out.
- One switch per tool: duplicates the host tool policy and route-level allow/deny. Rejected.
- A database table for broadcast state: two strings fit a JSON file without a database dependency.

## Consequences

- The plugin runs on hosts without the tools service; it just registers no tools.
- Under fake-IP the guard only covers local resolution; a private address resolved by the proxy cannot be blocked. The README states this.
- Versions missed while offline are announced once on the next start, never twice.
- Query is on by default, so servers without it add about 1.5 s per lookup; the protocol table depends on GitHub raw and falls back to the bare protocol number.
