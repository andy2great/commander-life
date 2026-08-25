import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAYER_ICON, defaultIconForSeat, isPlayerIconId, PLAYER_ICON_IDS } from './playerIcons';

describe('PLAYER_ICON_IDS', () => {
  it('offers more than one option', () => {
    expect(PLAYER_ICON_IDS.length).toBeGreaterThan(1);
  });

  it('has no duplicate ids', () => {
    expect(new Set(PLAYER_ICON_IDS).size).toBe(PLAYER_ICON_IDS.length);
  });
});

describe('defaultIconForSeat', () => {
  it('assigns the first icon to seat 0', () => {
    expect(defaultIconForSeat(0)).toBe(DEFAULT_PLAYER_ICON);
  });

  it('cycles through the icon set for seats beyond its length', () => {
    expect(defaultIconForSeat(PLAYER_ICON_IDS.length)).toBe(PLAYER_ICON_IDS[0]);
    expect(defaultIconForSeat(PLAYER_ICON_IDS.length + 1)).toBe(PLAYER_ICON_IDS[1]);
  });
});

describe('isPlayerIconId', () => {
  it('accepts every known icon id', () => {
    for (const icon of PLAYER_ICON_IDS) {
      expect(isPlayerIconId(icon)).toBe(true);
    }
  });

  it('rejects unknown strings and non-strings', () => {
    expect(isPlayerIconId('not-an-icon')).toBe(false);
    expect(isPlayerIconId(42)).toBe(false);
    expect(isPlayerIconId(null)).toBe(false);
    expect(isPlayerIconId(undefined)).toBe(false);
  });
});
