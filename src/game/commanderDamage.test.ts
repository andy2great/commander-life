import { describe, expect, it } from 'vitest';
import {
  applyCommanderDamageDelta,
  createCommanderDamageState,
  type Player,
  type UndoAction,
} from './commanderDamage';
import type { SoundEvent, SoundPlayer } from '../audio/soundPlayer';
import type { ScreenShakeTrigger } from './screenShake';
import type { ZoneEffectState } from './zoneEffect';

/** Records every sound-trigger call so tests can assert without a real AudioContext. */
class MockSoundPlayer implements SoundPlayer {
  readonly events: SoundEvent[] = [];
  play(event: SoundEvent): void {
    this.events.push(event);
  }
}

class MockShake implements ScreenShakeTrigger {
  readonly intensities: number[] = [];
  trigger(intensity: number): void {
    this.intensities.push(intensity);
  }
}

function makePlayers(): Player[] {
  return [
    { id: 'p1', name: 'Alara', life: 40 },
    { id: 'p2', name: 'Kess', life: 40 },
    { id: 'p3', name: 'Yorion', life: 40 },
  ];
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

describe('createCommanderDamageState', () => {
  it('zeroes commander damage between every pair of players, excluding self', () => {
    const state = createCommanderDamageState(['p1', 'p2', 'p3']);
    expect(state).toEqual({
      p1: { p2: 0, p3: 0 },
      p2: { p1: 0, p3: 0 },
      p3: { p1: 0, p2: 0 },
    });
  });
});

describe('applyCommanderDamageDelta', () => {
  it('increases commander damage and reduces the target life by the same amount', () => {
    const players = makePlayers();
    const state = createCommanderDamageState(players.map((p) => p.id));
    const undoStack = new FakeUndoStack();

    applyCommanderDamageDelta(state, players, 'p1', 'p2', 3, undoStack);

    expect(state.p1.p2).toBe(3);
    expect(players[0].life).toBe(37);
  });

  it('tracks damage from each opponent independently', () => {
    const players = makePlayers();
    const state = createCommanderDamageState(players.map((p) => p.id));
    const undoStack = new FakeUndoStack();

    applyCommanderDamageDelta(state, players, 'p1', 'p2', 5, undoStack);
    applyCommanderDamageDelta(state, players, 'p1', 'p3', 2, undoStack);

    expect(state.p1.p2).toBe(5);
    expect(state.p1.p3).toBe(2);
    expect(players[0].life).toBe(33);
  });

  it('clamps commander damage at zero and only applies the clamped life delta', () => {
    const players = makePlayers();
    const state = createCommanderDamageState(players.map((p) => p.id));
    const undoStack = new FakeUndoStack();

    applyCommanderDamageDelta(state, players, 'p1', 'p2', -1, undoStack);

    expect(state.p1.p2).toBe(0);
    expect(players[0].life).toBe(40);
    expect(undoStack.actions).toHaveLength(0);
  });

  it('ignores self-targeted damage', () => {
    const players = makePlayers();
    const state = createCommanderDamageState(players.map((p) => p.id));
    const undoStack = new FakeUndoStack();

    applyCommanderDamageDelta(state, players, 'p1', 'p1', 3, undoStack);

    expect(state.p1.p1).toBeUndefined();
    expect(players[0].life).toBe(40);
    expect(undoStack.actions).toHaveLength(0);
  });

  it('pushes an undo action that reverts both the damage counter and the life total', () => {
    const players = makePlayers();
    const state = createCommanderDamageState(players.map((p) => p.id));
    const undoStack = new FakeUndoStack();

    applyCommanderDamageDelta(state, players, 'p1', 'p2', 4, undoStack);
    expect(undoStack.actions).toHaveLength(1);

    undoStack.undoLast();

    expect(state.p1.p2).toBe(0);
    expect(players[0].life).toBe(40);
  });

  it('reverts a decrease back to the prior damage and life values', () => {
    const players = makePlayers();
    const state = createCommanderDamageState(players.map((p) => p.id));
    const undoStack = new FakeUndoStack();

    applyCommanderDamageDelta(state, players, 'p1', 'p2', 6, undoStack);
    applyCommanderDamageDelta(state, players, 'p1', 'p2', -2, undoStack);
    expect(state.p1.p2).toBe(4);
    expect(players[0].life).toBe(36);

    undoStack.undoLast();

    expect(state.p1.p2).toBe(6);
    expect(players[0].life).toBe(34);
  });

  it('plays commanderDamageUp when damage increases and commanderDamageDown when it decreases', () => {
    const players = makePlayers();
    const state = createCommanderDamageState(players.map((p) => p.id));
    const undoStack = new FakeUndoStack();
    const sound = new MockSoundPlayer();

    applyCommanderDamageDelta(state, players, 'p1', 'p2', 3, undoStack, sound);
    expect(sound.events).toEqual(['commanderDamageUp']);

    applyCommanderDamageDelta(state, players, 'p1', 'p2', -1, undoStack, sound);
    expect(sound.events).toEqual(['commanderDamageUp', 'commanderDamageDown']);
  });

  it('does not play a sound when a clamped decrease applies no actual change', () => {
    const players = makePlayers();
    const state = createCommanderDamageState(players.map((p) => p.id));
    const undoStack = new FakeUndoStack();
    const sound = new MockSoundPlayer();

    applyCommanderDamageDelta(state, players, 'p1', 'p2', -1, undoStack, sound);

    expect(sound.events).toEqual([]);
  });

  it('does not require a sound player: omitting it never throws', () => {
    const players = makePlayers();
    const state = createCommanderDamageState(players.map((p) => p.id));
    const undoStack = new FakeUndoStack();

    expect(() => applyCommanderDamageDelta(state, players, 'p1', 'p2', 3, undoStack)).not.toThrow();
  });

  it('triggers screen-shake when the clamped change is an increase', () => {
    const players = makePlayers();
    const state = createCommanderDamageState(players.map((p) => p.id));
    const undoStack = new FakeUndoStack();
    const shake = new MockShake();

    applyCommanderDamageDelta(state, players, 'p1', 'p2', 3, undoStack, undefined, shake);

    expect(shake.intensities).toHaveLength(1);
  });

  it('does not trigger screen-shake for a decrease', () => {
    const players = makePlayers();
    const state = createCommanderDamageState(players.map((p) => p.id));
    const undoStack = new FakeUndoStack();
    const shake = new MockShake();

    applyCommanderDamageDelta(state, players, 'p1', 'p2', 5, undoStack);
    applyCommanderDamageDelta(state, players, 'p1', 'p2', -2, undoStack, undefined, shake);

    expect(shake.intensities).toHaveLength(0);
  });

  it('does not trigger screen-shake when a clamped decrease applies no actual change', () => {
    const players = makePlayers();
    const state = createCommanderDamageState(players.map((p) => p.id));
    const undoStack = new FakeUndoStack();
    const shake = new MockShake();

    applyCommanderDamageDelta(state, players, 'p1', 'p2', -1, undoStack, undefined, shake);

    expect(shake.intensities).toHaveLength(0);
  });

  it('triggers a commander zone effect on the target when effects state is given', () => {
    const players = makePlayers();
    const state = createCommanderDamageState(players.map((p) => p.id));
    const undoStack = new FakeUndoStack();
    const effects: ZoneEffectState = {};

    applyCommanderDamageDelta(state, players, 'p1', 'p2', 3, undoStack, undefined, undefined, effects);

    expect(effects.p1).toEqual({ type: 'commander', elapsed: 0 });
    expect(effects.p2).toBeUndefined();
  });
});
