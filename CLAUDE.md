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
# Build everything (api must be built first)
cd api && npm run build && cd ../extension && npm run build

# Build api only
cd api && npm run build

# Build extension only (requires api built first)
cd extension && npm run build
```

There are no tests, linters, or CI. After building, reload the extension in `chrome://extensions`.

## Cross-Package Concerns

- Extension depends on api via `"colonist-io-api": "file:../api"` — always build api before extension
- Changes to api exports must stay compatible with extension imports
- The extension's `content/interceptor.ts` uses `installInterceptor({ source: "catan-companion-ws" })` — the content script listens for this specific source string
- The api's `ColonistTracker` replaces the old module-level state pattern — parser context is now per-instance
- `ColonistTracker.processMessage()` auto-detects new games (VP drop >4 or all-new players) and resets — check `didReset` if you need to react to this
- The overlay exposes a manual reset button via `setOnReset()` callback

## Extension Architecture

Three isolated execution contexts — no shared state between them:

1. **Page context** (`interceptor.js`) — Monkey-patches WebSocket, decodes msgpack, posts via `window.postMessage`
2. **Content script** (`content.js`) — Runs `ColonistTracker`, updates overlay DOM, persists to `chrome.storage.local`
3. **Popup** (`popup.js`) — React app, reads from `chrome.storage.local`, submits to leaderboard API

Content scripts cannot use ES module code splitting — Vite inlines all imports into each entry point.

## Key Gotchas

- **Build order**: api must be built before extension. The extension bundles api source at build time via the `file:` dependency.
- **`victoryPointsState`**: Stores raw counts (settlement count, city count, VP card count) — do NOT divide city value by 2
- **New-game detection**: Uses a VP drop threshold of 4. Small drops (1-3) can happen on reconnect when unsync'd build events are corrected — this is normal, not a new game.
- **`syncPlayerStates` skip flags**: `{ hasBuildings, hasVpCards }` are granular. Type 4/5 build events are skipped only when building counts were synced; type 23 VP card events are skipped only when VP card counts (key `"2"`) were present. This prevents silent data loss when a diff has `playerStates` for buildings but VP reveals only appear as game log events.
- **React hooks in `SubmitGameView`**: All hooks must be above the early return to avoid React hooks violations
- **Overlay drag**: Header drag handler ignores clicks on buttons (reset/toggle) via event target checks
- **Popup ↔ content script**: They never communicate directly. Popup reads from `chrome.storage.local`, which content script writes to.

## Environment

Extension uses Vite env vars (prefix `VITE_`). Copy `extension/.env.example` to `extension/.env`. The `.env` file is gitignored — never commit it.

Auth uses Firebase project `henry-auth-bcd1d` (shared with the leaderboard app).

## Data Submission

Game results are POSTed to the leaderboard at `catan.henrypye.xyz/api/games` with a `SubmitGamePayload` containing league ID, played-at timestamp, and per-player scores (VP, settlements, cities, longest road, largest army, dev card VP). The payload shape must match the leaderboard's `createGame()` server action Zod schema.
