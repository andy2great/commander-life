import { describe, expect, it } from 'vitest';
import { applyPoisonDelta, createPoisonState, type PoisonState } from './poison';
import type { UndoAction } from './commanderDamage';
import type { ScreenShakeTrigger } from './screenShake';
import { POISON_EFFECT_COLOR, type ZoneEffectTrigger, type ZoneEffectType } from './zoneEffect';

class MockShake implements ScreenShakeTrigger {
  readonly intensities: number[] = [];
  trigger(intensity: number): void {
    this.intensities.push(intensity);
  }
}

class MockZoneEffects implements ZoneEffectTrigger {
  readonly calls: Array<{ playerId: string; type: ZoneEffectType; color: string; delta: number }> = [];
  trigger(playerId: string, type: ZoneEffectType, color: string, delta: number): void {
    this.calls.push({ playerId, type, color, delta });
  }
}

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

  it('triggers screen-shake for a poison increase', () => {
    const state: PoisonState = createPoisonState(['p1']);
    const undoStack = new FakeUndoStack();
    const shake = new MockShake();

    applyPoisonDelta(state, 'p1', 2, undoStack, shake);

    expect(shake.intensities).toHaveLength(1);
  });

  it('does not trigger screen-shake for a decrease', () => {
    const state: PoisonState = createPoisonState(['p1']);
    const undoStack = new FakeUndoStack();
    const shake = new MockShake();

    applyPoisonDelta(state, 'p1', 5, undoStack);
    applyPoisonDelta(state, 'p1', -2, undoStack, shake);

    expect(shake.intensities).toHaveLength(0);
  });

  it('does not trigger screen-shake when a clamped decrease applies no actual change', () => {
    const state: PoisonState = createPoisonState(['p1']);
    const undoStack = new FakeUndoStack();
    const shake = new MockShake();

    applyPoisonDelta(state, 'p1', -1, undoStack, shake);

    expect(shake.intensities).toHaveLength(0);
  });

  it('triggers a zone effect on the player for a poison increase (issue #89)', () => {
    const state: PoisonState = createPoisonState(['p1']);
    const undoStack = new FakeUndoStack();
    const zoneEffects = new MockZoneEffects();

    applyPoisonDelta(state, 'p1', 2, undoStack, undefined, zoneEffects);

    expect(zoneEffects.calls).toEqual([{ playerId: 'p1', type: 'poison', color: POISON_EFFECT_COLOR, delta: 2 }]);
  });

  it('does not trigger a zone effect for a decrease', () => {
    const state: PoisonState = createPoisonState(['p1']);
    const undoStack = new FakeUndoStack();
    const zoneEffects = new MockZoneEffects();

    applyPoisonDelta(state, 'p1', 5, undoStack);
    applyPoisonDelta(state, 'p1', -2, undoStack, undefined, zoneEffects);

    expect(zoneEffects.calls).toHaveLength(0);
  });
});
