import { useState, useEffect } from "react";
import { fetchLeagues, type League } from "@/lib/api";
import type { StoredUser } from "@/lib/storage";
import { getGameState, type SerializedGameState } from "@/lib/gameState";

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return email[0]?.toUpperCase() ?? "?";
}

export default function LeagueView({
  user,
  token,
  onLogout,
  onSubmitGame,
}: {
  user: StoredUser;
  token: string | null;
  onLogout: () => void;
  onSubmitGame: () => void;
}) {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [gameState, setGameState] = useState<SerializedGameState | null>(null);

  useEffect(() => {
    fetchLeagues(token ?? undefined)
      .then(setLeagues)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    getGameState().then(setGameState);
  }, [token]);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt=""
              className="size-8 rounded-full object-cover"
            />
          ) : (
            <div className="size-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
              {getInitials(user.displayName, user.email)}
            </div>
          )}
          <div>
            <p className="text-xs font-medium">
              {user.displayName ?? user.email}
            </p>
            {user.displayName && (
              <p className="text-[10px] text-muted-foreground">{user.email}</p>
            )}
          </div>
        </div>
        <button
          onClick={onLogout}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Sign out
        </button>
      </div>

      {/* Leagues */}
      <div>
        <h2 className="text-xs font-bold tracking-tight mb-2">catan.</h2>

        {loading && (
          <p className="text-xs text-muted-foreground">Loading leagues...</p>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        {!loading && !error && leagues.length === 0 && (
          <p className="text-xs text-muted-foreground">No leagues found.</p>
        )}

        {leagues.map((league) => (
          <div
            key={league.id}
            className="flex items-center justify-between rounded-md border border-border bg-card p-3 mb-2"
          >
            <div>
              <p className="text-xs font-medium">{league.name}</p>
              {league.userRole && (
                <p className="text-[10px] text-muted-foreground">
                  {league.userRole}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Submit Game */}
      <div className="border-t border-border pt-3 space-y-2">
        {gameState && gameState.started && gameState.players.length > 0 ? (
          <>
            <p className="text-[10px] text-muted-foreground">
              Game tracked: {gameState.players.length} players
            </p>
            <button
              onClick={onSubmitGame}
              className="inline-flex h-8 w-full items-center justify-center rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Submit Game
            </button>
          </>
        ) : (
          <p className="text-[10px] text-muted-foreground">
            Navigate to colonist.io to track game stats
          </p>
        )}
      </div>
    </div>
  );
}
