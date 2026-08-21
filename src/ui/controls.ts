// Small undo icon at the shared control disc where all zones meet, per
// docs/concept.md's controls section: tap reverts the most recent
// undo-stack action, dimmed when there is nothing to undo. It shares the
// disc with ShortcutControl (issue #80, board-wide damage shortcuts) — the
// old PassTurnControl icon this file used to also host is gone (#64).

// 0.079 keeps the hit-circle diameter around ~56-64px (comfortably above the
// bare 44-48px platform minimum) down to the smallest supported phone width
// (~360px); see #38, which raised this from the #31 bare-minimum sizing
// after playtesters kept mis-tapping the center controls.
export const UNDO_RADIUS_RATIO = 0.079;

// ShortcutControl (issue #80) matches UndoControl's touch-target sizing —
// same #38 rationale applies to both icons on the shared disc.
export const SHORTCUT_RADIUS_RATIO = UNDO_RADIUS_RATIO;

// PauseControl (issue #97) matches UndoControl's touch-target sizing — same
// #38 rationale applies to every icon on the shared disc.
export const PAUSE_RADIUS_RATIO = UNDO_RADIUS_RATIO;

// Gap between the two center-disc controls' edges, relative to the canvas's
// short side, so they read as two distinct tappable icons rather than one
// blob at the smallest supported phone width.
export const CONTROL_GAP_RATIO = 0.02;

