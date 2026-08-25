// Persists the most recently used player roster (issue #126) so the setup
// screen can pre-fill names, colors, and table order on the next launch, not
// just via the in-game "New Game" hop. Takes a Storage-like interface rather
// than reaching for `localStorage` directly so it stays a DOM-global-free,
// unit-testable module — src/ui/setupScreen.ts supplies `window.localStorage`.

import { MAX_PLAYER_COUNT, MIN_PLAYER_COUNT, type GameConfig, type PlayerConfig } from '../game';
import { isPlayerIconId } from './playerIcons';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The subset of GameConfig that's remembered between games — the starting seat is a fresh per-game choice, not persisted (issue #126). */
export type PersistedRoster = Pick<GameConfig, 'playerCount' | 'startingLife' | 'players'>;

const STORAGE_KEY = 'commander-life:last-roster';

/** Saves `config`'s roster. Silently no-ops on failure (private browsing, quota exceeded) — persistence is a nice-to-have, never fatal. */
export function saveLastRoster(storage: StorageLike, config: PersistedRoster): void {
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ playerCount: config.playerCount, startingLife: config.startingLife, players: config.players }),
    );
  } catch {
    // ignore
  }
}

/** Loads the last saved roster, or null if none is saved or the stored value is missing/malformed/corrupted. */
export function loadLastRoster(storage: StorageLike): PersistedRoster | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isPersistedRoster(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isPlayerConfig(value: unknown): value is PlayerConfig {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.color === 'string' &&
    (candidate.icon === undefined || isPlayerIconId(candidate.icon))
  );
}

function isPersistedRoster(value: unknown): value is PersistedRoster {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.playerCount !== 'number' || typeof candidate.startingLife !== 'number') {
    return false;
  }
  if (candidate.playerCount < MIN_PLAYER_COUNT || candidate.playerCount > MAX_PLAYER_COUNT) {
    return false;
  }
  if (!Array.isArray(candidate.players) || candidate.players.length !== candidate.playerCount) {
    return false;
  }
  return candidate.players.every(isPlayerConfig);
}
