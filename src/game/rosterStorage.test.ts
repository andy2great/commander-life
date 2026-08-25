import { describe, expect, it } from 'vitest';
import { loadLastRoster, saveLastRoster, type StorageLike } from './rosterStorage';
import type { GameConfig, PlayerConfig } from '../game';

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

function makePlayers(count: number): PlayerConfig[] {
  return Array.from({ length: count }, (_, i) => ({ name: `Player ${i + 1}`, color: '#e11d48' }));
}

describe('saveLastRoster / loadLastRoster', () => {
  it('round-trips a saved roster', () => {
    const storage = new MemoryStorage();
    const config = { playerCount: 4, startingLife: 40, players: makePlayers(4) };
    saveLastRoster(storage, config);
    expect(loadLastRoster(storage)).toEqual(config);
  });

  it('drops a startingIndex field if present, since the starting seat is never persisted', () => {
    const storage = new MemoryStorage();
    const config: GameConfig = { playerCount: 3, startingLife: 40, players: makePlayers(3), startingIndex: 2 };
    saveLastRoster(storage, config);
    expect(loadLastRoster(storage)).toEqual({ playerCount: 3, startingLife: 40, players: makePlayers(3) });
  });

  it('returns null when nothing has been saved', () => {
    expect(loadLastRoster(new MemoryStorage())).toBeNull();
  });

  it('returns null for corrupted JSON', () => {
    const storage = new MemoryStorage();
    storage.setItem('commander-life:last-roster', '{not json');
    expect(loadLastRoster(storage)).toBeNull();
  });

  it('returns null when the shape does not match a roster', () => {
    const storage = new MemoryStorage();
    storage.setItem('commander-life:last-roster', JSON.stringify({ foo: 'bar' }));
    expect(loadLastRoster(storage)).toBeNull();
  });

  it('returns null when players.length disagrees with playerCount', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'commander-life:last-roster',
      JSON.stringify({ playerCount: 4, startingLife: 40, players: makePlayers(3) }),
    );
    expect(loadLastRoster(storage)).toBeNull();
  });

  it('returns null when playerCount is out of the supported 3-6 range', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'commander-life:last-roster',
      JSON.stringify({ playerCount: 2, startingLife: 40, players: makePlayers(2) }),
    );
    expect(loadLastRoster(storage)).toBeNull();
  });

  it('never throws when storage.setItem throws (e.g. private-browsing quota)', () => {
    const throwingStorage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    expect(() => saveLastRoster(throwingStorage, { playerCount: 3, startingLife: 40, players: makePlayers(3) })).not.toThrow();
  });

  it('round-trips a saved icon choice per player, including duplicate icons across players', () => {
    const storage = new MemoryStorage();
    const players: PlayerConfig[] = [
      { name: 'Alice', color: '#e11d48', icon: 'star' },
      { name: 'Bob', color: '#14b8a6', icon: 'star' },
      { name: 'Cara', color: '#f59e0b', icon: 'bolt' },
    ];
    const config = { playerCount: 3, startingLife: 40, players };
    saveLastRoster(storage, config);
    expect(loadLastRoster(storage)).toEqual(config);
  });

  it('returns null when a player icon is not one of the known ids', () => {
    const storage = new MemoryStorage();
    const players = [
      { name: 'Alice', color: '#e11d48', icon: 'not-a-real-icon' },
      { name: 'Bob', color: '#14b8a6' },
      { name: 'Cara', color: '#f59e0b' },
    ];
    storage.setItem('commander-life:last-roster', JSON.stringify({ playerCount: 3, startingLife: 40, players }));
    expect(loadLastRoster(storage)).toBeNull();
  });

  it('loads a roster saved before icons existed (icon field absent)', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'commander-life:last-roster',
      JSON.stringify({ playerCount: 3, startingLife: 40, players: makePlayers(3) }),
    );
    expect(loadLastRoster(storage)).toEqual({ playerCount: 3, startingLife: 40, players: makePlayers(3) });
  });
});
