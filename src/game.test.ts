import { describe, expect, it } from 'vitest';
import { Game, clamp, computeOverlaySafeArea, computeZoneRects, resolveOverlayViewportSize } from './game';
import { DISPLAY_FONT_STACK } from './ui/displayFont';
import { LONG_PRESS_MOVE_TOLERANCE_PX, LONG_PRESS_MS } from './ui/damagePanel';
import { clockwiseSeatOrder } from './game/turn';
import { applyCommanderDamageDelta } from './game/commanderDamage';
import { applyDamageDelta, applyHealDelta, applyLifelinkDelta } from './game/life';
import { applyPoisonDelta } from './game/poison';
import { applyEnergyDelta } from './game/energy';
import { applyExperienceDelta } from './game/experience';
import { addCustomCounter } from './game/customCounters';
import { applyBoardShortcutDelta } from './game/boardShortcut';
import type { SoundEvent, SoundPlayer } from './audio/soundPlayer';

/** Records every sound-trigger call so tests can assert on game events without a real AudioContext. */
class MockSoundPlayer implements SoundPlayer {
  readonly events: SoundEvent[] = [];
  play(event: SoundEvent): void {
    this.events.push(event);
  }
}

/** Deals commander damage from one player to another — the only sanctioned way life changes (issue #54). */
function dealDamage(game: Game, fromId: string, toId: string, amount: number, sound?: SoundPlayer): void {
  applyCommanderDamageDelta(game.damageState, game.players, toId, fromId, 0, amount, game.undoStack, sound);
}

/** Mirrors UndoControl's reflow math (it's the sole occupant of the shared disc, issue #64) so tests can tap the icon by coordinate. */
function undoControlCenter(width: number, height: number): { x: number; y: number } {
  return { x: width / 2, y: height / 2 };
}

describe('clamp', () => {
  it('returns the value when inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps below the minimum', () => {
    expect(clamp(-2, 0, 10)).toBe(0);
  });

  it('clamps above the maximum', () => {
    expect(clamp(12, 0, 10)).toBe(10);
  });
});

