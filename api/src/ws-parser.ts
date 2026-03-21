import type { GameEvent, GameState } from "./types";

// colonist.io protocol:
// - Sessions array maps playerColor (1-indexed) to username
// - type:91 diffs contain game state changes via gameLogState entries
// - gameLogState.{n}.text.type values:
//     4  = piece placed (pieceEnum: 0=road, 2=settlement, 3=city)
//     10 = dice roll (firstDice, secondDice, playerColor)
//     11 = robber placed
// - playerStates.{color}.victoryPointsState tracks VP by category

export interface ParserContext {
  colorToName: Map<number, string>;
  snapshotLogged: boolean;
}

export function createParserContext(): ParserContext {
  return {
    colorToName: new Map(),
    snapshotLogged: false,
  };
}

// colonist.io uses color strings in sessions, but numeric IDs in game state
const colorStringToNumber: Record<string, number> = {
  red: 1, blue: 2, orange: 3, white: 4, green: 5, brown: 6,
};

function resolveColorNumber(s: Record<string, unknown>, index: number): number {
  // Try numeric fields first
  for (const key of ["selectedColor", "playerColor", "color"]) {
    if (typeof s[key] === "number") return s[key] as number;
  }
  // Try string color name → number mapping
  for (const key of ["selectedColor", "playerColor", "color"]) {
    if (typeof s[key] === "string") {
      const num = colorStringToNumber[(s[key] as string).toLowerCase()];
      if (num) return num;
    }
  }
  // Fall back to array index
  return index + 1;
}

function getPlayerName(color: number, ctx: ParserContext): string {
  return ctx.colorToName.get(color) ?? `Player ${color}`;
}

// Extract player sessions from StateUpdated messages
function tryParseSessionsSnapshot(data: unknown, state: GameState, ctx: ParserContext): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;

  // Look for sessions array (lobby/room state)
  const sessions = findSessionsArray(d);
  if (!sessions || sessions.length === 0) return false;

  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i] as Record<string, unknown> | null;
    if (!s || typeof s !== "object") continue;

    const color = resolveColorNumber(s, i);

    const username =
      (typeof s.username === "string" ? s.username : null) ??
      (typeof s.name === "string" ? s.name : null) ??
      (typeof s.displayName === "string" ? s.displayName : null) ??
      (typeof s.playerName === "string" ? s.playerName : null) ??
      (typeof s.nick === "string" ? s.nick : null) ??
      (s.isBot ? `Bot ${color}` : null);
    if (!username) continue;

    const oldName = ctx.colorToName.get(color);
    if (oldName === username) continue; // no change, skip

    console.log(`[colonist-io-api] mapping color ${color} -> ${username}`);
    ctx.colorToName.set(color, username);

    // If we had a "Player N" entry with data, migrate it to the real name
    if (oldName && oldName !== username && state.players.has(oldName) && !state.players.has(username)) {
      const oldPlayer = state.players.get(oldName)!;
      state.players.delete(oldName);
      oldPlayer.name = username;
      state.players.set(username, oldPlayer);
      console.log(`[colonist-io-api] migrated "${oldName}" -> "${username}"`);
    } else if (!state.players.has(username)) {
      state.players.set(username, {
        name: username,
        settlements: 0,
        cities: 0,
        vpCards: 0,
      });
    }
  }

  if (ctx.colorToName.size > 0) {
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

// Sync authoritative building/VP counts from playerStates in diffs
function syncPlayerStates(diff: Record<string, unknown>, state: GameState, ctx: ParserContext): boolean {
  const playerStates = diff.playerStates as Record<string, unknown> | undefined;
  if (!playerStates || typeof playerStates !== "object") return false;

  let hasChanges = false;
  for (const [colorStr, val] of Object.entries(playerStates)) {
    const ps = val as Record<string, unknown> | undefined;
    if (!ps || typeof ps !== "object") continue;

    const color = parseInt(colorStr);
    if (isNaN(color)) continue;

    const name = getPlayerName(color, ctx);

    // Ensure player exists in state (even if still "Player N")
    if (!state.players.has(name)) {
      state.players.set(name, { name, settlements: 0, cities: 0, vpCards: 0 });
    }
    const player = state.players.get(name)!;

    // Store previous values to detect changes
    const prevSettlements = player.settlements;
    const prevCities = player.cities;
    const prevVpCards = player.vpCards;

    // Try to read victoryPointsState for authoritative counts
    // colonist.io uses numeric keys: 0=settlement VP, 1=city VP, 2=dev card VP
    const vpState = ps.victoryPointsState as Record<string, unknown> | undefined;
    if (vpState && typeof vpState === "object") {
      // Settlement VP: key "0" or named alternatives
      for (const key of ["0", "addressVictoryPoints", "settlementVictoryPoints"]) {
        if (typeof vpState[key] === "number") {
          player.settlements = vpState[key] as number;
          break;
        }
      }
      // City VP: key "1" or named alternatives (each city = 2 VP, so count = value / 2)
      for (const key of ["1", "upgradeVictoryPoints", "cityVictoryPoints"]) {
        if (typeof vpState[key] === "number") {
          const v = vpState[key] as number;
          player.cities = Math.round(v / 2);
          break;
        }
      }
      // VP cards: key "2" or named alternatives
      for (const key of ["2", "victoryPointDevelopmentCards", "developmentCardVictoryPoints"]) {
        if (typeof vpState[key] === "number") {
          player.vpCards = vpState[key] as number;
          break;
        }
      }

      // Only consider this as having changes if any values actually changed
      if (player.settlements !== prevSettlements || 
          player.cities !== prevCities || 
          player.vpCards !== prevVpCards) {
        hasChanges = true;
      }
    }
  }
  return hasChanges;
}

// Parse type:91 game state diffs for game events
// When skipBuilds is true, playerStates already synced building counts
function parseDiffEvents(diff: Record<string, unknown>, ctx: ParserContext, skipBuilds = false): GameEvent[] {
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
            player: getPlayerName(playerColor, ctx),
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
            player: getPlayerName(playerColor, ctx),
            building: "settlement",
          });
        } else if (pieceEnum === 3) {
          events.push({
            type: "built",
            player: getPlayerName(playerColor, ctx),
            building: "city",
          });
        }
      }

      // VP card: type 23 (dev card VP reveal)
      if (!skipBuilds && logType === 23 && playerColor) {
        events.push({
          type: "vp_card",
          player: getPlayerName(playerColor, ctx),
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
          player: getPlayerName(parseInt(colorStr), ctx),
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
          player: getPlayerName(parseInt(colorStr), ctx),
        });
      }
    }
  }

  return events;
}

