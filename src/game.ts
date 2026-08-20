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
import { PassTurnControl, UndoControl } from './ui/controls';

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
const BACKGROUND_COLOR = '#121016';

export const MIN_PLAYER_COUNT = 3;
export const MAX_PLAYER_COUNT = 6;
export const DEFAULT_PLAYER_COUNT = 4;
export const DEFAULT_STARTING_LIFE = 40;

// The 6 preset saturated accent colors from docs/concept.md, assigned to
// seats in order (crimson, teal, amber, violet, lime, sky).
export const PLAYER_COLORS = ['#e11d48', '#14b8a6', '#f59e0b', '#8b5cf6', '#84cc16', '#38bdf8'];

export interface PlayerConfig {
  name: string;
  color: string;
}

export interface GameConfig {
  playerCount: number;
  startingLife: number;
  players: PlayerConfig[];
}

export interface EliminationEntry {
  playerId: string;
  turnCount: number;
}

export interface GameStats {
  winnerId: string;
  durationS: number;
  /** Seconds each player spent as the active player, keyed by player id. */
  activeTimeS: Record<string, number>;
  eliminationOrder: EliminationEntry[];
}

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

  /** Pops and invokes the most recent action's undo(). Returns false if the stack was empty. */
  undo(): boolean {
    const action = this.actions.pop();
    if (!action) {
      return false;
    }
    action.undo();
    return true;
  }

  canUndo(): boolean {
    return this.actions.length > 0;
  }
}

export class Game {
  readonly playerCount: number;
  private turnState: TurnState = createTurnState();
  private readonly control = new PassTurnControl();
  private readonly undoControl = new UndoControl();
  private readonly playersList: Player[];
  private readonly damage: CommanderDamageState;
  private readonly stack = new ArrayUndoStack();
  private readonly popupsList: DeltaPopup[] = [];
  private height = 0;
  private hold: HoldState | undefined;
  private animTime = 0;
  private readonly activeTimeList: number[];
  private readonly eliminationOrderList: EliminationEntry[] = [];
  private endedFlag = false;
  private winnerId: string | null = null;
  private durationS = 0;

  constructor(config?: GameConfig) {
    this.playerCount = clamp(config?.playerCount ?? DEFAULT_PLAYER_COUNT, MIN_PLAYER_COUNT, MAX_PLAYER_COUNT);
    const startingLife = config?.startingLife ?? DEFAULT_STARTING_LIFE;
    this.playersList = Array.from({ length: this.playerCount }, (_, seat) => {
      const preset = config?.players[seat];
      return {
        id: `p${seat + 1}`,
        name: preset?.name || `Player ${seat + 1}`,
        life: startingLife,
        color: preset?.color || PLAYER_COLORS[seat % PLAYER_COLORS.length],
      };
    });
    this.damage = createCommanderDamageState(this.playersList.map((player) => player.id));
    this.activeTimeList = new Array(this.playerCount).fill(0);
  }

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

  /** True when there is at least one action to undo. */
  get canUndo(): boolean {
    return this.stack.canUndo();
  }

  /** True once the game has ended, manually or automatically. */
  get ended(): boolean {
    return this.endedFlag;
  }

  /** Stats for the end-game screen, or null until the game has ended. */
  get stats(): GameStats | null {
    if (!this.endedFlag || this.winnerId === null) {
      return null;
    }
    const activeTimeS: Record<string, number> = {};
    this.playersList.forEach((player, seat) => {
      activeTimeS[player.id] = this.activeTimeList[seat];
    });
    return {
      winnerId: this.winnerId,
      durationS: this.durationS,
      activeTimeS,
      eliminationOrder: [...this.eliminationOrderList],
    };
  }

  /** True when (x, y) — in the same coordinate space passed to resize — is over the shared center control. */
  isOverControl(x: number, y: number): boolean {
    return this.control.containsPoint(x, y);
  }

  /** True when (x, y) — in the same coordinate space passed to resize — is over the undo icon beside the shared center control. */
  isOverUndoControl(x: number, y: number): boolean {
    return this.undoControl.containsPoint(x, y);
  }

