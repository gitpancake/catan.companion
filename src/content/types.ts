export type Resource = "lumber" | "brick" | "wool" | "grain" | "ore";

export interface PlayerState {
  name: string;
  settlements: number;
  cities: number;
  vpCards: number; // revealed VP development cards
}

export interface GameState {
  players: Map<string, PlayerState>;
  diceHistory: number[];
  diceHistogram: Record<number, number>;
  longestRoadPlayer: string | null; // player name with longest road (5+ roads)
  largestArmyPlayer: string | null; // player name with largest army (3+ knights)
  started: boolean;
}

export type GameEvent =
  | { type: "roll"; player: string; value: number }
  | { type: "built"; player: string; building: "settlement" | "city" }
  | { type: "vp_card"; player: string }
  | { type: "longest_road"; player: string }
  | { type: "largest_army"; player: string }
  | { type: "unknown"; text: string };