describe('Game', () => {
  it('defaults the active player to seat 0 when no startingIndex is configured', () => {
    const game = new Game({ playerCount: 4, startingLife: 40, players: [] });
    expect(game.activeIndex).toBe(0);
  });

  it('starts at the configured seat when startingIndex is set (issue #126)', () => {
    const game = new Game({ playerCount: 4, startingLife: 40, players: [], startingIndex: 2 });
    expect(game.activeIndex).toBe(2);
  });

  it('falls back to seat 0 when startingIndex is out of range for the configured player count', () => {
    const game = new Game({ playerCount: 4, startingLife: 40, players: [], startingIndex: 9 });
    expect(game.activeIndex).toBe(0);
  });

  it('advances the active player when passTurn() is called (e.g. long-pressing the active player\'s zone)', () => {
    const game = new Game();
    game.resize(400, 800);

    game.passTurn();

    expect(game.activeIndex).toBe(1);
  });

  it('ignores taps outside the control', () => {
    const game = new Game();
    game.resize(400, 800);

    game.onTap(0, 0);

    expect(game.activeIndex).toBe(0);
  });

  it('wraps from the last seat to the first and increments the turn counter once per lap', () => {
    const game = new Game();
    game.resize(400, 800);

    for (let i = 0; i < game.playerCount; i += 1) {
      game.passTurn();
    }

    expect(game.activeIndex).toBe(0);
    expect(game.turnCount).toBe(1);
  });

  it('updates without throwing', () => {
    const game = new Game();
    game.update(0.016);
  });

  it('starts with one player per seat at 40 life and zeroed commander damage', () => {
    const game = new Game();

    expect(game.players).toHaveLength(game.playerCount);
    expect(game.players.every((player) => player.life === 40)).toBe(true);
    expect(game.damageState[game.players[0].id]).toEqual(
      Object.fromEntries(
        game.players.slice(1).map((player) => [player.id, [0]]),
      ),
    );
  });

  it('gives a two-commander player\'s opponents two independent commander-damage counters against them (issue #165)', () => {
    const game = new Game({
      playerCount: 3,
      startingLife: 40,
      players: [
        { name: 'Alara', color: '#111111', hasTwoCommanders: true },
        { name: 'Kess', color: '#222222' },
        { name: 'Yorion', color: '#333333' },
      ],
    });
    const [alara, kess, yorion] = game.players;

    expect(alara.hasTwoCommanders).toBe(true);
    expect(kess.hasTwoCommanders).toBeUndefined();
    expect(game.damageState[kess.id][alara.id]).toEqual([0, 0]);
    expect(game.damageState[yorion.id][alara.id]).toEqual([0, 0]);
    // Kess and Yorion are single-commander, so damage dealt by them still uses one counter.
    expect(game.damageState[alara.id][kess.id]).toEqual([0]);
    expect(game.damageState[yorion.id][kess.id]).toEqual([0]);
  });

  it('starts every player at 0 poison counters', () => {
    const game = new Game();

    expect(game.poisonState).toEqual(
      Object.fromEntries(game.players.map((player) => [player.id, 0])),
    );
  });

  it('starts every player at 0 energy counters, including after a fresh "New Game" (issue #160)', () => {
    const game = new Game();

    expect(game.energyState).toEqual(
      Object.fromEntries(game.players.map((player) => [player.id, 0])),
    );

    applyEnergyDelta(game.energyState, game.players[0].id, 3, game.undoStack);
    expect(game.energyState[game.players[0].id]).toBe(3);

    const newGame = new Game();
    expect(newGame.energyState).toEqual(
      Object.fromEntries(newGame.players.map((player) => [player.id, 0])),
    );
  });

  it('starts every player at 0 experience counters, including after a fresh "New Game" (issue #161)', () => {
    const game = new Game();

    expect(game.experienceState).toEqual(
      Object.fromEntries(game.players.map((player) => [player.id, 0])),
    );

    applyExperienceDelta(game.experienceState, game.players[0].id, 3, game.undoStack);
    expect(game.experienceState[game.players[0].id]).toBe(3);

    const newGame = new Game();
    expect(newGame.experienceState).toEqual(
      Object.fromEntries(newGame.players.map((player) => [player.id, 0])),
    );
  });

  it('starts every player with no custom counters, including after a fresh "New Game" (issue #171)', () => {
    const game = new Game();

    expect(game.customCountersState).toEqual(Object.fromEntries(game.players.map((player) => [player.id, []])));

    addCustomCounter(game.customCountersState, game.players[0].id, 'Storm Count', game.undoStack);
    expect(game.customCountersState[game.players[0].id]).toHaveLength(1);

    const newGame = new Game();
    expect(newGame.customCountersState).toEqual(Object.fromEntries(newGame.players.map((player) => [player.id, []])));
  });

  it('resolves a long-press to the player id whose zone contains the point', () => {
    const game = new Game();
    game.resize(400, 800);

    const zoneHeight = 800 / game.playerCount;
    const playerId = game.onLongPress(50, zoneHeight * 2 + 10);

    expect(playerId).toBe(game.players[2].id);
  });

  it('ignores long-presses over the shared undo control', () => {
    const game = new Game();
    game.resize(400, 800);

    expect(game.onLongPress(200, 400)).toBeNull();
  });

  describe('passTurnFromZoneLongPress (issue #64)', () => {
    it('passes the turn when the active player\'s own zone is long-pressed', () => {
      const game = new Game();
      game.resize(400, 800);
      const zoneHeight = 800 / game.playerCount;

      game.passTurnFromZoneLongPress(50, zoneHeight - 10); // seat 0's zone, the active seat

      expect(game.activeIndex).toBe(1);
    });

    it('does not pass the turn when a non-active player\'s zone is long-pressed', () => {
      const game = new Game();
      game.resize(400, 800);
      const zoneHeight = 800 / game.playerCount;

      game.passTurnFromZoneLongPress(50, zoneHeight * 2 + 10); // seat 2's zone, not active

      expect(game.activeIndex).toBe(0);
    });

    it('does not pass the turn when the long-press lands outside any zone (e.g. the shared undo control)', () => {
      const game = new Game();
      game.resize(400, 800);

      game.passTurnFromZoneLongPress(200, 400);

      expect(game.activeIndex).toBe(0);
    });

    it('wraps and increments the turn counter once per lap, same as passTurn()', () => {
      const game = new Game();
      game.resize(400, 800);
      const zoneHeight = 800 / game.playerCount;
      const rects = computeZoneRects(game.playerCount, 400, 800);

      for (let i = 0; i < game.playerCount; i += 1) {
        const rect = rects[game.activeIndex];
        game.passTurnFromZoneLongPress(rect.x + 10, rect.y + Math.min(rect.height - 10, zoneHeight - 10));
      }

      expect(game.activeIndex).toBe(0);
      expect(game.turnCount).toBe(1);
    });

    it('starts a brief flash animation on the zone that committed the pass, clearing after it finishes', () => {
      const game = new Game();
      game.resize(400, 800);
      const zoneHeight = 800 / game.playerCount;

      expect(game.passTurnFlashSeat).toBeNull();

      game.passTurnFromZoneLongPress(50, zoneHeight - 10);

      expect(game.passTurnFlashSeat).toBe(0);

      game.update(1); // well past the flash duration

      expect(game.passTurnFlashSeat).toBeNull();
    });

    it('does not start a flash animation when the long-press does not commit a turn pass', () => {
      const game = new Game();
      game.resize(400, 800);
      const zoneHeight = 800 / game.playerCount;

      game.passTurnFromZoneLongPress(50, zoneHeight * 2 + 10); // non-active zone

      expect(game.passTurnFlashSeat).toBeNull();
    });
  });

  describe('turn-hold ring (issue #109)', () => {
    it('shows a ring at the touch point that fills up over the hold duration when pressing the active zone', () => {
      const game = new Game();
      game.resize(400, 800);
      const zoneHeight = 800 / game.playerCount;

      expect(game.turnHoldRing).toBeNull();

      game.beginTurnHold(50, zoneHeight - 10); // seat 0's zone, the active seat

      expect(game.turnHoldRing).toEqual({ x: 50, y: zoneHeight - 10, progress: 0 });

      game.update(LONG_PRESS_MS / 1000 / 2);

      expect(game.turnHoldRing?.progress).toBeCloseTo(0.5);
    });

    it('shows no ring when pressing a non-active zone', () => {
      const game = new Game();
      game.resize(400, 800);
      const zoneHeight = 800 / game.playerCount;

      game.beginTurnHold(50, zoneHeight * 2 + 10); // seat 2's zone, not active

      expect(game.turnHoldRing).toBeNull();
    });

    it('shows no ring when pressing outside any zone (e.g. the shared undo control)', () => {
      const game = new Game();
      game.resize(400, 800);

      game.beginTurnHold(200, 400);

      expect(game.turnHoldRing).toBeNull();
    });

    it('cancels the ring on endTurnHold before it completes, with no turn change', () => {
      const game = new Game();
      game.resize(400, 800);
      const zoneHeight = 800 / game.playerCount;

      game.beginTurnHold(50, zoneHeight - 10);
      game.update(0.1);
      expect(game.turnHoldRing).not.toBeNull();

      game.endTurnHold();

      expect(game.turnHoldRing).toBeNull();
      expect(game.activeIndex).toBe(0);
    });

    it('cancels the ring once the pointer moves past the long-press movement tolerance', () => {
      const game = new Game();
      game.resize(400, 800);
      const zoneHeight = 800 / game.playerCount;

      game.beginTurnHold(50, zoneHeight - 10);
      expect(game.turnHoldRing).not.toBeNull();

      game.updateTurnHold(50, zoneHeight - 10 + LONG_PRESS_MOVE_TOLERANCE_PX); // still within tolerance
      expect(game.turnHoldRing).not.toBeNull();

      game.updateTurnHold(50, zoneHeight - 10 + LONG_PRESS_MOVE_TOLERANCE_PX + 1); // past tolerance
      expect(game.turnHoldRing).toBeNull();
    });

    it('clears the ring the moment the hold commits and the turn passes, leaving the commit flash to play', () => {
      const game = new Game();
      game.resize(400, 800);
      const zoneHeight = 800 / game.playerCount;

      game.beginTurnHold(50, zoneHeight - 10);
      game.update(LONG_PRESS_MS / 1000);

      game.passTurnFromZoneLongPress(50, zoneHeight - 10);

      expect(game.turnHoldRing).toBeNull();
      expect(game.activeIndex).toBe(1);
      expect(game.passTurnFlashSeat).toBe(0);
    });
  });

  it('does not change life when the upper or lower half of a bottom-row (non-rotated) zone is tapped (issue #54)', () => {
    const game = new Game();
    game.resize(400, 800);
    const player = game.players[2];
    const rect = computeZoneRects(game.playerCount, 400, 800)[2];

    game.onTap(rect.x + 10, rect.y + 10); // upper half
    expect(player.life).toBe(40);

    game.onTap(rect.x + 10, rect.y + rect.height - 10); // lower half
    expect(player.life).toBe(40);
  });

  it('does not change life when the upper or lower half of a top-row (rotated) zone is tapped (issue #54)', () => {
    const game = new Game();
    game.resize(400, 800);
    const player = game.players[0];
    const rect = computeZoneRects(game.playerCount, 400, 800)[0];

    game.onTap(rect.x + 10, rect.y + rect.height - 10); // upper half
    expect(player.life).toBe(40);

    game.onTap(rect.x + 10, rect.y + 10); // lower half
    expect(player.life).toBe(40);
  });

  it('does not change any life total or active player when tapping the shared center control', () => {
    const game = new Game();
    game.resize(400, 800);
    const livesBefore = game.players.map((player) => player.life);

    game.onTap(200, 400);

    expect(game.players.map((player) => player.life)).toEqual(livesBefore);
    expect(game.activeIndex).toBe(0);
  });

  it('undoes a turn pass, restoring the previous active player and turn count', () => {
    const game = new Game();
    game.resize(400, 800);
    const livesBefore = game.players.map((player) => player.life);

    for (let i = 0; i < game.playerCount; i += 1) {
      game.passTurn();
    }
    expect(game.activeIndex).toBe(0);
    expect(game.turnCount).toBe(1);

    game.undo();

    // Reverts to the clockwise-previous seat (issue #68), not raw index playerCount - 1.
    const order = clockwiseSeatOrder(game.playerCount);
    expect(game.activeIndex).toBe(order[order.length - 1]);
    expect(game.turnCount).toBe(0);
    expect(game.players.map((player) => player.life)).toEqual(livesBefore);
  });

  it('undoes each action exactly once, in order, through an interleaved sequence of life changes and turn passes', () => {
    const game = new Game();
    game.resize(400, 800);
    const player = game.players[0];
    const attackerId = game.players[1].id;

    dealDamage(game, attackerId, player.id, 1); // life: 40 -> 39
    game.passTurn(); // pass turn: activeIndex 0 -> 1
    dealDamage(game, attackerId, player.id, 1); // life: 39 -> 38

    expect(player.life).toBe(38);
    expect(game.activeIndex).toBe(1);

    game.undo(); // reverts life: 38 -> 39
    expect(player.life).toBe(39);
    expect(game.activeIndex).toBe(1);

    game.undo(); // reverts turn pass: activeIndex 1 -> 0
    expect(player.life).toBe(39);
    expect(game.activeIndex).toBe(0);

    game.undo(); // reverts life: 39 -> 40
    expect(player.life).toBe(40);
    expect(game.activeIndex).toBe(0);
  });

  it('pushes an undo action onto the shared stack that reverts a commander-damage life change', () => {
    const game = new Game();
    const player = game.players[0];

    dealDamage(game, game.players[1].id, player.id, 1);
    expect(player.life).toBe(39);

    const stack = game.undoStack as unknown as { actions: { undo(): void }[] };
    stack.actions[stack.actions.length - 1].undo();

    expect(player.life).toBe(40);
  });

  it('reports canUndo and reverts the most recent life change via undo()', () => {
    const game = new Game();
    const player = game.players[0];

    expect(game.canUndo).toBe(false);

    dealDamage(game, game.players[1].id, player.id, 1);
    expect(player.life).toBe(39);
    expect(game.canUndo).toBe(true);

    game.undo();

    expect(player.life).toBe(40);
    expect(game.canUndo).toBe(false);
  });

  it('undoes multiple changes in last-in-first-out order', () => {
    const game = new Game();
    const player = game.players[0];
    const attackerId = game.players[1].id;

    dealDamage(game, attackerId, player.id, 1); // -1
    dealDamage(game, attackerId, player.id, 1); // -1
    expect(player.life).toBe(38);

    game.undo();
    expect(player.life).toBe(39);

    game.undo();
    expect(player.life).toBe(40);
  });

  it('undo() is a no-op when nothing to undo', () => {
    const game = new Game();
    const livesBefore = game.players.map((player) => player.life);

    expect(() => game.undo()).not.toThrow();
    expect(game.players.map((player) => player.life)).toEqual(livesBefore);
    expect(game.canUndo).toBe(false);
  });

  it('tapping the undo icon reverts the most recent change and is dimmed/disabled when empty', () => {
    const game = new Game();
    game.resize(400, 800);
    const player = game.players[0];
    const undoCenter = undoControlCenter(400, 800);

    expect(game.isOverUndoControl(undoCenter.x, undoCenter.y)).toBe(true);

    // Tapping the undo icon while disabled changes nothing.
    game.onTap(undoCenter.x, undoCenter.y);
    expect(player.life).toBe(40);

    dealDamage(game, game.players[1].id, player.id, 1);
    expect(player.life).toBe(39);

    game.onTap(undoCenter.x, undoCenter.y);
    expect(player.life).toBe(40);
  });

  it('does not change life or open the damage panel target when long-pressing the undo icon', () => {
    const game = new Game();
    game.resize(400, 800);
    const undoCenter = undoControlCenter(400, 800);

    expect(game.onLongPress(undoCenter.x, undoCenter.y)).toBeNull();
  });

  it('exposes a tappable shortcut control next to the undo control that is not itself a zone (issue #80)', () => {
    const game = new Game();
    game.resize(400, 800);
    const undoCenter = undoControlCenter(400, 800);

    // Somewhere to the right of the undo icon, still on the shared disc's row.
    const shortcutProbeX = undoCenter.x + 40;
    expect(game.isOverShortcutControl(shortcutProbeX, undoCenter.y)).toBe(true);
    expect(game.isOverUndoControl(shortcutProbeX, undoCenter.y)).toBe(false);
    expect(game.onLongPress(shortcutProbeX, undoCenter.y)).toBeNull();
  });

  it('does not highlight a player zone as a drag target over the pause control (issue #141)', () => {
    const game = new Game();
    game.resize(400, 800);
    const undoCenter = undoControlCenter(400, 800);

    // Somewhere to the left of the undo icon, mirroring the shortcut control's position.
    const pauseProbeX = undoCenter.x - 40;
    expect(game.isOverPauseControl(pauseProbeX, undoCenter.y)).toBe(true);
    expect(game.isOverUndoControl(pauseProbeX, undoCenter.y)).toBe(false);
    expect(game.onLongPress(pauseProbeX, undoCenter.y)).toBeNull();
  });

  describe('resolveZoneDrag (issue #48)', () => {
    it('resolves a drag from one zone to a different zone, without itself changing any total', () => {
      const game = new Game();
      game.resize(400, 800);
      const zoneHeight = 800 / game.playerCount;
      const livesBefore = game.players.map((player) => player.life);

      const drag = game.resolveZoneDrag(50, zoneHeight + 10, 50, zoneHeight * 2 + 10);

      expect(drag).toEqual({ fromPlayerId: game.players[0].id, toPlayerId: game.players[2].id });
      expect(game.players.map((player) => player.life)).toEqual(livesBefore);
      expect(game.damageState[game.players[2].id][game.players[0].id]).toEqual([0]);
    });

    it('resolves a drag that starts and ends in the same zone as a self-target pair once past the move tolerance (issue #70)', () => {
      const game = new Game();
      game.resize(400, 800);
      const zoneHeight = 800 / game.playerCount;
      const player = game.players[0];

      const drag = game.resolveZoneDrag(50, 10, 70, zoneHeight - 10);

      expect(drag).toEqual({ fromPlayerId: player.id, toPlayerId: player.id });
    });

    it('returns null for a same-zone press that never moved past the long-press tolerance, i.e. a plain tap (issue #70)', () => {
      const game = new Game();
      game.resize(400, 800);

      expect(game.resolveZoneDrag(50, 10, 55, 15)).toBeNull(); // dx=5, dy=5, well under the 10px tolerance
    });

    it('applying commander damage to a resolved self-target pair leaves life and commander-damage state untouched (issue #70)', () => {
      const game = new Game();
      game.resize(400, 800);
      const zoneHeight = 800 / game.playerCount;
      const player = game.players[0];
      const lifeBefore = player.life;

      const drag = game.resolveZoneDrag(50, 10, 70, zoneHeight - 10);
      expect(drag).not.toBeNull();

      dealDamage(game, drag!.fromPlayerId, drag!.toPlayerId, 3);

      expect(player.life).toBe(lifeBefore);
      expect(game.damageState[player.id][player.id]).toBeUndefined();
    });

    it('returns null when either end is outside every player zone', () => {
      const game = new Game();
      game.resize(400, 800);
      const zoneHeight = 800 / game.playerCount;

      expect(game.resolveZoneDrag(200, 400, 50, zoneHeight + 10)).toBeNull(); // starts over the center control
      expect(game.resolveZoneDrag(50, zoneHeight + 10, 200, 400)).toBeNull(); // ends over the center control
    });
  });

  describe('dragArrow live preview (issue #55, gated by move threshold per issue #106)', () => {
    it('is null before any drag starts', () => {
      const game = new Game();
      game.resize(400, 800);

      expect(game.dragArrow).toBeNull();
    });

    it('beginDrag alone (no movement yet) starts no arrow, so a plain tap never shows one', () => {
      const game = new Game();
      game.resize(400, 800);

      game.beginDrag(50, 10);

      expect(game.dragArrow).toBeNull();
    });

    it('beginDrag outside every player zone (e.g. over a shared control) starts no arrow, even after movement', () => {
      const game = new Game();
      game.resize(400, 800);

      game.beginDrag(200, 400); // center control
      game.updateDragPointer(200, 400 + LONG_PRESS_MOVE_TOLERANCE_PX + 5);

      expect(game.dragArrow).toBeNull();
    });

    it('updateDragPointer within the move tolerance keeps the arrow hidden', () => {
      const game = new Game();
      game.resize(400, 800);

      game.beginDrag(50, 10);
      game.updateDragPointer(50, 10 + LONG_PRESS_MOVE_TOLERANCE_PX); // exactly at tolerance, not past it

      expect(game.dragArrow).toBeNull();
    });

    it('updateDragPointer past the move tolerance reveals the arrow from the exact press point to the pointer', () => {
      const game = new Game();
      game.resize(400, 800);

      game.beginDrag(50, 10);
      game.updateDragPointer(50, 10 + LONG_PRESS_MOVE_TOLERANCE_PX + 1);

      expect(game.dragArrow).toEqual({
        fromPlayerId: game.players[0].id,
        originX: 50,
        originY: 10,
        headX: 50,
        headY: 10 + LONG_PRESS_MOVE_TOLERANCE_PX + 1,
        targetPlayerId: null,
        color: game.players[0].color,
      });
    });

    it('keeps the arrow origin fixed at the exact press point, not the zone center, regardless of where within the zone the press started', () => {
      const game = new Game();
      game.resize(400, 800);
      const zoneHeight = 800 / game.playerCount;
      const originRect = computeZoneRects(game.playerCount, 400, 800)[0];
      const pressX = originRect.x + 15; // away from the zone's horizontal center
      const pressY = 5; // away from the zone's vertical center

      game.beginDrag(pressX, pressY);
      game.updateDragPointer(pressX, zoneHeight - 20); // moves well past the tolerance, within the same zone

      expect(game.dragArrow).toMatchObject({
        originX: pressX,
        originY: pressY,
      });
      expect(game.dragArrow?.originX).not.toBe(originRect.x + originRect.width / 2);
      expect(game.dragArrow?.originY).not.toBe(originRect.y + originRect.height / 2);

      // Moving the pointer further must not move the origin — only the head tracks the live pointer.
      game.updateDragPointer(pressX + 30, zoneHeight - 5);
      expect(game.dragArrow).toMatchObject({ originX: pressX, originY: pressY });
    });

    it('updateDragPointer moves the arrow head while no valid target is under the pointer, once past the move tolerance', () => {
      const game = new Game();
      game.resize(400, 800);
      const zoneHeight = 800 / game.playerCount;

      game.beginDrag(50, 10);
      game.updateDragPointer(60, zoneHeight - 20); // still inside the origin zone, past the tolerance

      expect(game.dragArrow?.headX).toBe(60);
      expect(game.dragArrow?.headY).toBe(zoneHeight - 20);
      expect(game.dragArrow?.targetPlayerId).toBeNull();
    });

    it('is a no-op if called with no drag in progress', () => {
      const game = new Game();
      game.resize(400, 800);

      game.updateDragPointer(60, 60);

      expect(game.dragArrow).toBeNull();
    });

    it('keeps the arrow head tracking the live pointer once it is over a different zone, while reporting its player as the target', () => {
      const game = new Game();
      game.resize(400, 800);
      const zoneHeight = 800 / game.playerCount;

      game.beginDrag(50, zoneHeight + 10);
      game.updateDragPointer(55, zoneHeight * 2 + 15);

      expect(game.dragArrow).toMatchObject({
        fromPlayerId: game.players[0].id,
        targetPlayerId: game.players[2].id,
        headX: 55,
        headY: zoneHeight * 2 + 15,
      });
    });

    it('keeps updating the arrow head as the pointer moves around within the target zone', () => {
      const game = new Game();
      game.resize(400, 800);
      const zoneHeight = 800 / game.playerCount;

      game.beginDrag(50, zoneHeight + 10);
      game.updateDragPointer(55, zoneHeight * 2 + 15);
      game.updateDragPointer(90, zoneHeight * 2 + 40);

      expect(game.dragArrow).toMatchObject({
        targetPlayerId: game.players[2].id,
        headX: 90,
        headY: zoneHeight * 2 + 40,
      });
    });

    it('does not snap to / target a shared control even though the pointer moves over it', () => {
      const game = new Game();
      game.resize(400, 800);
      const zoneHeight = 800 / game.playerCount;

      game.beginDrag(50, zoneHeight + 10);
      game.updateDragPointer(200, 400); // center control

      expect(game.dragArrow).toMatchObject({ targetPlayerId: null, headX: 200, headY: 400 });
    });

    it('endDrag clears the arrow immediately, regardless of how the press resolved', () => {
      const game = new Game();
      game.resize(400, 800);

      game.beginDrag(50, 10);
      game.updateDragPointer(50, 10 + LONG_PRESS_MOVE_TOLERANCE_PX + 1);
      expect(game.dragArrow).not.toBeNull();

      game.endDrag();

      expect(game.dragArrow).toBeNull();
    });

    it('endDrag before crossing the move tolerance clears the pending origin too, so a later move does not resurrect the arrow', () => {
      const game = new Game();
      game.resize(400, 800);

      game.beginDrag(50, 10);
      game.endDrag();
      game.updateDragPointer(50, 10 + LONG_PRESS_MOVE_TOLERANCE_PX + 1);

      expect(game.dragArrow).toBeNull();
    });
  });

  it('leaves life unchanged when a zone is tapped, even right before a release over a shared control (issue #54)', () => {
    const game = new Game();
    game.resize(400, 800);
    const zoneHeight = 800 / game.playerCount;
    const livesBefore = game.players.map((player) => player.life);

    game.onTap(50, zoneHeight + 10); // tap a player's own zone
    game.onTap(200, 400); // release over the shared center control

    expect(game.players.map((player) => player.life)).toEqual(livesBefore);
  });

  it('launches with the configured player count, starting life, names, and colors', () => {
    const game = new Game({
      playerCount: 3,
      startingLife: 20,
      players: [
        { name: 'Alara', color: '#111111' },
        { name: 'Kess', color: '#222222' },
        { name: 'Yorion', color: '#333333' },
      ],
    });

    expect(game.playerCount).toBe(3);
    expect(game.players.map((player) => ({ name: player.name, life: player.life, color: player.color }))).toEqual([
      { name: 'Alara', life: 20, color: '#111111' },
      { name: 'Kess', life: 20, color: '#222222' },
      { name: 'Yorion', life: 20, color: '#333333' },
    ]);
  });

  it('clamps a configured player count to the 2-8 range', () => {
    const tooFew = new Game({ playerCount: 1, startingLife: 40, players: [] });
    const tooMany = new Game({ playerCount: 9, startingLife: 40, players: [] });

    expect(tooFew.playerCount).toBe(2);
    expect(tooMany.playerCount).toBe(8);
  });

  it.each([2, 3, 4, 5, 6, 7, 8])(
    'keeps the shared undo control off every zone center in a %i-player game',
    (playerCount) => {
      const game = new Game({ playerCount, startingLife: 40, players: [] });
      const width = 400;
      const height = 900;
      game.resize(width, height);
      const rects = computeZoneRects(playerCount, width, height);

      rects.forEach((rect) => {
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;

        expect(game.isOverUndoControl(centerX, centerY)).toBe(false);
      });
    },
  );

  it.each([2, 3, 4, 5, 6, 7, 8])(
    'keeps the shared shortcut control off every zone center and off the undo control, at the smallest supported width, in a %i-player game (issue #80)',
    (playerCount) => {
      const game = new Game({ playerCount, startingLife: 40, players: [] });
      const width = 360;
      const height = 900;
      game.resize(width, height);
      const rects = computeZoneRects(playerCount, width, height);

      rects.forEach((rect) => {
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;

        expect(game.isOverShortcutControl(centerX, centerY)).toBe(false);
      });

      const undoCenter = undoControlCenter(width, height);
      expect(game.isOverShortcutControl(undoCenter.x, undoCenter.y)).toBe(false);
    },
  );

  it.each([2, 3, 4, 5, 6, 7, 8])(
    'lays out %i players in the table-like grid from docs/concept.md, and tapping either half changes nothing (issue #54)',
    (playerCount) => {
      const game = new Game({ playerCount, startingLife: 40, players: [] });
      game.resize(400, 900);
      const rects = computeZoneRects(playerCount, 400, 900);

      rects.forEach((rect, seat) => {
        const player = game.players[seat];

        game.onTap(rect.x + rect.width / 2, rect.y + rect.height * 0.25);
        expect(player.life).toBe(40);

        game.onTap(rect.x + rect.width / 2, rect.y + rect.height * 0.75);
        expect(player.life).toBe(40);
      });
    },
  );

  describe('5-player 2-top/2-bottom/1-left layout (issue #81)', () => {
    it('gives 2 zones across the top (rotated 180°), 2 across the bottom (upright), and 1 full-height zone on the left (rotated 90°), tiling the canvas with no gaps or overlaps', () => {
      const width = 400;
      const height = 900;
      const rects = computeZoneRects(5, width, height);
      const leftWidth = width / 3;
      const colWidth = (width - leftWidth) / 2;

      expect(rects).toEqual([
        { x: leftWidth, y: 0, width: colWidth, height: height / 2, rotation: 180 },
        { x: leftWidth + colWidth, y: 0, width: colWidth, height: height / 2, rotation: 180 },
        { x: leftWidth, y: height / 2, width: colWidth, height: height / 2, rotation: 0 },
        { x: leftWidth + colWidth, y: height / 2, width: colWidth, height: height / 2, rotation: 0 },
        { x: 0, y: 0, width: leftWidth, height, rotation: 90 },
      ]);
    });

    it('resolves taps and drags to the left-edge seat (seat 4) from anywhere in its full-height zone', () => {
      const game = new Game({ playerCount: 5, startingLife: 40, players: [] });
      const width = 400;
      const height = 900;
      game.resize(width, height);
      const rects = computeZoneRects(5, width, height);
      const topLeftRect = rects[0];
      const topLeftCenter = { x: topLeftRect.x + topLeftRect.width / 2, y: topLeftRect.y + topLeftRect.height / 2 };
      const topLeftSeat = game.players[0];
      const leftSeat = game.players[4];

      const dragFromNearTopOfLeftZone = game.resolveZoneDrag(topLeftCenter.x, topLeftCenter.y, 20, 20);
      expect(dragFromNearTopOfLeftZone).toEqual({ fromPlayerId: topLeftSeat.id, toPlayerId: leftSeat.id });

      const dragFromNearBottomOfLeftZone = game.resolveZoneDrag(topLeftCenter.x, topLeftCenter.y, 20, height - 20);
      expect(dragFromNearBottomOfLeftZone).toEqual({ fromPlayerId: topLeftSeat.id, toPlayerId: leftSeat.id });
    });

    it('resolves taps and drags to each of the 2 top and 2 bottom seats', () => {
      const game = new Game({ playerCount: 5, startingLife: 40, players: [] });
      const width = 400;
      const height = 900;
      game.resize(width, height);
      const rects = computeZoneRects(5, width, height);
      const leftSeatCenter = { x: rects[4].x + rects[4].width / 2, y: rects[4].y + rects[4].height / 2 };

      for (let seat = 0; seat <= 3; seat += 1) {
        const rect = rects[seat];
        const drag = game.resolveZoneDrag(
          leftSeatCenter.x,
          leftSeatCenter.y,
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        );

        expect(drag).toEqual({ fromPlayerId: game.players[4].id, toPlayerId: game.players[seat].id });
      }
    });

    it('walks the 5 seats in true clockwise order — top-left, top-right, bottom-right, bottom-left, left — when passing turns', () => {
      const game = new Game({ playerCount: 5, startingLife: 40, players: [] });
      game.resize(400, 900);

      const order = [0, 1, 3, 2, 4];
      expect(game.activeIndex).toBe(order[0]);
      for (let i = 1; i < order.length; i += 1) {
        game.passTurn();
        expect(game.activeIndex).toBe(order[i]);
      }
    });
  });

  describe('2-player 1v1 Duel Commander layout (issue #169)', () => {
    it('gives 2 full-width zones stacked top and bottom, the top one rotated 180°, tiling the canvas with no gaps or overlaps', () => {
      const width = 400;
      const height = 900;

      expect(computeZoneRects(2, width, height)).toEqual([
        { x: 0, y: 0, width, height: height / 2, rotation: 180 },
        { x: 0, y: height / 2, width, height: height / 2, rotation: 0 },
      ]);
    });

    it('accepts a 2-player config without clamping up to the old 3-player minimum', () => {
      const game = new Game({ playerCount: 2, startingLife: 40, players: [] });
      expect(game.playerCount).toBe(2);
      expect(game.players).toHaveLength(2);
    });

    it('alternates turns between the 2 seats, incrementing turnCount once per lap', () => {
      const game = new Game({ playerCount: 2, startingLife: 40, players: [] });
      expect(game.activeIndex).toBe(0);

      game.passTurn();
      expect(game.activeIndex).toBe(1);
      expect(game.turnCount).toBe(0);

      game.passTurn();
      expect(game.activeIndex).toBe(0);
      expect(game.turnCount).toBe(1);
    });

    it('resolves a drag between the 2 zones for commander damage, and a same-zone drag as a self-target pair', () => {
      const game = new Game({ playerCount: 2, startingLife: 40, players: [] });
      game.resize(400, 900);
      const [p0, p1] = game.players;

      const crossDrag = game.resolveZoneDrag(50, 10, 50, 460);
      expect(crossDrag).toEqual({ fromPlayerId: p0.id, toPlayerId: p1.id });

      dealDamage(game, p0.id, p1.id, 5);
      expect(p1.life).toBe(35);
      expect(game.damageState[p1.id][p0.id]).toEqual([5]);

      const selfDrag = game.resolveZoneDrag(50, 10, 70, 400);
      expect(selfDrag).toEqual({ fromPlayerId: p0.id, toPlayerId: p0.id });
    });

    it('undoes the most recent action, e.g. reverting commander damage', () => {
      const game = new Game({ playerCount: 2, startingLife: 40, players: [] });
      const [p0, p1] = game.players;

      dealDamage(game, p0.id, p1.id, 5);
      expect(p1.life).toBe(35);

      game.undo();
      expect(p1.life).toBe(40);
    });

    it('ends the game as soon as one of the 2 players is eliminated, with the survivor as winner', () => {
      const game = new Game({ playerCount: 2, startingLife: 1, players: [] });
      const [p0, p1] = game.players;

      dealDamage(game, p1.id, p0.id, 1); // p0: 1 -> 0
      game.update(0.016);

      expect(game.ended).toBe(true);
      expect(game.stats?.winnerId).toBe(p1.id);
      expect(game.stats?.eliminationOrder.map((entry) => entry.playerId)).toEqual([p0.id]);
    });
  });

  describe('7 and 8 player layouts (issue #170)', () => {
    it('accepts 7- and 8-player configs without clamping down to the old 6-player max', () => {
      const seven = new Game({ playerCount: 7, startingLife: 40, players: [] });
      const eight = new Game({ playerCount: 8, startingLife: 40, players: [] });

      expect(seven.playerCount).toBe(7);
      expect(seven.players).toHaveLength(7);
      expect(eight.playerCount).toBe(8);
      expect(eight.players).toHaveLength(8);
    });

    it('gives 7 players a 4-seat top row (rotated 180°) and a 3-seat bottom row (upright), tiling the canvas with no gaps or overlaps', () => {
      const width = 400;
      const height = 900;
      const topColWidth = width / 4;
      const bottomColWidth = width / 3;
      const rowHeight = height / 2;

      expect(computeZoneRects(7, width, height)).toEqual([
        { x: 0, y: 0, width: topColWidth, height: rowHeight, rotation: 180 },
        { x: topColWidth, y: 0, width: topColWidth, height: rowHeight, rotation: 180 },
        { x: topColWidth * 2, y: 0, width: topColWidth, height: rowHeight, rotation: 180 },
        { x: topColWidth * 3, y: 0, width: topColWidth, height: rowHeight, rotation: 180 },
        { x: 0, y: rowHeight, width: bottomColWidth, height: rowHeight, rotation: 0 },
        { x: bottomColWidth, y: rowHeight, width: bottomColWidth, height: rowHeight, rotation: 0 },
        { x: bottomColWidth * 2, y: rowHeight, width: bottomColWidth, height: rowHeight, rotation: 0 },
      ]);
    });

    it('gives 8 players a 4x2 grid, top row rotated 180°, bottom row upright, tiling the canvas with no gaps or overlaps', () => {
      const width = 400;
      const height = 900;
      const colWidth = width / 4;
      const rowHeight = height / 2;

      expect(computeZoneRects(8, width, height)).toEqual([
        { x: 0, y: 0, width: colWidth, height: rowHeight, rotation: 180 },
        { x: colWidth, y: 0, width: colWidth, height: rowHeight, rotation: 180 },
        { x: colWidth * 2, y: 0, width: colWidth, height: rowHeight, rotation: 180 },
        { x: colWidth * 3, y: 0, width: colWidth, height: rowHeight, rotation: 180 },
        { x: 0, y: rowHeight, width: colWidth, height: rowHeight, rotation: 0 },
        { x: colWidth, y: rowHeight, width: colWidth, height: rowHeight, rotation: 0 },
        { x: colWidth * 2, y: rowHeight, width: colWidth, height: rowHeight, rotation: 0 },
        { x: colWidth * 3, y: rowHeight, width: colWidth, height: rowHeight, rotation: 0 },
      ]);
    });

    it('walks the 7 seats in clockwise order — top row left-to-right, then bottom row right-to-left — when passing turns', () => {
      const game = new Game({ playerCount: 7, startingLife: 40, players: [] });
      game.resize(400, 900);

      const order = [0, 1, 2, 3, 6, 5, 4];
      expect(game.activeIndex).toBe(order[0]);
      for (let i = 1; i < order.length; i += 1) {
        game.passTurn();
        expect(game.activeIndex).toBe(order[i]);
      }
    });

    it('walks the 8 seats in clockwise order — top row left-to-right, then bottom row right-to-left — when passing turns', () => {
      const game = new Game({ playerCount: 8, startingLife: 40, players: [] });
      game.resize(400, 900);

      const order = [0, 1, 2, 3, 7, 6, 5, 4];
      expect(game.activeIndex).toBe(order[0]);
      for (let i = 1; i < order.length; i += 1) {
        game.passTurn();
        expect(game.activeIndex).toBe(order[i]);
      }
    });

    it('resolves a cross-zone drag between two of the 8 zones as commander damage', () => {
      const game = new Game({ playerCount: 8, startingLife: 40, players: [] });
      const width = 400;
      const height = 900;
      game.resize(width, height);
      const rects = computeZoneRects(8, width, height);
      const from = rects[0];
      const to = rects[7];

      const drag = game.resolveZoneDrag(
        from.x + from.width / 2,
        from.y + from.height / 2,
        to.x + to.width / 2,
        to.y + to.height / 2,
      );
      expect(drag).toEqual({ fromPlayerId: game.players[0].id, toPlayerId: game.players[7].id });

      dealDamage(game, game.players[0].id, game.players[7].id, 5);
      expect(game.players[7].life).toBe(35);
      expect(game.damageState[game.players[7].id][game.players[0].id]).toEqual([5]);
    });

    it('ends the game once only one of 8 players remains above 0 life', () => {
      const game = new Game({ playerCount: 8, startingLife: 1, players: [] });
      const [p0, ...rest] = game.players;

      rest.forEach((opponent) => {
        dealDamage(game, p0.id, opponent.id, 1);
      });
      game.update(0.016);

      expect(game.ended).toBe(true);
      expect(game.stats?.winnerId).toBe(p0.id);
      expect(game.stats?.eliminationOrder).toHaveLength(rest.length);
    });
  });
});

