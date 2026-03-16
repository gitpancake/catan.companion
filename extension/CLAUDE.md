# Catan Companion — Chrome Extension

## Overview

Chrome extension (Manifest V3) for tracking Catan game state on colonist.io and submitting results to [catan.henrypye.xyz](https://catan.henrypye.xyz). Uses the `colonist-io-api` library (in `../api`) for protocol parsing.

## Commands

```bash
npm run build    # TypeScript check + Vite build → dist/
npm run dev      # Vite dev server (not useful for extension dev)
```

After building, reload the extension in `chrome://extensions` (load unpacked → `dist/`).

**Important**: Build the api package first (`cd ../api && npm run build`) before building the extension.

## Architecture

### Build Output

Vite produces three entry points (no code splitting for content scripts):

- `dist/popup.js` — React popup UI
- `dist/content.js` — Content script injected on colonist.io
- `dist/interceptor.js` — Injected into page context to intercept WebSockets

Content scripts **cannot load ES module chunks**. Vite must inline all imports (including `colonist-io-api`) into each entry point. No dynamic `import()` in output.

### Key Directories

- `src/content/` — Content script: uses `ColonistTracker` from api, overlay updates, chrome.storage persistence
- `src/overlay/` — In-game overlay (vanilla HTML/CSS, no React)
- `src/popup/` — Extension popup (React + Tailwind)
- `src/lib/` — API client, Firebase auth, Chrome storage helpers

### Dependency on colonist-io-api

The extension depends on `colonist-io-api` via `"file:../api"` in package.json. Key imports:

- `ColonistTracker` — High-level game state tracking in `content/index.ts`
- `installInterceptor` — WebSocket monkey-patch in `content/interceptor.ts`
- `parseLogEntry`, `createGameState`, `applyEvent` — Used by DOM observer fallback in `content/observer.ts`
- `GameState` type — Used by overlay rendering

### Cross-Context Communication

```
colonist.io page context
  └─ interceptor.js (installInterceptor from api)
       └─ window.postMessage({ source: "catan-companion-ws", payload })

content script context
  └─ content.js (ColonistTracker from api)
       ├─ overlay (DOM injection)
       └─ chrome.storage.local (persist game state)

popup context
  └─ popup.js (React)
       └─ chrome.storage.local (read game state)
       └─ fetch → catan.henrypye.xyz/api/games (submit)
```

### Auth

Firebase Auth (project `henry-auth-bcd1d`, shared with leaderboard). Popup uses email/password login with `browserLocalPersistence`. Token sent as `Authorization: Bearer` header to leaderboard API.

## Known Issues / Gotchas

- All hooks in `SubmitGameView` must be above the early return to avoid React hooks violation
- The `persistGameState()` function in `content/index.ts` serializes inline (no shared chunk imports)
- Popup reads from `chrome.storage.local` — never communicates directly with content script
- The `@/` path alias maps to `./src/` (configured in both tsconfig.json and vite.config.ts)

## Environment Variables

Copy `.env.example` to `.env` and fill in:

- `VITE_FIREBASE_API_KEY` — Firebase API key
- `VITE_FIREBASE_AUTH_DOMAIN` — Firebase auth domain
- `VITE_FIREBASE_PROJECT_ID` — Firebase project ID (`henry-auth-bcd1d`)
- `VITE_API_BASE_URL` — Leaderboard API base URL (`https://catan.henrypye.xyz`)
