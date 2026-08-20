import { describe, expect, it } from 'vitest';
import { Game, clamp, computeZoneRects } from './game';
import { applyPoisonDelta } from './game/poison';
import { RADIUS_RATIO, UNDO_GAP_RATIO, UNDO_RADIUS_RATIO } from './ui/controls';

/** Mirrors UndoControl's reflow math so tests can tap the icon by coordinate. */
function undoControlCenter(width: number, height: number): { x: number; y: number } {
  const shortSide = Math.min(width, height);
  const mainRadius = shortSide * RADIUS_RATIO;
  const undoRadius = shortSide * UNDO_RADIUS_RATIO;
  return { x: width / 2 + mainRadius + shortSide * UNDO_GAP_RATIO + undoRadius, y: height / 2 };
}

describe('clamp', () => {
  it('returns the value when inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps below the minimum', () => {
    expect(clamp(-2, 0, 10)).toBe(0);
  });

  it('clamps above the maximum', () => {
    expect(clamp(12, 0, 10)).toBe(10);
  });
});

describe('Game', () => {
  it('advances the active player when the center control is tapped', () => {
    const game = new Game();
    game.resize(400, 800);

    game.onTap(200, 400);

    expect(game.activeIndex).toBe(1);
  });

  it('ignores taps outside the control', () => {
    const game = new Game();
    game.resize(400, 800);

    game.onTap(0, 0);

    expect(game.activeIndex).toBe(0);
  });

  it('wraps from the last seat to the first and increments the turn counter once per lap', () => {
    const game = new Game();
    game.resize(400, 800);

    for (let i = 0; i < game.playerCount; i += 1) {
      game.onTap(200, 400);
    }

    expect(game.activeIndex).toBe(0);
    expect(game.turnCount).toBe(1);
  });

  it('updates without throwing', () => {
    const game = new Game();
    game.update(0.016);
  });

  it('starts with one player per seat at 40 life and zeroed commander damage', () => {
    const game = new Game();

    expect(game.players).toHaveLength(game.playerCount);
    expect(game.players.every((player) => player.life === 40)).toBe(true);
    expect(game.damageState[game.players[0].id]).toEqual(
      Object.fromEntries(
        game.players.slice(1).map((player) => [player.id, 0]),
      ),
    );
  });

  it('starts every player at 0 poison counters', () => {
    const game = new Game();

    expect(game.poisonState).toEqual(
      Object.fromEntries(game.players.map((player) => [player.id, 0])),
    );
  });

  it('resolves a long-press to the player id whose zone contains the point', () => {
    const game = new Game();
    game.resize(400, 800);

    const zoneHeight = 800 / game.playerCount;
    const playerId = game.onLongPress(50, zoneHeight * 2 + 10);

    expect(playerId).toBe(game.players[2].id);
  });

  it('ignores long-presses over the shared center control', () => {
    const game = new Game();
    game.resize(400, 800);

    expect(game.onLongPress(200, 400)).toBeNull();
  });

  it('increments life when the upper half of a bottom-row (non-rotated) zone is tapped', () => {
    const game = new Game();
    game.resize(400, 800);
    const player = game.players[2];
    const rect = computeZoneRects(game.playerCount, 400, 800)[2];

    game.onTap(rect.x + 10, rect.y + 10); // near the row divider: away from this seat's body = upper

    expect(player.life).toBe(41);
  });

  it('decrements life when the lower half of a bottom-row (non-rotated) zone is tapped', () => {
    const game = new Game();
    game.resize(400, 800);
    const player = game.players[2];
    const rect = computeZoneRects(game.playerCount, 400, 800)[2];

    game.onTap(rect.x + 10, rect.y + rect.height - 10); // near the phone's bottom edge: this seat's own body = lower

    expect(player.life).toBe(39);
  });

  it('increments life when the upper half of a top-row (rotated) zone is tapped', () => {
    const game = new Game();
    game.resize(400, 800);
    const player = game.players[0];
    const rect = computeZoneRects(game.playerCount, 400, 800)[0];

    game.onTap(rect.x + 10, rect.y + rect.height - 10); // near the row divider: away from this seat's body = upper

    expect(player.life).toBe(41);
  });

  it('decrements life when the lower half of a top-row (rotated) zone is tapped', () => {
    const game = new Game();
    game.resize(400, 800);
    const player = game.players[0];
    const rect = computeZoneRects(game.playerCount, 400, 800)[0];

    game.onTap(rect.x + 10, rect.y + 10); // near the phone's top edge: this seat's own body = lower

    expect(player.life).toBe(39);
  });

  it('does not change any life total when tapping the shared center control', () => {
    const game = new Game();
    game.resize(400, 800);
    const livesBefore = game.players.map((player) => player.life);

    game.onTap(200, 400);

    expect(game.players.map((player) => player.life)).toEqual(livesBefore);
    expect(game.activeIndex).toBe(1);
  });

  it('undoes a turn pass, restoring the previous active player and turn count', () => {
    const game = new Game();
    game.resize(400, 800);
    const livesBefore = game.players.map((player) => player.life);

    for (let i = 0; i < game.playerCount; i += 1) {
      game.onTap(200, 400);
    }
    expect(game.activeIndex).toBe(0);
    expect(game.turnCount).toBe(1);

    game.undo();

    expect(game.activeIndex).toBe(game.playerCount - 1);
    expect(game.turnCount).toBe(0);
    expect(game.players.map((player) => player.life)).toEqual(livesBefore);
  });

  it('undoes each action exactly once, in order, through an interleaved sequence of life changes and turn passes', () => {
    const game = new Game();
    game.resize(400, 800);
    const player = game.players[0];
    const zoneHeight = 800 / game.playerCount;

    game.onTap(50, zoneHeight + 10); // life: 40 -> 41
    game.onTapEnd();
    game.onTap(200, 400); // pass turn: activeIndex 0 -> 1
    game.onTap(50, zoneHeight + 10); // life: 41 -> 42
    game.onTapEnd();

    expect(player.life).toBe(42);
    expect(game.activeIndex).toBe(1);

    game.undo(); // reverts life: 42 -> 41
    expect(player.life).toBe(41);
    expect(game.activeIndex).toBe(1);

    game.undo(); // reverts turn pass: activeIndex 1 -> 0
    expect(player.life).toBe(41);
    expect(game.activeIndex).toBe(0);

    game.undo(); // reverts life: 41 -> 40
    expect(player.life).toBe(40);
    expect(game.activeIndex).toBe(0);
  });

  it('pushes an undo action onto the shared stack that reverts a zone life change', () => {
    const game = new Game();
    game.resize(400, 800);
    const player = game.players[0];
    const zoneHeight = 800 / game.playerCount;

    game.onTap(50, zoneHeight + 10);
    expect(player.life).toBe(41);

    const stack = game.undoStack as unknown as { actions: { undo(): void }[] };
    stack.actions[stack.actions.length - 1].undo();

    expect(player.life).toBe(40);
  });

  it('reports canUndo and reverts the most recent life change via undo()', () => {
    const game = new Game();
    game.resize(400, 800);
    const player = game.players[0];
    const zoneHeight = 800 / game.playerCount;

    expect(game.canUndo).toBe(false);

    game.onTap(50, zoneHeight + 10);
    expect(player.life).toBe(41);
    expect(game.canUndo).toBe(true);

    game.undo();

    expect(player.life).toBe(40);
    expect(game.canUndo).toBe(false);
  });

  it('undoes multiple changes in last-in-first-out order', () => {
    const game = new Game();
    game.resize(400, 800);
    const player = game.players[0];
    const zoneHeight = 800 / game.playerCount;

    game.onTap(50, zoneHeight + 10); // +1
    game.onTapEnd();
    game.onTap(50, zoneHeight + 10); // +1
    game.onTapEnd();
    expect(player.life).toBe(42);

    game.undo();
    expect(player.life).toBe(41);

    game.undo();
    expect(player.life).toBe(40);
  });

  it('undo() is a no-op when nothing to undo', () => {
    const game = new Game();
    const livesBefore = game.players.map((player) => player.life);

    expect(() => game.undo()).not.toThrow();
    expect(game.players.map((player) => player.life)).toEqual(livesBefore);
    expect(game.canUndo).toBe(false);
  });

  it('tapping the undo icon reverts the most recent change and is dimmed/disabled when empty', () => {
    const game = new Game();
    game.resize(400, 800);
    const player = game.players[0];
    const zoneHeight = 800 / game.playerCount;
    const undoCenter = undoControlCenter(400, 800);

    expect(game.isOverUndoControl(undoCenter.x, undoCenter.y)).toBe(true);

    // Tapping the undo icon while disabled changes nothing.
    game.onTap(undoCenter.x, undoCenter.y);
    expect(player.life).toBe(40);

    game.onTap(50, zoneHeight + 10);
    expect(player.life).toBe(41);

    game.onTap(undoCenter.x, undoCenter.y);
    expect(player.life).toBe(40);
  });

  it('does not change life or open the damage panel target when long-pressing the undo icon', () => {
    const game = new Game();
    game.resize(400, 800);
    const undoCenter = undoControlCenter(400, 800);

    expect(game.onLongPress(undoCenter.x, undoCenter.y)).toBeNull();
  });

  it('ramps repeated life changes while a zone tap is held, accelerating after ~600ms', () => {
    const game = new Game();
    game.resize(400, 800);
    const player = game.players[0];
    const zoneHeight = 800 / game.playerCount;

    game.onTap(50, zoneHeight + 10);
    expect(player.life).toBe(41);

    game.update(0.3);
    expect(player.life).toBe(41);

    game.update(0.4);
    const afterRampStarts = player.life;
    expect(afterRampStarts).toBeGreaterThan(41);

    game.update(0.5);
    expect(player.life).toBeGreaterThan(afterRampStarts);

    game.onTapEnd();
    const afterRelease = player.life;
    game.update(1);
    expect(player.life).toBe(afterRelease);
  });

  it('cancelTap reverts the zone life change and popup, and disarms the ramp', () => {
    const game = new Game();
    game.resize(400, 800);
    const player = game.players[0];
    const zoneHeight = 800 / game.playerCount;

    game.onTap(50, zoneHeight + 10);
    expect(player.life).toBe(41);
    expect(game.popups).toHaveLength(1);

    game.cancelTap();
    expect(player.life).toBe(40);
    expect(game.popups).toHaveLength(0);

    game.update(1);
    expect(player.life).toBe(40);
  });

  it('cancelTap is a no-op when no zone tap is currently held', () => {
    const game = new Game();
    game.resize(400, 800);
    const livesBefore = game.players.map((player) => player.life);

    game.cancelTap();

    expect(game.players.map((player) => player.life)).toEqual(livesBefore);
  });

  it('spawns a delta popup at the tap location when a zone tap changes life', () => {
    const game = new Game();
    game.resize(400, 800);
    const zoneHeight = 800 / game.playerCount;

    game.onTap(50, zoneHeight + 10);

    expect(game.popups).toHaveLength(1);
    expect(game.popups[0]).toMatchObject({
      playerId: game.players[0].id,
      x: 50,
      y: zoneHeight + 10,
      delta: 1,
    });
  });

  it('does not spawn a popup when tapping the shared center control', () => {
    const game = new Game();
    game.resize(400, 800);

    game.onTap(200, 400);

    expect(game.popups).toHaveLength(0);
  });

  it('fades a popup out and removes it after ~500ms', () => {
    const game = new Game();
    game.resize(400, 800);
    const zoneHeight = 800 / game.playerCount;

    game.onTap(50, zoneHeight + 10);
    expect(game.popups).toHaveLength(1);

    game.update(0.4);
    expect(game.popups).toHaveLength(1);

    game.update(0.2);
    expect(game.popups).toHaveLength(0);
  });

  it('supports multiple concurrent popups from rapid taps without error', () => {
    const game = new Game();
    game.resize(400, 800);
    const zoneHeight = 800 / game.playerCount;

    game.onTap(50, zoneHeight + 10);
    game.onTapEnd();
    game.onTap(60, zoneHeight - 10);
    game.onTapEnd();

    expect(game.popups).toHaveLength(2);
    expect(() => game.update(0.016)).not.toThrow();
  });

  it('launches with the configured player count, starting life, names, and colors', () => {
    const game = new Game({
      playerCount: 3,
      startingLife: 20,
      players: [
        { name: 'Alara', color: '#111111' },
        { name: 'Kess', color: '#222222' },
        { name: 'Yorion', color: '#333333' },
      ],
    });

    expect(game.playerCount).toBe(3);
    expect(game.players.map((player) => ({ name: player.name, life: player.life, color: player.color }))).toEqual([
      { name: 'Alara', life: 20, color: '#111111' },
      { name: 'Kess', life: 20, color: '#222222' },
      { name: 'Yorion', life: 20, color: '#333333' },
    ]);
  });

  it('clamps a configured player count to the 3-6 range', () => {
    const tooFew = new Game({ playerCount: 1, startingLife: 40, players: [] });
    const tooMany = new Game({ playerCount: 9, startingLife: 40, players: [] });

    expect(tooFew.playerCount).toBe(3);
    expect(tooMany.playerCount).toBe(6);
  });

  it.each([3, 4, 5, 6])(
    'keeps the shared control off every zone center in a %i-player game, so taps there still reach that zone',
    (playerCount) => {
      const game = new Game({ playerCount, startingLife: 40, players: [] });
      const width = 400;
      const height = 900;
      game.resize(width, height);
      const rects = computeZoneRects(playerCount, width, height);

      rects.forEach((rect, seat) => {
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;

        expect(game.isOverControl(centerX, centerY)).toBe(false);

        const player = game.players[seat];
        const lifeBefore = player.life;
        // 1px toward this zone's own top edge from center: for a bottom-row
        // (upright) zone that's away from the seat's body = upper = +1; for a
        // top-row (rotated) zone that's near the seat's own body = lower = -1.
        game.onTap(centerX, centerY - 1);
        expect(player.life).toBe(lifeBefore + (rect.rotated ? -1 : 1));
      });
    },
  );

  it.each([3, 4, 5, 6])('lays out %i players in the table-like grid from docs/concept.md', (playerCount) => {
    const game = new Game({ playerCount, startingLife: 40, players: [] });
    game.resize(400, 900);
    const rects = computeZoneRects(playerCount, 400, 900);

    rects.forEach((rect, seat) => {
      // Each zone's own upper half increments and lower half decrements, from
      // that seat's own seated orientation: for a top-row (rotated) zone the
      // near-to-body (small canvas-offset) side is that seat's lower half,
      // the opposite of a bottom-row (upright) zone. Taps land a quarter-
      // height into each half, well clear of the shared control disc that
      // sits where the two rows meet.
      const player = game.players[seat];
      const nearBodyDelta = rect.rotated ? -1 : 1;

      game.onTap(rect.x + rect.width / 2, rect.y + rect.height * 0.25);
      expect(player.life).toBe(40 + nearBodyDelta);

      game.onTap(rect.x + rect.width / 2, rect.y + rect.height * 0.75);
      expect(player.life).toBe(40);
    });
  });
});

