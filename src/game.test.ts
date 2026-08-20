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
});
