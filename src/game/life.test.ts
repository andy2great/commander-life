import { describe, expect, it } from 'vitest';
import { applyDamageDelta, applyHealDelta, applyLifelinkDelta } from './life';
import type { Player, UndoAction } from './commanderDamage';
import type { SoundEvent, SoundPlayer } from '../audio/soundPlayer';
import type { ScreenShakeTrigger } from './screenShake';
import { DAMAGE_EFFECT_COLOR, HEAL_EFFECT_COLOR, type ZoneEffectTrigger, type ZoneEffectType } from './zoneEffect';
import { createStatsState, createStatsTrigger } from './stats';

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

function makePlayers(): Player[] {
  return [
    { id: 'p1', name: 'Alara', life: 40 },
    { id: 'p2', name: 'Kess', life: 40 },
  ];
}

describe('applyDamageDelta', () => {
  it('decreases the target life without any commander-damage state', () => {
    const [, target] = makePlayers();
    const undoStack = new FakeUndoStack();

    applyDamageDelta(target, 5, undoStack);

    expect(target.life).toBe(35);
  });

  it('pushes an undo action that restores the target life', () => {
    const [, target] = makePlayers();
    const undoStack = new FakeUndoStack();

    applyDamageDelta(target, 7, undoStack);
    expect(undoStack.actions).toHaveLength(1);

    undoStack.undoLast();

    expect(target.life).toBe(40);
  });

  it('plays lifeDown for positive delta and lifeUp for negative delta', () => {
    const [, target] = makePlayers();
    const undoStack = new FakeUndoStack();
    const sound = new MockSoundPlayer();

    applyDamageDelta(target, 3, undoStack, sound);
    applyDamageDelta(target, -1, undoStack, sound);

    expect(sound.events).toEqual(['lifeDown', 'lifeUp']);
  });

  it('is a no-op for a zero delta', () => {
    const [, target] = makePlayers();
    const undoStack = new FakeUndoStack();

    applyDamageDelta(target, 0, undoStack);

    expect(target.life).toBe(40);
    expect(undoStack.actions).toHaveLength(0);
  });

  it('triggers screen-shake for a positive (damage) delta', () => {
    const [, target] = makePlayers();
    const undoStack = new FakeUndoStack();
    const shake = new MockShake();

    applyDamageDelta(target, 3, undoStack, undefined, shake);

    expect(shake.intensities).toHaveLength(1);
  });

  it('does not trigger screen-shake for a negative delta', () => {
    const [, target] = makePlayers();
    const undoStack = new FakeUndoStack();
    const shake = new MockShake();

    applyDamageDelta(target, -1, undoStack, undefined, shake);

    expect(shake.intensities).toHaveLength(0);
  });

  it('does not require a shake trigger: omitting it never throws', () => {
    const [, target] = makePlayers();
    const undoStack = new FakeUndoStack();

    expect(() => applyDamageDelta(target, 3, undoStack)).not.toThrow();
  });

  it('triggers a zone effect on the target for a positive (damage) delta (issue #89)', () => {
    const [, target] = makePlayers();
    const undoStack = new FakeUndoStack();
    const zoneEffects = new MockZoneEffects();

    applyDamageDelta(target, 3, undoStack, undefined, undefined, zoneEffects);

    expect(zoneEffects.calls).toEqual([{ playerId: target.id, type: 'damage', color: DAMAGE_EFFECT_COLOR, delta: -3 }]);
  });

  it('does not trigger a zone effect for a negative delta', () => {
    const [, target] = makePlayers();
    const undoStack = new FakeUndoStack();
    const zoneEffects = new MockZoneEffects();

    applyDamageDelta(target, -1, undoStack, undefined, undefined, zoneEffects);

    expect(zoneEffects.calls).toHaveLength(0);
  });

  it('records life lost on the target for a positive delta (issue #98)', () => {
    const [attacker, target] = makePlayers();
    const state = createStatsState([attacker.id, target.id]);
    const stats = createStatsTrigger(state);

    applyDamageDelta(target, 6, new FakeUndoStack(), undefined, undefined, undefined, attacker.id, stats);

    expect(state.lifeLost[target.id]).toBe(6);
  });

  it('records a biggest-hit candidate attributed to the given attacker id, with no target id (issue #98)', () => {
    const [attacker, target] = makePlayers();
    const state = createStatsState([attacker.id, target.id]);
    const stats = createStatsTrigger(state);

    applyDamageDelta(target, 6, new FakeUndoStack(), undefined, undefined, undefined, attacker.id, stats);

    expect(state.biggestHit).toEqual({ attackerId: attacker.id, amount: 6, targetId: null });
  });

  it('does not record a hit when no attacker id is given', () => {
    const [, target] = makePlayers();
    const state = createStatsState([target.id]);
    const stats = createStatsTrigger(state);

    applyDamageDelta(target, 6, new FakeUndoStack(), undefined, undefined, undefined, undefined, stats);

    expect(state.biggestHit).toBeNull();
    expect(state.lifeLost[target.id]).toBe(6);
  });

  it('does not record stats for a negative (correction) delta', () => {
    const [attacker, target] = makePlayers();
    const state = createStatsState([attacker.id, target.id]);
    const stats = createStatsTrigger(state);

    applyDamageDelta(target, -3, new FakeUndoStack(), undefined, undefined, undefined, attacker.id, stats);

    expect(state.lifeLost[target.id]).toBe(0);
    expect(state.biggestHit).toBeNull();
  });

  it('does not require a stats trigger: omitting it never throws', () => {
    const [, target] = makePlayers();

    expect(() => applyDamageDelta(target, 3, new FakeUndoStack())).not.toThrow();
  });
});

