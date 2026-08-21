import { describe, expect, it } from 'vitest';
import { applyDamageDelta, applyHealDelta, applyLifelinkDelta } from './life';
import type { Player, UndoAction } from './commanderDamage';
import type { SoundEvent, SoundPlayer } from '../audio/soundPlayer';
import type { ScreenShakeTrigger } from './screenShake';
import type { ZoneEffectState } from './zoneEffect';

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

  it('triggers a damage zone effect on the target when effects state is given', () => {
    const [, target] = makePlayers();
    const undoStack = new FakeUndoStack();
    const effects: ZoneEffectState = {};

    applyDamageDelta(target, 3, undoStack, undefined, undefined, effects);

    expect(effects[target.id]).toEqual({ type: 'damage', elapsed: 0 });
  });

  it('does not require an effects state: omitting it never throws', () => {
    const [, target] = makePlayers();
    const undoStack = new FakeUndoStack();

    expect(() => applyDamageDelta(target, 3, undoStack)).not.toThrow();
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

  it('triggers a heal zone effect on the target when effects state is given', () => {
    const [, target] = makePlayers();
    const undoStack = new FakeUndoStack();
    const effects: ZoneEffectState = {};

    applyHealDelta(target, 3, undoStack, undefined, effects);

    expect(effects[target.id]).toEqual({ type: 'heal', elapsed: 0 });
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

  it('triggers a lifelink zone effect on both the attacker and target zones', () => {
    const [attacker, target] = makePlayers();
    const undoStack = new FakeUndoStack();
    const effects: ZoneEffectState = {};

    applyLifelinkDelta(attacker, target, 3, undoStack, undefined, undefined, effects);

    expect(effects[target.id]).toEqual({ type: 'lifelink', elapsed: 0 });
    expect(effects[attacker.id]).toEqual({ type: 'lifelink', elapsed: 0 });
  });
});
