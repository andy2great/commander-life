import { describe, expect, it } from 'vitest';
import { assignMonarch, createMonarchState, type MonarchState } from './monarch';
import type { UndoAction } from './commanderDamage';

class FakeUndoStack {
  actions: UndoAction[] = [];
  push(action: UndoAction): void {
    this.actions.push(action);
  }
  undoLast(): void {
    this.actions.pop()?.undo();
  }
}

describe('createMonarchState', () => {
  it('holds no player by default', () => {
    expect(createMonarchState()).toEqual({ holderId: null });
  });
});

describe('assignMonarch', () => {
  it('assigns the Monarch to a player', () => {
    const state: MonarchState = createMonarchState();
    const undoStack = new FakeUndoStack();

    assignMonarch(state, 'p1', undoStack);

    expect(state.holderId).toBe('p1');
  });

  it('reassigns the Monarch, removing it from the previous holder', () => {
    const state: MonarchState = createMonarchState();
    const undoStack = new FakeUndoStack();

    assignMonarch(state, 'p1', undoStack);
    assignMonarch(state, 'p2', undoStack);

    expect(state.holderId).toBe('p2');
  });

  it('is a no-op, pushing no undo action, when the player already holds the Monarch', () => {
    const state: MonarchState = createMonarchState();
    const undoStack = new FakeUndoStack();

    assignMonarch(state, 'p1', undoStack);
    assignMonarch(state, 'p1', undoStack);

    expect(state.holderId).toBe('p1');
    expect(undoStack.actions).toHaveLength(1);
  });

  it('pushes an undo action that reverts an assignment back to no holder', () => {
    const state: MonarchState = createMonarchState();
    const undoStack = new FakeUndoStack();

    assignMonarch(state, 'p1', undoStack);
    undoStack.undoLast();

    expect(state.holderId).toBeNull();
  });

  it('pushes an undo action that reverts a reassignment back to the previous holder', () => {
    const state: MonarchState = createMonarchState();
    const undoStack = new FakeUndoStack();

    assignMonarch(state, 'p1', undoStack);
    assignMonarch(state, 'p2', undoStack);
    undoStack.undoLast();

    expect(state.holderId).toBe('p1');
  });
});
