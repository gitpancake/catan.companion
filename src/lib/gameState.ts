import type { GameState } from "../content/types";

export interface SerializedPlayer {
  name: string;
  settlements: number;
  cities: number;
  vpCards: number;
}

export interface SerializedGameState {
  players: SerializedPlayer[];
  longestRoadPlayer: string | null;
  largestArmyPlayer: string | null;
  started: boolean;
  savedAt: string;
}

const GAME_STATE_KEY = "catan_game_state";

export function serializeGameState(state: GameState): SerializedGameState {
  return {
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
  };
}

export function calcVp(
  player: SerializedPlayer,
  longestRoadPlayer: string | null,
  largestArmyPlayer: string | null,
): number {
  return (
    player.settlements +
    player.cities * 2 +
    player.vpCards +
    (longestRoadPlayer === player.name ? 2 : 0) +
    (largestArmyPlayer === player.name ? 2 : 0)
  );
}

export async function saveGameState(state: GameState): Promise<void> {
  await chrome.storage.local.set({ [GAME_STATE_KEY]: serializeGameState(state) });
}

export async function getGameState(): Promise<SerializedGameState | null> {
  const result = await chrome.storage.local.get(GAME_STATE_KEY);
  return (result[GAME_STATE_KEY] as SerializedGameState | undefined) ?? null;
}

export async function clearGameState(): Promise<void> {
  await chrome.storage.local.remove(GAME_STATE_KEY);
}
