import { describe, expect, it } from 'vitest';
import { Game, clamp } from './game';

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

  it('increments life when the upper half of a player zone is tapped', () => {
    const game = new Game();
    game.resize(400, 800);
    const player = game.players[0];
    const zoneHeight = 800 / game.playerCount;

    game.onTap(50, zoneHeight / 2 - 10);

    expect(player.life).toBe(41);
  });

  it('decrements life when the lower half of a player zone is tapped', () => {
    const game = new Game();
    game.resize(400, 800);
    const player = game.players[0];
    const zoneHeight = 800 / game.playerCount;

    game.onTap(50, zoneHeight - 10);

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

  it('pushes an undo action onto the shared stack that reverts a zone life change', () => {
    const game = new Game();
    game.resize(400, 800);
    const player = game.players[0];
    const zoneHeight = 800 / game.playerCount;

    game.onTap(50, zoneHeight / 2 - 10);
    expect(player.life).toBe(41);

    const stack = game.undoStack as unknown as { actions: { undo(): void }[] };
    stack.actions[stack.actions.length - 1].undo();

    expect(player.life).toBe(40);
  });

  it('ramps repeated life changes while a zone tap is held, accelerating after ~600ms', () => {
    const game = new Game();
    game.resize(400, 800);
    const player = game.players[0];
    const zoneHeight = 800 / game.playerCount;

    game.onTap(50, zoneHeight / 2 - 10);
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

  it('spawns a delta popup at the tap location when a zone tap changes life', () => {
    const game = new Game();
    game.resize(400, 800);
    const zoneHeight = 800 / game.playerCount;

    game.onTap(50, zoneHeight / 2 - 10);

    expect(game.popups).toHaveLength(1);
    expect(game.popups[0]).toMatchObject({
      playerId: game.players[0].id,
      x: 50,
      y: zoneHeight / 2 - 10,
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

    game.onTap(50, zoneHeight / 2 - 10);
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

    game.onTap(50, zoneHeight / 2 - 10);
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

    expect(game.isOverControl(200, 450)).toBe(true);
    expect(game.isOverControl(0, 0)).toBe(false);
  });

  it('ends automatically when only one player remains above 0 life, recording elimination order', () => {
    const game = makeThreePlayerGame(1);
    game.resize(400, 900);
    const zoneHeight = 900 / 3;

    game.onTap(50, zoneHeight - 10); // Alara: 1 -> 0
    expect(game.ended).toBe(false);

    game.onTap(50, zoneHeight * 2 - 10); // Kess: 1 -> 0, only Yorion remains
    expect(game.ended).toBe(true);

    expect(game.stats?.winnerId).toBe(game.players[2].id);
    expect(game.stats?.eliminationOrder.map((entry) => entry.playerId)).toEqual([
      game.players[0].id,
      game.players[1].id,
    ]);
  });

  it('ends manually via endGame, picking the highest-life player as winner', () => {
    const game = makeThreePlayerGame(40);
    game.resize(400, 900);

    game.onTap(50, 140); // Alara upper half: 40 -> 41

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
    const zoneHeight = 900 / 3;

    game.update(2); // Alara active for 2s
    game.onTap(200, 450); // pass turn to Kess
    game.update(3); // Kess active for 3s

    game.onTap(50, zoneHeight - 10); // eliminate Alara
    game.onTap(50, zoneHeight * 2 - 10); // eliminate Kess, Yorion wins

    const stats = game.stats;
    expect(stats).not.toBeNull();
    expect(stats?.durationS).toBeCloseTo(5, 5);
    expect(stats?.activeTimeS[game.players[0].id]).toBeCloseTo(2, 5);
    expect(stats?.activeTimeS[game.players[1].id]).toBeCloseTo(3, 5);

    game.update(10);
    expect(game.stats?.durationS).toBeCloseTo(5, 5);
  });
});
