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

// Mirrors setupScreen.ts's buildZone, where the real `.setup-zone-content`
// box is explicitly sized to the zone rect's own dimensions minus this
// margin (`contentWidth - 20`/`contentHeight - 20`), regardless of rotation.
const ZONE_CONTENT_MARGIN = 20;

/**
 * Approximate bounding rect of a zone's control cluster, centered in the
 * zone rect. A 90°-rotated zone (the 5-player left-edge seat) swaps the
 * *natural* footprint's width/height, since the controls are rotated with
 * it — but the real `.setup-zone-content` box is always capped at the
 * zone's own rect size (minus a small margin) regardless of rotation, so a
 * narrow column (many players sharing a row) can never have a wider real
 * footprint than the zone that contains it, even though the fixed
 * ZONE_CONTENT_WIDTH/HEIGHT estimate is generous for a typical, unconstrained
 * seat (issue #192 review: applying the fixed estimate uniformly starved
 * maxWidth for 6-8 players on common phone widths).
 */
export function zoneContentRect(rect: ZoneRect): Rect {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const rotated = rect.rotation === 90;
  const naturalWidth = rotated ? ZONE_CONTENT_HEIGHT : ZONE_CONTENT_WIDTH;
  const naturalHeight = rotated ? ZONE_CONTENT_WIDTH : ZONE_CONTENT_HEIGHT;
  const width = Math.min(naturalWidth, Math.max(rect.width - ZONE_CONTENT_MARGIN, 0));
  const height = Math.min(naturalHeight, Math.max(rect.height - ZONE_CONTENT_MARGIN, 0));
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
 * Each zone constrains whichever of `maxWidth`/`maxHeight` it needs less of
 * (see the loop below) — in practice that means the 5-player layout's
 * full-height left-edge seat, whose vertical span always contains the
 * center point, is the only zone that ever constrains `maxWidth`; every
 * ordinary row-grid zone sits well clear of the center vertically and so
 * constrains `maxHeight` instead, once the viewport is short enough for
 * their content bands (around the 25%/75% height marks) to approach the
 * vertical center.
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
    const heightCandidate = 2 * (Math.abs(contentCenterY - centerY) - content.height / 2);

    // Per the AABB non-overlap rule (rectsOverlap), only ONE axis needs to
    // separate the hub from a given zone's content — not both. So when both
    // axes offer separation for a zone (the common case for an ordinary
    // row-grid seat: comfortably clear vertically, and only marginally clear
    // horizontally because a many-column row leaves little horizontal
    // margin), constrain only the less restrictive axis and leave the other
    // one unconstrained by this zone. Applying both unconditionally (as a
    // prior version of this function did) double-constrains every zone and
    // starves maxWidth for 6-8 players on common phone widths, even though
    // those zones are already fully protected by height alone (issue #192
    // review).
    if (widthCandidate > 0 && widthCandidate >= heightCandidate) {
      maxWidth = Math.min(maxWidth, widthCandidate);
    } else if (heightCandidate > 0) {
      maxHeight = Math.min(maxHeight, heightCandidate);
    }
  }

  return {
    maxWidth: Math.max(0, maxWidth),
    maxHeight: Math.max(0, Number.isFinite(maxHeight) ? maxHeight : viewportHeight),
  };
}
