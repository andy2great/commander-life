// Shared center "pass turn" control: a tappable disc that advances the
// active player. Plain circle for now (styling arrives in ticket 7); it
// exposes hit-testing so src/game.ts can route taps without knowing the
// control's shape, and a draw() that only ever receives a context passed in
// by the caller, matching the "only main.ts touches the canvas element" rule.

const RADIUS_RATIO = 0.07;

interface ControlLayout {
  centerX: number;
  centerY: number;
  radius: number;
}

export class PassTurnControl {
  private layout: ControlLayout = { centerX: 0, centerY: 0, radius: 0 };

  /** Recomputes the control's position and size for the current canvas dimensions. */
  reflow(width: number, height: number): void {
    this.layout = {
      centerX: width / 2,
      centerY: height / 2,
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
    ctx.strokeStyle = '#e8ecf5';
    ctx.stroke();

    ctx.fillStyle = '#e8ecf5';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(radius)}px system-ui, sans-serif`;
    ctx.fillText('⟳', centerX, centerY);
  }
}
