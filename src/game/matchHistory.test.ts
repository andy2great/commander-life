import { describe, expect, it } from 'vitest';
import { loadMatchHistory, saveMatchResult, type MatchHistoryEntry, type StorageLike } from './matchHistory';

/** In-memory stand-in for localStorage, so these stay DOM-free unit tests. */
class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

function makeEntry(overrides: Partial<MatchHistoryEntry> = {}): MatchHistoryEntry {
  return {
    playedAt: '2026-08-25T12:00:00.000Z',
    players: ['Alice', 'Bob', 'Carol'],
    winnerName: 'Alice',
    eliminationOrder: ['Carol', 'Bob'],
    ...overrides,
  };
}

describe('saveMatchResult / loadMatchHistory', () => {
  it('round-trips a single saved game', () => {
    const storage = new MemoryStorage();
    const entry = makeEntry();
    saveMatchResult(storage, entry);
    expect(loadMatchHistory(storage)).toEqual([entry]);
  });

  it('lists games most-recent-first', () => {
    const storage = new MemoryStorage();
    const first = makeEntry({ playedAt: '2026-08-25T12:00:00.000Z', winnerName: 'Alice' });
    const second = makeEntry({ playedAt: '2026-08-25T13:00:00.000Z', winnerName: 'Bob' });
    saveMatchResult(storage, first);
    saveMatchResult(storage, second);
    expect(loadMatchHistory(storage)).toEqual([second, first]);
  });

  it('records a null winnerName for a draw (issue #84)', () => {
    const storage = new MemoryStorage();
    const entry = makeEntry({ winnerName: null });
    saveMatchResult(storage, entry);
    expect(loadMatchHistory(storage)).toEqual([entry]);
  });

  it('returns an empty array when nothing has been saved', () => {
    expect(loadMatchHistory(new MemoryStorage())).toEqual([]);
  });

  it('returns an empty array for corrupted JSON', () => {
    const storage = new MemoryStorage();
    storage.setItem('commander-life:match-history', '{not json');
    expect(loadMatchHistory(storage)).toEqual([]);
  });

  it('returns an empty array when the stored value is not an array', () => {
    const storage = new MemoryStorage();
    storage.setItem('commander-life:match-history', JSON.stringify({ foo: 'bar' }));
    expect(loadMatchHistory(storage)).toEqual([]);
  });

  it('drops malformed entries but keeps well-formed ones', () => {
    const storage = new MemoryStorage();
    const good = makeEntry();
    storage.setItem('commander-life:match-history', JSON.stringify([good, { foo: 'bar' }]));
    expect(loadMatchHistory(storage)).toEqual([good]);
  });

  it('never throws when storage.setItem throws (e.g. private-browsing quota)', () => {
    const throwingStorage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    expect(() => saveMatchResult(throwingStorage, makeEntry())).not.toThrow();
  });
});
