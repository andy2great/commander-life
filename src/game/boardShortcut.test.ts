import { describe, expect, it } from 'vitest';
import { applyBoardShortcutDelta, BOARD_SHORTCUT_OPTIONS, boardShortcutTargets } from './boardShortcut';
import type { Player, UndoAction } from './commanderDamage';
import type { ScreenShakeTrigger } from './screenShake';
import { DAMAGE_EFFECT_COLOR, type ZoneEffectTrigger, type ZoneEffectType } from './zoneEffect';

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
      { playerId: players[0].id, type: 'damage', color: DAMAGE_EFFECT_COLOR },
      { playerId: players[1].id, type: 'damage', color: DAMAGE_EFFECT_COLOR },
      { playerId: players[2].id, type: 'damage', color: DAMAGE_EFFECT_COLOR },
    ]);
  });

  it('does not trigger a zone effect for a negative (healing) delta', () => {
    const players = makePlayers(3);
    const undoStack = new FakeUndoStack();
    const zoneEffects = new MockZoneEffects();

    applyBoardShortcutDelta(players, 0, 'opponents', -2, undoStack, undefined, undefined, zoneEffects);

    expect(zoneEffects.calls).toHaveLength(0);
  });
});
