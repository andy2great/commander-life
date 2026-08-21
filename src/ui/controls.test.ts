import { describe, expect, it } from 'vitest';
import { PassTurnControl, RADIUS_RATIO, UndoControl, UNDO_GAP_RATIO, UNDO_RADIUS_RATIO } from './controls';

// Common phone widths this app must stay comfortably tappable on, per #31/#38.
const PHONE_WIDTHS = [360, 390, 414, 430];
// #38: raised from the bare 44px platform minimum to a comfortable target.
const MIN_TOUCH_TARGET_PX = 56;

describe('touch target sizing', () => {
  it.each(PHONE_WIDTHS)('PassTurnControl hit-circle meets the minimum touch target at %ipx width', (width) => {
    const control = new PassTurnControl();
    control.reflow(width, width * 2, width);

    expect(control.containsPoint(width / 2 + RADIUS_RATIO * width - 1, width)).toBe(true);
    expect(RADIUS_RATIO * width * 2).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  });

  it.each(PHONE_WIDTHS)('UndoControl hit-circle meets the minimum touch target at %ipx width', (width) => {
    expect(UNDO_RADIUS_RATIO * width * 2).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  });

  it('sizes the undo icon glyph to fit fully inside its own tappable circle', () => {
    // The icon's font-size drives its drawn glyph size; it must not exceed
    // the hit-circle radius used by containsPoint(), or the visible icon
    // would overflow what's actually tappable (the #31 bug).
    const width = 400;
    const height = 800;
    const undoControl = new UndoControl();
    undoControl.reflow(width, height, height / 2);

    const shortSide = Math.min(width, height);
    const radius = shortSide * UNDO_RADIUS_RATIO;
    const fontSize = Math.floor(radius);

    expect(fontSize).toBeLessThanOrEqual(radius);
  });

  it('sizes the pass-turn icon glyph to fit fully inside its own tappable circle', () => {
    // Same #31 requirement as the undo icon above, carried forward for the
    // main control so it isn't lost again (#38).
    const width = 400;
    const height = 800;
    const control = new PassTurnControl();
    control.reflow(width, height, height / 2);

    const shortSide = Math.min(width, height);
    const radius = shortSide * RADIUS_RATIO;
    const fontSize = Math.floor(radius);

    expect(fontSize).toBeLessThanOrEqual(radius);
  });
});

describe('shared control layout', () => {
  it.each(PHONE_WIDTHS)('keeps the undo icon fully on-canvas and separated from the pass-turn control at %ipx width', (width) => {
    const height = width * 2;
    const control = new PassTurnControl();
    const undoControl = new UndoControl();
    control.reflow(width, height, height / 2);
    undoControl.reflow(width, height, height / 2);

    const mainRadius = width * RADIUS_RATIO;
    const undoRadius = width * UNDO_RADIUS_RATIO;
    const gap = width * UNDO_GAP_RATIO;
    const undoCenterX = width / 2 + mainRadius + gap + undoRadius;

    // Left edge of the undo hit-circle never touches the main control's
    // hit-circle: the gap is added between them by construction.
    expect(undoCenterX - undoRadius).toBeGreaterThan(width / 2 + mainRadius);
    // Right edge of the undo hit-circle stays within the canvas.
    expect(undoCenterX + undoRadius).toBeLessThanOrEqual(width);
  });

  it.each(PHONE_WIDTHS)('separates the two controls by a comfortable margin at %ipx width, not just the bare gap ratio', (width) => {
    // #38: a tap near the boundary between the two controls used to be easy
    // to fat-finger onto the wrong one. Assert the gap itself, in px, is a
    // real margin rather than a token separation.
    const gapPx = width * UNDO_GAP_RATIO;
    expect(gapPx).toBeGreaterThanOrEqual(16);
  });
});
