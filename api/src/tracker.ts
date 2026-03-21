import { createParserContext, parseWsMessage, restoreColorMap, getDiscoveredPlayers, type ParserContext } from "./ws-parser";
import { createGameState, applyEvent } from "./state";
import type { GameState, GameEvent, PlayerState } from "./types";

export class ColonistTracker {
  private state: GameState;
  private ctx: ParserContext;
  private _didReset = false;

  constructor() {
    this.state = createGameState();
    this.ctx = createParserContext();
  }

  processMessage(raw: string): GameEvent[] {
    const wasStarted = this.state.started && this.state.players.size > 0;
    const prevPlayers = wasStarted ? new Set(this.state.players.keys()) : null;
    const prevTotalVP = wasStarted ? this.getTotalVP() : 0;

    this._didReset = false;

    const events = parseWsMessage(raw, this.state, this.ctx);
    for (const event of events) {
      applyEvent(this.state, event);
    }

    // Detect new game: players changed entirely, or VP decreased (impossible in one game)
    if (wasStarted && this.isNewGame(prevPlayers!, prevTotalVP)) {
      console.log("[colonist-io-api] new game detected, resetting state");
      this.reset();
      this._didReset = true;
      const freshEvents = parseWsMessage(raw, this.state, this.ctx);
      for (const event of freshEvents) {
        applyEvent(this.state, event);
      }
      return freshEvents;
    }

    return events;
  }

  /** Returns true if the last processMessage call triggered an automatic reset. */
  get didReset(): boolean {
    return this._didReset;
  }

  private getTotalVP(): number {
    let total = 0;
    for (const p of this.state.players.values()) {
      total += p.settlements + p.cities * 2 + p.vpCards;
    }
    return total;
  }

  private isNewGame(prevPlayers: Set<string>, prevTotalVP: number): boolean {
    const currentPlayers = new Set(this.state.players.keys());

    // All players changed (no overlap with previous game)
    if (
      currentPlayers.size > 0 &&
      [...currentPlayers].every((n) => !prevPlayers.has(n))
    ) {
      return true;
    }

    // VP decreased — VP never goes down in a single Catan game
    const currentTotalVP = this.getTotalVP();
    if (prevTotalVP > 0 && currentTotalVP < prevTotalVP) {
      return true;
    }

    return false;
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