// Try to extract player names from playerStates entries directly
// (fallback when sessions array isn't available, e.g. on reconnect)
function tryExtractNamesFromPlayerStates(
  playerStates: Record<string, unknown>,
  state: GameState,
  ctx: ParserContext,
): void {
  for (const [colorStr, val] of Object.entries(playerStates)) {
    const ps = val as Record<string, unknown> | undefined;
    if (!ps || typeof ps !== "object") continue;

    const color = parseInt(colorStr);
    if (isNaN(color)) continue;
    if (ctx.colorToName.has(color)) continue; // already mapped

    // Try common name fields
    const name =
      (typeof ps.username === "string" ? ps.username : null) ??
      (typeof ps.name === "string" ? ps.name : null) ??
      (typeof ps.playerName === "string" ? ps.playerName : null);

    if (name) {
      console.log(`[colonist-io-api] extracted name from playerStates: color ${color} -> ${name}`);
      ctx.colorToName.set(color, name);
      if (!state.players.has(name)) {
        state.players.set(name, { name, settlements: 0, cities: 0, vpCards: 0 });
      }
      state.started = true;
    }
  }
}

// Recursively search for sessions arrays in an object (up to a depth limit)
function deepFindSessions(obj: unknown, depth = 0): unknown[] | null {
  if (depth > 4 || !obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  // Check for known session-like array keys
  for (const key of ["sessions", "playerUserStates", "players", "users", "members"]) {
    if (Array.isArray(o[key]) && o[key].length > 0) {
      // Verify at least one entry has a username-like field
      const arr = o[key] as unknown[];
      const hasUsername = arr.some(
        (item) =>
          item &&
          typeof item === "object" &&
          ("username" in (item as Record<string, unknown>) ||
           "name" in (item as Record<string, unknown>) ||
           "playerName" in (item as Record<string, unknown>)),
      );
      if (hasUsername) {
        console.log(`[colonist-io-api] found player array under key "${key}" at depth ${depth}`);
        return arr;
      }
    }
  }

  // Search one level deeper in each object-valued field
  for (const val of Object.values(o)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const found = deepFindSessions(val, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

// Try to parse a full game state snapshot (sent on connect/reconnect)
// These contain playerStates, sessions, gameLogState etc. at the payload level
function tryParseFullSnapshot(obj: Record<string, unknown>, state: GameState, ctx: ParserContext): boolean {
  // Look for playerStates at various nesting levels
  const payload = (obj.data as Record<string, unknown> | undefined)?.payload as Record<string, unknown> | undefined;
  const candidates = [
    obj,
    obj.data as Record<string, unknown> | undefined,
    payload,
    // colonist.io nests game state under payload.gameState
    payload?.gameState as Record<string, unknown> | undefined,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const c = candidate as Record<string, unknown>;

    // If this object has playerStates, treat it as a snapshot
    if (c.playerStates && typeof c.playerStates === "object") {
      // 1. Try to find sessions at this level, parent level, or deeper for name mapping FIRST
      // playerUserStates is typically at the payload level, while playerStates is in gameState
      const sessions = deepFindSessions(c) ?? deepFindSessions(obj) ?? deepFindSessions(payload);
      if (sessions) {
        // Wrap in an object so tryParseSessionsSnapshot can find it
        tryParseSessionsSnapshot({ sessions }, state, ctx);
      }

      // 2. If we still don't have names, try extracting from playerStates entries
      if (ctx.colorToName.size === 0) {
        tryExtractNamesFromPlayerStates(
          c.playerStates as Record<string, unknown>,
          state,
          ctx,
        );
      }

      // 3. If we STILL don't have names, log the playerStates keys for debugging
      if (ctx.colorToName.size === 0) {
        const ps = c.playerStates as Record<string, unknown>;
        for (const [colorStr, val] of Object.entries(ps)) {
          const entry = val as Record<string, unknown> | undefined;
          if (entry && typeof entry === "object") {
            console.log(`[colonist-io-api] playerStates[${colorStr}] keys:`, Object.keys(entry).join(","));
          }
        }
      }

      // 4. Now sync VP state (names should be resolved by now)
      syncPlayerStates(c as Record<string, unknown>, state, ctx);

      // Search for LR/LA at ALL candidate levels — they may be nested
      // differently than playerStates (e.g., playerStates in gameState
      // but LR/LA at the payload level)
      for (const lrCandidate of candidates) {
        if (!lrCandidate || typeof lrCandidate !== "object") continue;
        const lrc = lrCandidate as Record<string, unknown>;
        const lrState = lrc.mechanicLongestRoadState as Record<string, unknown> | undefined;
        if (lrState && typeof lrState === "object") {
          for (const [colorStr, val] of Object.entries(lrState)) {
            const v = val as Record<string, unknown> | undefined;
            if (v && typeof v === "object" && typeof v.hasLongestRoad === "boolean") {
              const name = getPlayerName(parseInt(colorStr), ctx);
              if (v.hasLongestRoad) state.longestRoadPlayer = name;
              else if (state.longestRoadPlayer === name) state.longestRoadPlayer = null;
            }
          }
          break;
        }
      }
      for (const laCandidate of candidates) {
        if (!laCandidate || typeof laCandidate !== "object") continue;
        const lac = laCandidate as Record<string, unknown>;
        const laState = lac.mechanicLargestArmyState as Record<string, unknown> | undefined;
        if (laState && typeof laState === "object") {
          for (const [colorStr, val] of Object.entries(laState)) {
            const v = val as Record<string, unknown> | undefined;
            if (v && typeof v === "object" && typeof v.hasLargestArmy === "boolean") {
              const name = getPlayerName(parseInt(colorStr), ctx);
              if (v.hasLargestArmy) state.largestArmyPlayer = name;
              else if (state.largestArmyPlayer === name) state.largestArmyPlayer = null;
            }
          }
          break;
        }
      }

      return true;
    }
  }
  return false;
}

export function parseWsMessage(raw: string, state: GameState, ctx: ParserContext): GameEvent[] {
  const events: GameEvent[] = [];

  try {
    const msg = JSON.parse(raw);
    if (!msg || typeof msg !== "object") return events;

    // Log large messages (likely full state snapshots on connect)
    if (!ctx.snapshotLogged && raw.length > 5000) {
      console.log("[colonist-io-api] received game snapshot");
      ctx.snapshotLogged = true;
    }

    // Try to extract player sessions from the message (shallow search first)
    tryParseSessionsSnapshot(msg, state, ctx);

    // If no names found yet, do a deep search for sessions
    if (ctx.colorToName.size === 0) {
      const deepSessions = deepFindSessions(msg);
      if (deepSessions) {
        console.log("[colonist-io-api] found sessions via deep search");
        tryParseSessionsSnapshot({ sessions: deepSessions }, state, ctx);
      }
    }

    // Try to parse full game state snapshot (on connect/reconnect)
    tryParseFullSnapshot(msg as Record<string, unknown>, state, ctx);

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
            const hasPlayerStates = syncPlayerStates(diff, state, ctx);
            const diffEvents = parseDiffEvents(diff, ctx, hasPlayerStates);
            events.push(...diffEvents);
          }
        }
      }

      // Also try snapshot from nested data
      tryParseSessionsSnapshot(data, state, ctx);
    }
  } catch {
    // Ignore parse errors
  }

  return events;
}

export function getDiscoveredPlayers(ctx: ParserContext): ReadonlyMap<number, string> {
  return ctx.colorToName;
}

export function restoreColorMap(map: Record<string, string>, ctx: ParserContext): void {
  for (const [colorStr, name] of Object.entries(map)) {
    ctx.colorToName.set(parseInt(colorStr), name);
  }
}
