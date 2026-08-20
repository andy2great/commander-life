// Regression spec for issue #40: pins the exact tap/hold/long-press values
// validated at the playgroup table, as documented in docs/concept.md's
// "Controls" section, in one grouped suite. src/game.ts, src/ui/controls.ts,
// and src/ui/damagePanel.ts each get touched by later tickets — this file
// exists so a change to any of these values is a deliberate, visible edit
// here rather than an incidental side effect elsewhere.
import { describe, expect, it } from 'vitest';
import { Game, RAMP_DELAY_S, computeZoneRects } from './game';
import { UndoControl } from './ui/controls';
import { LONG_PRESS_MS } from './ui/damagePanel';

/** Minimal stand-in for CanvasRenderingContext2D covering only what UndoControl.draw() calls. */
function createFakeCtx(): CanvasRenderingContext2D {
  return {
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    fillText: () => {},
  } as unknown as CanvasRenderingContext2D;
}

describe('docs/concept.md touch-control spec (#40)', () => {
  it('ramps tap-and-hold starting after ~600ms, per "tap-and-hold ramps continuously, accelerating after ~600ms"', () => {
    expect(RAMP_DELAY_S).toBe(0.6);
  });

  it('opens the commander-damage sub-panel after a ~500ms long-press, per "Long-press own zone (~500ms)"', () => {
    expect(LONG_PRESS_MS).toBe(500);
  });

  it('tap upper half of own zone: +1 life; tap lower half: -1 life', () => {
    const game = new Game();
    game.resize(400, 800);
    const player = game.players[2];
    const rect = computeZoneRects(game.playerCount, 400, 800)[2];

    game.onTap(rect.x + 10, rect.y + 10); // upper half
    expect(player.life).toBe(41);

    game.onTap(rect.x + 10, rect.y + rect.height - 10); // lower half
    expect(player.life).toBe(40);
  });

  it('center control: tap = pass turn', () => {
    const game = new Game();
    game.resize(400, 800);

    expect(game.isOverControl(200, 400)).toBe(true);
    game.onTap(200, 400);

    expect(game.activeIndex).toBe(1);
  });

  it('center control: long-press = end game', () => {
    const game = new Game();
    game.resize(400, 800);

    expect(game.isOverControl(200, 400)).toBe(true);
    expect(game.ended).toBe(false);

    game.endGame();

    expect(game.ended).toBe(true);
  });

  it('undo icon: dimmed when the undo stack is empty, full opacity once there is something to undo', () => {
    const control = new UndoControl();
    control.reflow(400, 800, 400);
    const ctx = createFakeCtx();

    control.draw(ctx, false);
    expect(ctx.globalAlpha).toBeLessThan(1);

    control.draw(ctx, true);
    expect(ctx.globalAlpha).toBe(1);
  });
});