describe('sound triggers', () => {
  it('plays no sound when a player\'s own zone is tapped (issue #54)', () => {
    const sound = new MockSoundPlayer();
    const game = new Game(undefined, sound);
    game.resize(400, 800);
    const zoneHeight = 800 / game.playerCount;

    game.onTap(50, zoneHeight + 10); // upper half
    game.onTap(50, 10); // lower half

    expect(sound.events).toEqual([]);
  });

  it('plays commanderDamageUp when commander damage is dealt via the zone-to-zone drag flow', () => {
    const sound = new MockSoundPlayer();
    const game = new Game(undefined, sound);

    dealDamage(game, game.players[1].id, game.players[0].id, 1, sound);

    expect(sound.events).toEqual(['commanderDamageUp']);
  });

  it('plays turnPass when passTurn() is called (e.g. long-pressing the active player\'s zone)', () => {
    const sound = new MockSoundPlayer();
    const game = new Game(undefined, sound);
    game.resize(400, 800);

    game.passTurn();

    expect(sound.events).toEqual(['turnPass']);
  });

  it('plays no sound when the shared center control is merely tapped (issue #48)', () => {
    const sound = new MockSoundPlayer();
    const game = new Game(undefined, sound);
    game.resize(400, 800);

    game.onTap(200, 400);

    expect(sound.events).toEqual([]);
  });

  it('plays eliminate exactly once when a player newly drops out, not again on later frames', () => {
    const sound = new MockSoundPlayer();
    const game = new Game({ playerCount: 3, startingLife: 1, players: [] }, sound);

    dealDamage(game, game.players[1].id, game.players[0].id, 1); // Alara: 1 -> 0
    game.update(0.016); // checkEndConditions runs every frame; commander damage changes bypass Game directly

    expect(sound.events.filter((event) => event === 'eliminate')).toHaveLength(1);

    game.update(0.016);
    game.update(0.016);

    expect(sound.events.filter((event) => event === 'eliminate')).toHaveLength(1);
  });

  it('plays gameEnd exactly once when the game ends', () => {
    const sound = new MockSoundPlayer();
    const game = new Game({ playerCount: 3, startingLife: 1, players: [] }, sound);

    dealDamage(game, game.players[2].id, game.players[0].id, 1); // Alara: 1 -> 0
    dealDamage(game, game.players[2].id, game.players[1].id, 1); // Kess: 1 -> 0, only Yorion remains
    game.update(0.016);
    game.update(0.016); // no-op once already ended

    expect(sound.events.filter((event) => event === 'gameEnd')).toHaveLength(1);
  });

  it('does not require a real AudioContext: default Game() construction never throws', () => {
    expect(() => new Game()).not.toThrow();
  });
});

