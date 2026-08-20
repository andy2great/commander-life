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

const ACTIVE_ZONE_COLOR_RGB = '91, 140, 255';
const IDLE_ZONE_COLOR = 'rgba(255, 255, 255, 0.12)';
const STARTING_LIFE = 40;
const BACKGROUND_COLOR = '#121016';

// The 6 preset saturated accent colors from docs/concept.md, assigned to
// seats in order (crimson, teal, amber, violet, lime, sky).
const PLAYER_COLORS = ['#e11d48', '#14b8a6', '#f59e0b', '#8b5cf6', '#84cc16', '#38bdf8'];

// Active zone's pulsing border: sine-driven width/opacity per docs/concept.md.
const PULSE_SPEED_RAD_S = 4;
const PULSE_MIN_WIDTH = 3;
const PULSE_MAX_WIDTH = 7;

// Tap-and-hold ramp: repeated ticks start after RAMP_DELAY_S of holding, then
// speed up from RAMP_START_INTERVAL_S down to RAMP_MIN_INTERVAL_S per docs/concept.md.
const RAMP_DELAY_S = 0.6;
const RAMP_START_INTERVAL_S = 0.2;
const RAMP_MIN_INTERVAL_S = 0.05;
const RAMP_ACCEL_S = 1;

// Delta popup: floats upward and fades out over ~500ms using eased alpha, per docs/concept.md.
const POPUP_DURATION_S = 0.5;
const POPUP_RISE_PX = 46;

interface HoldState {
  playerId: string;
  delta: 1 | -1;
  heldFor: number;
  sinceLastTick: number;
}

interface DeltaPopup {
  playerId: string;
  x: number;
  y: number;
  delta: number;
  age: number;
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
  private readonly popupsList: DeltaPopup[] = [];
  private height = 0;
  private hold: HoldState | undefined;
  private animTime = 0;

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

  get popups(): DeltaPopup[] {
    return this.popupsList;
  }

  update(dt: number): void {
    this.animTime += dt;

    for (let i = this.popupsList.length - 1; i >= 0; i -= 1) {
      this.popupsList[i].age += dt;
      if (this.popupsList[i].age >= POPUP_DURATION_S) {
        this.popupsList.splice(i, 1);
      }
    }

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
    this.popupsList.push({ playerId: zone.playerId, x, y, delta, age: 0 });
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
    this.drawPopups(ctx);
    this.control.draw(ctx);
  }

  private drawPopups(ctx: CanvasRenderingContext2D): void {
    const zoneHeight = this.height / this.playerCount;
    for (const popup of this.popupsList) {
      const seat = this.playersList.findIndex((player) => player.id === popup.playerId);
      if (seat < 0) {
        continue;
      }
      const isTopRow = seat < this.playerCount / 2;
      const progress = clamp(popup.age / POPUP_DURATION_S, 0, 1);
      const eased = 1 - (1 - progress) * (1 - progress);

      ctx.save();
      ctx.translate(popup.x, popup.y);
      if (isTopRow) {
        ctx.rotate(Math.PI);
      }
      ctx.globalAlpha = 1 - eased;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(zoneHeight * 0.16)}px "Arial Black", system-ui, sans-serif`;
      ctx.fillText(popup.delta > 0 ? `+${popup.delta}` : `${popup.delta}`, 0, -POPUP_RISE_PX * eased);
      ctx.restore();
    }
  }

  private drawZones(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const zoneHeight = height / this.playerCount;
    for (let seat = 0; seat < this.playerCount; seat += 1) {
      const y = seat * zoneHeight;
      const isActive = seat === this.turnState.activeIndex;
      // Zones in the top half face the opposite seat, so their contents read
      // upright from there once rotated 180°.
      const isTopRow = seat < this.playerCount / 2;
      const player = this.playersList[seat];
      const cx = width / 2;
      const cy = y + zoneHeight / 2;

      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, zoneHeight) * 0.75);
      gradient.addColorStop(0, PLAYER_COLORS[seat % PLAYER_COLORS.length]);
      gradient.addColorStop(1, BACKGROUND_COLOR);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, y, width, zoneHeight);

      ctx.save();
      ctx.translate(cx, cy);
      if (isTopRow) {
        ctx.rotate(Math.PI);
      }

      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.textAlign = 'center';

      const lifeFontSize = Math.round(zoneHeight * 0.5);
      ctx.font = `800 ${lifeFontSize}px "Arial Black", system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(String(player.life), 0, 0);

      const nameFontSize = Math.round(zoneHeight * 0.14);
      ctx.font = `600 ${nameFontSize}px system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(player.name, 0, lifeFontSize / 2 + 4);

      ctx.restore();

      if (isActive) {
        const pulse = 0.5 + 0.5 * Math.sin(this.animTime * PULSE_SPEED_RAD_S);
        ctx.lineWidth = PULSE_MIN_WIDTH + (PULSE_MAX_WIDTH - PULSE_MIN_WIDTH) * pulse;
        ctx.strokeStyle = `rgba(${ACTIVE_ZONE_COLOR_RGB}, ${0.6 + 0.4 * pulse})`;
      } else {
        ctx.lineWidth = 1;
        ctx.strokeStyle = IDLE_ZONE_COLOR;
      }
      ctx.strokeRect(1, y + 1, width - 2, zoneHeight - 2);
    }
  }
}
