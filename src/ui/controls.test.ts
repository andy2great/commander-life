import { describe, expect, it } from 'vitest';
import { CONTROL_GAP_RATIO, ShortcutControl, SHORTCUT_RADIUS_RATIO, UndoControl, UNDO_RADIUS_RATIO } from './controls';

// Common phone widths this app must stay comfortably tappable on, per #31/#38.
const PHONE_WIDTHS = [360, 390, 414, 430];
// #38: raised from the bare 44px platform minimum to a comfortable target.
const MIN_TOUCH_TARGET_PX = 56;

/** Mirrors Game.resize()'s placement of ShortcutControl beside UndoControl (issue #80). */
function shortcutCenterX(width: number, height: number): number {
  const shortSide = Math.min(width, height);
  return width / 2 + shortSide * UNDO_RADIUS_RATIO + shortSide * CONTROL_GAP_RATIO + shortSide * SHORTCUT_RADIUS_RATIO;
}

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

  it.each(PHONE_WIDTHS)('ShortcutControl hit-circle meets the minimum touch target at %ipx width', (width) => {
    const height = width * 2;
    const control = new ShortcutControl();
    const centerX = shortcutCenterX(width, height);
    control.reflow(width, height, centerX, height / 2);

    expect(control.containsPoint(centerX + SHORTCUT_RADIUS_RATIO * Math.min(width, height) - 1, height / 2)).toBe(
      true,
    );
    expect(SHORTCUT_RADIUS_RATIO * Math.min(width, height) * 2).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  });

  it.each(PHONE_WIDTHS)(
    'places ShortcutControl beside UndoControl without overlapping it at %ipx width',
    (width) => {
      const height = width * 2;
      const undoControl = new UndoControl();
      undoControl.reflow(width, height, height / 2);
      const shortcutControl = new ShortcutControl();
      const centerX = shortcutCenterX(width, height);
      shortcutControl.reflow(width, height, centerX, height / 2);

      // Neither control's own center should fall inside the other's hit-circle.
      expect(undoControl.containsPoint(centerX, height / 2)).toBe(false);
      expect(shortcutControl.containsPoint(width / 2, height / 2)).toBe(false);
      // The shortcut control must stay fully on-canvas at the smallest supported width.
      const shortcutRadius = SHORTCUT_RADIUS_RATIO * Math.min(width, height);
      expect(centerX + shortcutRadius).toBeLessThanOrEqual(width);
    },
  );
});