describe('applyHealDelta', () => {
  it('increases the target life', () => {
    const [, target] = makePlayers();
    target.life = 20;
    const undoStack = new FakeUndoStack();

    applyHealDelta(target, 6, undoStack);

    expect(target.life).toBe(26);
  });

  it('pushes an undo action that restores the target life', () => {
    const [, target] = makePlayers();
    const undoStack = new FakeUndoStack();

    applyHealDelta(target, 4, undoStack);
    expect(undoStack.actions).toHaveLength(1);

    undoStack.undoLast();

    expect(target.life).toBe(40);
  });

  it('plays lifeUp for positive delta', () => {
    const [, target] = makePlayers();
    const undoStack = new FakeUndoStack();
    const sound = new MockSoundPlayer();

    applyHealDelta(target, 2, undoStack, sound);

    expect(sound.events).toEqual(['lifeUp']);
  });

  it('is a no-op for a zero delta', () => {
    const [, target] = makePlayers();
    const undoStack = new FakeUndoStack();

    applyHealDelta(target, 0, undoStack);

    expect(target.life).toBe(40);
    expect(undoStack.actions).toHaveLength(0);
  });

  it('triggers a zone effect on the target for a positive (heal) delta (issue #89)', () => {
    const [, target] = makePlayers();
    const undoStack = new FakeUndoStack();
    const zoneEffects = new MockZoneEffects();

    applyHealDelta(target, 4, undoStack, undefined, zoneEffects);

    expect(zoneEffects.calls).toEqual([{ playerId: target.id, type: 'heal', color: HEAL_EFFECT_COLOR, delta: 4 }]);
  });

  it('does not trigger a zone effect for a negative delta', () => {
    const [, target] = makePlayers();
    const undoStack = new FakeUndoStack();
    const zoneEffects = new MockZoneEffects();

    applyHealDelta(target, -2, undoStack, undefined, zoneEffects);

    expect(zoneEffects.calls).toHaveLength(0);
  });

  it('records life gained on the target for a positive delta (issue #98)', () => {
    const [, target] = makePlayers();
    const state = createStatsState([target.id]);
    const stats = createStatsTrigger(state);

    applyHealDelta(target, 5, new FakeUndoStack(), undefined, undefined, stats);

    expect(state.lifeGained[target.id]).toBe(5);
  });

  it('does not record stats for a negative (correction) delta', () => {
    const [, target] = makePlayers();
    const state = createStatsState([target.id]);
    const stats = createStatsTrigger(state);

    applyHealDelta(target, -5, new FakeUndoStack(), undefined, undefined, stats);

    expect(state.lifeGained[target.id]).toBe(0);
  });
});

