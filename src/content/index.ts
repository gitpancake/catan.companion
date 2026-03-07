import { startObserver } from "./observer";
import { parseWsMessage } from "./ws-parser";
import { createGameState, applyEvent } from "../tracker/state";
import { createOverlay, updateOverlay } from "../overlay/index";
import type { GameState } from "./types";

// Inline serialization to avoid shared chunk (content scripts can't load chunks)
function persistGameState(state: GameState) {
  chrome.storage.local.set({
    catan_game_state: {
      players: Array.from(state.players.values()).map((p) => ({
        name: p.name,
        settlements: p.settlements,
        cities: p.cities,
        vpCards: p.vpCards,
      })),
      longestRoadPlayer: state.longestRoadPlayer,
      largestArmyPlayer: state.largestArmyPlayer,
      started: state.started,
      savedAt: new Date().toISOString(),
    },
  });
}

// Only activate on colonist.io
if (window.location.hostname.includes("colonist.io")) {
  // Inject the WebSocket interceptor into the page context
  // This must happen ASAP to catch WebSocket creation
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("interceptor.js");
  (document.head || document.documentElement).appendChild(script);
  script.onload = () => script.remove();

  // Shared game state — used by both WS parser and DOM observer
  const wsState = createGameState();

  // Listen for intercepted WebSocket messages (now msgpack-decoded)
  window.addEventListener("message", (event) => {
    if (event.data?.source !== "catan-companion-ws") return;

    // parseWsMessage now also tries to extract game state snapshots
    const events = parseWsMessage(event.data.payload, wsState);

    // Update overlay if we got events OR if snapshot populated players
    if (events.length > 0 || wsState.players.size > 0) {
      for (const gameEvent of events) {
        applyEvent(wsState, gameEvent);
      }
      createOverlay();
      updateOverlay(wsState);
      persistGameState(wsState);
    }
  });

  // Also keep the DOM observer as a fallback
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver);
  } else {
    startObserver();
  }
}
