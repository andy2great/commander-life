import { describe, expect, it } from 'vitest';
import {
  addCustomCounter,
  applyCustomCounterDelta,
  createCustomCountersState,
  removeCustomCounter,
  type CustomCountersState,
} from './customCounters';
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

describe('createCustomCountersState', () => {
  it('starts every player with an empty list of custom counters', () => {
    const state = createCustomCountersState(['p1', 'p2']);
    expect(state).toEqual({ p1: [], p2: [] });
  });
});

describe('addCustomCounter', () => {
  it('adds a new counter starting at 0, per player', () => {
    const state: CustomCountersState = createCustomCountersState(['p1', 'p2']);
    const undoStack = new FakeUndoStack();

    const counter = addCustomCounter(state, 'p1', 'Storm Count', undoStack);

    expect(counter.name).toBe('Storm Count');
    expect(counter.value).toBe(0);
    expect(state.p1).toEqual([counter]);
    expect(state.p2).toEqual([]);
  });

  it('supports multiple custom counters for the same player', () => {
    const state: CustomCountersState = createCustomCountersState(['p1']);
    const undoStack = new FakeUndoStack();

    addCustomCounter(state, 'p1', 'Storm Count', undoStack);
    addCustomCounter(state, 'p1', 'Treasure', undoStack);

    expect(state.p1.map((counter) => counter.name)).toEqual(['Storm Count', 'Treasure']);
  });

  it('pushes an undo action that removes the added counter', () => {
    const state: CustomCountersState = createCustomCountersState(['p1']);
    const undoStack = new FakeUndoStack();

    addCustomCounter(state, 'p1', 'Storm Count', undoStack);
    expect(undoStack.actions).toHaveLength(1);
    expect(state.p1).toHaveLength(1);

    undoStack.undoLast();

    expect(state.p1).toHaveLength(0);
  });
});

describe('applyCustomCounterDelta', () => {
  it('increases a custom counter', () => {
    const state: CustomCountersState = createCustomCountersState(['p1']);
    const undoStack = new FakeUndoStack();
    const counter = addCustomCounter(state, 'p1', 'Storm Count', undoStack);

    applyCustomCounterDelta(state, 'p1', counter.id, 3, undoStack);

    expect(counter.value).toBe(3);
  });

  it('decreases a custom counter', () => {
    const state: CustomCountersState = createCustomCountersState(['p1']);
    const undoStack = new FakeUndoStack();
    const counter = addCustomCounter(state, 'p1', 'Storm Count', undoStack);

    applyCustomCounterDelta(state, 'p1', counter.id, 5, undoStack);
    applyCustomCounterDelta(state, 'p1', counter.id, -2, undoStack);

    expect(counter.value).toBe(3);
  });

  it('has no artificial bound: a decrease can take the value below zero', () => {
    const state: CustomCountersState = createCustomCountersState(['p1']);
    const undoStack = new FakeUndoStack();
    const counter = addCustomCounter(state, 'p1', 'Storm Count', undoStack);

    applyCustomCounterDelta(state, 'p1', counter.id, -4, undoStack);

    expect(counter.value).toBe(-4);
  });

  it('is a no-op for a counter id that no longer exists', () => {
    const state: CustomCountersState = createCustomCountersState(['p1']);
    const undoStack = new FakeUndoStack();

    applyCustomCounterDelta(state, 'p1', 'missing-id', 1, undoStack);

    expect(undoStack.actions).toHaveLength(0);
  });

  it('pushes an undo action that reverts the value', () => {
    const state: CustomCountersState = createCustomCountersState(['p1']);
    const undoStack = new FakeUndoStack();
    const counter = addCustomCounter(state, 'p1', 'Storm Count', undoStack);
    undoStack.actions = [];

    applyCustomCounterDelta(state, 'p1', counter.id, 4, undoStack);
    expect(undoStack.actions).toHaveLength(1);

    undoStack.undoLast();

    expect(counter.value).toBe(0);
  });

  it('reverts a below-zero decrease back to the prior value', () => {
    const state: CustomCountersState = createCustomCountersState(['p1']);
    const undoStack = new FakeUndoStack();
    const counter = addCustomCounter(state, 'p1', 'Storm Count', undoStack);

    applyCustomCounterDelta(state, 'p1', counter.id, -6, undoStack);
    undoStack.undoLast();

    expect(counter.value).toBe(0);
  });
});

describe('removeCustomCounter', () => {
  it('removes the counter from the player list', () => {
    const state: CustomCountersState = createCustomCountersState(['p1']);
    const undoStack = new FakeUndoStack();
    const counter = addCustomCounter(state, 'p1', 'Storm Count', undoStack);

    removeCustomCounter(state, 'p1', counter.id, undoStack);

    expect(state.p1).toHaveLength(0);
  });

  it('is a no-op for a counter id that no longer exists', () => {
    const state: CustomCountersState = createCustomCountersState(['p1']);
    const undoStack = new FakeUndoStack();

    removeCustomCounter(state, 'p1', 'missing-id', undoStack);

    expect(undoStack.actions).toHaveLength(0);
  });

  it('pushes an undo action that reinserts the counter at its prior index with its prior value', () => {
    const state: CustomCountersState = createCustomCountersState(['p1']);
    const undoStack = new FakeUndoStack();
    const first = addCustomCounter(state, 'p1', 'Storm Count', undoStack);
    const second = addCustomCounter(state, 'p1', 'Treasure', undoStack);
    applyCustomCounterDelta(state, 'p1', first.id, 3, undoStack);
    undoStack.actions = [];

    removeCustomCounter(state, 'p1', first.id, undoStack);
    expect(state.p1).toEqual([second]);
    expect(undoStack.actions).toHaveLength(1);

    undoStack.undoLast();

    expect(state.p1).toEqual([first, second]);
    expect(state.p1[0].value).toBe(3);
  });
});
