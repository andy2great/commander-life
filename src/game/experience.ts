// Experience counter tracking, per player (issue #161). A separate counter
// from life, commander damage, poison, and energy — Playgroup-style trackers
// support it for Commander decks built around cards like The Ozolith or
// backgrounds. Modeled on src/game/poison.ts (via src/game/energy.ts). Free
// of DOM globals so it stays unit-testable.

import type { UndoStack } from './commanderDamage';

/** state[playerId] = experience counters that player has accumulated. */
export type ExperienceState = Record<string, number>;

export function createExperienceState(playerIds: string[]): ExperienceState {
  const state: ExperienceState = {};
  for (const id of playerIds) {
    state[id] = 0;
  }
  return state;
}

/**
 * Adjusts `playerId`'s experience counter by `delta`, clamped at zero.
 * Pushes an undo action that reverts it onto `undoStack`.
 */
export function applyExperienceDelta(
  state: ExperienceState,
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
