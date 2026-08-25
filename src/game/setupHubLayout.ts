// Pure, DOM-free geometry for the setup screen's shared center hub (issue
// #192): the hub is absolutely positioned dead-center over the per-seat
// zone grid (src/ui/setupScreen.ts), so on short viewports or the 5-player
// layout (whose left-edge seat spans the full canvas height, right through
// the hub's own center point) its natural content size can grow into a
// zone's controls and swallow taps meant for them. This module computes the
// largest width/height the hub can render at, centered on screen, without
// reaching into any zone's approximate control-cluster footprint — kept
// DOM-free so it's unit-testable per CLAUDE.md, mirroring playerRoster.ts.

import { computeZoneRects, type ZoneRect } from '../game';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Approximate footprint of a zone's control cluster (name field, color
 * swatches, start/remove buttons, two-commanders toggle) in its unrotated
 * orientation, derived from the fixed control sizes in setupScreen.ts's
 * injected stylesheet: a name row up to ~260px wide (160px name field +
 * two 44px buttons + gaps), stacked above a swatch row and the commander
 * toggle for a total natural height of ~130px, each with some margin.
 * These are deliberately generous (larger than the real rendered controls)
 * so the hub-sizing math below stays conservative — it never overlaps a
 * zone's real controls, even though it may reserve a little more space
 * than strictly necessary.
 */
export const ZONE_CONTENT_WIDTH = 280;
export const ZONE_CONTENT_HEIGHT = 150;

/**
 * Approximate bounding rect of a zone's control cluster, centered in the
 * zone rect. A 90°-rotated zone (the 5-player left-edge seat) swaps the
 * footprint's width/height, since the controls are rotated with it.
 */
export function zoneContentRect(rect: ZoneRect): Rect {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const rotated = rect.rotation === 90;
  const width = rotated ? ZONE_CONTENT_HEIGHT : ZONE_CONTENT_WIDTH;
  const height = rotated ? ZONE_CONTENT_WIDTH : ZONE_CONTENT_HEIGHT;
  return { x: centerX - width / 2, y: centerY - height / 2, width, height };
}

/** True if two axis-aligned rects share any area (touching edges don't count as overlap). */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

// Matches the static `.setup-hub` width rule in setupScreen.ts's injected
// stylesheet — the natural/preferred size the hub uses when no zone forces
// it smaller.
const HUB_PREFERRED_WIDTH = 240;
const HUB_PREFERRED_WIDTH_VIEWPORT_RATIO = 0.78;

export interface SetupHubMaxSize {
  maxWidth: number;
  maxHeight: number;
}

/**
 * Largest width/height the setup hub can render at — centered on screen,
 * same as its CSS `top: 50%; left: 50%` placement — without its bounding
 * box reaching into any player zone's control-cluster footprint (issue
 * #192). Callers apply this as a `max-width`/`max-height` cap (paired with
 * `overflow-y: auto`, the same `--overlay-max-h` pattern statsScreen.ts and
 * the other overlays use) rather than a forced size, so the hub still
 * shrinks to fit its natural content when that's smaller than the cap.
 *
 * Only the 5-player layout's full-height left-edge seat ever constrains
 * `maxWidth`: every other zone's control cluster sits comfortably clear of
 * the shared center point horizontally. `maxHeight` is constrained by
 * every player count's top/bottom-row zones once the viewport is short
 * enough for their content bands (around the 25%/75% height marks) to
 * approach the vertical center.
 */
export function computeSetupHubMaxSize(playerCount: number, viewportWidth: number, viewportHeight: number): SetupHubMaxSize {
  const centerX = viewportWidth / 2;
  const centerY = viewportHeight / 2;

  let maxWidth = Math.min(HUB_PREFERRED_WIDTH, viewportWidth * HUB_PREFERRED_WIDTH_VIEWPORT_RATIO);
  let maxHeight = Infinity;

  for (const rect of computeZoneRects(playerCount, viewportWidth, viewportHeight)) {
    const content = zoneContentRect(rect);
    const contentCenterX = content.x + content.width / 2;
    const contentCenterY = content.y + content.height / 2;

    // A zone's content can only be avoided along an axis where the hub's
    // center point falls outside the content's span on that axis — e.g.
    // the 5-player left seat's content spans the full canvas height, so
    // its vertical span always contains the center point and only the
    // horizontal axis can keep the hub clear of it.
    const widthCandidate = 2 * (Math.abs(contentCenterX - centerX) - content.width / 2);
    if (widthCandidate > 0) {
      maxWidth = Math.min(maxWidth, widthCandidate);
    }

    const heightCandidate = 2 * (Math.abs(contentCenterY - centerY) - content.height / 2);
    if (heightCandidate > 0) {
      maxHeight = Math.min(maxHeight, heightCandidate);
    }
  }

  return {
    maxWidth: Math.max(0, maxWidth),
    maxHeight: Math.max(0, Number.isFinite(maxHeight) ? maxHeight : viewportHeight),
  };
}
