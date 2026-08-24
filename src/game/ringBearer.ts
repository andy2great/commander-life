// Ring-bearer tracking (issue #163): a Playgroup-style "The Ring tempts you"
// badge, held by at most one player at a time. Scoped to a simple
// single-holder badge, not the full temptation-tier rules text. Modeled on
// src/game/poison.ts's shape; free of DOM globals so it stays unit-testable.

import type { UndoStack } from './commanderDamage';

export interface RingBearerState {
  /** The current Ring-bearer's player id, or null when no one holds it (the default at game start). */
  holderId: string | null;
}

export function createRingBearerState(): RingBearerState {
  return { holderId: null };
}

/**
 * Assigns the Ring-bearer badge to `playerId`, removing it from whoever held
 * it before. Pushes an undo action that restores the previous holder (which
 * may be null) onto `undoStack`. No-op — and no undo action pushed — if
 * `playerId` already holds it.
 */
export function assignRingBearer(state: RingBearerState, playerId: string, undoStack: UndoStack): void {
  const previousHolderId = state.holderId;
  if (previousHolderId === playerId) {
    return;
  }

  state.holderId = playerId;
  undoStack.push({
    undo(): void {
      state.holderId = previousHolderId;
    },
  });
}
