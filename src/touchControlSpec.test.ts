// Regression spec for issue #40 (later reworked by #48): pins the exact
// tap/hold/long-press/drag values validated at the playgroup table, as
// documented in docs/concept.md's "Controls" section, in one grouped suite.
// src/game.ts, src/ui/controls.ts, and src/ui/damagePanel.ts each get
// touched by later tickets — this file exists so a change to any of these
// values is a deliberate, visible edit here rather than an incidental side
// effect elsewhere.
import { describe, expect, it } from 'vitest';
import { Game, computeZoneRects } from './game';
import { UndoControl } from './ui/controls';
import { LONG_PRESS_MS } from './ui/damagePanel';

/** Minimal stand-in for CanvasRenderingContext2D covering only what UndoControl.draw() calls. */
function createFakeCtx(): CanvasRenderingContext2D {
  return {
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    arc: () => {},
    clip: () => {},
    moveTo: () => {},
    lineTo: () => {},
    fill: () => {},
    stroke: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
  } as unknown as CanvasRenderingContext2D;
}

describe('docs/concept.md touch-control spec (#40)', () => {
  it('resolves the long-press/drag gesture threshold at ~500ms, per "Long-press own zone (~500ms)"', () => {
    expect(LONG_PRESS_MS).toBe(500);
  });

  it('tapping either half of own zone changes nothing, per "a plain tap on your own zone does nothing" (issue #54)', () => {
    const game = new Game();
    game.resize(400, 800);
    const player = game.players[2];
    const rect = computeZoneRects(game.playerCount, 400, 800)[2];

    game.onTap(rect.x + 10, rect.y + 10); // upper half
    expect(player.life).toBe(40);

    game.onTap(rect.x + 10, rect.y + rect.height - 10); // lower half
    expect(player.life).toBe(40);
  });

  it('shared undo control: tap no longer passes the turn (issue #48)', () => {
    const game = new Game();
    game.resize(400, 800);

    expect(game.isOverUndoControl(200, 400)).toBe(true);
    game.onTap(200, 400);

    expect(game.activeIndex).toBe(0);
  });

  it('active player\'s zone: long-press passes the turn (issue #64)', () => {
    const game = new Game();
    game.resize(400, 800);
    const zoneHeight = 800 / game.playerCount;

    game.passTurnFromZoneLongPress(50, zoneHeight - 10); // seat 0's zone, the active seat

    expect(game.activeIndex).toBe(1);
  });

  it('non-active zone: long-press does not pass the turn (issue #64)', () => {
    const game = new Game();
    game.resize(400, 800);
    const zoneHeight = 800 / game.playerCount;

    game.passTurnFromZoneLongPress(50, zoneHeight * 2 + 10); // seat 2's zone, not active

    expect(game.activeIndex).toBe(0);
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

  it('zone-to-zone drag: starting and ending in the same zone past the move tolerance opens a self-target menu, without changing any totals itself (issue #70)', () => {
    const game = new Game();
    game.resize(400, 800);
    const zoneHeight = 800 / game.playerCount;
    const livesBefore = game.players.map((player) => player.life);

    const drag = game.resolveZoneDrag(50, 10, 60, zoneHeight - 10);

    expect(drag).toEqual({ fromPlayerId: game.players[0].id, toPlayerId: game.players[0].id });
    expect(game.players.map((player) => player.life)).toEqual(livesBefore);
  });

  it('zone-to-zone drag: a same-zone press that never moves past the tolerance is a plain tap, opening no menu (issue #70)', () => {
    const game = new Game();
    game.resize(400, 800);
    const livesBefore = game.players.map((player) => player.life);

    const drag = game.resolveZoneDrag(50, 10, 55, 15); // dx=5, dy=5, well under the 10px tolerance

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
