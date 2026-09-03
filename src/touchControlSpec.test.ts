// Regression spec for issue #40 (later reworked by #48): pins the exact
// tap/hold/long-press/drag values validated at the playgroup table, as
// documented in docs/concept.md's "Controls" section, in one grouped suite.
// src/game.ts, src/ui/controls.ts, and src/ui/damagePanel.ts each get
// touched by later tickets — this file exists so a change to any of these
// values is a deliberate, visible edit here rather than an incidental side
// effect elsewhere.
import { describe, expect, it, vi } from 'vitest';
import { Game, computeZoneRects } from './game';
import { CONTROL_GAP_RATIO, PAUSE_RADIUS_RATIO, SHORTCUT_RADIUS_RATIO, UNDO_RADIUS_RATIO, UndoControl } from './ui/controls';
import { attachTapAndLongPress, LONG_PRESS_MS, type TapGestureHandlers } from './ui/damagePanel';

// Minimal addEventListener/removeEventListener stand-in so attachTapAndLongPress
// can be exercised without a DOM (vitest here runs with environment: 'node'),
// mirroring the same pattern ui/damagePanel.test.ts uses for the gesture
// engine itself. Doubles as a stand-in for a DOM button layered over the
// board (issue #221's third acceptance criterion), since from the gesture
// engine's point of view a canvas and a DOM element are both just an
// addEventListener/removeEventListener target.
class FakeElement {
  private readonly listeners = new Map<string, Set<(event: PointerEvent) => void>>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener as (event: PointerEvent) => void);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.get(type)?.delete(listener as (event: PointerEvent) => void);
  }

  dispatch(type: string, event: Partial<PointerEvent>): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as PointerEvent);
    }
  }
}

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

describe('shared control disc hit-circle boundary: no ambiguous gap to zone handling (issue #221)', () => {
  const width = 400;
  const height = 800;
  const shortSide = Math.min(width, height);
  const centerX = width / 2;
  const centerY = height / 2;
  const undoRadius = shortSide * UNDO_RADIUS_RATIO;
  const shortcutRadius = shortSide * SHORTCUT_RADIUS_RATIO;
  const pauseRadius = shortSide * PAUSE_RADIUS_RATIO;
  const gap = shortSide * CONTROL_GAP_RATIO;
  // Mirrors Game.resize()'s placement of ShortcutControl/PauseControl beside UndoControl.
  const shortcutCenterX = centerX + undoRadius + gap + shortcutRadius;
  const pauseCenterX = centerX - undoRadius - gap - pauseRadius;

  it('Undo: a tap just inside the hit-circle registers on the control; a tap just outside falls through to the zone beneath it', () => {
    const game = new Game();
    game.resize(width, height);

    expect(game.isOverUndoControl(centerX, centerY + undoRadius - 1)).toBe(true);
    expect(game.onLongPress(centerX, centerY + undoRadius - 1)).toBeNull();

    expect(game.isOverUndoControl(centerX, centerY + undoRadius + 1)).toBe(false);
    expect(game.onLongPress(centerX, centerY + undoRadius + 1)).not.toBeNull();
  });

  it('Shortcut: a tap just inside the hit-circle registers on the control; a tap just outside falls through to the zone beneath it', () => {
    const game = new Game();
    game.resize(width, height);

    expect(game.isOverShortcutControl(shortcutCenterX, centerY + shortcutRadius - 1)).toBe(true);
    expect(game.onLongPress(shortcutCenterX, centerY + shortcutRadius - 1)).toBeNull();

    expect(game.isOverShortcutControl(shortcutCenterX, centerY + shortcutRadius + 1)).toBe(false);
    expect(game.onLongPress(shortcutCenterX, centerY + shortcutRadius + 1)).not.toBeNull();
  });

  it('Pause: a tap just inside the hit-circle registers on the control; a tap just outside falls through to the zone beneath it', () => {
    const game = new Game();
    game.resize(width, height);

    expect(game.isOverPauseControl(pauseCenterX, centerY + pauseRadius - 1)).toBe(true);
    expect(game.onLongPress(pauseCenterX, centerY + pauseRadius - 1)).toBeNull();

    expect(game.isOverPauseControl(pauseCenterX, centerY + pauseRadius + 1)).toBe(false);
    expect(game.onLongPress(pauseCenterX, centerY + pauseRadius + 1)).not.toBeNull();
  });
});

