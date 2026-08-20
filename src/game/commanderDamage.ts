// Commander-damage sync logic. Keeps per-opponent commander-damage counters and
// each player's total life in sync, and records a matching undo action on the
// shared undo stack. Free of DOM globals so it stays unit-testable.

export interface Player {
  id: string;
  name: string;
  life: number;
}

/** state[targetId][fromOpponentId] = commander damage targetId has taken from fromOpponentId. */
export type CommanderDamageState = Record<string, Record<string, number>>;

export interface UndoAction {
  undo(): void;
}

export interface UndoStack {
  push(action: UndoAction): void;
}

export function createCommanderDamageState(playerIds: string[]): CommanderDamageState {
  const state: CommanderDamageState = {};
  for (const id of playerIds) {
    state[id] = {};
    for (const otherId of playerIds) {
      if (otherId !== id) {
        state[id][otherId] = 0;
      }
    }
  }
  return state;
}

/**
 * Adjusts the commander damage `targetId` has taken from `fromId` by `delta`
 * (clamped at zero) and applies the same delta to `targetId`'s life, since
 * commander damage is also regular damage. Pushes an undo action that
 * reverts both changes onto `undoStack`.
 */
export function applyCommanderDamageDelta(
  state: CommanderDamageState,
  players: Player[],
  targetId: string,
  fromId: string,
  delta: number,
  undoStack: UndoStack,
): void {
  if (targetId === fromId || delta === 0) {
    return;
  }
  const target = players.find((player) => player.id === targetId);
  if (!target) {
    return;
  }

  const targetDamage = state[targetId] ?? (state[targetId] = {});
  const before = targetDamage[fromId] ?? 0;
  const after = Math.max(0, before + delta);
  const applied = after - before;
  if (applied === 0) {
    return;
  }

  targetDamage[fromId] = after;
  target.life -= applied;

  undoStack.push({
    undo(): void {
      targetDamage[fromId] = before;
      target.life += applied;
    },
  });
}