describe('end of game', () => {
  function makeThreePlayerGame(startingLife: number): Game {
    return new Game({
      playerCount: 3,
      startingLife,
      players: [
        { name: 'Alara', color: '#111111' },
        { name: 'Kess', color: '#222222' },
        { name: 'Yorion', color: '#333333' },
      ],
    });
  }

  it('has no stats before the game ends', () => {
    const game = makeThreePlayerGame(40);

    expect(game.ended).toBe(false);
    expect(game.stats).toBeNull();
  });

  it('reports whether a point is over the shared undo control', () => {
    const game = makeThreePlayerGame(40);
    game.resize(400, 900);

    // The grid is always two rows filling half the canvas height each, so
    // the control sits at the boundary between them (450) for every player
    // count. See Game.resize().
    expect(game.isOverUndoControl(200, 450)).toBe(true);
    expect(game.isOverUndoControl(0, 0)).toBe(false);
  });

  it('ends automatically when only one player remains above 0 life, recording elimination order', () => {
    const game = makeThreePlayerGame(1);
    const yorion = game.players[2];

    dealDamage(game, yorion.id, game.players[0].id, 1); // Alara: 1 -> 0
    game.update(0.016); // checkEndConditions runs every frame; commander damage changes bypass Game directly
    expect(game.ended).toBe(false);

    dealDamage(game, yorion.id, game.players[1].id, 1); // Kess: 1 -> 0, only Yorion remains
    game.update(0.016);
    expect(game.ended).toBe(true);

    expect(game.stats?.winnerId).toBe(game.players[2].id);
    expect(game.stats?.eliminationOrder.map((entry) => entry.playerId)).toEqual([
      game.players[0].id,
      game.players[1].id,
    ]);
  });

  it('ends automatically when a player reaches 10 poison, recording elimination order the same way as 0 life', () => {
    const game = makeThreePlayerGame(40);
    const alara = game.players[0];
    const kess = game.players[1];

    applyPoisonDelta(game.poisonState, alara.id, 10, game.undoStack);
    expect(game.ended).toBe(false);

    applyPoisonDelta(game.poisonState, kess.id, 10, game.undoStack);
    game.update(0.016); // checkEndConditions runs every frame; poison changes bypass Game directly

    expect(game.ended).toBe(true);
    expect(game.stats?.winnerId).toBe(game.players[2].id);
    expect(game.stats?.eliminationOrder.map((entry) => entry.playerId)).toEqual([alara.id, kess.id]);
  });

  it('drops a player from eliminationOrder once undo restores their poison below the lethal threshold', () => {
    const game = makeThreePlayerGame(1);
    const alara = game.players[0];
    const kess = game.players[1];
    const yorion = game.players[2];

    applyPoisonDelta(game.poisonState, alara.id, 10, game.undoStack);
    game.update(0.016);
    expect(game.ended).toBe(false);

    game.undo(); // Alara: 10 -> 0 poison, no longer eliminated
    game.update(0.016);
    expect(game.ended).toBe(false);

    dealDamage(game, alara.id, kess.id, 1); // Kess: 1 -> 0
    dealDamage(game, alara.id, yorion.id, 1); // Yorion: 1 -> 0, only Alara remains
    game.update(0.016);

    expect(game.ended).toBe(true);
    expect(game.stats?.eliminationOrder.map((entry) => entry.playerId)).toEqual([kess.id, yorion.id]);
  });

  it('drops a player from eliminationOrder once undo restores their life above 0', () => {
    const game = makeThreePlayerGame(1);
    const alara = game.players[0];
    const kess = game.players[1];
    const yorion = game.players[2];

    dealDamage(game, yorion.id, alara.id, 1); // Alara: 1 -> 0
    game.update(0.016); // checkEndConditions runs every frame; commander damage changes bypass Game directly
    expect(game.stats).toBeNull();

    game.undo(); // Alara: 0 -> 1
    game.update(0.016);

    dealDamage(game, alara.id, kess.id, 1); // Kess: 1 -> 0
    dealDamage(game, alara.id, yorion.id, 1); // Yorion: 1 -> 0, only Alara remains
    game.update(0.016);

    expect(game.ended).toBe(true);
    expect(game.stats?.winnerId).toBe(alara.id);
    expect(game.stats?.eliminationOrder.map((entry) => entry.playerId)).toEqual([kess.id, yorion.id]);
  });

  it('accumulates time-as-active-player and freezes match duration once ended', () => {
    const game = makeThreePlayerGame(1);
    const kess = game.players[1];

    game.update(2); // Alara active for 2s
    game.passTurn(); // pass turn to Yorion (clockwise: seat 0 -> seat 2 for a 3-player table)
    game.update(3); // Yorion active for 3s

    dealDamage(game, kess.id, game.players[0].id, 1); // eliminate Alara
    dealDamage(game, kess.id, game.players[2].id, 1); // eliminate Yorion, Kess wins
    game.update(0); // checkEndConditions runs every frame; commander damage changes bypass Game directly. dt=0 keeps duration exact.

    const stats = game.stats;
    expect(stats).not.toBeNull();
    expect(stats?.durationS).toBeCloseTo(5, 5);
    expect(stats?.activeTimeS[game.players[0].id]).toBeCloseTo(2, 5);
    expect(stats?.activeTimeS[game.players[2].id]).toBeCloseTo(3, 5);

    game.update(10);
    expect(game.stats?.durationS).toBeCloseTo(5, 5);
  });

  it('populates lifeLost/lifeGained/commanderDamage totals and the biggest hit from a sequence of damage, heal, lifelink, and commander-damage actions (issue #98)', () => {
    const game = makeThreePlayerGame(1);
    const alara = game.players[0];
    const kess = game.players[1];
    const yorion = game.players[2];

    applyDamageDelta(kess, 5, game.undoStack, undefined, undefined, undefined, alara.id, game.statsTrigger);
    applyHealDelta(kess, 3, game.undoStack, undefined, undefined, game.statsTrigger);
    applyLifelinkDelta(yorion, alara, 4, game.undoStack, undefined, undefined, undefined, game.statsTrigger);
    applyCommanderDamageDelta(
      game.damageState,
      game.players,
      kess.id,
      alara.id,
      0,
      9,
      game.undoStack,
      undefined,
      undefined,
      undefined,
      game.statsTrigger,
    );
    game.update(0.016); // checkEndConditions runs every frame; life/damage changes above bypass Game directly

    expect(game.ended).toBe(true);
    expect(game.stats?.winnerId).toBe(yorion.id);

    expect(game.stats?.lifeLost).toEqual({ [alara.id]: 4, [kess.id]: 5, [yorion.id]: 0 });
    expect(game.stats?.lifeGained).toEqual({ [alara.id]: 0, [kess.id]: 3, [yorion.id]: 4 });
    expect(game.stats?.commanderDamageDealt).toEqual({ [alara.id]: 9, [kess.id]: 0, [yorion.id]: 0 });
    expect(game.stats?.commanderDamageReceived).toEqual({ [alara.id]: 0, [kess.id]: 9, [yorion.id]: 0 });
    expect(game.stats?.biggestHit).toEqual({ attackerId: alara.id, amount: 9, targetId: kess.id });
  });

  it('ends with no winner rather than softlocking when a board-wide shortcut eliminates every remaining player at once (issue #84)', () => {
    const game = makeThreePlayerGame(5);

    applyBoardShortcutDelta(game.players, game.activeIndex, 'all', 10, game.undoStack, undefined);
    game.update(0.016);

    expect(game.ended).toBe(true);
    expect(game.stats?.winnerId).toBeNull();
    expect(game.stats?.eliminationOrder.map((entry) => entry.playerId)).toEqual([
      game.players[0].id,
      game.players[1].id,
      game.players[2].id,
    ]);
    game.players.forEach((player) => expect(player.life).toBe(-5));
  });
});

