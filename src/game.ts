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

  update(_dt: number): void {
    // No per-frame simulation yet; kept so main.ts's frame loop stays simple.
  }

  /** Recomputes control placement for the current canvas size. Also called by render(). */
  resize(width: number, height: number): void {
    this.height = height;
    this.control.reflow(width, height);
  }

  onTap(x: number, y: number): void {
    if (this.control.containsPoint(x, y)) {
      this.turnState = advanceTurn(this.turnState, this.playerCount);
    }
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
