import { describe, expect, it } from 'vitest';
import { assignRingBearer, createRingBearerState, type RingBearerState } from './ringBearer';
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

describe('createRingBearerState', () => {
  it('starts with no holder', () => {
    expect(createRingBearerState()).toEqual({ holderId: null });
  });
});

describe('assignRingBearer', () => {
  it('assigns the badge to a player', () => {
    const state: RingBearerState = createRingBearerState();
    const undoStack = new FakeUndoStack();

    assignRingBearer(state, 'p1', undoStack);

    expect(state.holderId).toBe('p1');
  });

  it('reassigns the badge to a different player, removing it from the previous holder', () => {
    const state: RingBearerState = createRingBearerState();
    const undoStack = new FakeUndoStack();

    assignRingBearer(state, 'p1', undoStack);
    assignRingBearer(state, 'p2', undoStack);

    expect(state.holderId).toBe('p2');
  });

  it('is a no-op when the current holder is reassigned to themselves', () => {
    const state: RingBearerState = createRingBearerState();
    const undoStack = new FakeUndoStack();

    assignRingBearer(state, 'p1', undoStack);
    assignRingBearer(state, 'p1', undoStack);

    expect(state.holderId).toBe('p1');
    expect(undoStack.actions).toHaveLength(1);
  });

  it('pushes an undo action that restores the previous holder', () => {
    const state: RingBearerState = createRingBearerState();
    const undoStack = new FakeUndoStack();

    assignRingBearer(state, 'p1', undoStack);
    assignRingBearer(state, 'p2', undoStack);
    undoStack.undoLast();

    expect(state.holderId).toBe('p1');
  });

  it('pushes an undo action that restores no holder when assigned for the first time', () => {
    const state: RingBearerState = createRingBearerState();
    const undoStack = new FakeUndoStack();

    assignRingBearer(state, 'p1', undoStack);
    undoStack.undoLast();

    expect(state.holderId).toBeNull();
  });

  it('undoing twice restores the holder from two reassignments ago', () => {
    const state: RingBearerState = createRingBearerState();
    const undoStack = new FakeUndoStack();

    assignRingBearer(state, 'p1', undoStack);
    assignRingBearer(state, 'p2', undoStack);
    assignRingBearer(state, 'p3', undoStack);
    undoStack.undoLast();
    undoStack.undoLast();

    expect(state.holderId).toBe('p1');
  });
});
