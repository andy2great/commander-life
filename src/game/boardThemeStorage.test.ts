import { describe, expect, it } from 'vitest';
import { loadLastBoardTheme, saveLastBoardTheme, type StorageLike } from './boardThemeStorage';
import { BOARD_THEMES } from './boardTheme';

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

describe('saveLastBoardTheme / loadLastBoardTheme', () => {
  it('round-trips a saved theme id', () => {
    const storage = new MemoryStorage();
    saveLastBoardTheme(storage, BOARD_THEMES[2].id);
    expect(loadLastBoardTheme(storage)).toBe(BOARD_THEMES[2].id);
  });

  it('returns null when nothing has been saved', () => {
    expect(loadLastBoardTheme(new MemoryStorage())).toBeNull();
  });

  it('returns null for an unknown theme id', () => {
    const storage = new MemoryStorage();
    storage.setItem('commander-life:board-theme', 'not-a-real-theme');
    expect(loadLastBoardTheme(storage)).toBeNull();
  });

  it('never throws when storage.setItem throws (e.g. private-browsing quota)', () => {
    const throwingStorage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    expect(() => saveLastBoardTheme(throwingStorage, BOARD_THEMES[0].id)).not.toThrow();
  });

  it('never throws when storage.getItem throws', () => {
    const throwingStorage: StorageLike = {
      getItem: () => {
        throw new Error('access denied');
      },
      setItem: () => {},
    };
    expect(() => loadLastBoardTheme(throwingStorage)).not.toThrow();
    expect(loadLastBoardTheme(throwingStorage)).toBeNull();
  });
});
