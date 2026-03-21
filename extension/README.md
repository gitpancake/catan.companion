# Catan Companion — Chrome Extension

Chrome extension that tracks your Settlers of Catan games on [colonist.io](https://colonist.io) in real time and submits results to the [Catan Leaderboard](https://catan.henrypye.xyz).

## Features

- Real-time game overlay showing player settlements, cities, VP, and dice histogram
- Manual reset button and automatic new-game detection (resets state when players change or VP drops)
- WebSocket interception with automatic msgpack decoding
- DOM observer fallback for compatibility
- Firebase authentication
- One-click game submission to leaderboard with player mapping

## How It Works

```
colonist.io (WebSocket) → interceptor (decode msgpack)
    → content script (ColonistTracker from colonist-io-api)
    → overlay (in-game display) + chrome.storage (persist)
    → popup (review & submit to leaderboard)
```

## Setup

1. Install dependencies (build api first):

```bash
cd ../api && npm install && npm run build
cd ../extension && npm install
```

2. Copy `.env.example` to `.env` and fill in Firebase + API credentials

3. Build the extension:

```bash
npm run build
```

4. Load in Chrome:
   - Navigate to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist/` directory

## Development

After making changes, rebuild and reload:

```bash
npm run build
# Then click the reload button on the extension in chrome://extensions
```

## Tech Stack

- [colonist-io-api](../api) — Protocol parsing library
- React 19 — Popup UI
- Tailwind CSS v4 — Styling
- Vite 6 — Build tool
- Firebase — Authentication
