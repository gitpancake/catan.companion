import { getStoredToken } from "./storage";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function apiFetch(path: string, token?: string, init?: RequestInit) {
  const authToken = token ?? (await getStoredToken());
  if (!authToken) throw new Error("No token available");

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  return res.json();
}

export interface League {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  userRole: string | null;
}

export async function fetchLeagues(token?: string): Promise<League[]> {
  return apiFetch("/api/leagues", token);
}

export interface Player {
  id: string;
  name: string;
  created_at: string;
}

export async function fetchPlayers(token?: string): Promise<Player[]> {
  return apiFetch("/api/players", token);
}

export interface ScorePayload {
  playerId: string;
  victoryPoints: number;
  settlements: number;
  cities: number;
  longestRoad: boolean;
  largestArmy: boolean;
  devPoints: number;
  devCardVp: number;
}

export interface SubmitGamePayload {
  leagueId: string;
  playedAt: string;
  scores: ScorePayload[];
}

export async function submitGame(payload: SubmitGamePayload, token?: string): Promise<{ id: string }> {
  return apiFetch("/api/games", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
