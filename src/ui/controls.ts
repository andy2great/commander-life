// Shared center "pass turn" control: a tappable disc that advances the
// active player. Plain circle for now (styling arrives in ticket 7); it
// exposes hit-testing so src/game.ts can route taps without knowing the
// control's shape, and a draw() that only ever receives a context passed in
// by the caller, matching the "only main.ts touches the canvas element" rule.

// 0.085 keeps the hit-circle diameter around ~56-64px (comfortably above the
// bare 44-48px platform minimum) down to the smallest supported phone width
// (~360px); see #38, which raised this from the #31 bare-minimum sizing
// after playtesters kept mis-tapping the center controls.
export const RADIUS_RATIO = 0.085;

interface ControlLayout {
  centerX: number;
  centerY: number;
  radius: number;
}

export class PassTurnControl {
  private layout: ControlLayout = { centerX: 0, centerY: 0, radius: 0 };

  /**
   * Recomputes the control's position and size for the current canvas
   * dimensions. `centerY` is caller-supplied (rather than always `height /
   * 2`) so it can be snapped to a zone boundary instead of a zone's center
   * — see `Game.resize()`.
   */
  reflow(width: number, height: number, centerY: number): void {
    this.layout = {
      centerX: width / 2,
      centerY,
      radius: Math.min(width, height) * RADIUS_RATIO,
    };
  }

  /** True when (x, y) — in the same coordinate space passed to reflow — is over the control. */
  containsPoint(x: number, y: number): boolean {
    const { centerX, centerY, radius } = this.layout;
    return Math.hypot(x - centerX, y - centerY) <= radius;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const { centerX, centerY, radius } = this.layout;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20, 18, 28, 0.85)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#f5f3f7';
    ctx.stroke();

    ctx.fillStyle = '#f5f3f7';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Floor (not round) so the glyph never renders larger than the
    // hit-circle radius — rounding up could push it outside the tappable
    // area again, the #31 bug (#38).
    ctx.font = `${Math.floor(radius)}px system-ui, sans-serif`;
    ctx.fillText('⟳', centerX, centerY);
  }
}

// Small undo icon beside the shared center control, per docs/concept.md
// controls section: tap reverts the most recent undo-stack action, dimmed
// when there is nothing to undo.
// 0.079 keeps the hit-circle diameter around ~56-64px, matching the
// PassTurnControl bump above; see #38. The gap ratio was widened from 0.03
// to 0.055 so an errant tap near the boundary between the two controls
// doesn't land on the wrong one.
export const UNDO_RADIUS_RATIO = 0.079;
export const UNDO_GAP_RATIO = 0.055;

export class UndoControl {
  private layout: ControlLayout = { centerX: 0, centerY: 0, radius: 0 };

  /** Recomputes the icon's position and size for the current canvas dimensions. `centerY` mirrors PassTurnControl.reflow(). */
  reflow(width: number, height: number, centerY: number): void {
    const shortSide = Math.min(width, height);
    const mainRadius = shortSide * RADIUS_RATIO;
    const radius = shortSide * UNDO_RADIUS_RATIO;
    this.layout = {
      centerX: width / 2 + mainRadius + shortSide * UNDO_GAP_RATIO + radius,
      centerY,
      radius,
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

// Explicit "end game" icon beside the shared center control, mirroring
// UndoControl but on the opposite side. Needed because long-press on the
// center control now passes the turn (issue #48) instead of ending the
// game, so ending the game needs its own discoverable tap target. A plain
// tap on this icon no longer ends the game outright — like the center
// control, it takes a long-press to actually commit (issue #56), so an
// accidental tap on the flag can't end the game.
export class EndGameControl {
  private layout: ControlLayout = { centerX: 0, centerY: 0, radius: 0 };

  /** Recomputes the icon's position and size for the current canvas dimensions. `centerY` mirrors PassTurnControl.reflow(). */
  reflow(width: number, height: number, centerY: number): void {
    const shortSide = Math.min(width, height);
    const mainRadius = shortSide * RADIUS_RATIO;
    const radius = shortSide * UNDO_RADIUS_RATIO;
    this.layout = {
      centerX: width / 2 - mainRadius - shortSide * UNDO_GAP_RATIO - radius,
      centerY,
      radius,
    };
  }

  /** True when (x, y) — in the same coordinate space passed to reflow — is over the icon. */
  containsPoint(x: number, y: number): boolean {
    const { centerX, centerY, radius } = this.layout;
    return Math.hypot(x - centerX, y - centerY) <= radius;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const { centerX, centerY, radius } = this.layout;

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
    ctx.fillText('⚑', centerX, centerY);
  }
}
