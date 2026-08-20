// Poison counter tracking, per player. A separate counter from life and
// commander damage (per docs/concept.md's EDH ruleset: 10 poison is lethal,
// independent of life total). Free of DOM globals so it stays unit-testable.

import type { UndoStack } from './commanderDamage';

/** state[playerId] = poison counters that player has accumulated. */
export type PoisonState = Record<string, number>;

/** A player reaching this many poison counters is eliminated, per docs/concept.md. */
export const POISON_LETHAL = 10;

export function createPoisonState(playerIds: string[]): PoisonState {
  const state: PoisonState = {};
  for (const id of playerIds) {
    state[id] = 0;
  }
  return state;
}

/**
 * Adjusts `playerId`'s poison counter by `delta`, clamped at zero. Pushes an
 * undo action that reverts it onto `undoStack`.
 */
export function applyPoisonDelta(
  state: PoisonState,
  playerId: string,
  delta: number,
  undoStack: UndoStack,
): void {
  if (delta === 0) {
    return;
  }
  const before = state[playerId] ?? 0;
  const after = Math.max(0, before + delta);
  const applied = after - before;
  if (applied === 0) {
    return;
  }

  state[playerId] = after;
  undoStack.push({
    undo(): void {
      state[playerId] = before;
    },
  });
}
