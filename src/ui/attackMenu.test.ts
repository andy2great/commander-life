import { describe, expect, it } from 'vitest';
import { buildDamageTypeDefs } from './attackMenu';
import { createCommanderDamageState, type Player, type UndoAction } from '../game/commanderDamage';
import { createPoisonState } from '../game/poison';
import type { ScreenShakeTrigger } from '../game/screenShake';

class MockShake implements ScreenShakeTrigger {
  readonly intensities: number[] = [];
  trigger(intensity: number): void {
    this.intensities.push(intensity);
  }
}

function makePlayers(): [Player, Player] {
  return [
    { id: 'a', name: 'Alara', life: 40, color: '#e5484d' },
    { id: 'b', name: 'Bruse', life: 40, color: '#12a594' },
  ];
}

function makeUndoStack(): { actions: UndoAction[]; push(action: UndoAction): void } {
  const actions: UndoAction[] = [];
  return {
    actions,
    push(action: UndoAction): void {
      actions.push(action);
    },
  };
}

describe('buildDamageTypeDefs', () => {
  it('includes all five types for an attacker->target pair, in order', () => {
    const [attacker, target] = makePlayers();
    const types = buildDamageTypeDefs(
      attacker,
      target,
      false,
      createCommanderDamageState(['a', 'b']),
      createPoisonState(['a', 'b']),
      [attacker, target],
      makeUndoStack(),
    );

    expect(types.map((type) => type.key)).toEqual(['damage', 'commander', 'lifelink', 'heal', 'poison']);
  });

  it('omits commander damage and lifelink for a self-target pair', () => {
    const [attacker] = makePlayers();
    const types = buildDamageTypeDefs(
      attacker,
      attacker,
      true,
      createCommanderDamageState(['a']),
      createPoisonState(['a']),
      [attacker],
      makeUndoStack(),
    );

    expect(types.map((type) => type.key)).toEqual(['damage', 'heal', 'poison']);
  });

  it('reads commander damage from the shared damageState and updates it via apply', () => {
    const [attacker, target] = makePlayers();
    const damageState = createCommanderDamageState(['a', 'b']);
    damageState[target.id][attacker.id] = 3;
    const undoStack = makeUndoStack();

    const types = buildDamageTypeDefs(
      attacker,
      target,
      false,
      damageState,
      createPoisonState(['a', 'b']),
      [attacker, target],
      undoStack,
    );
    const commander = types.find((type) => type.key === 'commander')!;

    expect(commander.getValue()).toBe(3);

    commander.apply(1);
    expect(commander.getValue()).toBe(4);
    expect(target.life).toBe(39);
    expect(undoStack.actions).toHaveLength(1);

    undoStack.actions[0].undo();
    expect(commander.getValue()).toBe(3);
    expect(target.life).toBe(40);
  });

  it('reads poison from the shared poisonState and updates it via apply', () => {
    const [attacker, target] = makePlayers();
    const poisonState = createPoisonState(['a', 'b']);
    poisonState[target.id] = 2;
    const undoStack = makeUndoStack();

    const types = buildDamageTypeDefs(
      attacker,
      target,
      false,
      createCommanderDamageState(['a', 'b']),
      poisonState,
      [attacker, target],
      undoStack,
    );
    const poison = types.find((type) => type.key === 'poison')!;

    expect(poison.getValue()).toBe(2);
    poison.apply(1);
    expect(poison.getValue()).toBe(3);
    expect(undoStack.actions).toHaveLength(1);
  });

  it('backs damage/lifelink/heal with a menu-local session count starting at 0, independent of life until applied', () => {
    const [attacker, target] = makePlayers();
    const undoStack = makeUndoStack();

    const types = buildDamageTypeDefs(
      attacker,
      target,
      false,
      createCommanderDamageState(['a', 'b']),
      createPoisonState(['a', 'b']),
      [attacker, target],
      undoStack,
    );
    const damage = types.find((type) => type.key === 'damage')!;

    expect(damage.getValue()).toBe(0);

    damage.apply(1);
    expect(damage.getValue()).toBe(1);
    expect(target.life).toBe(39);
    expect(undoStack.actions).toHaveLength(1);

    damage.apply(-1);
    expect(damage.getValue()).toBe(0);
    expect(target.life).toBe(40);
    expect(undoStack.actions).toHaveLength(2);
  });

  it('clamps the local session count at zero, refusing to apply a redundant minus tap', () => {
    const [attacker, target] = makePlayers();
    const undoStack = makeUndoStack();

    const types = buildDamageTypeDefs(
      attacker,
      target,
      false,
      createCommanderDamageState(['a', 'b']),
      createPoisonState(['a', 'b']),
      [attacker, target],
      undoStack,
    );
    const heal = types.find((type) => type.key === 'heal')!;

    heal.apply(-1);
    expect(heal.getValue()).toBe(0);
    expect(target.life).toBe(40);
    expect(undoStack.actions).toHaveLength(0);
  });

  it('applies lifelink damage to the target and heal to the attacker as one action', () => {
    const [attacker, target] = makePlayers();
    const undoStack = makeUndoStack();

    const types = buildDamageTypeDefs(
      attacker,
      target,
      false,
      createCommanderDamageState(['a', 'b']),
      createPoisonState(['a', 'b']),
      [attacker, target],
      undoStack,
    );
    const lifelink = types.find((type) => type.key === 'lifelink')!;

    lifelink.apply(1);
    expect(target.life).toBe(39);
    expect(attacker.life).toBe(41);
    expect(undoStack.actions).toHaveLength(1);

    undoStack.actions[0].undo();
    expect(target.life).toBe(40);
    expect(attacker.life).toBe(40);
  });

  it('triggers screen-shake for damage/commander/lifelink/poison increases but never for heal (issue #88)', () => {
    const [attacker, target] = makePlayers();
    const shake = new MockShake();

    const types = buildDamageTypeDefs(
      attacker,
      target,
      false,
      createCommanderDamageState(['a', 'b']),
      createPoisonState(['a', 'b']),
      [attacker, target],
      makeUndoStack(),
      undefined,
      shake,
    );

    for (const key of ['damage', 'commander', 'lifelink', 'poison'] as const) {
      types.find((type) => type.key === key)!.apply(1);
    }
    expect(shake.intensities).toHaveLength(4);

    types.find((type) => type.key === 'heal')!.apply(1);
    expect(shake.intensities).toHaveLength(4);
  });
});