interface ControlLayout {
  centerX: number;
  centerY: number;
  radius: number;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Curved-arrow "undo" glyph (docs/concept.md: "vector-drawn with canvas path
 * calls — no icon fonts or bitmap images"), replacing the `↺` text glyph
 * (issue #122). An open circular arc plus a chevron arrowhead at its
 * trailing end, both stroked.
 */
function drawUndoGlyph(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number): void {
  const r = radius * 0.42;
  const startAngle = degToRad(-25);
  const endAngle = degToRad(215);

  ctx.lineWidth = Math.max(radius * 0.16, 1.5);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.arc(centerX, centerY, r, startAngle, endAngle, false);
  ctx.stroke();

  const tipX = centerX + r * Math.cos(endAngle);
  const tipY = centerY + r * Math.sin(endAngle);
  const backAngle = endAngle + Math.PI / 2 + Math.PI;
  const headLen = radius * 0.34;
  const spread = 0.5;

  ctx.beginPath();
  ctx.moveTo(tipX + headLen * Math.cos(backAngle - spread), tipY + headLen * Math.sin(backAngle - spread));
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(tipX + headLen * Math.cos(backAngle + spread), tipY + headLen * Math.sin(backAngle + spread));
  ctx.stroke();
}

/**
 * Lightning-bolt "shortcut" glyph, replacing the `⚡` text glyph (issue
 * #122). Points are the classic zap-bolt outline, normalized to a
 * roughly ±10 unit box and scaled/filled around the control's center —
 * the same filled-path approach as `OPTION_ICONS` in boardShortcutMenu.ts.
 */
const SHORTCUT_BOLT_POINTS: ReadonlyArray<readonly [number, number]> = [
  [1, -10],
  [-9, 2],
  [0, 2],
  [-1, 10],
  [9, -2],
  [0, -2],
];

function drawShortcutGlyph(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number): void {
  const scale = (radius * 0.85) / 12;

  ctx.beginPath();
  SHORTCUT_BOLT_POINTS.forEach(([x, y], index) => {
    const px = centerX + x * scale;
    const py = centerY + y * scale;
    if (index === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  });
  ctx.closePath();
  ctx.fill();
}

/** Draws one filled bar (a closed rectangle subpath) for the pause glyph. */
function drawPauseBar(ctx: CanvasRenderingContext2D, x: number, top: number, width: number, bottom: number): void {
  ctx.moveTo(x, top);
  ctx.lineTo(x + width, top);
  ctx.lineTo(x + width, bottom);
  ctx.lineTo(x, bottom);
  ctx.closePath();
}

/**
 * Pause/resume glyph, replacing the `⏸`/`▶` text glyphs (issue #122): two
 * filled bars when running, a filled triangle when paused (matching the
 * original glyph swap based on `paused`).
 */
function drawPauseGlyph(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  paused: boolean,
): void {
  ctx.beginPath();
  if (paused) {
    const size = radius * 0.55;
    ctx.moveTo(centerX - size * 0.5, centerY - size * 0.75);
    ctx.lineTo(centerX - size * 0.5, centerY + size * 0.75);
    ctx.lineTo(centerX + size * 0.75, centerY);
    ctx.closePath();
  } else {
    const barWidth = radius * 0.22;
    const barHeight = radius * 0.85;
    const gap = radius * 0.22;
    const top = centerY - barHeight / 2;
    const bottom = centerY + barHeight / 2;
    drawPauseBar(ctx, centerX - gap / 2 - barWidth, top, barWidth, bottom);
    drawPauseBar(ctx, centerX + gap / 2, top, barWidth, bottom);
  }
  ctx.fill();
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
    ctx.strokeStyle = '#f5f3f7';
    drawUndoGlyph(ctx, centerX, centerY, radius);

    ctx.restore();
  }
}

/**
 * Shortcut icon at the shared control disc (issue #80): tap opens
 * BoardShortcutMenu, offering board-wide damage actions ("damage each
 * opponent" / "damage all players") scoped to the active player. Placed by
 * the caller (see `Game.resize()`) just clear of UndoControl's hit-circle,
 * rather than sharing its centerX, so both remain independently tappable.
 */
export class ShortcutControl {
  private layout: ControlLayout = { centerX: 0, centerY: 0, radius: 0 };

  /** `centerX`/`centerY` are caller-supplied so this control can sit beside UndoControl rather than always centered on the canvas. */
  reflow(width: number, height: number, centerX: number, centerY: number): void {
    const shortSide = Math.min(width, height);
    this.layout = {
      centerX,
      centerY,
      radius: shortSide * SHORTCUT_RADIUS_RATIO,
    };
  }

  /** True when (x, y) — in the same coordinate space passed to reflow — is over the icon. */
  containsPoint(x: number, y: number): boolean {
    const { centerX, centerY, radius } = this.layout;
    return Math.hypot(x - centerX, y - centerY) <= radius;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const { centerX, centerY, radius } = this.layout;

    ctx.save();

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20, 18, 28, 0.85)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#f5f3f7';
    ctx.stroke();

    ctx.fillStyle = '#f5f3f7';
    drawShortcutGlyph(ctx, centerX, centerY, radius);

    ctx.restore();
  }
}

/**
 * Pause icon at the shared control disc (issue #97): tap freezes the turn
 * timer and match duration and disables gameplay inputs; tapping again
 * resumes from exactly where they left off. Placed by the caller (see
 * `Game.resize()`) just clear of UndoControl's hit-circle, mirroring
 * ShortcutControl on the opposite side.
 */
export class PauseControl {
  private layout: ControlLayout = { centerX: 0, centerY: 0, radius: 0 };

  /** `centerX`/`centerY` are caller-supplied so this control can sit beside UndoControl rather than always centered on the canvas. */
  reflow(width: number, height: number, centerX: number, centerY: number): void {
    const shortSide = Math.min(width, height);
    this.layout = {
      centerX,
      centerY,
      radius: shortSide * PAUSE_RADIUS_RATIO,
    };
  }

  /** True when (x, y) — in the same coordinate space passed to reflow — is over the icon. */
  containsPoint(x: number, y: number): boolean {
    const { centerX, centerY, radius } = this.layout;
    return Math.hypot(x - centerX, y - centerY) <= radius;
  }

  /** `paused` swaps the glyph between pause (two bars) and resume (a triangle). */
  draw(ctx: CanvasRenderingContext2D, paused: boolean): void {
    const { centerX, centerY, radius } = this.layout;

    ctx.save();

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20, 18, 28, 0.85)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#f5f3f7';
    ctx.stroke();

    ctx.fillStyle = '#f5f3f7';
    drawPauseGlyph(ctx, centerX, centerY, radius, paused);

    ctx.restore();
  }
}