// Issue #117: the board-wide shortcut menu's "End game" option lets the host
// instantly pick a winner rather than waiting for the automatic elimination
// path. alivePlayers is what the menu lists as candidates; endGameWithWinner
// is what confirming a pick calls.
describe('endGameWithWinner (issue #117)', () => {
  function makeThreePlayerGame(startingLife: number): Game {
    return new Game({
      playerCount: 3,
      startingLife,
      players: [
        { name: 'Alara', color: '#111111' },
        { name: 'Kess', color: '#222222' },
        { name: 'Yorion', color: '#333333' },
      ],
    });
  }

  it('lists every player as alive before any elimination', () => {
    const game = makeThreePlayerGame(40);

    expect(game.alivePlayers.map((player) => player.id)).toEqual(game.players.map((player) => player.id));
  });

  it('excludes eliminated players from alivePlayers', () => {
    const game = makeThreePlayerGame(1);
    const alara = game.players[0];
    const kess = game.players[1];
    const yorion = game.players[2];

    dealDamage(game, yorion.id, alara.id, 1); // Alara: 1 -> 0
    game.update(0.016);

    expect(game.alivePlayers.map((player) => player.id)).toEqual([kess.id, yorion.id]);
  });

  it('immediately ends the game with the given player recorded as winner', () => {
    const game = makeThreePlayerGame(40);
    const kess = game.players[1];

    game.endGameWithWinner(kess.id);

    expect(game.ended).toBe(true);
    expect(game.stats?.winnerId).toBe(kess.id);
  });

  it('leaves life/turn/damage state unchanged when ending manually', () => {
    const game = makeThreePlayerGame(40);
    const kess = game.players[1];

    game.endGameWithWinner(kess.id);

    expect(game.players.map((player) => player.life)).toEqual([40, 40, 40]);
    expect(game.turnCount).toBe(0);
  });

  it('is a no-op once the game has already ended', () => {
    const game = makeThreePlayerGame(40);
    const kess = game.players[1];
    const yorion = game.players[2];

    game.endGameWithWinner(kess.id);
    game.endGameWithWinner(yorion.id);

    expect(game.stats?.winnerId).toBe(kess.id);
  });

  it('is a no-op for an eliminated player id', () => {
    const game = makeThreePlayerGame(1);
    const alara = game.players[0];
    const yorion = game.players[2];

    dealDamage(game, yorion.id, alara.id, 1); // Alara: 1 -> 0
    game.update(0.016);

    game.endGameWithWinner(alara.id);

    expect(game.ended).toBe(false);
    expect(game.stats).toBeNull();
  });

  it('is a no-op for an unknown player id', () => {
    const game = makeThreePlayerGame(40);

    game.endGameWithWinner('not-a-real-id');

    expect(game.ended).toBe(false);
  });
});

