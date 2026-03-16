import { ColonistTracker } from "colonist-io-api";
import { startObserver } from "./observer";
import { createOverlay, updateOverlay } from "../overlay/index";

// Inline serialization to avoid shared chunk (content scripts can't load chunks)
function persistGameState(tracker: ColonistTracker) {
  const state = tracker.getState();
  const colorMap: Record<string, string> = {};
  for (const [color, name] of tracker.getPlayerMappings()) {
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
function restoreTracker(tracker: ColonistTracker): Promise<boolean> {
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

      tracker.restore(saved.players, {
        colorMap: saved.colorMap,
        longestRoadPlayer: saved.longestRoadPlayer,
        largestArmyPlayer: saved.largestArmyPlayer,
      });

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

  const tracker = new ColonistTracker();

  // Restore previous state (e.g. after page refresh mid-game)
  restoreTracker(tracker).then((restored) => {
    if (restored) {
      createOverlay();
      updateOverlay(tracker.getState());
    }
  });

  // Listen for intercepted WebSocket messages (now msgpack-decoded)
  window.addEventListener("message", (event) => {
    if (event.data?.source !== "catan-companion-ws") return;

    const events = tracker.processMessage(event.data.payload);
    const state = tracker.getState();

    // Update overlay if we got events OR if snapshot populated players
    if (events.length > 0 || state.players.size > 0) {
      createOverlay();
      updateOverlay(state);
      persistGameState(tracker);
    }
  });

  // Also keep the DOM observer as a fallback
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver);
  } else {
    startObserver();
  }
}
