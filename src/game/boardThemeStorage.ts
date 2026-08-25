// Persists the last-selected board theme (issue #168) so it survives
// closing and reopening the app, alongside rosterStorage.ts's roster
// persistence. Takes a Storage-like interface rather than reaching for
// `localStorage` directly so it stays a DOM-global-free, unit-testable
// module — src/ui/setupScreen.ts supplies `window.localStorage`.

import { BOARD_THEMES } from './boardTheme';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'commander-life:board-theme';

/** Saves the selected theme id. Silently no-ops on failure (private browsing, quota exceeded) — persistence is a nice-to-have, never fatal. */
export function saveLastBoardTheme(storage: StorageLike, themeId: string): void {
  try {
    storage.setItem(STORAGE_KEY, themeId);
  } catch {
    // ignore
  }
}

/** Loads the last saved theme id, or null if none is saved or the stored value isn't a known theme id. */
export function loadLastBoardTheme(storage: StorageLike): string | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return BOARD_THEMES.some((theme) => theme.id === raw) ? raw : null;
  } catch {
    return null;
  }
}