// Issue #88: canvas-wide screen-shake on impactful damage actions. The
// trigger/decay math itself lives in src/game/screenShake.ts and is unit
// tested there independent of Game/rendering; these tests only cover how
// Game wires it in (shakeTrigger exposed to UI menus, elimination shaking
// harder than a routine damage tick, hit-testing staying unaffected).
describe('screen shake (issue #88)', () => {
  function makeThreePlayerGame(startingLife: number): Game {
    return new Game({ playerCount: 3, startingLife, players: [] });
  }

  it('starts with no trauma', () => {
    const game = makeThreePlayerGame(40);

    expect(game.shakeTrauma).toBe(0);
  });

  it('exposes a shakeTrigger that raises trauma, e.g. for a damage-menu action', () => {
    const game = makeThreePlayerGame(40);

    game.shakeTrigger.trigger(0.4);

    expect(game.shakeTrauma).toBeCloseTo(0.4, 5);
  });

  it('decays trauma over successive update() calls', () => {
    const game = makeThreePlayerGame(40);
    game.shakeTrigger.trigger(1);

    game.update(0.05);
    const afterOneFrame = game.shakeTrauma;
    game.update(0.05);

    expect(afterOneFrame).toBeGreaterThan(0);
    expect(afterOneFrame).toBeLessThan(1);
    expect(game.shakeTrauma).toBeLessThan(afterOneFrame);
  });

  it('shakes harder when a player is eliminated than a routine damage-menu trigger', () => {
    const eliminationGame = makeThreePlayerGame(1);
    dealDamage(eliminationGame, eliminationGame.players[1].id, eliminationGame.players[0].id, 1); // Alara: 1 -> 0
    eliminationGame.update(0.016); // checkEndConditions runs every frame, then decays trauma once

    const routineGame = makeThreePlayerGame(40);
    routineGame.shakeTrigger.trigger(0.4); // e.g. a plain damage-menu tick
    routineGame.update(0.016); // same single frame of decay

    expect(eliminationGame.shakeTrauma).toBeGreaterThan(routineGame.shakeTrauma);
  });

  it('leaves hit-testing (e.g. the undo control) unaffected while trauma is active', () => {
    const game = makeThreePlayerGame(40);
    game.resize(400, 900);
    game.shakeTrigger.trigger(1);

    expect(game.isOverUndoControl(200, 450)).toBe(true);
    expect(game.isOverUndoControl(0, 0)).toBe(false);
  });
});