describe('end of game', () => {
  function makeThreePlayerGame(startingLife: number): Game {
    return new Game({
      playerCount: 3,
      startingLife,
      players: [
        { name: 'Alara', color: '#111111' },
        { name: 'Kess', color: '#222222' },
        { name: 'Yorion', color: '#333333' },
      ],
    });
  }

  it('has no stats before the game ends', () => {
    const game = makeThreePlayerGame(40);

    expect(game.ended).toBe(false);
    expect(game.stats).toBeNull();
  });

  it('reports whether a point is over the shared center control', () => {
    const game = makeThreePlayerGame(40);
    game.resize(400, 900);

    // The grid is always two rows filling half the canvas height each, so
    // the control sits at the boundary between them (450) for every player
    // count. See Game.resize().
    expect(game.isOverControl(200, 450)).toBe(true);
    expect(game.isOverControl(0, 0)).toBe(false);
  });

  it('ends automatically when only one player remains above 0 life, recording elimination order', () => {
    const game = makeThreePlayerGame(1);
    game.resize(400, 900);
    const rects = computeZoneRects(3, 400, 900);

    game.onTap(rects[0].x + 50, rects[0].y + 10); // Alara: 1 -> 0 (lower half, near this rotated seat's own body)
    expect(game.ended).toBe(false);

    game.onTap(rects[1].x + 50, rects[1].y + rects[1].height - 10); // Kess: 1 -> 0 (lower half), only Yorion remains
    expect(game.ended).toBe(true);

    expect(game.stats?.winnerId).toBe(game.players[2].id);
    expect(game.stats?.eliminationOrder.map((entry) => entry.playerId)).toEqual([
      game.players[0].id,
      game.players[1].id,
    ]);
  });

  it('ends automatically when a player reaches 10 poison, recording elimination order the same way as 0 life', () => {
    const game = makeThreePlayerGame(40);
    const alara = game.players[0];
    const kess = game.players[1];

    applyPoisonDelta(game.poisonState, alara.id, 10, game.undoStack);
    expect(game.ended).toBe(false);

    applyPoisonDelta(game.poisonState, kess.id, 10, game.undoStack);
    game.update(0.016); // checkEndConditions runs every frame; poison changes bypass Game directly

    expect(game.ended).toBe(true);
    expect(game.stats?.winnerId).toBe(game.players[2].id);
    expect(game.stats?.eliminationOrder.map((entry) => entry.playerId)).toEqual([alara.id, kess.id]);
  });

  it('drops a player from eliminationOrder once undo restores their poison below the lethal threshold', () => {
    const game = makeThreePlayerGame(40);
    const alara = game.players[0];

    applyPoisonDelta(game.poisonState, alara.id, 10, game.undoStack);
    game.update(0.016);
    expect(game.ended).toBe(false);

    game.undo(); // Alara: 10 -> 0
    game.update(0.016);

    game.endGame();

    expect(game.ended).toBe(true);
    expect(game.stats?.eliminationOrder).toEqual([]);
  });

  it('excludes a poison-eliminated player from the manual endGame winner even with the highest life', () => {
    const game = makeThreePlayerGame(40);
    const alara = game.players[0];
    const kess = game.players[1];

    applyPoisonDelta(game.poisonState, alara.id, 10, game.undoStack); // Alara eliminated by poison, still at 40 life
    game.update(0.016);

    game.endGame();

    expect(game.stats?.winnerId).not.toBe(alara.id);
    expect(game.stats?.winnerId).toBe(kess.id);
  });

  it('drops a player from eliminationOrder once undo restores their life above 0', () => {
    const game = makeThreePlayerGame(1);
    game.resize(400, 900);
    const rects = computeZoneRects(3, 400, 900);

    game.onTap(rects[0].x + 50, rects[0].y + 10); // Alara: 1 -> 0, recorded as eliminated
    expect(game.stats).toBeNull();

    game.undo(); // Alara: 0 -> 1

    game.endGame();

    expect(game.ended).toBe(true);
    expect(game.stats?.winnerId).toBe(game.players[0].id);
    expect(game.stats?.eliminationOrder).toEqual([]);
  });

  it('ends manually via endGame, picking the highest-life player as winner', () => {
    const game = makeThreePlayerGame(40);
    game.resize(400, 900);

    game.onTap(50, 310); // Alara upper half (rotated seat, large canvas offset): 40 -> 41

    game.endGame();

    expect(game.ended).toBe(true);
    expect(game.stats?.winnerId).toBe(game.players[0].id);
  });

  it('is a no-op to end an already-ended game', () => {
    const game = makeThreePlayerGame(40);
    game.endGame();
    const stats = game.stats;

    game.endGame();

    expect(game.stats).toEqual(stats);
  });

  it('accumulates time-as-active-player and freezes match duration once ended', () => {
    const game = makeThreePlayerGame(1);
    game.resize(400, 900);
    const rects = computeZoneRects(3, 400, 900);

    game.update(2); // Alara active for 2s
    game.onTap(200, 450); // pass turn to Kess (shared control center; see Game.resize())
    game.update(3); // Kess active for 3s

    game.onTap(rects[0].x + 50, rects[0].y + 10); // eliminate Alara
    game.onTap(rects[1].x + 50, rects[1].y + rects[1].height - 10); // eliminate Kess, Yorion wins

    const stats = game.stats;
    expect(stats).not.toBeNull();
    expect(stats?.durationS).toBeCloseTo(5, 5);
    expect(stats?.activeTimeS[game.players[0].id]).toBeCloseTo(2, 5);
    expect(stats?.activeTimeS[game.players[1].id]).toBeCloseTo(3, 5);

    game.update(10);
    expect(game.stats?.durationS).toBeCloseTo(5, 5);
  });
});
