import { describe, expect, it } from 'vitest';
import { buildDamageTypeDefs, createAttackMenuSession } from './attackMenu';
import { createCommanderDamageState, type Player, type UndoAction } from '../game/commanderDamage';
import { createPoisonState } from '../game/poison';
import { createEnergyState } from '../game/energy';
import { createExperienceState } from '../game/experience';
import type { ScreenShakeTrigger } from '../game/screenShake';
import type { ZoneEffectTrigger, ZoneEffectType } from '../game/zoneEffect';
import { createStatsState, createStatsTrigger } from '../game/stats';

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
      createCommanderDamageState([attacker, target]),
      createPoisonState(['a', 'b']),
      createEnergyState(['a', 'b']),
      createExperienceState(['a', 'b']),
      [attacker, target],
      makeUndoStack(),
    );

    expect(types.map((type) => type.key)).toEqual(['damage', 'commander', 'lifelink', 'heal', 'poison']);
  });

  it('includes energy and experience for a self-target pair, alongside poison (issues #160, #161)', () => {
    const [attacker] = makePlayers();
    const types = buildDamageTypeDefs(
      attacker,
      attacker,
      true,
      createCommanderDamageState([attacker]),
      createPoisonState(['a']),
      createEnergyState(['a']),
      createExperienceState(['a']),
      [attacker],
      makeUndoStack(),
    );

    expect(types.map((type) => type.key)).toEqual(['damage', 'heal', 'poison', 'energy', 'experience']);
  });

  it('omits energy and experience for an attacker->target pair', () => {
    const [attacker, target] = makePlayers();
    const types = buildDamageTypeDefs(
      attacker,
      target,
      false,
      createCommanderDamageState([attacker, target]),
      createPoisonState(['a', 'b']),
      createEnergyState(['a', 'b']),
      createExperienceState(['a', 'b']),
      [attacker, target],
      makeUndoStack(),
    );

    expect(types.map((type) => type.key)).not.toContain('energy');
    expect(types.map((type) => type.key)).not.toContain('experience');
  });

  it('reads energy from the shared energyState and updates it via apply, clamped at zero', () => {
    const [attacker] = makePlayers();
    const energyState = createEnergyState(['a']);
    energyState[attacker.id] = 2;
    const undoStack = makeUndoStack();

    const types = buildDamageTypeDefs(
      attacker,
      attacker,
      true,
      createCommanderDamageState([attacker]),
      createPoisonState(['a']),
      energyState,
      createExperienceState(['a']),
      [attacker],
      undoStack,
    );
    const energy = types.find((type) => type.key === 'energy')!;

    expect(energy.getValue()).toBe(2);
    energy.apply(1);
    expect(energy.getValue()).toBe(3);
    expect(undoStack.actions).toHaveLength(1);

    undoStack.actions[0].undo();
    expect(energy.getValue()).toBe(2);
  });

  it('clamps energy at zero via apply', () => {
    const [attacker] = makePlayers();
    const undoStack = makeUndoStack();

    const types = buildDamageTypeDefs(
      attacker,
      attacker,
      true,
      createCommanderDamageState([attacker]),
      createPoisonState(['a']),
      createEnergyState(['a']),
      createExperienceState(['a']),
      [attacker],
      undoStack,
    );
    const energy = types.find((type) => type.key === 'energy')!;

    energy.apply(-1);
    expect(energy.getValue()).toBe(0);
    expect(undoStack.actions).toHaveLength(0);
  });

  it('reads experience from the shared experienceState and updates it via apply, clamped at zero', () => {
    const [attacker] = makePlayers();
    const experienceState = createExperienceState(['a']);
    experienceState[attacker.id] = 2;
    const undoStack = makeUndoStack();

    const types = buildDamageTypeDefs(
      attacker,
      attacker,
      true,
      createCommanderDamageState([attacker]),
      createPoisonState(['a']),
      createEnergyState(['a']),
      experienceState,
      [attacker],
      undoStack,
    );
    const experience = types.find((type) => type.key === 'experience')!;

    expect(experience.getValue()).toBe(2);
    experience.apply(1);
    expect(experience.getValue()).toBe(3);
    expect(undoStack.actions).toHaveLength(1);

    undoStack.actions[0].undo();
    expect(experience.getValue()).toBe(2);
  });

  it('clamps experience at zero via apply', () => {
    const [attacker] = makePlayers();
    const undoStack = makeUndoStack();

    const types = buildDamageTypeDefs(
      attacker,
      attacker,
      true,
      createCommanderDamageState([attacker]),
      createPoisonState(['a']),
      createEnergyState(['a']),
      createExperienceState(['a']),
      [attacker],
      undoStack,
    );
    const experience = types.find((type) => type.key === 'experience')!;

    experience.apply(-1);
    expect(experience.getValue()).toBe(0);
    expect(undoStack.actions).toHaveLength(0);
  });

  it('omits commander damage and lifelink for a self-target pair', () => {
    const [attacker] = makePlayers();
    const types = buildDamageTypeDefs(
      attacker,
      attacker,
      true,
      createCommanderDamageState([attacker]),
      createPoisonState(['a']),
      createEnergyState(['a']),
      createExperienceState(['a']),
      [attacker],
      makeUndoStack(),
    );

    expect(types.map((type) => type.key)).toEqual(['damage', 'heal', 'poison', 'energy', 'experience']);
  });

  it('reads commander damage from the shared damageState and updates it via apply', () => {
    const [attacker, target] = makePlayers();
    const damageState = createCommanderDamageState([attacker, target]);
    damageState[target.id][attacker.id] = [3];
    const undoStack = makeUndoStack();

    const types = buildDamageTypeDefs(
      attacker,
      target,
      false,
      damageState,
      createPoisonState(['a', 'b']),
      createEnergyState(['a', 'b']),
      createExperienceState(['a', 'b']),
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

  it('offers two independent commander-damage toggles for a two-commander attacker (issue #165)', () => {
    const [attacker, target] = makePlayers();
    attacker.hasTwoCommanders = true;
    const damageState = createCommanderDamageState([attacker, target]);
    const undoStack = makeUndoStack();

    const types = buildDamageTypeDefs(
      attacker,
      target,
      false,
      damageState,
      createPoisonState(['a', 'b']),
      createEnergyState(['a', 'b']),
      createExperienceState(['a', 'b']),
      [attacker, target],
      undoStack,
    );

    expect(types.map((type) => type.key)).toEqual(['damage', 'commander1', 'commander2', 'lifelink', 'heal', 'poison']);

    const commander1 = types.find((type) => type.key === 'commander1')!;
    const commander2 = types.find((type) => type.key === 'commander2')!;

    commander1.apply(1);
    commander2.apply(1);
    commander2.apply(1);

    expect(commander1.getValue()).toBe(1);
    expect(commander2.getValue()).toBe(2);
    expect(damageState[target.id][attacker.id]).toEqual([1, 2]);
    expect(target.life).toBe(37);

    undoStack.actions[2].undo();
    expect(commander2.getValue()).toBe(1);
    expect(commander1.getValue()).toBe(1);
    expect(target.life).toBe(38);
  });

  it('still offers a single "commander" toggle for a single-commander attacker even when the target has two commanders', () => {
    const [attacker, target] = makePlayers();
    target.hasTwoCommanders = true;

    const types = buildDamageTypeDefs(
      attacker,
      target,
      false,
      createCommanderDamageState([attacker, target]),
      createPoisonState(['a', 'b']),
      createEnergyState(['a', 'b']),
      createExperienceState(['a', 'b']),
      [attacker, target],
      makeUndoStack(),
    );

    expect(types.map((type) => type.key)).toContain('commander');
    expect(types.map((type) => type.key)).not.toContain('commander1');
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
      createCommanderDamageState([attacker, target]),
      poisonState,
      createEnergyState(['a', 'b']),
      createExperienceState(['a', 'b']),
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
      createCommanderDamageState([attacker, target]),
      createPoisonState(['a', 'b']),
      createEnergyState(['a', 'b']),
      createExperienceState(['a', 'b']),
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
      createCommanderDamageState([attacker, target]),
      createPoisonState(['a', 'b']),
      createEnergyState(['a', 'b']),
      createExperienceState(['a', 'b']),
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
      createCommanderDamageState([attacker, target]),
      createPoisonState(['a', 'b']),
      createEnergyState(['a', 'b']),
      createExperienceState(['a', 'b']),
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
      createCommanderDamageState([attacker, target]),
      createPoisonState(['a', 'b']),
      createEnergyState(['a', 'b']),
      createExperienceState(['a', 'b']),
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

  it('triggers a distinct-per-type zone effect for every damage type, including heal, from both AttackMenu paths (issue #89)', () => {
    const [attacker, target] = makePlayers();
    const zoneEffects = new MockZoneEffects();

    const types = buildDamageTypeDefs(
      attacker,
      target,
      false,
      createCommanderDamageState([attacker, target]),
      createPoisonState(['a', 'b']),
      createEnergyState(['a', 'b']),
      createExperienceState(['a', 'b']),
      [attacker, target],
      makeUndoStack(),
      undefined,
      undefined,
      zoneEffects,
    );

    for (const key of ['damage', 'commander', 'lifelink', 'heal', 'poison'] as const) {
      types.find((type) => type.key === key)!.apply(1);
    }

    expect(zoneEffects.calls.map((call) => call.type)).toEqual([
      'damage',
      'commanderDamage',
      'damage', // lifelink's target-side flash
      'heal', // lifelink's attacker-side flash
      'heal',
      'poison',
    ]);
  });

  it('attributes damage/commander/lifelink hits to the attacker on stats, but not heal or poison (issue #98)', () => {
    const [attacker, target] = makePlayers();
    const statsState = createStatsState([attacker.id, target.id]);
    const stats = createStatsTrigger(statsState);

    const types = buildDamageTypeDefs(
      attacker,
      target,
      false,
      createCommanderDamageState([attacker, target]),
      createPoisonState(['a', 'b']),
      createEnergyState(['a', 'b']),
      createExperienceState(['a', 'b']),
      [attacker, target],
      makeUndoStack(),
      undefined,
      undefined,
      undefined,
      stats,
    );

    types.find((type) => type.key === 'damage')!.apply(1);
    const commander = types.find((type) => type.key === 'commander')!;
    commander.apply(1);
    commander.apply(1);
    const lifelink = types.find((type) => type.key === 'lifelink')!;
    lifelink.apply(1);
    lifelink.apply(1);
    lifelink.apply(1);
    types.find((type) => type.key === 'heal')!.apply(1);
    types.find((type) => type.key === 'poison')!.apply(1);

    expect(statsState.lifeLost[target.id]).toBe(4); // 1 plain damage + 3 lifelink
    expect(statsState.lifeGained[target.id]).toBe(1); // the heal
    expect(statsState.lifeGained[attacker.id]).toBe(3); // lifelink's attacker-side gain
    expect(statsState.commanderDamageDealt[attacker.id]).toBe(2);
    expect(statsState.commanderDamageReceived[target.id]).toBe(2);
    // Every +1 tap is its own hit; ties keep the first recorded (the plain damage tap).
    expect(statsState.biggestHit).toEqual({ attackerId: attacker.id, amount: 1, targetId: null });
  });

  it('attributes a self-target damage hit to the player themself, with no attacker/target distinction', () => {
    const [attacker] = makePlayers();
    const statsState = createStatsState([attacker.id]);
    const stats = createStatsTrigger(statsState);

    const types = buildDamageTypeDefs(
      attacker,
      attacker,
      true,
      createCommanderDamageState([attacker]),
      createPoisonState(['a']),
      createEnergyState(['a']),
      createExperienceState(['a']),
      [attacker],
      makeUndoStack(),
      undefined,
      undefined,
      undefined,
      stats,
    );

    const damage = types.find((type) => type.key === 'damage')!;
    damage.apply(1);
    damage.apply(1);
    damage.apply(1);
    damage.apply(1);
    damage.apply(1);

    expect(statsState.lifeLost[attacker.id]).toBe(5);
    expect(statsState.biggestHit).toEqual({ attackerId: attacker.id, amount: 1, targetId: null });
  });
});

describe('createAttackMenuSession', () => {
  it('collects every stepper tap made during a session into a single undo entry, across damage types (issue #94)', () => {
    const [attacker, target] = makePlayers();
    const undoStack = makeUndoStack();
    const session = createAttackMenuSession(undoStack);

    const types = buildDamageTypeDefs(
      attacker,
      target,
      false,
      createCommanderDamageState([attacker, target]),
      createPoisonState(['a', 'b']),
      createEnergyState(['a', 'b']),
      createExperienceState(['a', 'b']),
      [attacker, target],
      session.undoStack,
    );

    types.find((type) => type.key === 'damage')!.apply(1);
    types.find((type) => type.key === 'damage')!.apply(1);
    types.find((type) => type.key === 'heal')!.apply(1);
    expect(target.life).toBe(39);
    expect(undoStack.actions).toHaveLength(0);

    session.commit();
    expect(undoStack.actions).toHaveLength(1);

    undoStack.actions[0].undo();
    expect(target.life).toBe(40);
  });

  it('does not push anything onto the real undo stack when no taps were made', () => {
    const undoStack = makeUndoStack();
    const session = createAttackMenuSession(undoStack);

    session.commit();

    expect(undoStack.actions).toHaveLength(0);
  });

  it('starts a fresh batch after committing, so a later session commits separately', () => {
    const [attacker, target] = makePlayers();
    const undoStack = makeUndoStack();
    const session = createAttackMenuSession(undoStack);

    const types = buildDamageTypeDefs(
      attacker,
      target,
      false,
      createCommanderDamageState([attacker, target]),
      createPoisonState(['a', 'b']),
      createEnergyState(['a', 'b']),
      createExperienceState(['a', 'b']),
      [attacker, target],
      session.undoStack,
    );

    types.find((type) => type.key === 'damage')!.apply(1);
    session.commit();
    types.find((type) => type.key === 'damage')!.apply(1);
    session.commit();

    expect(undoStack.actions).toHaveLength(2);
    expect(target.life).toBe(38);

    undoStack.actions[1].undo();
    expect(target.life).toBe(39);
    undoStack.actions[0].undo();
    expect(target.life).toBe(40);
  });
});