// Issue #89: per-zone visual effect confirming every life/counter change. The
// trigger/expiry math itself lives in src/game/zoneEffect.ts and is unit
// tested there independent of Game/rendering; these tests only cover how
// Game wires it in (zoneEffectTrigger exposed to UI menus, per-player
// zoneEffectFor state, multiple zones flashing independently at once).
describe('zone effect (issue #89)', () => {
  function makeThreePlayerGame(startingLife: number): Game {
    return new Game({ playerCount: 3, startingLife, players: [] });
  }

  it('starts with no active zone effect for any player', () => {
    const game = makeThreePlayerGame(40);

    game.players.forEach((player) => expect(game.zoneEffectFor(player.id)).toBeNull());
  });

  it('exposes a zoneEffectTrigger that starts a flash for the given player, e.g. for a damage-menu action', () => {
    const game = makeThreePlayerGame(40);
    const [, target] = game.players;

    game.zoneEffectTrigger.trigger(target.id, 'damage', '#ef4444');

    expect(game.zoneEffectFor(target.id)).toEqual({ type: 'damage', color: '#ef4444', progress: 0 });
  });

  it('fades and eventually clears the flash over successive update() calls', () => {
    const game = makeThreePlayerGame(40);
    const [, target] = game.players;
    game.zoneEffectTrigger.trigger(target.id, 'heal', '#22c55e');

    game.update(0.2);
    const midProgress = game.zoneEffectFor(target.id)?.progress ?? 0;
    game.update(1);

    expect(midProgress).toBeGreaterThan(0);
    expect(midProgress).toBeLessThan(1);
    expect(game.zoneEffectFor(target.id)).toBeNull();
  });

  it('flashes multiple zones independently at once, e.g. a board-wide "damage all players" shortcut', () => {
    const game = makeThreePlayerGame(40);

    applyBoardShortcutDelta(
      game.players,
      game.activeIndex,
      'all',
      3,
      game.undoStack,
      undefined,
      undefined,
      game.zoneEffectTrigger,
    );

    game.players.forEach((player) => {
      expect(game.zoneEffectFor(player.id)).toEqual({ type: 'damage', color: '#ef4444', progress: 0 });
    });
  });

  it('leaves hit-testing (e.g. the undo control) unaffected while a zone effect is active', () => {
    const game = makeThreePlayerGame(40);
    game.resize(400, 900);
    game.zoneEffectTrigger.trigger(game.players[0].id, 'poison', '#a855f7');

    expect(game.isOverUndoControl(200, 450)).toBe(true);
    expect(game.isOverUndoControl(0, 0)).toBe(false);
  });
});

// Issue #45: landscape overlays (setup screen, commander-damage panel, stats
// screen) were unbounded and could grow taller than a short landscape
// viewport, burying player zones/life totals behind them.
describe('computeOverlaySafeArea', () => {
  it('leaves overlay height unconstrained in portrait', () => {
    expect(computeOverlaySafeArea(400, 800).maxHeight).toBe(800);
  });

  it.each([
    [812, 375],
    [896, 414],
  ])('caps overlay height below the %ix%i landscape viewport', (width, height) => {
    const { maxHeight } = computeOverlaySafeArea(width, height);
    expect(maxHeight).toBeLessThan(height);
    expect(maxHeight).toBeGreaterThan(0);
  });

  it('treats a square canvas as portrait (unconstrained)', () => {
    expect(computeOverlaySafeArea(500, 500).maxHeight).toBe(500);
  });
});

// Issue #114: the setup screen's "Start Game" CTA is pinned to the bottom of
// an overlay sized off computeOverlaySafeArea. Sizing that off the layout
// viewport alone (window.innerWidth/innerHeight) ignores the on-screen
// keyboard shrinking the *visible* viewport, so the CTA could end up
// rendered below the visible/tappable area while a player name field is
// focused. resolveOverlayViewportSize is what main.ts calls before
// computeOverlaySafeArea to prefer the (keyboard-aware) visual viewport.
describe('resolveOverlayViewportSize (issue #114)', () => {
  it('falls back to the layout viewport when there is no visual viewport', () => {
    expect(resolveOverlayViewportSize(400, 800, null)).toEqual({ width: 400, height: 800 });
    expect(resolveOverlayViewportSize(400, 800, undefined)).toEqual({ width: 400, height: 800 });
  });

  it('prefers the visual viewport size when present, e.g. shrunk by an open soft keyboard', () => {
    // Layout viewport stays 400x800 while the keyboard covers ~40% of it.
    const shrunkByKeyboard = resolveOverlayViewportSize(400, 800, { width: 400, height: 480 });
    expect(shrunkByKeyboard).toEqual({ width: 400, height: 480 });

    const { maxHeight } = computeOverlaySafeArea(shrunkByKeyboard.width, shrunkByKeyboard.height);
    expect(maxHeight).toBe(480); // overlay (and its bottom-pinned CTA) now fits above the keyboard
  });
});

describe('Game overlay safe area', () => {
  it('reflects the most recent resize() call', () => {
    const game = new Game({ playerCount: 4, startingLife: 40, players: [] });

    game.resize(400, 900);
    expect(game.overlaySafeArea.maxHeight).toBe(900);

    game.resize(812, 375); // common landscape phone size, per issue #45
    expect(game.overlaySafeArea.maxHeight).toBeLessThan(375);
  });
});

