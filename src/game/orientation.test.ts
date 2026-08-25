import { describe, expect, it } from 'vitest';
import { isPortraitOrientation } from './orientation';

describe('isPortraitOrientation', () => {
  it('is true when height is greater than width', () => {
    expect(isPortraitOrientation(400, 800)).toBe(true);
  });

  it('is false when width is greater than height', () => {
    expect(isPortraitOrientation(800, 400)).toBe(false);
  });

  it('is false for a square viewport', () => {
    expect(isPortraitOrientation(500, 500)).toBe(false);
  });
});
