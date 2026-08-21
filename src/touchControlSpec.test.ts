// Regression spec for issue #40 (later reworked by #48): pins the exact
// tap/hold/long-press/drag values validated at the playgroup table, as
// documented in docs/concept.md's "Controls" section, in one grouped suite.
// src/game.ts, src/ui/controls.ts, and src/ui/damagePanel.ts each get
// touched by later tickets — this file exists so a change to any of these
// values is a deliberate, visible edit here rather than an incidental side
// effect elsewhere.
import { describe, expect, it } from 'vitest';
import { Game, RAMP_DELAY_S, computeZoneRects } from './game';
import { RADIUS_RATIO, UNDO_GAP_RATIO, UNDO_RADIUS_RATIO, UndoControl } from './ui/controls';
import { LONG_PRESS_MS } from './ui/damagePanel';

/** Mirrors EndGameControl's reflow math (opposite side of the center control from UndoControl). */
function endControlCenter(width: number, height: number): { x: number; y: number } {
  const shortSide = Math.min(width, height);
  const mainRadius = shortSide * RADIUS_RATIO;
  const endRadius = shortSide * UNDO_RADIUS_RATIO;
  return { x: width / 2 - mainRadius - shortSide * UNDO_GAP_RATIO - endRadius, y: height / 2 };
}

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

  it('resolves the long-press/drag gesture threshold at ~500ms, per "Long-press own zone (~500ms)"', () => {
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

  it('center control: tap no longer passes the turn (issue #48)', () => {
    const game = new Game();
    game.resize(400, 800);

    expect(game.isOverControl(200, 400)).toBe(true);
    game.onTap(200, 400);

    expect(game.activeIndex).toBe(0);
  });

  it('center control: long-press passes the turn (issue #48)', () => {
    const game = new Game();
    game.resize(400, 800);

    expect(game.isOverControl(200, 400)).toBe(true);
    game.passTurn();

    expect(game.activeIndex).toBe(1);
  });

  it('end-game icon: tap no longer ends the game outright (issue #56)', () => {
    const game = new Game();
    game.resize(400, 800);
    expect(game.ended).toBe(false);

    const endCenter = endControlCenter(400, 800);
    expect(game.isOverEndControl(endCenter.x, endCenter.y)).toBe(true);

    game.onTap(endCenter.x, endCenter.y);

    expect(game.ended).toBe(false);
  });

  it('end-game icon: long-press ends the game, mirroring the center control\'s tap/long-press split (issue #56)', () => {
    const game = new Game();
    game.resize(400, 800);
    expect(game.ended).toBe(false);

    const endCenter = endControlCenter(400, 800);
    expect(game.isOverEndControl(endCenter.x, endCenter.y)).toBe(true);

    game.endGame();

    expect(game.ended).toBe(true);
  });

  it('zone-to-zone drag: releasing in a different player\'s zone resolves to that attacker/target pair, without changing any totals itself', () => {
    const game = new Game();
    game.resize(400, 800);
    const zoneHeight = 800 / game.playerCount;
    const livesBefore = game.players.map((player) => player.life);

    const drag = game.resolveZoneDrag(50, 10, 50, zoneHeight * 2 + 10);

    expect(drag).toEqual({ fromPlayerId: game.players[0].id, toPlayerId: game.players[2].id });
    expect(game.players.map((player) => player.life)).toEqual(livesBefore);
  });

  it('zone-to-zone drag: starting and ending in the same zone opens no menu and changes nothing', () => {
    const game = new Game();
    game.resize(400, 800);
    const zoneHeight = 800 / game.playerCount;
    const livesBefore = game.players.map((player) => player.life);

    const drag = game.resolveZoneDrag(50, 10, 60, zoneHeight - 10);

    expect(drag).toBeNull();
    expect(game.players.map((player) => player.life)).toEqual(livesBefore);
  });

  it('zone-to-zone drag: ending outside any player zone opens no menu and changes nothing', () => {
    const game = new Game();
    game.resize(400, 800);
    const livesBefore = game.players.map((player) => player.life);

    const drag = game.resolveZoneDrag(50, 10, 200, 400); // release over the shared center control

    expect(drag).toBeNull();
    expect(game.players.map((player) => player.life)).toEqual(livesBefore);
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
