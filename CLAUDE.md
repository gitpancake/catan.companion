# Catan Companion — Chrome Extension

## Project Overview

Chrome extension (Manifest V3) that intercepts WebSocket messages on colonist.io to track Catan game state in real time and submit results to the [Catan Leaderboard](https://github.com/gitpancake/catan.henrypye.xyz).

## Commands

```bash
npm run build    # TypeScript check + Vite build → dist/
npm run dev      # Vite dev server (not useful for extension dev)
```

After building, reload the extension in `chrome://extensions` (load unpacked → `dist/`).

## Architecture

### Build Output

Vite produces three entry points (no code splitting for content scripts):

- `dist/popup.js` — React popup UI
- `dist/content.js` — Content script injected on colonist.io
- `dist/interceptor.js` — Injected into page context to intercept WebSockets

Content scripts **cannot load ES module chunks**. Any shared code used by `content/index.ts` must be inlined, not imported from shared modules. The `persistGameState()` function is intentionally duplicated in `content/index.ts` for this reason.

### Key Directories

- `src/content/` — Content script: WS interception, protocol parsing, overlay updates
- `src/overlay/` — In-game overlay (vanilla HTML/CSS, no React)
- `src/popup/` — Extension popup (React + Tailwind)
- `src/tracker/` — Game state machine (`applyEvent`)
- `src/lib/` — API client, Firebase auth, Chrome storage helpers

### colonist.io Protocol

WebSocket messages are msgpack-encoded. The interceptor decodes them and forwards as JSON via `window.postMessage`.

Key message types:
- **Sessions array**: `sessions[]` maps to player info. Color is read from `selectedColor`, `playerColor`, or `color` fields on each session object (falls back to index + 1)
- **type:91 diffs**: `data.payload.diff` contains `gameLogState` entries:
  - `text.type:4` — Setup phase placement (pieceEnum: 0=road, 2=settlement, 3=city)
  - `text.type:5` — Mid-game build (same pieceEnum values, also has `isVp` flag)
  - `text.type:10` — Dice roll (`firstDice`, `secondDice`, `playerColor`)
  - `text.type:23` — VP card reveal
  - `text.type:45` — Game winner
- **mechanicLongestRoadState / mechanicLargestArmyState**: In diffs, keyed by color string. `hasLongestRoad`/`hasLargestArmy` can be `true` (gained) or `false` (lost)

### Cross-Context Communication

Game state flows: content script → `chrome.storage.local` → popup. The popup reads stored state to display submission UI.

## Known Issues / Gotchas

- Bot sessions lack `username` — parser assigns `Bot N` to preserve color indexing
- Settlements default to 0; all placements (including setup) come through as diff events
- The `playerColorToName` map is module-level state — survives across messages but resets on page reload
- All hooks in `SubmitGameView` must be above the early return to avoid React hooks violation (#310)
- City counts from `victoryPointsState` are stored as total VP (2 per city) — must `Math.round(v / 2)` to avoid fractional display when colonist.io sends odd values

## API

Submits to `https://catan.henrypye.xyz/api/games` (POST). Auth via Firebase ID token in `Authorization: Bearer` header. See `src/lib/api.ts`.

## Dependencies

- `@msgpack/msgpack` — Decode colonist.io WebSocket binary frames
- `firebase` — Auth (shared project with leaderboard: `henry-auth-bcd1d`)
- React 19, Tailwind CSS v4, Vite 6
