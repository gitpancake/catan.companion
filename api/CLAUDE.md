# colonist-io-api — Protocol Library

## Overview

Standalone TypeScript library for intercepting and parsing colonist.io WebSocket messages. No Chrome extension APIs, no framework dependencies — just `@msgpack/msgpack`.

## Commands

```bash
npm run build    # tsc → dist/ (JS + .d.ts declarations)
npm run clean    # rm -rf dist
```

## Architecture

### Source Files

- `src/types.ts` — Core types: `GameState`, `PlayerState`, `GameEvent`, `Resource`
- `src/state.ts` — State machine: `createGameState()`, `applyEvent()`
- `src/ws-parser.ts` — colonist.io protocol parser (sessions, diffs, snapshots)
- `src/parser.ts` — DOM log entry parser (fallback, parses rendered game log HTML)
- `src/interceptor.ts` — WebSocket monkey-patch: decode msgpack → `postMessage`
- `src/tracker.ts` — `ColonistTracker` class: high-level API combining parser + state
- `src/index.ts` — Barrel export

### Key Design Decision: ParserContext

The ws-parser uses a `ParserContext` object (instead of module-level state) to track the color-to-name mapping and snapshot logging flag. This makes the parser stateless at the module level — multiple `ColonistTracker` instances can coexist without interfering.

```ts
interface ParserContext {
  colorToName: Map<number, string>;  // player color (1-6) → username
  snapshotLogged: boolean;           // throttle snapshot console logs
}
```

All internal parser functions receive `ctx` as a parameter.

### colonist.io Protocol Details

WebSocket messages are msgpack-encoded binary frames.

**Sessions array**: Found at various nesting depths. Maps players to colors via `selectedColor`, `playerColor`, or `color` fields. Username extracted from `username`, `name`, `displayName`, `playerName`, or `nick` fields.

**type:91 diffs** (`data.payload.diff`):
- `gameLogState.{n}.text.type` values:
  - `4` — Setup phase placement (`pieceEnum`: 0=road, 2=settlement, 3=city)
  - `5` — Mid-game build (same pieceEnum)
  - `10` — Dice roll (`firstDice`, `secondDice`, `playerColor`)
  - `23` — VP card reveal
  - `45` — Game winner
- `playerStates.{color}.victoryPointsState` — Authoritative counts (not VP totals):
  - Key `"0"` = settlement count
  - Key `"1"` = city count
  - Key `"2"` = VP dev card count
- `mechanicLongestRoadState.{color}.hasLongestRoad` — boolean
- `mechanicLargestArmyState.{color}.hasLargestArmy` — boolean

**Full snapshots**: Sent on connect/reconnect. The parser searches multiple nesting levels (`obj`, `obj.data`, `obj.data.payload`, `obj.data.payload.gameState`) and performs deep recursive searches for sessions arrays.

## Gotchas

- Bot sessions lack `username` — parser assigns `Bot N` to preserve color indexing
- `victoryPointsState` stores counts directly (settlement count, city count, VP card count) — do NOT divide city value by 2
- `deepFindSessions()` searches up to depth 4 and validates entries have username-like fields
- Color string-to-number mapping: red=1, blue=2, orange=3, white=4, green=5, brown=6
- `syncPlayerStates` returns `{ hasBuildings, hasVpCards }` — skip flags are granular per category. Type 4/5 build events are skipped only when building counts were synced; type 23 VP card events are skipped only when VP card counts (key `"2"`) were present. This prevents silent data loss when a diff contains `playerStates` for buildings but VP reveals only appear as game log events (e.g. at game end).
