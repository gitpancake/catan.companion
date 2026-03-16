# colonist-io-api

TypeScript library for intercepting and parsing [colonist.io](https://colonist.io) WebSocket messages. Tracks game state in real time: player names, settlements, cities, dice rolls, longest road, largest army, and VP cards.

## Install

```bash
npm install colonist-io-api
```

## Quick Start

### Chrome Extension / Userscript

```ts
import { ColonistTracker, installInterceptor } from "colonist-io-api";

// 1. Intercept WebSocket messages (must run in page context)
installInterceptor({ source: "my-app" });

// 2. Track game state
const tracker = new ColonistTracker();

window.addEventListener("message", (event) => {
  if (event.data?.source !== "my-app") return;

  const events = tracker.processMessage(event.data.payload);
  const state = tracker.getState();

  console.log("Players:", [...state.players.values()]);
  console.log("Dice rolls:", state.diceHistory.length);
  console.log("Events:", events);
});
```

### Node.js (parsing recorded messages)

```ts
import { ColonistTracker } from "colonist-io-api";

const tracker = new ColonistTracker();

for (const message of recordedMessages) {
  const events = tracker.processMessage(message);
  for (const event of events) {
    console.log(event);
  }
}

const finalState = tracker.getState();
```

### Low-level API

```ts
import {
  createGameState,
  createParserContext,
  parseWsMessage,
  applyEvent,
} from "colonist-io-api";

const state = createGameState();
const ctx = createParserContext();

// Parse a raw JSON message string
const events = parseWsMessage(rawMessage, state, ctx);

// Apply events to state
for (const event of events) {
  applyEvent(state, event);
}
```

## API

### `ColonistTracker`

High-level class that combines parsing and state management.

| Method | Description |
|--------|-------------|
| `processMessage(raw: string)` | Parse a JSON message string, apply events, return `GameEvent[]` |
| `getState()` | Get current `GameState` (readonly) |
| `getPlayerMappings()` | Get color-to-name mapping `ReadonlyMap<number, string>` |
| `restore(players, opts?)` | Restore state from serialized data |
| `reset()` | Reset to empty state |

### `installInterceptor(options?)`

Monkey-patches `window.WebSocket` to intercept and decode msgpack messages. Forwards decoded messages via `window.postMessage`.

| Option | Default | Description |
|--------|---------|-------------|
| `source` | `"colonist-io-api"` | Value of `event.data.source` in posted messages |

### Types

```ts
interface GameState {
  players: Map<string, PlayerState>;
  diceHistory: number[];
  diceHistogram: Record<number, number>;
  longestRoadPlayer: string | null;
  largestArmyPlayer: string | null;
  started: boolean;
}

interface PlayerState {
  name: string;
  settlements: number;
  cities: number;
  vpCards: number;
}

type GameEvent =
  | { type: "roll"; player: string; value: number }
  | { type: "built"; player: string; building: "settlement" | "city" }
  | { type: "vp_card"; player: string }
  | { type: "longest_road"; player: string }
  | { type: "lost_longest_road"; player: string }
  | { type: "largest_army"; player: string }
  | { type: "lost_largest_army"; player: string }
  | { type: "unknown"; text: string };
```

## colonist.io Protocol

WebSocket messages are msgpack-encoded. Key message structures:

- **Sessions array**: Maps player colors (1-6) to usernames
- **type:91 diffs**: Incremental game state updates containing:
  - `gameLogState` entries (dice rolls, builds, VP cards)
  - `playerStates` with authoritative VP counts
  - `mechanicLongestRoadState` / `mechanicLargestArmyState`
- **Full snapshots**: Sent on connect/reconnect with complete game state

## License

MIT