describe('applyLifelinkDelta', () => {
  it('decreases target life and increases attacker life by the same amount', () => {
    const [attacker, target] = makePlayers();
    const undoStack = new FakeUndoStack();

    applyLifelinkDelta(attacker, target, 5, undoStack);

    expect(target.life).toBe(35);
    expect(attacker.life).toBe(45);
  });

  it('reverts both life totals with a single undo', () => {
    const [attacker, target] = makePlayers();
    const undoStack = new FakeUndoStack();

    applyLifelinkDelta(attacker, target, 5, undoStack);
    expect(undoStack.actions).toHaveLength(1);

    undoStack.undoLast();

    expect(target.life).toBe(40);
    expect(attacker.life).toBe(40);
  });

  it('plays lifeDown for a positive delta', () => {
    const [attacker, target] = makePlayers();
    const undoStack = new FakeUndoStack();
    const sound = new MockSoundPlayer();

    applyLifelinkDelta(attacker, target, 3, undoStack, sound);

    expect(sound.events).toEqual(['lifeDown']);
  });

  it('ignores self-targeted lifelink and pushes no undo action', () => {
    const [attacker] = makePlayers();
    const undoStack = new FakeUndoStack();

    applyLifelinkDelta(attacker, attacker, 5, undoStack);

    expect(attacker.life).toBe(40);
    expect(undoStack.actions).toHaveLength(0);
  });

  it('is a no-op for a zero delta', () => {
    const [attacker, target] = makePlayers();
    const undoStack = new FakeUndoStack();

    applyLifelinkDelta(attacker, target, 0, undoStack);

    expect(target.life).toBe(40);
    expect(attacker.life).toBe(40);
    expect(undoStack.actions).toHaveLength(0);
  });

  it('triggers screen-shake for a positive (damage) delta', () => {
    const [attacker, target] = makePlayers();
    const undoStack = new FakeUndoStack();
    const shake = new MockShake();

    applyLifelinkDelta(attacker, target, 4, undoStack, undefined, shake);

    expect(shake.intensities).toHaveLength(1);
  });

  it('does not trigger screen-shake for a negative delta', () => {
    const [attacker, target] = makePlayers();
    const undoStack = new FakeUndoStack();
    const shake = new MockShake();

    applyLifelinkDelta(attacker, target, -2, undoStack, undefined, shake);

    expect(shake.intensities).toHaveLength(0);
  });

  it('triggers a damage zone effect on the target and a heal zone effect on the attacker for a positive delta (issue #89)', () => {
    const [attacker, target] = makePlayers();
    const undoStack = new FakeUndoStack();
    const zoneEffects = new MockZoneEffects();

    applyLifelinkDelta(attacker, target, 4, undoStack, undefined, undefined, zoneEffects);

    expect(zoneEffects.calls).toEqual([
      { playerId: target.id, type: 'damage', color: DAMAGE_EFFECT_COLOR, delta: -4 },
      { playerId: attacker.id, type: 'heal', color: HEAL_EFFECT_COLOR, delta: 4 },
    ]);
  });

  it('does not trigger a zone effect for a negative delta', () => {
    const [attacker, target] = makePlayers();
    const undoStack = new FakeUndoStack();
    const zoneEffects = new MockZoneEffects();

    applyLifelinkDelta(attacker, target, -2, undoStack, undefined, undefined, zoneEffects);

    expect(zoneEffects.calls).toHaveLength(0);
  });

  it('records life lost on the target, life gained on the attacker, and a biggest-hit candidate for a positive delta (issue #98)', () => {
    const [attacker, target] = makePlayers();
    const state = createStatsState([attacker.id, target.id]);
    const stats = createStatsTrigger(state);

    applyLifelinkDelta(attacker, target, 4, new FakeUndoStack(), undefined, undefined, undefined, stats);

    expect(state.lifeLost[target.id]).toBe(4);
    expect(state.lifeGained[attacker.id]).toBe(4);
    expect(state.biggestHit).toEqual({ attackerId: attacker.id, amount: 4, targetId: null });
  });

  it('does not record stats for a negative delta', () => {
    const [attacker, target] = makePlayers();
    const state = createStatsState([attacker.id, target.id]);
    const stats = createStatsTrigger(state);

    applyLifelinkDelta(attacker, target, -4, new FakeUndoStack(), undefined, undefined, undefined, stats);

    expect(state.lifeLost[target.id]).toBe(0);
    expect(state.lifeGained[attacker.id]).toBe(0);
    expect(state.biggestHit).toBeNull();
  });
});
