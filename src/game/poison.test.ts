import { describe, expect, it } from 'vitest';
import { applyPoisonDelta, createPoisonState, type PoisonState } from './poison';
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

describe('createPoisonState', () => {
  it('zeroes poison counters for every player', () => {
    const state = createPoisonState(['p1', 'p2', 'p3']);
    expect(state).toEqual({ p1: 0, p2: 0, p3: 0 });
  });
});

describe('applyPoisonDelta', () => {
  it('increases a player poison counter', () => {
    const state: PoisonState = createPoisonState(['p1', 'p2']);
    const undoStack = new FakeUndoStack();

    applyPoisonDelta(state, 'p1', 3, undoStack);

    expect(state.p1).toBe(3);
    expect(state.p2).toBe(0);
  });

  it('decreases a player poison counter', () => {
    const state: PoisonState = createPoisonState(['p1']);
    const undoStack = new FakeUndoStack();

    applyPoisonDelta(state, 'p1', 5, undoStack);
    applyPoisonDelta(state, 'p1', -2, undoStack);

    expect(state.p1).toBe(3);
  });

  it('clamps at zero and pushes no undo action when nothing changed', () => {
    const state: PoisonState = createPoisonState(['p1']);
    const undoStack = new FakeUndoStack();

    applyPoisonDelta(state, 'p1', -1, undoStack);

    expect(state.p1).toBe(0);
    expect(undoStack.actions).toHaveLength(0);
  });

  it('pushes an undo action that reverts the poison counter', () => {
    const state: PoisonState = createPoisonState(['p1']);
    const undoStack = new FakeUndoStack();

    applyPoisonDelta(state, 'p1', 4, undoStack);
    expect(undoStack.actions).toHaveLength(1);

    undoStack.undoLast();

    expect(state.p1).toBe(0);
  });

  it('reverts a decrease back to the prior poison value', () => {
    const state: PoisonState = createPoisonState(['p1']);
    const undoStack = new FakeUndoStack();

    applyPoisonDelta(state, 'p1', 6, undoStack);
    applyPoisonDelta(state, 'p1', -2, undoStack);
    expect(state.p1).toBe(4);

    undoStack.undoLast();

    expect(state.p1).toBe(6);
  });
});
