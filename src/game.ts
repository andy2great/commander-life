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

// Half-boundary affordance (issue #32): a subtle dividing line at the tap
// boundary plus persistent +/- glyphs, so each zone shows before any tap
// which half adds life and which removes it. The divider line is symmetric
// under a 180° turn so it stays put, but the +/- glyphs swap ends for a
// rotated (top-row) zone, mirroring zoneAt()'s rotation-aware half split
// below, so + always sits on that seat's own perceived "upper" side.
const HALF_DIVIDER_COLOR = 'rgba(255, 255, 255, 0.35)';
const HALF_GLYPH_BADGE_COLOR = 'rgba(0, 0, 0, 0.38)';

export const MIN_PLAYER_COUNT = 3;
export const MAX_PLAYER_COUNT = 6;
export const DEFAULT_PLAYER_COUNT = 4;
export const DEFAULT_STARTING_LIFE = 40;

// The 6 preset saturated accent colors from docs/concept.md, assigned to
// seats in order (crimson, teal, amber, violet, lime, sky).
export const PLAYER_COLORS = ['#e11d48', '#14b8a6', '#f59e0b', '#8b5cf6', '#84cc16', '#38bdf8'];

// Table-like grid layout per docs/concept.md: always two rows (top row
// rotated 180° to face the opposite seat, bottom row upright), each sized to
// fill half the canvas height, split into this many equal-width columns.
export const ROW_COUNTS_BY_PLAYER_COUNT: Record<number, [number, number]> = {
  3: [1, 2],
  4: [2, 2],
  5: [2, 3],
  6: [3, 3],
};

export interface ZoneRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Top row zones render rotated 180° so their contents read upright from that seat. */
  rotated: boolean;
}

