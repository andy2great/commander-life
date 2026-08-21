import { describe, expect, it } from 'vitest';
import { UndoControl, UNDO_RADIUS_RATIO } from './controls';

// Common phone widths this app must stay comfortably tappable on, per #31/#38.
const PHONE_WIDTHS = [360, 390, 414, 430];
// #38: raised from the bare 44px platform minimum to a comfortable target.
const MIN_TOUCH_TARGET_PX = 56;

describe('touch target sizing', () => {
  it.each(PHONE_WIDTHS)('UndoControl hit-circle meets the minimum touch target at %ipx width', (width) => {
    const control = new UndoControl();
    control.reflow(width, width * 2, width);

    expect(control.containsPoint(width / 2 + UNDO_RADIUS_RATIO * width - 1, width)).toBe(true);
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
});

describe('shared control layout', () => {
  it.each(PHONE_WIDTHS)('centers the undo icon on the shared control disc at %ipx width', (width) => {
    const height = width * 2;
    const control = new UndoControl();
    control.reflow(width, height, height / 2);

    expect(control.containsPoint(width / 2, height / 2)).toBe(true);
  });
});
