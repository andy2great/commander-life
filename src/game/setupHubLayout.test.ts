import { describe, expect, it } from 'vitest';
import { MAX_PLAYER_COUNT, MIN_PLAYER_COUNT, computeZoneRects } from '../game';
import { computeSetupHubMaxSize, rectsOverlap, zoneContentRect, type Rect } from './setupHubLayout';

function hubRect(playerCount: number, width: number, height: number): Rect {
  const { maxWidth, maxHeight } = computeSetupHubMaxSize(playerCount, width, height);
  return { x: width / 2 - maxWidth / 2, y: height / 2 - maxHeight / 2, width: maxWidth, height: maxHeight };
}

/** Asserts the hub, sized via computeSetupHubMaxSize, never overlaps any zone's approximate control-cluster footprint (issue #192). */
function expectHubClearsEveryZone(playerCount: number, width: number, height: number): void {
  const hub = hubRect(playerCount, width, height);
  for (const rect of computeZoneRects(playerCount, width, height)) {
    expect(rectsOverlap(hub, zoneContentRect(rect))).toBe(false);
  }
}

// Common phone CSS widths, reused across tests below (issue #192 review: the
// prior "typical viewport" test only exercised width=390, which let a
// width-collapse regression for 6-8 players at other common widths, e.g.
// 430, slip through unnoticed).
const COMMON_PHONE_WIDTHS = [320, 360, 375, 390, 414, 430];

// A hub smaller than this on either axis can no longer fit its own controls
// (44px buttons, steppers, the Start Game CTA) usably — regression guard for
// issue #192's review defect, where a fixed content-width estimate applied
// uniformly to every zone collapsed maxWidth to a 6.7-42.5px sliver for 6-8
// players at common phone widths (390, 430) even though nothing was close to
// overlapping. Comfortably below the tightest *legitimate* squeeze (the
// 5-player layout, ~120-150px) so it only fails on a real regression.
const MIN_USABLE_HUB_SIZE = 100;

describe('computeSetupHubMaxSize', () => {
  // The 5-player layout's full-height left-edge seat sits at the exact
  // same vertical center as the hub (previously the tightest fit, issue
  // #192) — only a width cap, not a height cap, can keep the hub clear of
  // it, across a range of common phone widths.
  it('keeps the hub clear of every zone for the 5-player layout across common phone widths', () => {
    for (const width of COMMON_PHONE_WIDTHS) {
      expectHubClearsEveryZone(5, width, 800);
    }
  });

  // On a short viewport, the hub's natural (uncapped) content height would
  // reach the 25%/75% content bands every other player count's top/bottom
  // row zones sit in.
  it('keeps the hub clear of every zone on a short viewport (~600-650px tall)', () => {
    for (const height of [600, 620, 650]) {
      for (let playerCount = MIN_PLAYER_COUNT; playerCount <= MAX_PLAYER_COUNT; playerCount += 1) {
        expectHubClearsEveryZone(playerCount, 390, height);
      }
    }
  });

  it('keeps the hub clear of every zone at every supported player count across common phone widths on a typical viewport', () => {
    for (const width of COMMON_PHONE_WIDTHS) {
      for (let playerCount = MIN_PLAYER_COUNT; playerCount <= MAX_PLAYER_COUNT; playerCount += 1) {
        expectHubClearsEveryZone(playerCount, width, 844);
      }
    }
  });

  // Regression guard (issue #192 review) for the width-collapse defect: a
  // fixed, uniformly-applied content-width estimate let far-but-narrow
  // columns (6-8 players, whose row-grid has 3-4 columns) spuriously starve
  // maxWidth down to a 6.7-42.5px sliver at common phone widths, even though
  // `expectHubClearsEveryZone`'s non-overlap check alone couldn't catch it
  // (a trivially tiny hub always "clears" every zone).
  it('never shrinks the hub below a usable size at any supported player count across common phone widths', () => {
    for (const width of COMMON_PHONE_WIDTHS) {
      for (let playerCount = MIN_PLAYER_COUNT; playerCount <= MAX_PLAYER_COUNT; playerCount += 1) {
        const { maxWidth, maxHeight } = computeSetupHubMaxSize(playerCount, width, 844);
        expect(maxWidth).toBeGreaterThanOrEqual(MIN_USABLE_HUB_SIZE);
        expect(maxHeight).toBeGreaterThanOrEqual(MIN_USABLE_HUB_SIZE);
      }
    }
  });
});

describe('zoneContentRect', () => {
  it('swaps the footprint for a 90°-rotated zone', () => {
    const rect = { x: 0, y: 0, width: 100, height: 400, rotation: 90 as const };
    const content = zoneContentRect(rect);
    expect(content.width).toBeLessThan(content.height);
  });

  it('keeps the footprint wide-not-tall for an unrotated zone', () => {
    const rect = { x: 0, y: 0, width: 400, height: 100, rotation: 0 as const };
    const content = zoneContentRect(rect);
    expect(content.width).toBeGreaterThan(content.height);
  });
});

describe('rectsOverlap', () => {
  it('detects overlapping rects', () => {
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
  });

  it('does not flag disjoint rects', () => {
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 20, width: 10, height: 10 })).toBe(false);
  });

  it('does not flag rects that only touch edges', () => {
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
  });
});
