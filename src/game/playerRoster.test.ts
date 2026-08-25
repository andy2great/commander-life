import { describe, expect, it } from 'vitest';
import {
  clampStartingIndex,
  defaultNameForSeat,
  movePlayer,
  removePlayerAt,
  resolveDisplayValue,
  resolveSubmittedName,
} from './playerRoster';

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

  it('is a no-op at the minimum player count (2)', () => {
    const players = ['a', 'b'];
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

describe('defaultNameForSeat', () => {
  it('is 1-indexed', () => {
    expect(defaultNameForSeat(0)).toBe('Player 1');
    expect(defaultNameForSeat(3)).toBe('Player 4');
  });
});

describe('resolveDisplayValue', () => {
  it('is blank for an untouched player, regardless of its stored name', () => {
    expect(resolveDisplayValue({ name: 'Player 4' }, true)).toBe('');
  });

  it('is the player name for a touched player', () => {
    expect(resolveDisplayValue({ name: 'Atraxa' }, false)).toBe('Atraxa');
  });
});

describe('resolveSubmittedName', () => {
  it('submits the current positional default for an untouched player', () => {
    expect(resolveSubmittedName({ name: 'Player 4' }, 0, true)).toBe('Player 1');
  });

  it('submits the stored name for a touched player, ignoring its position', () => {
    expect(resolveSubmittedName({ name: 'Atraxa' }, 0, false)).toBe('Atraxa');
  });
});

/**
 * Regression coverage for issue #140: reordering/removing players must not
 * stamp a stale literal name (derived from an old index) onto an untouched
 * field. `untouched` is simulated the way SetupScreen tracks it — a `Set`
 * keyed by player object identity — since `movePlayer`/`removePlayerAt`
 * preserve object identity while changing index, which is exactly the
 * property the fix relies on.
 */
describe('reorder/remove keeps untouched vs. custom-named state correct (issue #140)', () => {
  it('reorder: an untouched player never displays stale text, and its submitted name tracks its new seat', () => {
    const players = [{ name: 'Player 1' }, { name: 'Player 2' }, { name: 'Player 3' }, { name: 'Player 4' }];
    const untouched = new Set(players);

    const reordered = movePlayer(players, 3, 0);

    reordered.forEach((player, index) => {
      expect(resolveDisplayValue(player, untouched.has(player))).toBe('');
      expect(resolveSubmittedName(player, index, untouched.has(player))).toBe(defaultNameForSeat(index));
    });
  });

  it('reorder: a custom-named player keeps its name across the move', () => {
    const custom = { name: 'Atraxa' };
    const players = [{ name: 'Player 1' }, { name: 'Player 2' }, { name: 'Player 3' }, custom];
    const untouched = new Set(players.filter((player) => player !== custom));

    const reordered = movePlayer(players, 3, 0);
    const newIndex = reordered.indexOf(custom);

    expect(resolveDisplayValue(custom, untouched.has(custom))).toBe('Atraxa');
    expect(resolveSubmittedName(custom, newIndex, untouched.has(custom))).toBe('Atraxa');
  });

  it('remove: a remaining untouched player never displays stale text after the shift', () => {
    const players = [{ name: 'Player 1' }, { name: 'Player 2' }, { name: 'Player 3' }, { name: 'Player 4' }];
    const untouched = new Set(players);

    const next = removePlayerAt(players, 0);

    next.forEach((player, index) => {
      expect(resolveDisplayValue(player, untouched.has(player))).toBe('');
      expect(resolveSubmittedName(player, index, untouched.has(player))).toBe(defaultNameForSeat(index));
    });
  });

  it('remove: a custom-named player keeps its name after the shift', () => {
    const custom = { name: 'Atraxa' };
    const players = [{ name: 'Player 1' }, custom, { name: 'Player 3' }, { name: 'Player 4' }];
    const untouched = new Set(players.filter((player) => player !== custom));

    const next = removePlayerAt(players, 0);
    const newIndex = next.indexOf(custom);

    expect(resolveDisplayValue(custom, untouched.has(custom))).toBe('Atraxa');
    expect(resolveSubmittedName(custom, newIndex, untouched.has(custom))).toBe('Atraxa');
  });
});
