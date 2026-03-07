import { getFirebaseAuth } from "./firebase";

const TOKEN_KEY = "catan_id_token";
const USER_KEY = "catan_user";

export interface StoredUser {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
}

export async function saveAuth(token: string, user: StoredUser) {
  await chrome.storage.local.set({
    [TOKEN_KEY]: token,
    [USER_KEY]: user,
  });
}

export async function getStoredToken(): Promise<string | null> {
  // Try to get a fresh token from the current Firebase user (handles expiry)
  const currentUser = getFirebaseAuth().currentUser;
  if (currentUser) {
    const freshToken = await currentUser.getIdToken(/* forceRefresh */ true);
    // Persist the refreshed token
    await chrome.storage.local.set({ [TOKEN_KEY]: freshToken });
    return freshToken;
  }

  // Fall back to stored token (e.g. if Firebase hasn't initialized yet)
  const result = await chrome.storage.local.get(TOKEN_KEY);
  return (result[TOKEN_KEY] as string | undefined) ?? null;
}

export async function getStoredUser(): Promise<StoredUser | null> {
  const result = await chrome.storage.local.get(USER_KEY);
  return (result[USER_KEY] as StoredUser | undefined) ?? null;
}

export async function clearAuth() {
  await chrome.storage.local.remove([TOKEN_KEY, USER_KEY]);
}

// Player name mappings: colonist.io username → leaderboard player ID
const PLAYER_MAPPINGS_KEY = "catan_player_mappings";

export async function getPlayerMappings(): Promise<Record<string, string>> {
  const result = await chrome.storage.local.get(PLAYER_MAPPINGS_KEY);
  return (result[PLAYER_MAPPINGS_KEY] as Record<string, string>) ?? {};
}

export async function savePlayerMappings(mappings: Record<string, string>) {
  await chrome.storage.local.set({ [PLAYER_MAPPINGS_KEY]: mappings });
}
