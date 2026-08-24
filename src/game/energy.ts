// Energy counter tracking, per player (issue #160). A separate counter from
// life, commander damage, and poison — Playgroup-style trackers support it
// for Aether Revolt/Kaladesh-block Commander decks. Modeled on
// src/game/poison.ts. Free of DOM globals so it stays unit-testable.

import type { UndoStack } from './commanderDamage';

/** state[playerId] = energy counters that player has accumulated. */
export type EnergyState = Record<string, number>;

export function createEnergyState(playerIds: string[]): EnergyState {
  const state: EnergyState = {};
  for (const id of playerIds) {
    state[id] = 0;
  }
  return state;
}

/**
 * Adjusts `playerId`'s energy counter by `delta`, clamped at zero. Pushes an
 * undo action that reverts it onto `undoStack`.
 */
export function applyEnergyDelta(state: EnergyState, playerId: string, delta: number, undoStack: UndoStack): void {
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
