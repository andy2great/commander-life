import { describe, expect, it } from 'vitest';
import { BOARD_THEMES, DEFAULT_BOARD_THEME_ID, getBoardTheme } from './boardTheme';

describe('BOARD_THEMES', () => {
  it('offers at least 3 themes with unique ids', () => {
    expect(BOARD_THEMES.length).toBeGreaterThanOrEqual(3);
    expect(new Set(BOARD_THEMES.map((theme) => theme.id)).size).toBe(BOARD_THEMES.length);
  });

  it('includes the default theme id', () => {
    expect(BOARD_THEMES.some((theme) => theme.id === DEFAULT_BOARD_THEME_ID)).toBe(true);
  });
});

describe('getBoardTheme', () => {
  it('resolves a known id to its theme', () => {
    const theme = BOARD_THEMES[1];
    expect(getBoardTheme(theme.id)).toEqual(theme);
  });

  it('falls back to the default theme for an unknown id', () => {
    expect(getBoardTheme('not-a-real-theme')).toEqual(getBoardTheme(DEFAULT_BOARD_THEME_ID));
  });

  it('falls back to the default theme for undefined', () => {
    expect(getBoardTheme(undefined)).toEqual(getBoardTheme(DEFAULT_BOARD_THEME_ID));
  });
});
