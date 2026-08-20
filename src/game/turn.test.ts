import { describe, expect, it } from 'vitest';
import { advanceTurn, createTurnState, nextPlayerIndex } from './turn';

const SUPPORTED_PLAYER_COUNTS = [3, 4, 5, 6];

describe('nextPlayerIndex', () => {
  for (const playerCount of SUPPORTED_PLAYER_COUNTS) {
    it(`advances seat by seat for ${playerCount} players`, () => {
      for (let seat = 0; seat < playerCount - 1; seat += 1) {
        expect(nextPlayerIndex(seat, playerCount)).toBe(seat + 1);
      }
    });

    it(`wraps from the last seat back to the first for ${playerCount} players`, () => {
      expect(nextPlayerIndex(playerCount - 1, playerCount)).toBe(0);
    });
  }
});

describe('advanceTurn', () => {
  for (const playerCount of SUPPORTED_PLAYER_COUNTS) {
    it(`increments the turn counter exactly once per lap for ${playerCount} players`, () => {
      let state = createTurnState();
      for (let seat = 1; seat < playerCount; seat += 1) {
        state = advanceTurn(state, playerCount);
        expect(state.activeIndex).toBe(seat);
        expect(state.turnCount).toBe(0);
      }

      state = advanceTurn(state, playerCount);
      expect(state.activeIndex).toBe(0);
      expect(state.turnCount).toBe(1);

      state = advanceTurn(state, playerCount);
      expect(state.activeIndex).toBe(1);
      expect(state.turnCount).toBe(1);
    });
  }
});
