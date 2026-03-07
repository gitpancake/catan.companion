import type { GameEvent, GameState } from "./types";

// colonist.io protocol:
// - Sessions array maps playerColor (1-indexed) to username
// - type:91 diffs contain game state changes via gameLogState entries
// - gameLogState.{n}.text.type values:
//     4  = piece placed (pieceEnum: 0=road, 2=settlement, 3=city)
//     10 = dice roll (firstDice, secondDice, playerColor)
//     11 = robber placed
// - playerStates.{color}.victoryPointsState tracks VP by category

// Maps playerColor (1-indexed) → username
const playerColorToName = new Map<number, string>();

function getPlayerName(color: number): string {
  return playerColorToName.get(color) ?? `Player ${color}`;
}

// Extract player sessions from StateUpdated messages
function tryParseSessionsSnapshot(data: unknown, state: GameState): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;

  // Look for sessions array (lobby/room state)
  const sessions = findSessionsArray(d);
  if (!sessions || sessions.length === 0) return false;

  console.log("[catan-companion] sessions:", JSON.stringify(sessions.map((s: any) => s ? { username: s.username, selectedColor: s.selectedColor, isBot: s.isBot, playerColor: s.playerColor, color: s.color, index: s.index } : null)));

  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i] as Record<string, unknown> | null;
    if (!s || typeof s !== "object") continue;

    // Use the session's actual color field if available, fall back to index+1
    const color =
      (typeof s.selectedColor === "number" ? s.selectedColor : null) ??
      (typeof s.playerColor === "number" ? s.playerColor : null) ??
      (typeof s.color === "number" ? s.color : null) ??
      i + 1;

    const username = (s.username as string | undefined) || (s.isBot ? `Bot ${color}` : null);
    if (!username) continue;

    console.log(`[catan-companion] mapping color ${color} -> ${username} (all keys: ${Object.keys(s).join(",")})`);
    playerColorToName.set(color, username);

    if (!state.players.has(username)) {
      // Start at 0 — setup placements come through as type:91 diff events
      state.players.set(username, {
        name: username,
        settlements: 0,
        cities: 0,
        vpCards: 0,
      });
    }
  }

  if (playerColorToName.size > 0) {
    state.started = true;
    return true;
  }
  return false;
}

function findSessionsArray(obj: Record<string, unknown>): unknown[] | null {
  if (Array.isArray(obj.sessions)) return obj.sessions;

  // Check nested in data
  const data = obj.data as Record<string, unknown> | undefined;
  if (data && typeof data === "object") {
    if (Array.isArray(data.sessions)) return data.sessions;

    // Check in payload
    const payload = data.payload as Record<string, unknown> | undefined;
    if (payload && typeof payload === "object" && Array.isArray(payload.sessions)) {
      return payload.sessions;
    }
  }

  return null;
}

let playerStatesLogged = false;

// Sync authoritative building/VP counts from playerStates in diffs
function syncPlayerStates(diff: Record<string, unknown>, state: GameState): boolean {
  const playerStates = diff.playerStates as Record<string, unknown> | undefined;
  if (!playerStates || typeof playerStates !== "object") return false;

  if (!playerStatesLogged) {
    console.log("[catan-companion] playerStates structure:", JSON.stringify(playerStates, null, 2));
    playerStatesLogged = true;
  }

  let synced = false;
  for (const [colorStr, val] of Object.entries(playerStates)) {
    const ps = val as Record<string, unknown> | undefined;
    if (!ps || typeof ps !== "object") continue;

    const color = parseInt(colorStr);
    if (isNaN(color)) continue;

    const name = getPlayerName(color);
    if (name.startsWith("Player ")) continue; // unknown player

    const player = state.players.get(name);
    if (!player) continue;

    // Try to read victoryPointsState for authoritative counts
    const vpState = ps.victoryPointsState as Record<string, unknown> | undefined;
    if (vpState && typeof vpState === "object") {
      // colonist uses addressVictoryPoints for settlements and
      // upgradeVictoryPoints for cities (each city = 2 VP, so cities = value / 2)
      if (typeof vpState.addressVictoryPoints === "number") {
        player.settlements = vpState.addressVictoryPoints;
      }
      if (typeof vpState.upgradeVictoryPoints === "number") {
        player.cities = vpState.upgradeVictoryPoints / 2;
      }
      if (typeof vpState.victoryPointDevelopmentCards === "number") {
        player.vpCards = vpState.victoryPointDevelopmentCards;
      }
      synced = true;
      console.log(`[catan-companion] playerStates sync: ${name} -> ${JSON.stringify(vpState)}`);
    }
  }
  return synced;
}

