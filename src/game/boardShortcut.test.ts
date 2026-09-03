import { describe, expect, it } from 'vitest';
import { applyBoardShortcutDelta, BOARD_SHORTCUT_OPTIONS, boardShortcutTargets, createBoardShortcutSession } from './boardShortcut';
import type { Player, UndoAction } from './commanderDamage';
import type { ScreenShakeTrigger } from './screenShake';
import { DAMAGE_EFFECT_COLOR, HEAL_EFFECT_COLOR, type ZoneEffectTrigger, type ZoneEffectType } from './zoneEffect';
import { createStatsState, createStatsTrigger } from './stats';

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

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, seat) => ({
    id: `p${seat + 1}`,
    name: `Player ${seat + 1}`,
    life: 40,
  }));
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

describe('BOARD_SHORTCUT_OPTIONS', () => {
  it('offers exactly the two documented shortcuts', () => {
    expect(BOARD_SHORTCUT_OPTIONS).toEqual([
      { scope: 'opponents', label: 'Damage each opponent' },
      { scope: 'all', label: 'Damage all players' },
    ]);
  });
});

describe('boardShortcutTargets', () => {
  it.each([3, 4, 5])('excludes only the active player for "opponents" at %i players', (count) => {
    const players = makePlayers(count);
    const activeIndex = 1;

    const targets = boardShortcutTargets(players, activeIndex, 'opponents');

    expect(targets.map((player) => player.id)).toEqual(
      players.filter((_, seat) => seat !== activeIndex).map((player) => player.id),
    );
    expect(targets).not.toContainEqual(players[activeIndex]);
    expect(targets).toHaveLength(count - 1);
  });

  it.each([3, 4, 5])('includes every player, including the active one, for "all" at %i players', (count) => {
    const players = makePlayers(count);
    const activeIndex = 2 % count;

    const targets = boardShortcutTargets(players, activeIndex, 'all');

    expect(targets).toEqual(players);
    expect(targets).toHaveLength(count);
  });
});

describe('applyBoardShortcutDelta', () => {
  it('applies the delta to every opponent and reverts all of them with a single undo tap', () => {
    const players = makePlayers(4);
    const activeIndex = 0;
    const undoStack = new FakeUndoStack();

    applyBoardShortcutDelta(players, activeIndex, 'opponents', 3, undoStack);

    expect(players.map((player) => player.life)).toEqual([40, 37, 37, 37]);
    expect(undoStack.actions).toHaveLength(1);

    undoStack.undoLast();

    expect(players.map((player) => player.life)).toEqual([40, 40, 40, 40]);
  });

  it('applies the delta to every player, including the active one, and reverts all with a single undo tap', () => {
    const players = makePlayers(3);
    const activeIndex = 1;
    const undoStack = new FakeUndoStack();

    applyBoardShortcutDelta(players, activeIndex, 'all', 5, undoStack);

    expect(players.map((player) => player.life)).toEqual([35, 35, 35]);
    expect(undoStack.actions).toHaveLength(1);

    undoStack.undoLast();

    expect(players.map((player) => player.life)).toEqual([40, 40, 40]);
  });

  it('is a no-op for a zero delta', () => {
    const players = makePlayers(4);
    const undoStack = new FakeUndoStack();

    applyBoardShortcutDelta(players, 0, 'all', 0, undoStack);

    expect(players.map((player) => player.life)).toEqual([40, 40, 40, 40]);
    expect(undoStack.actions).toHaveLength(0);
  });

  it('applies a negative delta as healing to every affected player', () => {
    const players = makePlayers(3);
    const undoStack = new FakeUndoStack();

    applyBoardShortcutDelta(players, 0, 'opponents', -2, undoStack);

    expect(players.map((player) => player.life)).toEqual([40, 42, 42]);
  });

  it('triggers screen-shake once per affected player for a positive (damage) delta', () => {
    const players = makePlayers(3);
    const undoStack = new FakeUndoStack();
    const shake = new MockShake();

    applyBoardShortcutDelta(players, 0, 'opponents', 3, undoStack, undefined, shake);

    expect(shake.intensities).toHaveLength(2);
  });

  it('does not trigger screen-shake for a negative (healing) delta', () => {
    const players = makePlayers(3);
    const undoStack = new FakeUndoStack();
    const shake = new MockShake();

    applyBoardShortcutDelta(players, 0, 'opponents', -2, undoStack, undefined, shake);

    expect(shake.intensities).toHaveLength(0);
  });

  it('triggers a zone effect independently on every affected zone for a positive (damage) delta (issue #89)', () => {
    const players = makePlayers(3);
    const undoStack = new FakeUndoStack();
    const zoneEffects = new MockZoneEffects();

    applyBoardShortcutDelta(players, 0, 'all', 3, undoStack, undefined, undefined, zoneEffects);

    expect(zoneEffects.calls).toEqual([
      { playerId: players[0].id, type: 'damage', color: DAMAGE_EFFECT_COLOR, delta: -3 },
      { playerId: players[1].id, type: 'damage', color: DAMAGE_EFFECT_COLOR, delta: -3 },
      { playerId: players[2].id, type: 'damage', color: DAMAGE_EFFECT_COLOR, delta: -3 },
    ]);
  });

  it('triggers a heal zone effect independently on every affected zone for a negative (healing) delta (issue #95)', () => {
    const players = makePlayers(3);
    const undoStack = new FakeUndoStack();
    const zoneEffects = new MockZoneEffects();

    applyBoardShortcutDelta(players, 0, 'opponents', -2, undoStack, undefined, undefined, zoneEffects);

    expect(zoneEffects.calls).toEqual([
      { playerId: players[1].id, type: 'heal', color: HEAL_EFFECT_COLOR, delta: 2 },
      { playerId: players[2].id, type: 'heal', color: HEAL_EFFECT_COLOR, delta: 2 },
    ]);
  });

  it('attributes life-lost/biggest-hit stats to the active player for a positive (damage) delta (issue #98)', () => {
    const players = makePlayers(3);
    const undoStack = new FakeUndoStack();
    const statsState = createStatsState(players.map((p) => p.id));
    const stats = createStatsTrigger(statsState);

    applyBoardShortcutDelta(players, 0, 'opponents', 3, undoStack, undefined, undefined, undefined, stats);

    expect(statsState.lifeLost[players[1].id]).toBe(3);
    expect(statsState.lifeLost[players[2].id]).toBe(3);
    expect(statsState.biggestHit).toEqual({ attackerId: players[0].id, amount: 3, targetId: null });
  });

  it('records life gained for the affected players for a negative (healing) delta, without a biggest hit', () => {
    const players = makePlayers(3);
    const undoStack = new FakeUndoStack();
    const statsState = createStatsState(players.map((p) => p.id));
    const stats = createStatsTrigger(statsState);

    applyBoardShortcutDelta(players, 0, 'opponents', -2, undoStack, undefined, undefined, undefined, stats);

    expect(statsState.lifeGained[players[1].id]).toBe(2);
    expect(statsState.lifeGained[players[2].id]).toBe(2);
    expect(statsState.biggestHit).toBeNull();
  });
});

