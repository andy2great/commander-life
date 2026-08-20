// Core game logic. Keep this file free of DOM globals so it stays unit-testable;
// everything that touches the canvas element lives in main.ts.

import { advanceTurn, createTurnState, type TurnState } from './game/turn';
import {
  createCommanderDamageState,
  type CommanderDamageState,
  type Player,
  type UndoAction,
  type UndoStack,
} from './game/commanderDamage';
import { PassTurnControl } from './ui/controls';

export function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

const ACTIVE_ZONE_COLOR = '#5b8cff';
const IDLE_ZONE_COLOR = 'rgba(255, 255, 255, 0.12)';
const STARTING_LIFE = 40;

// Tap-and-hold ramp: repeated ticks start after RAMP_DELAY_S of holding, then
// speed up from RAMP_START_INTERVAL_S down to RAMP_MIN_INTERVAL_S per docs/concept.md.
const RAMP_DELAY_S = 0.6;
const RAMP_START_INTERVAL_S = 0.2;
const RAMP_MIN_INTERVAL_S = 0.05;
const RAMP_ACCEL_S = 1;

interface HoldState {
  playerId: string;
  delta: 1 | -1;
  heldFor: number;
  sinceLastTick: number;
}

class ArrayUndoStack implements UndoStack {
  private readonly actions: UndoAction[] = [];

  push(action: UndoAction): void {
    this.actions.push(action);
  }
}

export class Game {
  readonly playerCount = 4;
  private turnState: TurnState = createTurnState();
  private readonly control = new PassTurnControl();
  private readonly playersList: Player[] = Array.from({ length: this.playerCount }, (_, seat) => ({
    id: `p${seat + 1}`,
    name: `Player ${seat + 1}`,
    life: STARTING_LIFE,
  }));
  private readonly damage: CommanderDamageState = createCommanderDamageState(
    this.playersList.map((player) => player.id),
  );
  private readonly stack: UndoStack = new ArrayUndoStack();
  private height = 0;
  private hold: HoldState | undefined;

  get activeIndex(): number {
    return this.turnState.activeIndex;
  }

  get turnCount(): number {
    return this.turnState.turnCount;
  }

  get players(): Player[] {
    return this.playersList;
  }

  get damageState(): CommanderDamageState {
    return this.damage;
  }

  get undoStack(): UndoStack {
    return this.stack;
  }

  update(dt: number): void {
    if (!this.hold) {
      return;
    }

    this.hold.heldFor += dt;
    if (this.hold.heldFor < RAMP_DELAY_S) {
      return;
    }

    this.hold.sinceLastTick += dt;
    const rampElapsed = this.hold.heldFor - RAMP_DELAY_S;
    const interval = Math.max(
      RAMP_MIN_INTERVAL_S,
      RAMP_START_INTERVAL_S -
        (RAMP_START_INTERVAL_S - RAMP_MIN_INTERVAL_S) * Math.min(1, rampElapsed / RAMP_ACCEL_S),
    );

    while (this.hold.sinceLastTick >= interval) {
      this.hold.sinceLastTick -= interval;
      this.applyLifeDelta(this.hold.playerId, this.hold.delta);
    }
  }

  /** Recomputes control placement for the current canvas size. Also called by render(). */
  resize(width: number, height: number): void {
    this.height = height;
    this.control.reflow(width, height);
  }

  onTap(x: number, y: number): void {
    if (this.control.containsPoint(x, y)) {
      this.turnState = advanceTurn(this.turnState, this.playerCount);
      return;
    }

    const zone = this.zoneAt(x, y);
    if (!zone) {
      return;
    }

    const delta = zone.half === 'upper' ? 1 : -1;
    this.applyLifeDelta(zone.playerId, delta);
    this.hold = { playerId: zone.playerId, delta, heldFor: 0, sinceLastTick: 0 };
  }

  /** Call on pointerup/pointercancel/pointerleave to stop any in-progress ramp. */
  onTapEnd(): void {
    this.hold = undefined;
  }

  /** Returns the id of the player zone under (x, y), or null over the shared control or outside any zone. */
  onLongPress(x: number, y: number): string | null {
    if (this.control.containsPoint(x, y)) {
      return null;
    }
    return this.playerIdAt(x, y);
  }

  private playerIdAt(_x: number, y: number): string | null {
    if (this.height <= 0) {
      return null;
    }
    const zoneHeight = this.height / this.playerCount;
    const seat = Math.floor(y / zoneHeight);
    if (seat < 0 || seat >= this.playerCount) {
      return null;
    }
    return this.playersList[seat].id;
  }

  /** Returns the player zone and which half (x, y) falls in, or null outside any zone. */
  private zoneAt(x: number, y: number): { playerId: string; half: 'upper' | 'lower' } | null {
    const playerId = this.playerIdAt(x, y);
    if (!playerId) {
      return null;
    }
    const zoneHeight = this.height / this.playerCount;
    const offsetInZone = y % zoneHeight;
    const half = offsetInZone < zoneHeight / 2 ? 'upper' : 'lower';
    return { playerId, half };
  }

  private applyLifeDelta(playerId: string, delta: number): void {
    const player = this.playersList.find((candidate) => candidate.id === playerId);
    if (!player) {
      return;
    }
    player.life += delta;
    this.stack.push({
      undo(): void {
        player.life -= delta;
      },
    });
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    this.resize(width, height);
    ctx.clearRect(0, 0, width, height);

    this.drawZones(ctx, width, height);
    this.control.draw(ctx);
  }

  private drawZones(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const zoneHeight = height / this.playerCount;
    for (let seat = 0; seat < this.playerCount; seat += 1) {
      const y = seat * zoneHeight;
      const isActive = seat === this.turnState.activeIndex;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.fillRect(0, y, width, zoneHeight);

      ctx.lineWidth = isActive ? 4 : 1;
      ctx.strokeStyle = isActive ? ACTIVE_ZONE_COLOR : IDLE_ZONE_COLOR;
      ctx.strokeRect(1, y + 1, width - 2, zoneHeight - 2);
    }
  }
}