/** Computes each seat's zone rect (in row-major, left-to-right order) for the current canvas size. */
export function computeZoneRects(playerCount: number, width: number, height: number): ZoneRect[] {
  const rowCounts = ROW_COUNTS_BY_PLAYER_COUNT[playerCount] ?? [Math.ceil(playerCount / 2), Math.floor(playerCount / 2)];
  const rowHeight = height / rowCounts.length;
  const rects: ZoneRect[] = [];
  rowCounts.forEach((count, rowIndex) => {
    const y = rowIndex * rowHeight;
    const colWidth = width / count;
    const rotated = rowIndex === 0;
    for (let col = 0; col < count; col += 1) {
      rects.push({ x: col * colWidth, y, width: colWidth, height: rowHeight, rotated });
    }
  });
  return rects;
}

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
  private zoneRects: ZoneRect[] = [];
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

  /** Recomputes zone and control placement for the current canvas size. Also called by render(). */
  resize(width: number, height: number): void {
    this.zoneRects = computeZoneRects(this.playerCount, width, height);
    // The grid is always two rows filling half the canvas height each, so
    // height / 2 is exactly the boundary between them — never a zone's own
    // center (where its life total is drawn) — for every player count.
    const controlCenterY = height / 2;
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

  private seatAt(x: number, y: number): number {
    return this.zoneRects.findIndex(
      (rect) => x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height,
    );
  }

  private playerIdAt(x: number, y: number): string | null {
    const seat = this.seatAt(x, y);
    if (seat === -1) {
      return null;
    }
    return this.playersList[seat].id;
  }

  /** Returns the player zone and which half (x, y) falls in, or null outside any zone. */
  private zoneAt(x: number, y: number): { playerId: string; half: 'upper' | 'lower' } | null {
    const seat = this.seatAt(x, y);
    if (seat === -1) {
      return null;
    }
    const rect = this.zoneRects[seat];
    const offsetInZone = y - rect.y;
    const nearRectStart = offsetInZone < rect.height / 2;
    // Top-row zones render rotated 180° to face that seat, so the small-offset
    // side of the rect (physically closest to the top edge of the phone) is
    // that player's own perceived "lower" half, the opposite of a bottom-row
    // (upright) zone where the small-offset side is their perceived "upper".
    const half = nearRectStart !== rect.rotated ? 'upper' : 'lower';
    return { playerId: this.playersList[seat].id, half };
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
   * Records newly-eliminated players (life at or below 0), clears the record
   * for anyone since restored above 0 life (e.g. via undo), and ends the game
   * automatically once only one player remains above 0 life, per
   * docs/concept.md step 6.
   */
  private checkEndConditions(): void {
    if (this.endedFlag) {
      return;
    }
    for (const player of this.playersList) {
      const eliminatedIndex = this.eliminationOrderList.findIndex((entry) => entry.playerId === player.id);
      if (player.life <= 0) {
        if (eliminatedIndex === -1) {
          this.eliminationOrderList.push({ playerId: player.id, turnCount: this.turnState.turnCount });
        }
      } else if (eliminatedIndex !== -1) {
        this.eliminationOrderList.splice(eliminatedIndex, 1);
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

    this.drawZones(ctx);
    this.drawPopups(ctx);
    this.control.draw(ctx);
    this.undoControl.draw(ctx, this.canUndo);
  }

  private drawPopups(ctx: CanvasRenderingContext2D): void {
    for (const popup of this.popupsList) {
      const seat = this.playersList.findIndex((player) => player.id === popup.playerId);
      const rect = this.zoneRects[seat];
      if (!rect) {
        continue;
      }
      const progress = clamp(popup.age / POPUP_DURATION_S, 0, 1);
      const eased = 1 - (1 - progress) * (1 - progress);
      const shortSide = Math.min(rect.width, rect.height);

      ctx.save();
      ctx.translate(popup.x, popup.y);
      if (rect.rotated) {
        ctx.rotate(Math.PI);
      }
      ctx.globalAlpha = 1 - eased;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(shortSide * 0.16)}px "Arial Black", system-ui, sans-serif`;
      ctx.fillText(popup.delta > 0 ? `+${popup.delta}` : `${popup.delta}`, 0, -POPUP_RISE_PX * eased);
      ctx.restore();
    }
  }

  private drawZones(ctx: CanvasRenderingContext2D): void {
    for (let seat = 0; seat < this.playerCount; seat += 1) {
      const rect = this.zoneRects[seat];
      const isActive = seat === this.turnState.activeIndex;
      const player = this.playersList[seat];
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const shortSide = Math.min(rect.width, rect.height);

      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rect.width, rect.height) * 0.75);
      gradient.addColorStop(0, player.color ?? PLAYER_COLORS[seat % PLAYER_COLORS.length]);
      gradient.addColorStop(1, BACKGROUND_COLOR);
      ctx.fillStyle = gradient;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

      this.drawHalfAffordance(ctx, rect);

      ctx.save();
      ctx.translate(cx, cy);
      if (rect.rotated) {
        ctx.rotate(Math.PI);
      }

      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.textAlign = 'center';

      const lifeFontSize = Math.round(shortSide * 0.5);
      ctx.font = `800 ${lifeFontSize}px "Arial Black", system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(String(player.life), 0, 0);

      const nameFontSize = Math.round(shortSide * 0.14);
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
      ctx.strokeRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
    }
  }

  /** Draws the always-visible +/- half-boundary affordance for one zone. See HALF_DIVIDER_COLOR above. */
  private drawHalfAffordance(ctx: CanvasRenderingContext2D, rect: ZoneRect): void {
    const midY = rect.y + rect.height / 2;
    const cx = rect.x + rect.width / 2;

    ctx.save();
    ctx.strokeStyle = HALF_DIVIDER_COLOR;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(rect.x, midY);
    ctx.lineTo(rect.x + rect.width, midY);
    ctx.stroke();
    ctx.restore();

    const shortSide = Math.min(rect.width, rect.height);
    const glyphSize = Math.max(14, Math.round(shortSide * 0.1));
    const margin = Math.max(glyphSize * 1.3, rect.height * 0.12);
    const plusY = rect.rotated ? rect.y + rect.height - margin : rect.y + margin;
    const minusY = rect.rotated ? rect.y + margin : rect.y + rect.height - margin;
    this.drawHalfGlyph(ctx, '+', cx, plusY, glyphSize);
    this.drawHalfGlyph(ctx, '−', cx, minusY, glyphSize);
  }

  /** Draws one +/- glyph on a small translucent badge for contrast against any of the 6 accent colors. */
  private drawHalfGlyph(ctx: CanvasRenderingContext2D, glyph: string, x: number, y: number, size: number): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, size * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = HALF_GLYPH_BADGE_COLOR;
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${size}px "Arial Black", system-ui, sans-serif`;
    ctx.fillText(glyph, x, y);
    ctx.restore();
  }
}
