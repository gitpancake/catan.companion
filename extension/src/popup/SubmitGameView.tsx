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
  type SerializedGameState,
  type SerializedPlayer,
} from "@/lib/gameState";
import { getPlayerMappings, savePlayerMappings } from "@/lib/storage";

interface PlayerOverride {
  settlements: number;
  cities: number;
  vpCards: number;
  longestRoad: boolean;
  largestArmy: boolean;
}

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
  const [editMode, setEditMode] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, PlayerOverride>>({});

  useEffect(() => {
    const t = token ?? undefined;

    // Load game state independently so API failures don't discard it
    getGameState().then(setGameState).catch(() => {});

    Promise.all([
      fetchLeagues(t),
      fetchPlayers(t),
      getPlayerMappings(),
    ]).then(([ls, ps, pm]) => {
      const filteredLeagues = ls.filter((l) => l.userRole === "owner" || l.userRole === "co-owner");
      setLeagues(filteredLeagues);
      setPlayers(ps);
      setMappings(pm);
      
      // Auto-select league if there's only one
      if (filteredLeagues.length === 1) {
        setSelectedLeague(filteredLeagues[0].id);
      }
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load data");
    });
  }, [token]);

  // Must be above the early return so hook count is stable across renders
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => onBack(), 3000);
    return () => clearTimeout(timer);
  }, [success, onBack]);

  if (!gameState || !gameState.started || gameState.players.length === 0) {
    return (
      <div className="p-4 space-y-3">
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground">
          &larr; Back
        </button>
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : (
          <p className="text-xs text-muted-foreground">No game data found. Play a game on colonist.io first.</p>
        )}
      </div>
    );
  }

  const mappedPlayers = gameState.players.filter((p) => !skipped.has(p.name) && mappings[p.name]);

  const getPlayerData = (player: SerializedPlayer) => {
    const override = overrides[player.name];
    if (!override) {
      return {
        settlements: player.settlements,
        cities: player.cities,
        vpCards: player.vpCards,
        longestRoad: gameState.longestRoadPlayer === player.name,
        largestArmy: gameState.largestArmyPlayer === player.name,
      };
    }
    return override;
  };

  const calcPlayerVp = (player: SerializedPlayer) => {
    const data = getPlayerData(player);
    return data.settlements + data.cities * 2 + data.vpCards + 
           (data.longestRoad ? 2 : 0) + (data.largestArmy ? 2 : 0);
  };

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
          scores: mappedPlayers.map((p) => {
            const data = getPlayerData(p);
            return {
              playerId: mappings[p.name],
              victoryPoints: calcPlayerVp(p),
              settlements: data.settlements,
              cities: data.cities,
              longestRoad: data.longestRoad,
              largestArmy: data.largestArmy,
              devPoints: 0,
              devCardVp: data.vpCards,
            };
          }),
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
      <div className="flex flex-col items-center justify-center p-8 space-y-3">
        <p className="text-sm font-medium text-green-500">Game submitted!</p>
        <p className="text-[10px] text-muted-foreground">Returning to leagues...</p>
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditMode(!editMode)}
            className={`text-[10px] px-2 py-1 rounded border transition-colors ${
              editMode 
                ? "bg-primary text-primary-foreground border-primary" 
                : "border-input bg-background text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {editMode ? "Done" : "Edit Scores"}
          </button>
          <h2 className="text-xs font-bold tracking-tight">Submit Game</h2>
        </div>
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
            editMode={editMode}
            override={overrides[p.name]}
            calculatedVp={calcPlayerVp(p)}
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
            onOverride={(override) =>
              setOverrides((prev) => ({ ...prev, [p.name]: override }))
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
  editMode,
  override,
  calculatedVp,
  onMap,
  onToggleSkip,
  onOverride,
}: {
  player: SerializedPlayer;
  gameState: SerializedGameState;
  leaderboardPlayers: Player[];
  selectedPlayerId: string;
  isSkipped: boolean;
  editMode: boolean;
  override?: PlayerOverride;
  calculatedVp: number;
  onMap: (playerId: string) => void;
  onToggleSkip: () => void;
  onOverride: (override: PlayerOverride) => void;
}) {
  // Use override values or original values
  const currentData = override || {
    settlements: player.settlements,
    cities: player.cities,
    vpCards: player.vpCards,
    longestRoad: gameState.longestRoadPlayer === player.name,
    largestArmy: gameState.largestArmyPlayer === player.name,
  };

  const updateOverride = (updates: Partial<PlayerOverride>) => {
    onOverride({ ...currentData, ...updates });
  };

  return (
    <div className={`rounded-md border border-border p-2 space-y-1.5 ${isSkipped ? "opacity-40" : ""}`}>
      {/* Player name + VP + skip */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium">{player.name}</span>
          {!editMode && (
            <span className="text-[10px] text-muted-foreground">
              {currentData.settlements}s {currentData.cities}c
              {currentData.longestRoad ? " LR" : ""}
              {currentData.largestArmy ? " LA" : ""}
              {currentData.vpCards > 0 ? ` ${currentData.vpCards}vp` : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${override ? "text-amber-500" : ""}`}>
            {calculatedVp} VP
          </span>
          <button
            onClick={onToggleSkip}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            {isSkipped ? "include" : "skip"}
          </button>
        </div>
      </div>

      {/* Edit mode controls */}
      {editMode && !isSkipped && (
        <div className="space-y-1">
          <div className="grid grid-cols-3 gap-1">
            <div className="space-y-0.5">
              <label className="text-[10px] text-muted-foreground">Settlements</label>
              <input
                type="number"
                min="0"
                max="5"
                value={currentData.settlements}
                onChange={(e) => updateOverride({ settlements: parseInt(e.target.value) || 0 })}
                className="flex h-6 w-full rounded border border-input bg-background px-1 text-[11px] text-center font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-[10px] text-muted-foreground">Cities</label>
              <input
                type="number"
                min="0"
                max="4"
                value={currentData.cities}
                onChange={(e) => updateOverride({ cities: parseInt(e.target.value) || 0 })}
                className="flex h-6 w-full rounded border border-input bg-background px-1 text-[11px] text-center font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-[10px] text-muted-foreground">Dev VP</label>
              <input
                type="number"
                min="0"
                max="5"
                value={currentData.vpCards}
                onChange={(e) => updateOverride({ vpCards: parseInt(e.target.value) || 0 })}
                className="flex h-6 w-full rounded border border-input bg-background px-1 text-[11px] text-center font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => updateOverride({ longestRoad: !currentData.longestRoad })}
              className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                currentData.longestRoad
                  ? "border-amber-500 bg-amber-50 text-amber-700"
                  : "border-input bg-background text-muted-foreground hover:bg-accent"
              }`}
            >
              Longest Road
            </button>
            <button
              type="button"
              onClick={() => updateOverride({ largestArmy: !currentData.largestArmy })}
              className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                currentData.largestArmy
                  ? "border-amber-500 bg-amber-50 text-amber-700"
                  : "border-input bg-background text-muted-foreground hover:bg-accent"
              }`}
            >
              Largest Army
            </button>
          </div>
        </div>
      )}

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
