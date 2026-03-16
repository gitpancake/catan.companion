import { createParserContext, parseWsMessage, restoreColorMap, getDiscoveredPlayers, type ParserContext } from "./ws-parser";
import { createGameState, applyEvent } from "./state";
import type { GameState, GameEvent, PlayerState } from "./types";

export class ColonistTracker {
  private state: GameState;
  private ctx: ParserContext;

  constructor() {
    this.state = createGameState();
    this.ctx = createParserContext();
  }

  processMessage(raw: string): GameEvent[] {
    const events = parseWsMessage(raw, this.state, this.ctx);
    for (const event of events) {
      applyEvent(this.state, event);
    }
    return events;
  }

  getState(): Readonly<GameState> {
    return this.state;
  }

  getPlayerMappings(): ReadonlyMap<number, string> {
    return getDiscoveredPlayers(this.ctx);
  }

  restore(
    players: PlayerState[],
    opts?: {
      colorMap?: Record<string, string>;
      longestRoadPlayer?: string | null;
      largestArmyPlayer?: string | null;
    },
  ): void {
    for (const p of players) {
      this.state.players.set(p.name, {
        name: p.name,
        settlements: p.settlements ?? 0,
        cities: p.cities ?? 0,
        vpCards: p.vpCards ?? 0,
      });
    }
    if (opts?.longestRoadPlayer !== undefined) {
      this.state.longestRoadPlayer = opts.longestRoadPlayer;
    }
    if (opts?.largestArmyPlayer !== undefined) {
      this.state.largestArmyPlayer = opts.largestArmyPlayer;
    }
    if (opts?.colorMap) {
      restoreColorMap(opts.colorMap, this.ctx);
    }
    this.state.started = true;
  }

  reset(): void {
    this.state = createGameState();
    this.ctx = createParserContext();
  }
}
