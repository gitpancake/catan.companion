# Catan Companion — Monorepo

## Structure

```
catan-companion/
  api/           ← colonist-io-api: protocol library (npm-publishable)
  extension/     ← Chrome extension for catan.henrypye.xyz
```

### api/ — colonist-io-api

Standalone TypeScript library for intercepting and parsing colonist.io WebSocket messages. Tracks game state (players, builds, dice, VP). No Chrome APIs, no framework deps — just `@msgpack/msgpack`. See `api/CLAUDE.md` for protocol details.

### extension/ — Catan Companion Chrome Extension

Manifest V3 extension that uses `colonist-io-api` to track games on colonist.io and submit results to the leaderboard at catan.henrypye.xyz. React popup, in-game overlay, Firebase auth. See `extension/CLAUDE.md`.

## Commands

```bash
# Build everything
cd api && npm run build && cd ../extension && npm run build

# Build api only
cd api && npm run build

# Build extension only (requires api built first)
cd extension && npm run build

# Dev server (extension — not useful for extension dev)
cd extension && npm run dev
```

## Cross-Package Concerns

- Extension depends on api via `"colonist-io-api": "file:../api"` — build api before extension
- Changes to api exports must stay compatible with extension imports
- The extension's `content/interceptor.ts` uses `installInterceptor({ source: "catan-companion-ws" })` — the content script listens for this specific source
- The api's `ColonistTracker` replaces the old module-level state pattern — parser context is now per-instance