describe('createBoardShortcutSession', () => {
  it('commits the selected option and stepped amount on commit(), without a separate explicit Apply (issue #230)', () => {
    const players = makePlayers(3);
    const undoStack = new FakeUndoStack();
    const session = createBoardShortcutSession(players, () => 0, undoStack);

    session.select(BOARD_SHORTCUT_OPTIONS[0]); // opponents
    session.step(1);
    session.step(1);
    session.step(1);
    session.commit();

    expect(players.map((player) => player.life)).toEqual([40, 37, 37]);
    expect(undoStack.actions).toHaveLength(1);

    undoStack.undoLast();

    expect(players.map((player) => player.life)).toEqual([40, 40, 40]);
  });

  it('is a no-op commit when dismissed without ever selecting an option', () => {
    const players = makePlayers(3);
    const undoStack = new FakeUndoStack();
    const session = createBoardShortcutSession(players, () => 0, undoStack);

    session.commit();

    expect(players.map((player) => player.life)).toEqual([40, 40, 40]);
    expect(undoStack.actions).toHaveLength(0);
  });

  it('is a no-op commit when an option is selected but the stepper is left at its default (no-op) value', () => {
    const players = makePlayers(3);
    const undoStack = new FakeUndoStack();
    const session = createBoardShortcutSession(players, () => 0, undoStack);

    session.select(BOARD_SHORTCUT_OPTIONS[1]); // all
    session.commit();

    expect(players.map((player) => player.life)).toEqual([40, 40, 40]);
    expect(undoStack.actions).toHaveLength(0);
  });

  it('resets the pending amount to 0 when switching which option is selected', () => {
    const players = makePlayers(3);
    const undoStack = new FakeUndoStack();
    const session = createBoardShortcutSession(players, () => 0, undoStack);

    session.select(BOARD_SHORTCUT_OPTIONS[0]);
    session.step(1);
    session.step(1);
    session.select(BOARD_SHORTCUT_OPTIONS[1]);

    expect(session.getAmount()).toBe(0);
  });

  it('deselect() clears the pending selection so a later commit() no-ops', () => {
    const players = makePlayers(3);
    const undoStack = new FakeUndoStack();
    const session = createBoardShortcutSession(players, () => 0, undoStack);

    session.select(BOARD_SHORTCUT_OPTIONS[0]);
    session.step(1);
    session.deselect();
    session.commit();

    expect(players.map((player) => player.life)).toEqual([40, 40, 40]);
    expect(undoStack.actions).toHaveLength(0);
    expect(session.hasSelection()).toBe(false);
  });

  it('only commits once per selection: a second commit() call after one is a no-op', () => {
    const players = makePlayers(3);
    const undoStack = new FakeUndoStack();
    const session = createBoardShortcutSession(players, () => 0, undoStack);

    session.select(BOARD_SHORTCUT_OPTIONS[0]);
    session.step(1);
    session.step(1);
    session.commit();
    session.commit();

    expect(undoStack.actions).toHaveLength(1);
  });
});