  /** Reverts the most recent life or commander-damage change. No-op if nothing to undo. */
  undo(): void {
    this.stack.undo();
  }

  /** Ends the game, e.g. from a long-press on the shared center control. No-op once already ended. */
  endGame(): void {
    if (this.endedFlag) {
      return;
    }
    this.checkEndConditions();
    if (this.endedFlag) {
      return;
    }
    // Per docs/concept.md: manually ending the game picks the highest-life player as winner.
    const winner = this.playersList.reduce((best, player) => (player.life > best.life ? player : best));
    this.finishGame(winner.id);
  }

  update(dt: number): void {
    if (this.endedFlag) {
      return;
    }
    this.checkEndConditions();
    if (this.endedFlag) {
      return;
    }

    this.animTime += dt;
    this.activeTimeList[this.turnState.activeIndex] += dt;

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
    // Snap to the nearest zone boundary rather than the exact geometric
    // center: for an odd player count, height / 2 falls exactly on the
    // middle zone's own center (where its life total is drawn), so the
    // shared control would render on top of it and swallow taps meant for
    // that zone. Zone boundaries are at k * zoneHeight; for an even player
    // count the nearest boundary already equals height / 2, so this is a
    // no-op there.
    const zoneHeight = height / this.playerCount;
    const controlCenterY = Math.floor(this.playerCount / 2) * zoneHeight;
    this.control.reflow(width, height, controlCenterY);
    this.undoControl.reflow(width, height, controlCenterY);
  }

  onTap(x: number, y: number): void {
    if (this.undoControl.containsPoint(x, y)) {
      this.undo();
      return;
    }

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

  /**
   * Reverts the life change from the current zone tap and disarms its ramp.
   * Call when a long-press on the same press supersedes the paired tap
   * (e.g. before opening the commander-damage panel), so the tap that had to
   * fire on pointerdown to support tap-and-hold ramping leaves no trace.
   * No-op if the current press isn't a zone hold.
   */
  cancelTap(): void {
    if (!this.hold) {
      return;
    }
    const { playerId, delta } = this.hold;
    this.hold = undefined;
    this.applyLifeDelta(playerId, -delta);
    const lastPopup = this.popupsList[this.popupsList.length - 1];
    if (lastPopup && lastPopup.playerId === playerId && lastPopup.delta === delta) {
      this.popupsList.pop();
    }
  }

  /** Returns the id of the player zone under (x, y), or null over the shared control or outside any zone. */
  onLongPress(x: number, y: number): string | null {
    if (this.control.containsPoint(x, y) || this.undoControl.containsPoint(x, y)) {
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
    this.checkEndConditions();
  }

  /**
   * Records newly-eliminated players (life at or below 0) and ends the game
   * automatically once only one player remains above 0 life, per
   * docs/concept.md step 6.
   */
  private checkEndConditions(): void {
    if (this.endedFlag) {
      return;
    }
    for (const player of this.playersList) {
      if (player.life <= 0 && !this.eliminationOrderList.some((entry) => entry.playerId === player.id)) {
        this.eliminationOrderList.push({ playerId: player.id, turnCount: this.turnState.turnCount });
      }
    }
    const alive = this.playersList.filter((player) => player.life > 0);
    if (alive.length === 1) {
      this.finishGame(alive[0].id);
    }
  }

  private finishGame(winnerId: string): void {
    if (this.endedFlag) {
      return;
    }
    this.endedFlag = true;
    this.winnerId = winnerId;
    this.durationS = this.animTime;
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    this.resize(width, height);
    ctx.clearRect(0, 0, width, height);

    this.drawZones(ctx, width, height);
    this.drawPopups(ctx);
    this.control.draw(ctx);
    this.undoControl.draw(ctx, this.canUndo);
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
      gradient.addColorStop(0, player.color ?? PLAYER_COLORS[seat % PLAYER_COLORS.length]);
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
