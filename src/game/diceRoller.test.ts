import { describe, expect, it } from 'vitest';
import { flipCoin, rollDie, rollForStartingSeat } from './diceRoller';

describe('rollDie', () => {
  it('maps the lowest rng value to face 1', () => {
    expect(rollDie(20, () => 0)).toBe(1);
  });

  it('maps the highest rng value to the last face', () => {
    expect(rollDie(20, () => 0.999999)).toBe(20);
  });

  it('maps the midpoint to a middle face', () => {
    expect(rollDie(6, () => 0.5)).toBe(4);
  });

  it('stays within [1, sides] across many real rolls', () => {
    for (let i = 0; i < 1000; i += 1) {
      const value = rollDie(20);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(20);
    }
  });

  it('is fair: every face of a d6 turns up at least once over many rolls', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i += 1) {
      seen.add(rollDie(6));
    }
    expect(seen).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });
});

describe('flipCoin', () => {
  it('is heads just below the midpoint', () => {
    expect(flipCoin(() => 0.499999)).toBe('heads');
  });

  it('is tails at or above the midpoint', () => {
    expect(flipCoin(() => 0.5)).toBe('tails');
  });

  it('is fair: both faces turn up over many flips', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      seen.add(flipCoin());
    }
    expect(seen).toEqual(new Set(['heads', 'tails']));
  });
});

describe('rollForStartingSeat', () => {
  it('flips a coin for exactly 2 players: heads picks seat 0', () => {
    expect(rollForStartingSeat(2, () => 0.1)).toBe(0);
  });

  it('flips a coin for exactly 2 players: tails picks seat 1', () => {
    expect(rollForStartingSeat(2, () => 0.9)).toBe(1);
  });

  it('rolls a die sized to the table for more than 2 players', () => {
    expect(rollForStartingSeat(4, () => 0)).toBe(0);
    expect(rollForStartingSeat(4, () => 0.999999)).toBe(3);
  });

  it('stays within [0, playerCount - 1] for every supported table size', () => {
    for (const playerCount of [2, 3, 4, 5, 6]) {
      for (let i = 0; i < 500; i += 1) {
        const seat = rollForStartingSeat(playerCount);
        expect(seat).toBeGreaterThanOrEqual(0);
        expect(seat).toBeLessThan(playerCount);
      }
    }
  });

  it('is fair: every seat is reachable over many rolls, for a representative table size', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i += 1) {
      seen.add(rollForStartingSeat(5));
    }
    expect(seen).toEqual(new Set([0, 1, 2, 3, 4]));
  });
});
