import { describe, expect, it } from 'vitest';
import { clampStartingIndex, movePlayer, removePlayerAt } from './playerRoster';

describe('movePlayer', () => {
  it('moves an item forward, shifting the items in between back', () => {
    expect(movePlayer(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves an item backward, shifting the items in between forward', () => {
    expect(movePlayer(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('is a no-op when fromIndex equals toIndex', () => {
    const players = ['a', 'b', 'c'];
    expect(movePlayer(players, 1, 1)).toBe(players);
  });

  it('is a no-op for an out-of-range index', () => {
    const players = ['a', 'b', 'c'];
    expect(movePlayer(players, 0, 5)).toBe(players);
    expect(movePlayer(players, -1, 1)).toBe(players);
  });

  it('does not mutate the input array', () => {
    const players = ['a', 'b', 'c'];
    movePlayer(players, 0, 2);
    expect(players).toEqual(['a', 'b', 'c']);
  });
});

describe('removePlayerAt', () => {
  it('removes the item at the given index', () => {
    expect(removePlayerAt(['a', 'b', 'c', 'd'], 1)).toEqual(['a', 'c', 'd']);
  });

  it('is a no-op at the minimum player count (3)', () => {
    const players = ['a', 'b', 'c'];
    expect(removePlayerAt(players, 0)).toBe(players);
  });

  it('is a no-op for an out-of-range index', () => {
    const players = ['a', 'b', 'c', 'd'];
    expect(removePlayerAt(players, 4)).toBe(players);
    expect(removePlayerAt(players, -1)).toBe(players);
  });

  it('does not mutate the input array', () => {
    const players = ['a', 'b', 'c', 'd'];
    removePlayerAt(players, 1);
    expect(players).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('clampStartingIndex', () => {
  it('returns the index unchanged when it is in range', () => {
    expect(clampStartingIndex(2, 4)).toBe(2);
  });

  it('defaults to 0 when the index is negative', () => {
    expect(clampStartingIndex(-1, 4)).toBe(0);
  });

  it('defaults to 0 when the index is at or past playerCount (e.g. the chosen starter was removed)', () => {
    expect(clampStartingIndex(4, 4)).toBe(0);
    expect(clampStartingIndex(9, 4)).toBe(0);
  });

  it('defaults to 0 for a non-integer index', () => {
    expect(clampStartingIndex(1.5, 4)).toBe(0);
  });
});
