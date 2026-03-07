import { useState, useEffect } from "react";
import {
  fetchLeagues,
  fetchPlayers,
  submitGame,
  type League,
  type Player,
} from "@/lib/api";
import {
  getGameState,
  clearGameState,
  calcVp,
  type SerializedGameState,
  type SerializedPlayer,
} from "@/lib/gameState";
import { getPlayerMappings, savePlayerMappings } from "@/lib/storage";

export default function SubmitGameView({
  token,
  onBack,
}: {
  token: string | null;
  onBack: () => void;
}) {
  const [gameState, setGameState] = useState<SerializedGameState | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedLeague, setSelectedLeague] = useState("");
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const t = token ?? undefined;
    Promise.all([
      getGameState(),
      fetchLeagues(t),
      fetchPlayers(t),
      getPlayerMappings(),
    ]).then(([gs, ls, ps, pm]) => {
      setGameState(gs);
      // Only show leagues where user can submit (owner/co-owner)
      setLeagues(ls.filter((l) => l.userRole === "owner" || l.userRole === "co-owner"));
      setPlayers(ps);
      setMappings(pm);
    });
  }, [token]);

  if (!gameState || !gameState.started || gameState.players.length === 0) {
    return (
      <div className="p-4 space-y-3">
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground">
          &larr; Back
        </button>
        <p className="text-xs text-muted-foreground">No game data found. Play a game on colonist.io first.</p>
      </div>
    );
  }

  const mappedPlayers = gameState.players.filter((p) => !skipped.has(p.name) && mappings[p.name]);

  const handleSubmit = async () => {
    if (!selectedLeague) {
      setError("Select a league");
      return;
    }
    if (mappedPlayers.length < 2) {
      setError("Map at least 2 players");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await submitGame(
        {
          leagueId: selectedLeague,
          playedAt: gameState.savedAt,
          scores: mappedPlayers.map((p) => ({
            playerId: mappings[p.name],
            victoryPoints: calcVp(p, gameState.longestRoadPlayer, gameState.largestArmyPlayer),
            settlements: p.settlements,
            cities: p.cities,
            longestRoad: gameState.longestRoadPlayer === p.name,
            largestArmy: gameState.largestArmyPlayer === p.name,
            devPoints: 0,
            devCardVp: p.vpCards,
          })),
        },
        token ?? undefined,
      );

      // Save mappings for next time
      await savePlayerMappings(mappings);
      await clearGameState();
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="p-4 space-y-3">
        <p className="text-xs font-medium text-green-500">Game submitted!</p>
        <button
          onClick={onBack}
          className="inline-flex h-8 w-full items-center justify-center rounded-md border border-border px-4 text-xs font-medium hover:bg-muted"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground">
          &larr; Back
        </button>
        <h2 className="text-xs font-bold tracking-tight">Submit Game</h2>
      </div>

      {/* League Selection */}
      <div className="space-y-1">
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          League
        </label>
        <select
          value={selectedLeague}
          onChange={(e) => setSelectedLeague(e.target.value)}
          className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Select league...</option>
          {leagues.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      {/* Player Mapping */}
      <div className="space-y-2">
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Players
        </label>
        {gameState.players.map((p) => (
          <PlayerRow
            key={p.name}
            player={p}
            gameState={gameState}
            leaderboardPlayers={players}
            selectedPlayerId={mappings[p.name] ?? ""}
            isSkipped={skipped.has(p.name)}
            onMap={(playerId) =>
              setMappings((prev) => ({ ...prev, [p.name]: playerId }))
            }
            onToggleSkip={() =>
              setSkipped((prev) => {
                const next = new Set(prev);
                if (next.has(p.name)) next.delete(p.name);
                else next.add(p.name);
                return next;
              })
            }
          />
        ))}
      </div>

      {/* Error */}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submitting || mappedPlayers.length < 2}
        className="inline-flex h-8 w-full items-center justify-center rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
      >
        {submitting ? "Submitting..." : `Submit (${mappedPlayers.length} players)`}
      </button>
    </div>
  );
}

function PlayerRow({
  player,
  gameState,
  leaderboardPlayers,
  selectedPlayerId,
  isSkipped,
  onMap,
  onToggleSkip,
}: {
  player: SerializedPlayer;
  gameState: SerializedGameState;
  leaderboardPlayers: Player[];
  selectedPlayerId: string;
  isSkipped: boolean;
  onMap: (playerId: string) => void;
  onToggleSkip: () => void;
}) {
  const vp = calcVp(player, gameState.longestRoadPlayer, gameState.largestArmyPlayer);
  const hasLR = gameState.longestRoadPlayer === player.name;
  const hasLA = gameState.largestArmyPlayer === player.name;

  return (
    <div className={`rounded-md border border-border p-2 space-y-1.5 ${isSkipped ? "opacity-40" : ""}`}>
      {/* Player name + VP + skip */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium">{player.name}</span>
          <span className="text-[10px] text-muted-foreground">
            {player.settlements}s {player.cities}c
            {hasLR ? " LR" : ""}
            {hasLA ? " LA" : ""}
            {player.vpCards > 0 ? ` ${player.vpCards}vp` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold">{vp} VP</span>
          <button
            onClick={onToggleSkip}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            {isSkipped ? "include" : "skip"}
          </button>
        </div>
      </div>

      {/* Mapping dropdown */}
      {!isSkipped && (
        <select
          value={selectedPlayerId}
          onChange={(e) => onMap(e.target.value)}
          className="flex h-7 w-full rounded border border-input bg-background px-2 text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">Map to player...</option>
          {leaderboardPlayers.map((lp) => (
            <option key={lp.id} value={lp.id}>
              {lp.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
