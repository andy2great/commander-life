// Small undo icon at the shared control disc where all zones meet, per
// docs/concept.md's controls section: tap reverts the most recent
// undo-stack action, dimmed when there is nothing to undo. This is the sole
// occupant of the disc now that the pass-turn gesture moved to a long-press
// on the active player's own zone (issue #64) — the old PassTurnControl icon
// this file used to also host is gone.

// 0.079 keeps the hit-circle diameter around ~56-64px (comfortably above the
// bare 44-48px platform minimum) down to the smallest supported phone width
// (~360px); see #38, which raised this from the #31 bare-minimum sizing
// after playtesters kept mis-tapping the center controls.
export const UNDO_RADIUS_RATIO = 0.079;

interface ControlLayout {
  centerX: number;
  centerY: number;
  radius: number;
}

export class UndoControl {
  private layout: ControlLayout = { centerX: 0, centerY: 0, radius: 0 };

  /**
   * Recomputes the icon's position and size for the current canvas
   * dimensions. `centerY` is caller-supplied (rather than always `height /
   * 2`) so it can be snapped to a zone boundary instead of a zone's center
   * — see `Game.resize()`.
   */
  reflow(width: number, height: number, centerY: number): void {
    const shortSide = Math.min(width, height);
    this.layout = {
      centerX: width / 2,
      centerY,
      radius: shortSide * UNDO_RADIUS_RATIO,
    };
  }

  /** True when (x, y) — in the same coordinate space passed to reflow — is over the icon. */
  containsPoint(x: number, y: number): boolean {
    const { centerX, centerY, radius } = this.layout;
    return Math.hypot(x - centerX, y - centerY) <= radius;
  }

  /** `enabled` dims the icon per docs/concept.md when there is nothing to undo. */
  draw(ctx: CanvasRenderingContext2D, enabled: boolean): void {
    const { centerX, centerY, radius } = this.layout;

    ctx.save();
    ctx.globalAlpha = enabled ? 1 : 0.35;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20, 18, 28, 0.85)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#f5f3f7';
    ctx.stroke();

    ctx.fillStyle = '#f5f3f7';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Floor (not round) so the glyph never renders larger than the
    // hit-circle radius — rounding up could push it outside the tappable
    // area again, the #31 bug (#38).
    ctx.font = `${Math.floor(radius)}px system-ui, sans-serif`;
    ctx.fillText('↺', centerX, centerY);

    ctx.restore();
  }
}