// Parse type:91 game state diffs for game events
// When skipBuilds is true, playerStates already synced building counts
function parseDiffEvents(diff: Record<string, unknown>, skipBuilds = false): GameEvent[] {
  const events: GameEvent[] = [];

  // Parse gameLogState entries
  const gameLog = diff.gameLogState as Record<string, unknown> | undefined;
  if (gameLog && typeof gameLog === "object") {
    for (const entry of Object.values(gameLog)) {
      const e = entry as Record<string, unknown> | undefined;
      if (!e || typeof e !== "object") continue;

      const text = e.text as Record<string, unknown> | undefined;
      if (!text || typeof text !== "object") continue;

      const logType = text.type as number | undefined;
      const playerColor = text.playerColor as number | undefined;

      if (logType === undefined) continue;

      // Dice roll: type 10
      if (logType === 10 && playerColor) {
        const d1 = text.firstDice as number | undefined;
        const d2 = text.secondDice as number | undefined;
        if (d1 && d2) {
          events.push({
            type: "roll",
            player: getPlayerName(playerColor),
            value: d1 + d2,
          });
        }
      }

      // Piece placed: type 4 (setup) or type 5 (mid-game build)
      // Skip if playerStates already synced authoritative counts
      if (!skipBuilds && (logType === 4 || logType === 5) && playerColor) {
        const pieceEnum = text.pieceEnum as number | undefined;
        if (pieceEnum === 2) {
          events.push({
            type: "built",
            player: getPlayerName(playerColor),
            building: "settlement",
          });
        } else if (pieceEnum === 3) {
          events.push({
            type: "built",
            player: getPlayerName(playerColor),
            building: "city",
          });
        }
      }

      // VP card: type 23 (dev card VP reveal)
      if (!skipBuilds && logType === 23 && playerColor) {
        events.push({
          type: "vp_card",
          player: getPlayerName(playerColor),
        });
      }
    }
  }

  // Check for longest road changes
  const lrState = diff.mechanicLongestRoadState as Record<string, unknown> | undefined;
  if (lrState && typeof lrState === "object") {
    for (const [colorStr, val] of Object.entries(lrState)) {
      const v = val as Record<string, unknown> | undefined;
      if (v && typeof v === "object" && typeof v.hasLongestRoad === "boolean") {
        events.push({
          type: v.hasLongestRoad ? "longest_road" : "lost_longest_road",
          player: getPlayerName(parseInt(colorStr)),
        });
      }
    }
  }

  // Check for largest army changes
  const laState = diff.mechanicLargestArmyState as Record<string, unknown> | undefined;
  if (laState && typeof laState === "object") {
    for (const [colorStr, val] of Object.entries(laState)) {
      const v = val as Record<string, unknown> | undefined;
      if (v && typeof v === "object" && typeof v.hasLargestArmy === "boolean") {
        events.push({
          type: v.hasLargestArmy ? "largest_army" : "lost_largest_army",
          player: getPlayerName(parseInt(colorStr)),
        });
      }
    }
  }

  return events;
}

export function parseWsMessage(raw: string, state?: GameState): GameEvent[] {
  const events: GameEvent[] = [];

  try {
    const msg = JSON.parse(raw);
    if (!msg || typeof msg !== "object") return events;

    // Try to extract player sessions from the message
    if (state) {
      tryParseSessionsSnapshot(msg, state);
    }

    // Check for type:91 diff messages (nested in data)
    const data = msg.data as Record<string, unknown> | undefined;
    if (data && typeof data === "object") {
      const type = data.type as number | undefined;

      if (type === 91) {
        const payload = data.payload as Record<string, unknown> | undefined;
        if (payload && typeof payload === "object") {
          const diff = payload.diff as Record<string, unknown> | undefined;
          if (diff && typeof diff === "object") {
            // If playerStates is present, use it as ground truth for
            // buildings/VP and skip incremental built events from this diff
            const hasPlayerStates = state && syncPlayerStates(diff, state);
            const diffEvents = parseDiffEvents(diff, hasPlayerStates ?? false);
            events.push(...diffEvents);
          }
        }
      }

      // Also try snapshot from nested data
      if (state) {
        tryParseSessionsSnapshot(data, state);
      }
    }
  } catch {
    // Ignore parse errors
  }

  return events;
}

export function getDiscoveredPlayers(): Map<number, string> {
  return playerColorToName;
}
