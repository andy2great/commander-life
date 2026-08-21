import { describe, expect, it } from 'vitest';
import { createStatsState, createStatsTrigger } from './stats';

describe('createStatsState', () => {
  it('zeroes every totals record for every player id', () => {
    const state = createStatsState(['p1', 'p2']);

    expect(state).toEqual({
      lifeLost: { p1: 0, p2: 0 },
      lifeGained: { p1: 0, p2: 0 },
      commanderDamageDealt: { p1: 0, p2: 0 },
      commanderDamageReceived: { p1: 0, p2: 0 },
      biggestHit: null,
    });
  });
});

describe('StatsTrigger.recordLifeChange', () => {
  it('adds a positive delta to lifeGained', () => {
    const state = createStatsState(['p1']);
    const stats = createStatsTrigger(state);

    stats.recordLifeChange('p1', 6);

    expect(state.lifeGained.p1).toBe(6);
    expect(state.lifeLost.p1).toBe(0);
  });

  it('adds the absolute value of a negative delta to lifeLost', () => {
    const state = createStatsState(['p1']);
    const stats = createStatsTrigger(state);

    stats.recordLifeChange('p1', -4);

    expect(state.lifeLost.p1).toBe(4);
    expect(state.lifeGained.p1).toBe(0);
  });

  it('accumulates across multiple calls', () => {
    const state = createStatsState(['p1']);
    const stats = createStatsTrigger(state);

    stats.recordLifeChange('p1', -4);
    stats.recordLifeChange('p1', -3);
    stats.recordLifeChange('p1', 2);

    expect(state.lifeLost.p1).toBe(7);
    expect(state.lifeGained.p1).toBe(2);
  });

  it('is a no-op for a zero delta', () => {
    const state = createStatsState(['p1']);
    const stats = createStatsTrigger(state);

    stats.recordLifeChange('p1', 0);

    expect(state.lifeLost.p1).toBe(0);
    expect(state.lifeGained.p1).toBe(0);
  });
});

describe('StatsTrigger.recordHit', () => {
  it('sets the first hit as the biggest hit', () => {
    const state = createStatsState(['p1', 'p2']);
    const stats = createStatsTrigger(state);

    stats.recordHit('p1', 5);

    expect(state.biggestHit).toEqual({ attackerId: 'p1', amount: 5, targetId: null });
  });

  it('replaces the biggest hit when a larger amount lands', () => {
    const state = createStatsState(['p1', 'p2']);
    const stats = createStatsTrigger(state);

    stats.recordHit('p1', 5);
    stats.recordHit('p2', 9);

    expect(state.biggestHit).toEqual({ attackerId: 'p2', amount: 9, targetId: null });
  });

  it('keeps the current biggest hit when a smaller amount lands', () => {
    const state = createStatsState(['p1', 'p2']);
    const stats = createStatsTrigger(state);

    stats.recordHit('p1', 9);
    stats.recordHit('p2', 5);

    expect(state.biggestHit).toEqual({ attackerId: 'p1', amount: 9, targetId: null });
  });

  it('records the target id only when given, for commander damage', () => {
    const state = createStatsState(['p1', 'p2']);
    const stats = createStatsTrigger(state);

    stats.recordHit('p1', 9, 'p2');

    expect(state.biggestHit).toEqual({ attackerId: 'p1', amount: 9, targetId: 'p2' });
  });

  it('ignores a zero or negative amount', () => {
    const state = createStatsState(['p1']);
    const stats = createStatsTrigger(state);

    stats.recordHit('p1', 0);
    stats.recordHit('p1', -3);

    expect(state.biggestHit).toBeNull();
  });
});

describe('StatsTrigger.recordCommanderDamage', () => {
  it('adds the amount to the attacker dealt total and the target received total', () => {
    const state = createStatsState(['p1', 'p2']);
    const stats = createStatsTrigger(state);

    stats.recordCommanderDamage('p1', 'p2', 4);
    stats.recordCommanderDamage('p1', 'p2', 3);

    expect(state.commanderDamageDealt.p1).toBe(7);
    expect(state.commanderDamageReceived.p2).toBe(7);
    expect(state.commanderDamageDealt.p2).toBe(0);
    expect(state.commanderDamageReceived.p1).toBe(0);
  });
});
