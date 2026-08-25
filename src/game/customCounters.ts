// Custom free-form counters (issue #171): player-named counters for effects
// the built-in life/poison/energy/experience types don't cover (e.g. "Storm
// Count", "Treasure", "Saga chapter"). Unlike poison/energy/experience,
// values are NOT clamped at zero — there's no universal floor for an
// arbitrary named counter. Each player can have any number of these, added
// and removed at runtime, unlike the fixed always-present counter types.
// Free of DOM globals so it stays unit-testable.

import type { UndoStack } from './commanderDamage';

export interface CustomCounter {
  id: string;
  name: string;
  value: number;
}

/** state[playerId] = that player's custom counters, in the order they were added. */
export type CustomCountersState = Record<string, CustomCounter[]>;

export function createCustomCountersState(playerIds: string[]): CustomCountersState {
  const state: CustomCountersState = {};
  for (const id of playerIds) {
    state[id] = [];
  }
  return state;
}

let nextCounterId = 1;

/**
 * Adds a new counter named `name`, starting at 0, to `playerId`'s list.
 * Pushes an undo action that removes it again.
 */
export function addCustomCounter(state: CustomCountersState, playerId: string, name: string, undoStack: UndoStack): CustomCounter {
  const counter: CustomCounter = { id: `custom-${nextCounterId}`, name, value: 0 };
  nextCounterId += 1;
  const counters = state[playerId] ?? (state[playerId] = []);
  counters.push(counter);
  undoStack.push({
    undo(): void {
      const index = counters.indexOf(counter);
      if (index !== -1) {
        counters.splice(index, 1);
      }
    },
  });
  return counter;
}

/**
 * Adjusts `counterId`'s value by `delta`, with no clamping — unlike poison/
 * energy/experience, a custom counter has no built-in floor or ceiling.
 * Pushes an undo action that reverts it. No-op if the counter no longer
 * exists (e.g. it was removed by another action first).
 */
export function applyCustomCounterDelta(
  state: CustomCountersState,
  playerId: string,
  counterId: string,
  delta: number,
  undoStack: UndoStack,
): void {
  if (delta === 0) {
    return;
  }
  const counter = state[playerId]?.find((entry) => entry.id === counterId);
  if (!counter) {
    return;
  }
  const before = counter.value;
  counter.value = before + delta;
  undoStack.push({
    undo(): void {
      counter.value = before;
    },
  });
}

/**
 * Removes `counterId` from `playerId`'s list. Pushes an undo action that
 * reinserts it at its prior index with its prior value, so removal is
 * itself undoable. No-op if the counter no longer exists.
 */
export function removeCustomCounter(state: CustomCountersState, playerId: string, counterId: string, undoStack: UndoStack): void {
  const counters = state[playerId];
  if (!counters) {
    return;
  }
  const index = counters.findIndex((entry) => entry.id === counterId);
  if (index === -1) {
    return;
  }
  const [removed] = counters.splice(index, 1);
  undoStack.push({
    undo(): void {
      counters.splice(index, 0, removed);
    },
  });
}