describe("a long-press starting on a shared control never passes the turn, even when the control sits over the active player's own zone (issue #221, stakeholder report)", () => {
  const width = 400;
  const height = 800;
  const shortSide = Math.min(width, height);
  const centerX = width / 2;
  const centerY = height / 2;
  const undoRadius = shortSide * UNDO_RADIUS_RATIO;
  const shortcutRadius = shortSide * SHORTCUT_RADIUS_RATIO;
  const pauseRadius = shortSide * PAUSE_RADIUS_RATIO;
  const gap = shortSide * CONTROL_GAP_RATIO;
  const shortcutCenterX = centerX + undoRadius + gap + shortcutRadius;
  const pauseCenterX = centerX - undoRadius - gap - pauseRadius;

  // For the default 4-player layout the shared disc (centerX, centerY) sits
  // exactly on the corner where all 4 zones meet: Undo and Shortcut both
  // fall geometrically over raw seat 3 (bottom row, right column), Pause
  // over raw seat 2 (bottom row, left column) — see ROW_COUNTS_BY_PLAYER_COUNT
  // in src/game/turn.ts. Making that seat the active one is what makes these
  // cases meaningful: without Game.onLongPress's control exclusion, a
  // long-press on the disc would resolve to the active player's own zone and
  // incorrectly pass the turn, exactly the stakeholder-reported bug.

  it("Undo/Shortcut sit over seat 3's zone: long-pressing them while seat 3 is active never advances activeIndex", () => {
    const game = new Game({ playerCount: 4, startingLife: 40, players: [], startingIndex: 3 });
    game.resize(width, height);

    game.passTurnFromZoneLongPress(centerX, centerY);
    expect(game.activeIndex).toBe(3);

    game.passTurnFromZoneLongPress(shortcutCenterX, centerY);
    expect(game.activeIndex).toBe(3);
  });

  it("Pause sits over seat 2's zone: long-pressing it while seat 2 is active never advances activeIndex", () => {
    const game = new Game({ playerCount: 4, startingLife: 40, players: [], startingIndex: 2 });
    game.resize(width, height);

    game.passTurnFromZoneLongPress(pauseCenterX, centerY);
    expect(game.activeIndex).toBe(2);
  });

  it('holding a press over the shared disc past LONG_PRESS_MS never passes the turn, via the same gesture engine main.ts wires to the canvas', () => {
    vi.useFakeTimers();
    const element = new FakeElement();
    const game = new Game({ playerCount: 4, startingLife: 40, players: [], startingIndex: 3 });
    game.resize(width, height);

    attachTapAndLongPress(element as unknown as HTMLElement, {
      onTap: () => {},
      onLongPress: (event) => game.passTurnFromZoneLongPress(event.clientX, event.clientY),
    });

    element.dispatch('pointerdown', { clientX: centerX, clientY: centerY });
    vi.advanceTimersByTime(LONG_PRESS_MS);
    element.dispatch('pointerup', { clientX: centerX, clientY: centerY });

    expect(game.activeIndex).toBe(3);
    vi.useRealTimers();
  });
});

describe('DOM buttons rendered over the board get the same non-interference guarantee as the canvas-drawn disc controls (issue #221)', () => {
  it("a long-held press starting over a DOM button never passes the turn, even though the button sits directly on top of the active player's own zone", () => {
    vi.useFakeTimers();
    const element = new FakeElement();
    const game = new Game(); // default 4 players, seat 0 active
    game.resize(400, 800);

    // Stand-in for a DOM button rendered over the board (e.g. an attack-menu
    // stepper or close button) sitting directly on top of seat 0's own zone
    // — the exact geometry that would otherwise let a stray long-press pass
    // the turn.
    const domButtonRect = { x: 20, y: 20, width: 56, height: 56 };
    const isOverDomButton = (x: number, y: number): boolean =>
      x >= domButtonRect.x &&
      x <= domButtonRect.x + domButtonRect.width &&
      y >= domButtonRect.y &&
      y <= domButtonRect.y + domButtonRect.height;

    // Mirrors main.ts's onPressStart wiring for the canvas disc controls
    // (issue #123): a tap-only control reports itself via onPressStart
    // returning false, which skips arming the long-press timer entirely —
    // the same contract applies whether the control is canvas-drawn or a
    // real DOM element layered on top of the board.
    const handlers: TapGestureHandlers = {
      onPressStart: (event) => !isOverDomButton(event.clientX, event.clientY),
      onTap: () => {},
      onLongPress: (event) => game.passTurnFromZoneLongPress(event.clientX, event.clientY),
    };
    attachTapAndLongPress(element as unknown as HTMLElement, handlers);

    const point = { clientX: 40, clientY: 40 }; // inside domButtonRect, and inside seat 0's own zone
    element.dispatch('pointerdown', point);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    element.dispatch('pointerup', point);

    expect(game.activeIndex).toBe(0);
    vi.useRealTimers();
  });
});
