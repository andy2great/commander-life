// Pure, DOM-free array helpers for the setup screen's player list (issue
// #126): reordering and removing a specific seat, plus clamping a
// starting-seat index back into range once the list has changed shape. Kept
// separate from the drag/tap DOM wiring in src/ui/setupScreen.ts so the
// index math is unit-testable on its own.

import { MIN_PLAYER_COUNT } from '../game';

/** Moves the item at `fromIndex` to `toIndex`, shifting the items between them. No-op (returns `players` unchanged) for an out-of-range or identical index. */
export function movePlayer<T>(players: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= players.length ||
    toIndex < 0 ||
    toIndex >= players.length
  ) {
    return players;
  }
  const next = players.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

/** Removes the item at `index`. No-op at or below MIN_PLAYER_COUNT, or for an out-of-range index — a table always needs at least 3 seats. */
export function removePlayerAt<T>(players: T[], index: number): T[] {
  if (players.length <= MIN_PLAYER_COUNT || index < 0 || index >= players.length) {
    return players;
  }
  const next = players.slice();
  next.splice(index, 1);
  return next;
}

/** Clamps a starting-seat index back into `[0, playerCount)`, e.g. after the chosen starting player was removed from the list. Defaults to seat 0. */
export function clampStartingIndex(index: number, playerCount: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= playerCount) {
    return 0;
  }
  return index;
}
