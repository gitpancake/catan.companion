# Catan Companion

A Chrome extension that tracks game data while playing [Catan](https://colonist.io) on colonist.io and submits results to the [Catan Leaderboard](https://github.com/gitpancake/catan.henrypye.xyz) at [catan.henrypye.xyz](https://catan.henrypye.xyz).

## How It Works

The extension intercepts WebSocket messages from colonist.io to track game state in real time:

- **Settlements, cities, and upgrades** for each player
- **Dice rolls** with a frequency histogram
- **Longest road** and **largest army** holders
- **Victory point cards**

An in-game overlay displays live stats during play. After a game ends, you can submit the tracked scores to a league on the leaderboard via the extension popup.

## Architecture

```
src/
  content/         # Content script — runs on colonist.io pages
    index.ts       # Entry point: injects interceptor, wires up WS parsing + overlay
    interceptor.ts # Injected into page context to intercept & decode WebSocket messages (msgpack)
    ws-parser.ts   # Parses colonist.io's protocol (sessions, diffs, game events)
    observer.ts    # DOM observer fallback for game state
    types.ts       # Shared types (GameState, GameEvent, PlayerState)
  overlay/         # In-game overlay UI (vanilla HTML/CSS, injected into colonist.io)
  popup/           # Extension popup (React + Tailwind)
    App.tsx        # Auth state + view routing (leagues / submit game)
    LoginScreen.tsx
    LeagueView.tsx # Shows leagues, "Submit Game" button
    SubmitGameView.tsx # Map colonist players to leaderboard players, review scores, submit
  tracker/         # Game state machine
    state.ts       # applyEvent() — processes parsed events into cumulative state
  lib/             # Shared utilities
    api.ts         # REST client for catan.henrypye.xyz API
    firebase.ts    # Firebase Auth config
    storage.ts     # Chrome storage helpers (auth tokens, player mappings, game state)
    gameState.ts   # Serialization helpers for persisting state across contexts
```

### Data Flow

1. **`interceptor.ts`** is injected into the colonist.io page context and monkey-patches `WebSocket` to intercept messages. Messages are msgpack-decoded and forwarded to the content script via `window.postMessage`.

2. **`ws-parser.ts`** parses colonist.io's protocol:
   - `sessions[]` arrays map player colors to usernames
   - `type:91` diff messages contain `gameLogState` entries with game events
   - `text.type:4` = setup placement, `text.type:5` = mid-game build, `text.type:10` = dice roll

3. **`state.ts`** applies parsed events to a cumulative `GameState` (settlements, cities, VP cards, dice history).

4. **`index.ts`** persists the game state to `chrome.storage.local` after every update, making it available to the popup.

5. **Popup** reads stored game state and lets users submit scores to a league via the leaderboard API.

## Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
npm install
npm run build
```

### Load in Chrome

1. Navigate to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `dist/` directory
4. Navigate to [colonist.io](https://colonist.io) and start a game

### Rebuild

After making changes:

```bash
npm run build
```

Then click the refresh icon on the extension card in `chrome://extensions`.

## Submitting Games

1. Play a game on colonist.io — the overlay tracks stats in real time
2. Open the extension popup and sign in
3. Click "Submit Game"
4. Select a league, map colonist.io usernames to leaderboard players
5. Review scores and submit

Player mappings are remembered for future games.

## Tech Stack

- **Vite** + **TypeScript** — build tooling
- **React 19** + **Tailwind CSS v4** — popup UI
- **Firebase Auth** — authentication (shared with leaderboard)
- **@msgpack/msgpack** — decoding colonist.io WebSocket messages
- **Chrome Extension Manifest V3**
