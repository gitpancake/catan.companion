import { startObserver } from "./observer";
import { parseWsMessage, getDiscoveredPlayers, restoreColorMap } from "./ws-parser";
import { createGameState, applyEvent } from "../tracker/state";
import { createOverlay, updateOverlay } from "../overlay/index";
import type { GameState } from "./types";

// Inline serialization to avoid shared chunk (content scripts can't load chunks)
function persistGameState(state: GameState) {
  // Persist color map alongside game state so it survives page reloads
  const colorMap: Record<string, string> = {};
  for (const [color, name] of getDiscoveredPlayers()) {
    colorMap[String(color)] = name;
  }

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
      colorMap,
    },
  });
}

// Restore game state and color map from storage
function restoreGameState(wsState: GameState): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.get("catan_game_state", (result) => {
      const saved = result.catan_game_state as {
        started?: boolean;
        players?: { name: string; settlements: number; cities: number; vpCards: number }[];
        longestRoadPlayer?: string | null;
        largestArmyPlayer?: string | null;
        colorMap?: Record<string, string>;
      } | undefined;
      if (!saved || !saved.started || !Array.isArray(saved.players) || saved.players.length === 0) {
        resolve(false);
        return;
      }

      // Restore player state
      for (const p of saved.players) {
        wsState.players.set(p.name, {
          name: p.name,
          settlements: p.settlements ?? 0,
          cities: p.cities ?? 0,
          vpCards: p.vpCards ?? 0,
        });
      }
      wsState.longestRoadPlayer = saved.longestRoadPlayer ?? null;
      wsState.largestArmyPlayer = saved.largestArmyPlayer ?? null;
      wsState.started = true;

      // Restore color map
      if (saved.colorMap && typeof saved.colorMap === "object") {
        restoreColorMap(saved.colorMap);
      }

      resolve(true);
    });
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

  // Restore previous state (e.g. after page refresh mid-game)
  restoreGameState(wsState).then((restored) => {
    if (restored) {
      createOverlay();
      updateOverlay(wsState);
    }
  });

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
