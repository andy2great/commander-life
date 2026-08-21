import { describe, expect, it } from 'vitest';
import { Game, clamp, computeOverlaySafeArea, computeZoneRects } from './game';
import { clockwiseSeatOrder } from './game/turn';
import { applyCommanderDamageDelta } from './game/commanderDamage';
import { applyPoisonDelta } from './game/poison';
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
  applyCommanderDamageDelta(game.damageState, game.players, toId, fromId, amount, game.undoStack, sound);
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
        game.players.slice(1).map((player) => [player.id, 0]),
      ),
    );
  });

  it('starts every player at 0 poison counters', () => {
    const game = new Game();

    expect(game.poisonState).toEqual(
      Object.fromEntries(game.players.map((player) => [player.id, 0])),
    );
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

  describe('resolveZoneDrag (issue #48)', () => {
    it('resolves a drag from one zone to a different zone, without itself changing any total', () => {
      const game = new Game();
      game.resize(400, 800);
      const zoneHeight = 800 / game.playerCount;
      const livesBefore = game.players.map((player) => player.life);

      const drag = game.resolveZoneDrag(50, zoneHeight + 10, 50, zoneHeight * 2 + 10);

      expect(drag).toEqual({ fromPlayerId: game.players[0].id, toPlayerId: game.players[2].id });
      expect(game.players.map((player) => player.life)).toEqual(livesBefore);
      expect(game.damageState[game.players[2].id][game.players[0].id]).toBe(0);
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

  describe('dragArrow live preview (issue #55)', () => {
    it('is null before any drag starts', () => {
      const game = new Game();
      game.resize(400, 800);

      expect(game.dragArrow).toBeNull();
    });

    it('beginDrag inside a player zone starts an arrow from that zone\'s center to the pointer, with no target yet', () => {
      const game = new Game();
      game.resize(400, 800);
      const originRect = computeZoneRects(game.playerCount, 400, 800)[0];

      game.beginDrag(50, 10);

      expect(game.dragArrow).toEqual({
        fromPlayerId: game.players[0].id,
        originX: originRect.x + originRect.width / 2,
        originY: originRect.y + originRect.height / 2,
        headX: 50,
        headY: 10,
        targetPlayerId: null,
        color: game.players[0].color,
      });
    });

    it('beginDrag outside every player zone (e.g. over a shared control) starts no arrow', () => {
      const game = new Game();
      game.resize(400, 800);

      game.beginDrag(200, 400); // center control

      expect(game.dragArrow).toBeNull();
    });

    it('updateDragPointer moves the arrow head while no valid target is under the pointer', () => {
      const game = new Game();
      game.resize(400, 800);
      const zoneHeight = 800 / game.playerCount;

      game.beginDrag(50, 10);
      game.updateDragPointer(60, zoneHeight - 20); // still inside the origin zone

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
      expect(game.dragArrow).not.toBeNull();

      game.endDrag();

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

  it('clamps a configured player count to the 3-6 range', () => {
    const tooFew = new Game({ playerCount: 1, startingLife: 40, players: [] });
    const tooMany = new Game({ playerCount: 9, startingLife: 40, players: [] });

    expect(tooFew.playerCount).toBe(3);
    expect(tooMany.playerCount).toBe(6);
  });

  it.each([3, 4, 5, 6])(
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

  it.each([3, 4, 5, 6])(
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

  describe('5-player lone seat layout (issue #77)', () => {
    it('gives the fifth seat its own full-width rotated zone at the top, with the other four upright below it', () => {
      const width = 400;
      const height = 900;
      const rects = computeZoneRects(5, width, height);

      expect(rects).toEqual([
        { x: 0, y: 0, width, height: height / 2, rotated: true },
        { x: 0, width: width / 4, y: height / 2, height: height / 2, rotated: false },
        { x: width / 4, width: width / 4, y: height / 2, height: height / 2, rotated: false },
        { x: (width / 4) * 2, width: width / 4, y: height / 2, height: height / 2, rotated: false },
        { x: (width / 4) * 3, width: width / 4, y: height / 2, height: height / 2, rotated: false },
      ]);
    });

    it('resolves taps and drags to the lone seat (seat 0) from anywhere in its full-width zone', () => {
      const game = new Game({ playerCount: 5, startingLife: 40, players: [] });
      const width = 400;
      const height = 900;
      game.resize(width, height);
      const loneSeat = game.players[0];

      const dragToLoneSeat = game.resolveZoneDrag(width - 20, height - 20, 20, 20);

      expect(dragToLoneSeat).toEqual({ fromPlayerId: game.players[4].id, toPlayerId: loneSeat.id });
    });

    it('resolves taps and drags to each of the four upright seats sharing the bottom row', () => {
      const game = new Game({ playerCount: 5, startingLife: 40, players: [] });
      const width = 400;
      const height = 900;
      game.resize(width, height);
      const rects = computeZoneRects(5, width, height);

      for (let seat = 1; seat <= 4; seat += 1) {
        const rect = rects[seat];
        const drag = game.resolveZoneDrag(20, 20, rect.x + rect.width / 2, rect.y + rect.height / 2);

        expect(drag).toEqual({ fromPlayerId: game.players[0].id, toPlayerId: game.players[seat].id });
      }
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

describe('Game overlay safe area', () => {
  it('reflects the most recent resize() call', () => {
    const game = new Game({ playerCount: 4, startingLife: 40, players: [] });

    game.resize(400, 900);
    expect(game.overlaySafeArea.maxHeight).toBe(900);

    game.resize(812, 375); // common landscape phone size, per issue #45
    expect(game.overlaySafeArea.maxHeight).toBeLessThan(375);
  });
});
