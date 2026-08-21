import { describe, expect, it } from 'vitest';
import {
  applyCommanderDamageDelta,
  createCommanderDamageState,
  type Player,
  type UndoAction,
} from './commanderDamage';
import type { SoundEvent, SoundPlayer } from '../audio/soundPlayer';
import type { ScreenShakeTrigger } from './screenShake';
import { DAMAGE_EFFECT_COLOR, type ZoneEffectTrigger, type ZoneEffectType } from './zoneEffect';
import { createStatsState, createStatsTrigger } from './stats';

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

class MockZoneEffects implements ZoneEffectTrigger {
  readonly calls: Array<{ playerId: string; type: ZoneEffectType; color: string }> = [];
  trigger(playerId: string, type: ZoneEffectType, color: string): void {
    this.calls.push({ playerId, type, color });
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

  it('triggers a zone effect on the target, colored with the attacking commander\'s own accent color (issue #89)', () => {
    const players = makePlayers();
    players[1].color = '#8b5cf6';
    const state = createCommanderDamageState(players.map((p) => p.id));
    const undoStack = new FakeUndoStack();
    const zoneEffects = new MockZoneEffects();

    applyCommanderDamageDelta(state, players, 'p1', 'p2', 3, undoStack, undefined, undefined, zoneEffects);

    expect(zoneEffects.calls).toEqual([{ playerId: 'p1', type: 'commanderDamage', color: '#8b5cf6' }]);
  });

  it('falls back to the plain damage color when the attacker has no accent color set', () => {
    const players = makePlayers();
    const state = createCommanderDamageState(players.map((p) => p.id));
    const undoStack = new FakeUndoStack();
    const zoneEffects = new MockZoneEffects();

    applyCommanderDamageDelta(state, players, 'p1', 'p2', 3, undoStack, undefined, undefined, zoneEffects);

    expect(zoneEffects.calls).toEqual([{ playerId: 'p1', type: 'commanderDamage', color: DAMAGE_EFFECT_COLOR }]);
  });

  it('does not trigger a zone effect for a decrease', () => {
    const players = makePlayers();
    const state = createCommanderDamageState(players.map((p) => p.id));
    const undoStack = new FakeUndoStack();
    const zoneEffects = new MockZoneEffects();

    applyCommanderDamageDelta(state, players, 'p1', 'p2', 5, undoStack);
    applyCommanderDamageDelta(state, players, 'p1', 'p2', -2, undoStack, undefined, undefined, zoneEffects);

    expect(zoneEffects.calls).toHaveLength(0);
  });

  it('records commander damage dealt/received and a biggest-hit candidate with the target set, for an increase (issue #98)', () => {
    const players = makePlayers();
    const state = createCommanderDamageState(players.map((p) => p.id));
    const undoStack = new FakeUndoStack();
    const statsState = createStatsState(players.map((p) => p.id));
    const stats = createStatsTrigger(statsState);

    applyCommanderDamageDelta(state, players, 'p1', 'p2', 5, undoStack, undefined, undefined, undefined, stats);

    expect(statsState.commanderDamageDealt.p2).toBe(5);
    expect(statsState.commanderDamageReceived.p1).toBe(5);
    expect(statsState.biggestHit).toEqual({ attackerId: 'p2', amount: 5, targetId: 'p1' });
  });

  it('does not record stats when a clamped decrease applies no actual change', () => {
    const players = makePlayers();
    const state = createCommanderDamageState(players.map((p) => p.id));
    const undoStack = new FakeUndoStack();
    const statsState = createStatsState(players.map((p) => p.id));
    const stats = createStatsTrigger(statsState);

    applyCommanderDamageDelta(state, players, 'p1', 'p2', -1, undoStack, undefined, undefined, undefined, stats);

    expect(statsState.commanderDamageDealt.p2).toBe(0);
    expect(statsState.commanderDamageReceived.p1).toBe(0);
    expect(statsState.biggestHit).toBeNull();
  });
});
