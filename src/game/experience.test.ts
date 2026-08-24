import { describe, expect, it } from 'vitest';
import { applyExperienceDelta, createExperienceState, type ExperienceState } from './experience';
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

describe('createExperienceState', () => {
  it('zeroes experience counters for every player', () => {
    const state = createExperienceState(['p1', 'p2', 'p3']);
    expect(state).toEqual({ p1: 0, p2: 0, p3: 0 });
  });
});

describe('applyExperienceDelta', () => {
  it('increases a player experience counter', () => {
    const state: ExperienceState = createExperienceState(['p1', 'p2']);
    const undoStack = new FakeUndoStack();

    applyExperienceDelta(state, 'p1', 3, undoStack);

    expect(state.p1).toBe(3);
    expect(state.p2).toBe(0);
  });

  it('decreases a player experience counter', () => {
    const state: ExperienceState = createExperienceState(['p1']);
    const undoStack = new FakeUndoStack();

    applyExperienceDelta(state, 'p1', 5, undoStack);
    applyExperienceDelta(state, 'p1', -2, undoStack);

    expect(state.p1).toBe(3);
  });

  it('clamps at zero and pushes no undo action when nothing changed', () => {
    const state: ExperienceState = createExperienceState(['p1']);
    const undoStack = new FakeUndoStack();

    applyExperienceDelta(state, 'p1', -1, undoStack);

    expect(state.p1).toBe(0);
    expect(undoStack.actions).toHaveLength(0);
  });

  it('pushes an undo action that reverts the experience counter', () => {
    const state: ExperienceState = createExperienceState(['p1']);
    const undoStack = new FakeUndoStack();

    applyExperienceDelta(state, 'p1', 4, undoStack);
    expect(undoStack.actions).toHaveLength(1);

    undoStack.undoLast();

    expect(state.p1).toBe(0);
  });

  it('reverts a decrease back to the prior experience value', () => {
    const state: ExperienceState = createExperienceState(['p1']);
    const undoStack = new FakeUndoStack();

    applyExperienceDelta(state, 'p1', 6, undoStack);
    applyExperienceDelta(state, 'p1', -2, undoStack);
    expect(state.p1).toBe(4);

    undoStack.undoLast();

    expect(state.p1).toBe(6);
  });
});
