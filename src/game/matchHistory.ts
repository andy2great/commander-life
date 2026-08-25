// Persists a running history of completed games (issue #166) so a playgroup
// can see results across a whole session, not just the recap for the game
// that just ended (src/game/stats.ts, issue #98). Uses the same
// Storage-like/localStorage pattern as rosterStorage.ts so it stays a
// DOM-global-free, unit-testable module — src/ui/statsScreen.ts supplies
// `window.localStorage`.

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface MatchHistoryEntry {
  /** ISO 8601 timestamp of when the game ended. */
  playedAt: string;
  /** Player names, in table order. */
  players: string[];
  /** Winning player's name, or null for a draw (issue #84). */
  winnerName: string | null;
  /** Eliminated players' names, earliest elimination first. */
  eliminationOrder: string[];
}

const STORAGE_KEY = 'commander-life:match-history';

/** Saves `entry` as the most recent completed game. Silently no-ops on failure (private browsing, quota exceeded) — persistence is a nice-to-have, never fatal. */
export function saveMatchResult(storage: StorageLike, entry: MatchHistoryEntry): void {
  try {
    const history = loadMatchHistory(storage);
    history.unshift(entry);
    storage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // ignore
  }
}

/** Loads the saved match history, most-recent-first, or an empty array if none is saved or the stored value is missing/malformed/corrupted. */
export function loadMatchHistory(storage: StorageLike): MatchHistoryEntry[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isMatchHistoryEntry);
  } catch {
    return [];
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isMatchHistoryEntry(value: unknown): value is MatchHistoryEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.playedAt === 'string' &&
    isStringArray(candidate.players) &&
    (candidate.winnerName === null || typeof candidate.winnerName === 'string') &&
    isStringArray(candidate.eliminationOrder)
  );
}
