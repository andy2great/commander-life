// Monarch designation tracking (issue #162): a common Commander table
// mechanic where exactly one player holds the "Monarch" status at a time.
// This ticket only covers a visible, tappable badge marking the current
// holder — the draw-card rule itself is out of scope. Free of DOM globals so
// it stays unit-testable; src/game.ts hosts the tappable badge control.

import type { UndoStack } from './commanderDamage';

export interface MonarchState {
  holderId: string | null;
}

/** No player holds the Monarch by default at game start. */
export function createMonarchState(): MonarchState {
  return { holderId: null };
}

/**
 * Assigns the Monarch to `playerId`, removing it from whoever held it
 * before. Pushes an undo action reverting to the previous holder (including
 * back to no holder) onto `undoStack`. No-op — and pushes nothing — if
 * `playerId` already holds it.
 */
export function assignMonarch(state: MonarchState, playerId: string, undoStack: UndoStack): void {
  if (state.holderId === playerId) {
    return;
  }
  const previousHolderId = state.holderId;
  state.holderId = playerId;
  undoStack.push({
    undo(): void {
      state.holderId = previousHolderId;
    },
  });
}
