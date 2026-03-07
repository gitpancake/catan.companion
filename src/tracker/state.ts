import type { GameState, PlayerState, GameEvent } from "../content/types";

function createPlayer(name: string): PlayerState {
  return {
    name,
    settlements: 0,
    cities: 0,
    vpCards: 0,
  };
}

export function createGameState(): GameState {
  return {
    players: new Map(),
    diceHistory: [],
    diceHistogram: { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 },
    longestRoadPlayer: null,
    largestArmyPlayer: null,
    started: false,
  };
}

function ensurePlayer(state: GameState, name: string): PlayerState {
  if (!state.players.has(name)) {
    state.players.set(name, createPlayer(name));
  }
  return state.players.get(name)!;
}

export function applyEvent(state: GameState, event: GameEvent): void {
  state.started = true;

  switch (event.type) {
    case "roll": {
      state.diceHistory.push(event.value);
      if (event.value >= 2 && event.value <= 12) {
        state.diceHistogram[event.value]++;
      }
      ensurePlayer(state, event.player);
      break;
    }

    case "built": {
      const player = ensurePlayer(state, event.player);
      if (event.building === "settlement") {
        player.settlements++;
      } else if (event.building === "city") {
        player.cities++;
        player.settlements = Math.max(0, player.settlements - 1);
      }
      break;
    }

    case "vp_card": {
      const player = ensurePlayer(state, event.player);
      player.vpCards++;
      break;
    }

    case "longest_road": {
      state.longestRoadPlayer = event.player;
      break;
    }

    case "lost_longest_road": {
      if (state.longestRoadPlayer === event.player) {
        state.longestRoadPlayer = null;
      }
      break;
    }

    case "largest_army": {
      state.largestArmyPlayer = event.player;
      break;
    }

    case "lost_largest_army": {
      if (state.largestArmyPlayer === event.player) {
        state.largestArmyPlayer = null;
      }
      break;
    }
  }
}
