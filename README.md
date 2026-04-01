# Catan Companion

A monorepo for tracking [Settlers of Catan](https://colonist.io) games in real time. Intercepts colonist.io WebSocket messages, displays an in-game overlay with live stats, and submits results to the [Catan Leaderboard](https://catan.henrypye.xyz).

## How It Works

```
colonist.io (WebSocket frames, msgpack-encoded)
  → interceptor.js (page context, decodes msgpack)
  → content script (ColonistTracker parses protocol → GameEvents)
  → overlay (live settlements, cities, VP, dice histogram)
  → popup (review game, map players, submit to leaderboard)
```

## Packages

### [`api/`](api/) — colonist-io-api

Standalone TypeScript library for parsing colonist.io WebSocket messages. Tracks players, buildings, dice rolls, longest road, largest army, and VP cards. Zero framework dependencies — just `@msgpack/msgpack`.

- npm-publishable (no Chrome APIs)
- High-level `ColonistTracker` class or low-level `parseWsMessage` / `applyEvent` functions
- Auto-detects new games and resets state

### [`extension/`](extension/) — Catan Companion Chrome Extension

Manifest V3 Chrome extension that uses `colonist-io-api` to track games on colonist.io.

- **Overlay**: Real-time player stats, dice histogram, longest road/largest army badges, draggable + collapsible
- **Popup**: Firebase auth, league selection, game review with editable stats, one-click submission
- **Persistence**: Game state survives page refreshes via `chrome.storage.local`

## Quick Start

```bash
# 1. Build the API library (must be first)
cd api && npm install && npm run build

# 2. Build the extension
cd ../extension && npm install
cp .env.example .env   # Fill in Firebase + API credentials
npm run build

# 3. Load in Chrome
#    chrome://extensions → Developer mode → Load unpacked → select extension/dist/
```

## Development

```bash
# After making changes, rebuild and reload the extension
cd api && npm run build && cd ../extension && npm run build
# Then click reload on the extension in chrome://extensions
```

Build order matters: the extension depends on the api via `"colonist-io-api": "file:../api"`.

## Environment Variables

The extension requires a `.env` file (see `extension/.env.example`):

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Firebase API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_API_BASE_URL` | Leaderboard API base URL |

## Tech Stack

- **TypeScript** (strict mode) across both packages
- **React 19** + **Tailwind CSS v4** — Extension popup
- **Vite 6** — Extension bundler (3 entry points, no code splitting)
- **Firebase Auth** — User authentication
- **@msgpack/msgpack** — colonist.io protocol decoding
- **Chrome Manifest V3** — Extension platform

## Architecture

The extension runs across three isolated contexts:

| Context | File | Role |
|---------|------|------|
| Page | `interceptor.js` | Monkey-patches WebSocket, decodes msgpack, posts messages |
| Content script | `content.js` | Runs ColonistTracker, updates overlay, persists to storage |
| Popup | `popup.js` | React UI for auth, game review, and leaderboard submission |

Communication flows via `window.postMessage` (page → content) and `chrome.storage.local` (content → popup).

## Related

- **[Catan Leaderboard](https://catan.henrypye.xyz)** — Next.js web app that receives game submissions and displays rankings