describe('pause/resume (issue #97)', () => {
  it('starts unpaused', () => {
    const game = new Game();
    expect(game.paused).toBe(false);
  });

  it('togglePause() flips the paused state', () => {
    const game = new Game();

    game.togglePause();
    expect(game.paused).toBe(true);

    game.togglePause();
    expect(game.paused).toBe(false);
  });

  it('tapping the pause control toggles paused, same as togglePause()', () => {
    const game = new Game();
    game.resize(400, 800);
    // Mirrors PauseControl's reflow math (just clear of UndoControl, opposite ShortcutControl).
    const pauseX = 200 - 0.079 * 400 - 0.02 * 400 - 0.079 * 400;
    const pauseY = 400;

    game.onTap(pauseX, pauseY);
    expect(game.paused).toBe(true);

    game.onTap(pauseX, pauseY);
    expect(game.paused).toBe(false);
  });

  it('freezes the turn timer while paused and resumes without a time-jump', () => {
    const game = new Game();

    game.update(3);
    expect(game.turnTimerS).toBeCloseTo(3, 5);

    game.togglePause();
    game.update(5); // frozen while paused
    expect(game.turnTimerS).toBeCloseTo(3, 5);

    game.togglePause();
    game.update(2); // resumes exactly where it left off
    expect(game.turnTimerS).toBeCloseTo(5, 5);
  });

  it('resets the turn timer to 0 each time the turn passes', () => {
    const game = new Game();

    game.update(4);
    game.passTurn();

    expect(game.turnTimerS).toBeCloseTo(0, 5);
  });

  it('freezes match duration while paused and resumes without a time-jump', () => {
    const game = new Game({
      playerCount: 3,
      startingLife: 1,
      players: [
        { name: 'Alara', color: '#111111' },
        { name: 'Kess', color: '#222222' },
        { name: 'Yorion', color: '#333333' },
      ],
    });
    const alara = game.players[0];
    const kess = game.players[1];
    const yorion = game.players[2];

    game.update(2);
    game.togglePause();
    game.update(10); // frozen while paused
    game.togglePause();
    game.update(3); // resumes exactly where it left off

    dealDamage(game, kess.id, alara.id, 1); // eliminate Alara
    dealDamage(game, kess.id, yorion.id, 1); // eliminate Yorion, Kess wins
    game.update(0); // checkEndConditions runs every frame; dt=0 keeps duration exact

    expect(game.stats?.durationS).toBeCloseTo(5, 5);
  });

  it('disables long-press pass-turn while paused', () => {
    const game = new Game();
    game.resize(400, 800);
    const zoneHeight = 800 / game.playerCount;

    game.togglePause();
    game.passTurnFromZoneLongPress(50, zoneHeight - 10); // seat 0's zone, the active seat

    expect(game.activeIndex).toBe(0);
  });

  it('disables drag-to-attack (resolveZoneDrag) while paused', () => {
    const game = new Game();
    game.resize(400, 800);
    const zoneHeight = 800 / game.playerCount;

    game.togglePause();

    expect(game.resolveZoneDrag(50, zoneHeight + 10, 50, zoneHeight * 2 + 10)).toBeNull();
  });

  it('disables the live drag-arrow preview (beginDrag) while paused', () => {
    const game = new Game();
    game.resize(400, 800);

    game.togglePause();
    game.beginDrag(50, 10);

    expect(game.dragArrow).toBeNull();
  });

  it('disables tapping the undo control while paused, even though it sits under the PAUSED label', () => {
    const game = new Game();
    game.resize(400, 800);
    const player = game.players[0];
    const attackerId = game.players[1].id;
    dealDamage(game, attackerId, player.id, 1); // life: 40 -> 39
    expect(game.canUndo).toBe(true);

    game.togglePause();
    game.onTap(200, 400); // UndoControl.reflow centers it at width/2, height/2

    expect(game.canUndo).toBe(true);
    expect(player.life).toBe(39);

    game.togglePause();
    game.onTap(200, 400);

    expect(game.canUndo).toBe(false);
    expect(player.life).toBe(40);
  });
});

describe('active-player zone pulse border uses the foil accent, not the pre-redesign blue (issue #197)', () => {
  /**
   * Stands in for CanvasRenderingContext2D across a full Game.render() pass:
   * any method call is a no-op, any property read/write is recorded on a
   * plain object, and createLinearGradient/createRadialGradient return stubs
   * whose addColorStop calls are captured so gradient stops can be asserted
   * on directly instead of parsing canvas draw commands.
   */
  function createRecordingCtx(linearGradientStops: Array<Array<[number, string]>>): CanvasRenderingContext2D {
    const state: Record<string, unknown> = {};
    return new Proxy(state, {
      get(target, prop: string) {
        if (prop === 'createLinearGradient') {
          return () => {
            const stops: Array<[number, string]> = [];
            linearGradientStops.push(stops);
            return { addColorStop: (offset: number, color: string) => stops.push([offset, color]) };
          };
        }
        if (prop === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        if (prop in target) {
          return target[prop];
        }
        return () => {};
      },
      set(target, prop: string, value) {
        target[prop] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
  }

  it('strokes the active zone border with the brass->ember foil gradient, with pulse-driven opacity preserved', () => {
    const game = new Game();
    game.resize(400, 800);
    const linearGradientStops: Array<Array<[number, string]>> = [];
    const ctx = createRecordingCtx(linearGradientStops);

    game.render(ctx, 400, 800);

    // The shared control disc (issue #198) also calls createLinearGradient
    // for its own bevel fill and rim highlight; isolate the zone pulse
    // border's gradient by its distinguishing shape — both of its stops
    // share one pulse-driven alpha, unlike the disc's gradients whose stops
    // use fixed, differing alphas.
    const stopAlpha = (stop: [number, string]): string | undefined => stop[1].match(/,\s*([\d.]+)\)/)?.[1];
    const pulseGradients = linearGradientStops.filter(([first, second]) => {
      const firstAlpha = stopAlpha(first);
      return firstAlpha !== undefined && firstAlpha === stopAlpha(second);
    });
    expect(pulseGradients).toHaveLength(1);
    const [brassStop, emberStop] = pulseGradients[0];
    expect(brassStop[1]).toContain('215, 165, 76'); // #d7a54c
    expect(emberStop[1]).toContain('226, 103, 63'); // #e2673f
    expect(brassStop[1]).not.toContain('91, 140, 255');
    expect(emberStop[1]).not.toContain('91, 140, 255');
  });

  it('leaves idle (non-active) zone borders unaffected', () => {
    const game = new Game();
    game.resize(400, 800);
    const linearGradientStops: Array<Array<[number, string]>> = [];
    const strokeStyles: unknown[] = [];
    const ctx = createRecordingCtx(linearGradientStops);
    ctx.strokeRect = () => {
      strokeStyles.push(ctx.strokeStyle);
    };

    game.render(ctx, 400, 800);

    // One strokeRect call per seat's zone border; only the active seat's is a gradient.
    const gradientStrokeCount = strokeStyles.filter((style) => typeof style === 'object').length;
    const idleStrokeStyles = strokeStyles.filter((style) => typeof style === 'string');
    expect(gradientStrokeCount).toBe(1);
    expect(idleStrokeStyles.length).toBeGreaterThan(0);
    idleStrokeStyles.forEach((style) => {
      expect(style).toBe('rgba(255, 255, 255, 0.12)');
    });
  });
});

describe('canvas player-name text uses the display font, uppercase, tracked (issue #199)', () => {
  /** Records every fillText call along with the ctx.font/letterSpacing in effect at call time. */
  function createTextRecordingCtx(): {
    ctx: CanvasRenderingContext2D;
    fillTextCalls: Array<{ text: string; font: string; letterSpacing: string }>;
  } {
    const state: Record<string, unknown> = { font: '', letterSpacing: '0px' };
    const fillTextCalls: Array<{ text: string; font: string; letterSpacing: string }> = [];
    const ctx = new Proxy(state, {
      get(target, prop: string) {
        if (prop === 'fillText') {
          return (text: string) => {
            fillTextCalls.push({ text, font: target.font as string, letterSpacing: target.letterSpacing as string });
          };
        }
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        if (prop in target) {
          return target[prop];
        }
        return () => {};
      },
      set(target, prop: string, value) {
        target[prop] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, fillTextCalls };
  }

  it('draws the player name uppercase in the display font with letter-spacing, without changing the life/timer text', () => {
    const game = new Game();
    game.resize(400, 800);
    game.players[0].name = 'alice';
    const { ctx, fillTextCalls } = createTextRecordingCtx();

    game.render(ctx, 400, 800);

    const nameCall = fillTextCalls.find((call) => call.text === 'ALICE');
    expect(nameCall).toBeDefined();
    expect(nameCall!.font).toContain(DISPLAY_FONT_STACK);
    expect(nameCall!.letterSpacing).not.toBe('0px');

    const lifeCall = fillTextCalls.find((call) => call.text === String(game.players[0].life));
    expect(lifeCall).toBeDefined();
    expect(lifeCall!.font).toContain(DISPLAY_FONT_STACK);

    const timerCall = fillTextCalls.find((call) => /^\d{1,2}:\d{2}$/.test(call.text));
    expect(timerCall).toBeDefined();
    expect(timerCall!.font).toContain(DISPLAY_FONT_STACK);
    expect(timerCall!.letterSpacing).toBe('0px');
  });
});
