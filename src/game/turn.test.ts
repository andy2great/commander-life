import { describe, expect, it } from 'vitest';
import { advanceTurn, clockwiseSeatOrder, createTurnState, nextPlayerIndex } from './turn';

const SUPPORTED_PLAYER_COUNTS = [2, 3, 4, 5, 6];

// Raw seat indices (as computeZoneRects lays them out) walked in clockwise
// order around the table for each supported player count — top row
// left-to-right, then bottom row right-to-left (issue #68). 5 players is the
// 2-top/2-bottom/1-left shape from issue #81: raw seats
// [top-left, top-right, bottom-left, bottom-right, left] walk clockwise as
// [0, 1, 3, 2, 4]. 2 players (issue #169) is a single top seat and a single
// bottom seat, so the two are simply adjacent in the loop.
const EXPECTED_CLOCKWISE_ORDER: Record<number, number[]> = {
  2: [0, 1],
  3: [0, 2, 1],
  4: [0, 1, 3, 2],
  5: [0, 1, 3, 2, 4],
  6: [0, 1, 2, 5, 4, 3],
};

describe('clockwiseSeatOrder', () => {
  for (const playerCount of SUPPORTED_PLAYER_COUNTS) {
    it(`walks seats clockwise around the table for ${playerCount} players`, () => {
      expect(clockwiseSeatOrder(playerCount)).toEqual(EXPECTED_CLOCKWISE_ORDER[playerCount]);
    });
  }
});

describe('nextPlayerIndex', () => {
  for (const playerCount of SUPPORTED_PLAYER_COUNTS) {
    it(`advances to the next clockwise seat for ${playerCount} players`, () => {
      const order = EXPECTED_CLOCKWISE_ORDER[playerCount];
      for (let i = 0; i < order.length - 1; i += 1) {
        expect(nextPlayerIndex(order[i], playerCount)).toBe(order[i + 1]);
      }
    });

    it(`wraps from the last clockwise seat back to the first for ${playerCount} players`, () => {
      const order = EXPECTED_CLOCKWISE_ORDER[playerCount];
      expect(nextPlayerIndex(order[order.length - 1], playerCount)).toBe(order[0]);
    });
  }
});

describe('createTurnState', () => {
  it('defaults activeIndex to seat 0', () => {
    expect(createTurnState().activeIndex).toBe(0);
  });

  it('starts at the given seat when a startIndex is passed (issue #126)', () => {
    expect(createTurnState(2)).toEqual({ activeIndex: 2, turnCount: 0, startIndex: 2 });
  });
});

describe('advanceTurn', () => {
  for (const playerCount of SUPPORTED_PLAYER_COUNTS) {
    it(`advances seats in clockwise order and increments the turn counter exactly once per lap for ${playerCount} players`, () => {
      const order = EXPECTED_CLOCKWISE_ORDER[playerCount];
      let state = createTurnState();
      expect(state.activeIndex).toBe(order[0]);

      for (let i = 1; i < order.length; i += 1) {
        state = advanceTurn(state, playerCount);
        expect(state.activeIndex).toBe(order[i]);
        expect(state.turnCount).toBe(0);
      }

      state = advanceTurn(state, playerCount);
      expect(state.activeIndex).toBe(order[0]);
      expect(state.turnCount).toBe(1);

      state = advanceTurn(state, playerCount);
      expect(state.activeIndex).toBe(order[1]);
      expect(state.turnCount).toBe(1);
    });
  }

  it('increments turnCount only after every seat has had a turn when starting from a non-zero seat (issue #146)', () => {
    // 4p clockwise order is [0, 1, 3, 2]; starting at seat 3 the first lap
    // must visit seats 2, 0, and 1 before turnCount increments — not as soon
    // as play cycles past raw seat 0.
    let state = createTurnState(3);
    expect(state).toEqual({ activeIndex: 3, turnCount: 0, startIndex: 3 });

    state = advanceTurn(state, 4); // seat 3 -> 2
    expect(state.activeIndex).toBe(2);
    expect(state.turnCount).toBe(0);

    state = advanceTurn(state, 4); // seat 2 -> 0 (must NOT count as a lap)
    expect(state.activeIndex).toBe(0);
    expect(state.turnCount).toBe(0);

    state = advanceTurn(state, 4); // seat 0 -> 1
    expect(state.activeIndex).toBe(1);
    expect(state.turnCount).toBe(0);

    state = advanceTurn(state, 4); // seat 1 -> 3 (back to the starting seat: lap complete)
    expect(state.activeIndex).toBe(3);
    expect(state.turnCount).toBe(1);

    state = advanceTurn(state, 4); // second lap begins the same way
    expect(state.activeIndex).toBe(2);
    expect(state.turnCount).toBe(1);
  });
});
