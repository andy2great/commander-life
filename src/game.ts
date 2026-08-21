// Core game logic. Keep this file free of DOM globals so it stays unit-testable;
// everything that touches the canvas element lives in main.ts.

import { advanceTurn, createTurnState, ROW_COUNTS_BY_PLAYER_COUNT, type TurnState } from './game/turn';
import {
  createCommanderDamageState,
  type CommanderDamageState,
  type Player,
  type UndoAction,
  type UndoStack,
} from './game/commanderDamage';
import { createPoisonState, POISON_LETHAL, type PoisonState } from './game/poison';
import { UndoControl } from './ui/controls';
import { NoopSoundPlayer, type SoundPlayer } from './audio/soundPlayer';

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

// Zone-to-zone drag arrow (issue #55): drawn live from the origin zone to
// the pointer while a drag is in progress, so a Playgroup-style preview of
// the attacker/target pair is visible before resolveZoneDrag/AttackMenu.
// Sized relative to the shorter canvas dimension so it scales with the
// device/canvas size like the zone text does.
const ARROW_SHAFT_WIDTH_RATIO = 0.035;
const ARROW_HEAD_LENGTH_RATIO = 0.09;
const ARROW_HEAD_WIDTH_RATIO = 0.09;
const ARROW_TARGET_HIGHLIGHT_WIDTH_RATIO = 0.012;

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  return [
    parseInt(normalized.substring(0, 2), 16),
    parseInt(normalized.substring(2, 4), 16),
    parseInt(normalized.substring(4, 6), 16),
  ];
}

/** Blends a player accent color toward white, for the arrow's "3D" shaded gradient. */
function lightenColor(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.round(r + (255 - r) * amount)}, ${Math.round(g + (255 - g) * amount)}, ${Math.round(b + (255 - b) * amount)})`;
}

/** Blends a player accent color toward black, for the arrow's "3D" shaded gradient. */
function darkenColor(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.round(r * (1 - amount))}, ${Math.round(g * (1 - amount))}, ${Math.round(b * (1 - amount))})`;
}

export const MIN_PLAYER_COUNT = 3;
export const MAX_PLAYER_COUNT = 6;
export const DEFAULT_PLAYER_COUNT = 4;
export const DEFAULT_STARTING_LIFE = 40;

// The 6 preset saturated accent colors from docs/concept.md, assigned to
// seats in order (crimson, teal, amber, violet, lime, sky).
export const PLAYER_COLORS = ['#e11d48', '#14b8a6', '#f59e0b', '#8b5cf6', '#84cc16', '#38bdf8'];

// Landscape phones have far less vertical space than portrait, so a DOM
// overlay (setup screen, commander-damage panel, stats screen) sized for a
// tall portrait canvas can grow taller than the viewport and bury the player
// zones/life totals behind it (issue #45). Capping overlay height to this
// fraction of a landscape canvas leaves the rest of the game visible;
// portrait keeps the existing full-height layout unchanged.
export const OVERLAY_LANDSCAPE_MAX_HEIGHT_RATIO = 0.86;

export interface OverlaySafeArea {
  /** Max height, in px, a DOM overlay panel should occupy at the current canvas size. */
  maxHeight: number;
}

/** Safe height bound for DOM overlay panels (setup/damage/stats screens) at the given canvas size. */
export function computeOverlaySafeArea(width: number, height: number): OverlaySafeArea {
  const isLandscape = width > height;
  return { maxHeight: isLandscape ? height * OVERLAY_LANDSCAPE_MAX_HEIGHT_RATIO : height };
}

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

// Brief flash on the active zone the moment a long-press commits the turn
// pass (issue #64) — distinct from, and layered on top of, the idle pulsing
// border above.
const PASS_TURN_FLASH_DURATION_S = 0.35;

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

interface DragState {
  fromPlayerId: string;
  pointerX: number;
  pointerY: number;
}

/** Live preview of a zone-to-zone drag (issue #55), previewing what resolveZoneDrag would resolve if released now. */
export interface DragArrowState {
  fromPlayerId: string;
  originX: number;
  originY: number;
  /** Snapped to the target zone's center when targetPlayerId is set; otherwise the raw pointer position. */
  headX: number;
  headY: number;
  /** The zone under the pointer, only when it's a *different* player than fromPlayerId; null over empty space, the origin zone, or a shared control. */
  targetPlayerId: string | null;
  /** The attacking (origin) player's accent color. */
  color: string;
}

export class Game {
  readonly playerCount: number;
  private turnState: TurnState = createTurnState();
  private readonly undoControl = new UndoControl();
  private readonly playersList: Player[];
  private readonly damage: CommanderDamageState;
  private readonly poison: PoisonState;
  private readonly sound: SoundPlayer;
  private readonly stack = new ArrayUndoStack();
  private zoneRects: ZoneRect[] = [];
  private canvasWidth = 0;
  private canvasHeight = 0;
  private animTime = 0;
  private dragState: DragState | null = null;
  private passTurnFlashSeatIndex: number | null = null;
  private passTurnFlashTime = 0;
  private readonly activeTimeList: number[];
  private readonly eliminationOrderList: EliminationEntry[] = [];
  private endedFlag = false;
  private winnerId: string | null = null;
  private durationS = 0;

  constructor(config?: GameConfig, sound: SoundPlayer = new NoopSoundPlayer()) {
    this.sound = sound;
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
    this.poison = createPoisonState(this.playersList.map((player) => player.id));
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

  get poisonState(): PoisonState {
    return this.poison;
  }

  get undoStack(): UndoStack {
    return this.stack;
  }

  /** True when there is at least one action to undo. */
  get canUndo(): boolean {
    return this.stack.canUndo();
  }

  /** Safe height bound for DOM overlay panels at the current canvas size; see computeOverlaySafeArea(). */
  get overlaySafeArea(): OverlaySafeArea {
    return computeOverlaySafeArea(this.canvasWidth, this.canvasHeight);
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

  /** True when (x, y) — in the same coordinate space passed to resize — is over the shared center undo control. */
  isOverUndoControl(x: number, y: number): boolean {
    return this.undoControl.containsPoint(x, y);
  }

  /** The seat currently playing the turn-pass flash animation (issue #64), or null. */
  get passTurnFlashSeat(): number | null {
    return this.passTurnFlashSeatIndex;
  }

  /** Reverts the most recent life or commander-damage change. No-op if nothing to undo. */
  undo(): void {
    this.stack.undo();
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

    if (this.passTurnFlashSeatIndex !== null) {
      this.passTurnFlashTime += dt;
      if (this.passTurnFlashTime >= PASS_TURN_FLASH_DURATION_S) {
        this.passTurnFlashSeatIndex = null;
      }
    }
  }

  /** Recomputes zone and control placement for the current canvas size. Also called by render(). */
  resize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.zoneRects = computeZoneRects(this.playerCount, width, height);
    // The grid is always two rows filling half the canvas height each, so
    // height / 2 is exactly the boundary between them — never a zone's own
    // center (where its life total is drawn) — for every player count.
    const controlCenterY = height / 2;
    this.undoControl.reflow(width, height, controlCenterY);
  }

  onTap(x: number, y: number): void {
    if (this.undoControl.containsPoint(x, y)) {
      this.undo();
      return;
    }

    // Tapping a player's own zone no longer changes life — the zone-to-zone
    // drag → damage-type menu flow (resolveZoneDrag()) is the only way life
    // totals change (issue #54).
  }

  /** Advances the active player, e.g. from a long-press on the active player's zone. */
  passTurn(): void {
    const previousTurnState = this.turnState;
    this.turnState = advanceTurn(this.turnState, this.playerCount);
    this.sound.play('turnPass');
    this.stack.push({
      undo: (): void => {
        this.turnState = previousTurnState;
      },
    });
  }

  /**
   * Long-pressing (~LONG_PRESS_MS) inside the currently active player's own
   * zone passes the turn and triggers a brief flash animation on that zone
   * (issue #64, replacing the removed center PassTurnControl). No-op for a
   * long-press anywhere else — a non-active zone, empty space, or the undo
   * control.
   */
  passTurnFromZoneLongPress(x: number, y: number): void {
    const playerId = this.onLongPress(x, y);
    const activeSeat = this.turnState.activeIndex;
    if (playerId === null || playerId !== this.playersList[activeSeat].id) {
      return;
    }
    this.passTurnFlashSeatIndex = activeSeat;
    this.passTurnFlashTime = 0;
    this.passTurn();
  }

  /**
   * Returns the id of the player zone under (x, y), or null over a shared
   * control or outside any zone. Used both to target a long-press and, by
   * resolveZoneDrag() below, to resolve either end of a zone-to-zone drag.
   */
  onLongPress(x: number, y: number): string | null {
    if (this.undoControl.containsPoint(x, y)) {
      return null;
    }
    return this.playerIdAt(x, y);
  }

  /**
   * Resolves a zone-to-zone drag gesture: `from`/`to` are the pointer-down
   * and pointer-up positions, in the same coordinate space as resize().
   * Returns the attacking and target player ids when the press started in
   * one player's zone and released in a *different* player's zone; returns
   * null when it starts and ends in the same zone, either end is outside
   * every zone, or either end is over a shared control. Never itself
   * changes any life or damage total — the caller applies the confirmed
   * damage via applyCommanderDamageDelta/applyPoisonDelta once the dragging
   * player picks a damage type.
   */
  resolveZoneDrag(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ): { fromPlayerId: string; toPlayerId: string } | null {
    const fromPlayerId = this.onLongPress(fromX, fromY);
    const toPlayerId = this.onLongPress(toX, toY);
    if (!fromPlayerId || !toPlayerId || fromPlayerId === toPlayerId) {
      return null;
    }
    return { fromPlayerId, toPlayerId };
  }

  /**
   * Begins tracking the live drag arrow (issue #55), e.g. from main.ts's
   * onPressStart. No-op — clears any prior drag — if (x, y) isn't inside a
   * player zone (uses the same onLongPress rules resolveZoneDrag's `from`
   * end does, so a press starting over a shared control never shows an arrow).
   */
  beginDrag(x: number, y: number): void {
    const fromPlayerId = this.onLongPress(x, y);
    this.dragState = fromPlayerId ? { fromPlayerId, pointerX: x, pointerY: y } : null;
  }

  /** Updates the live drag arrow's pointer end, e.g. from main.ts's pointermove. No-op if no drag is in progress. */
  updateDragPointer(x: number, y: number): void {
    if (!this.dragState) {
      return;
    }
    this.dragState.pointerX = x;
    this.dragState.pointerY = y;
  }

  /** Clears the live drag arrow. Call on pointerup/pointercancel/pointerleave so it disappears immediately, whether or not the drag resolved into an opened menu. */
  endDrag(): void {
    this.dragState = null;
  }

  /** Live drag-arrow geometry/state for render(), or null when no zone-to-zone drag is in progress. */
  get dragArrow(): DragArrowState | null {
    if (!this.dragState) {
      return null;
    }
    const { fromPlayerId, pointerX, pointerY } = this.dragState;
    const fromSeat = this.playersList.findIndex((player) => player.id === fromPlayerId);
    const fromRect = this.zoneRects[fromSeat];
    if (!fromRect) {
      return null;
    }
    const originX = fromRect.x + fromRect.width / 2;
    const originY = fromRect.y + fromRect.height / 2;
    const color = this.playersList[fromSeat].color ?? PLAYER_COLORS[fromSeat % PLAYER_COLORS.length];

    const pointedPlayerId = this.onLongPress(pointerX, pointerY);
    const targetPlayerId = pointedPlayerId && pointedPlayerId !== fromPlayerId ? pointedPlayerId : null;

    return { fromPlayerId, originX, originY, headX: pointerX, headY: pointerY, targetPlayerId, color };
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

  /** True once a player's life is at or below 0, or their poison counter has reached the lethal threshold. */
  private isEliminated(player: Player): boolean {
    return player.life <= 0 || (this.poison[player.id] ?? 0) >= POISON_LETHAL;
  }

  /**
   * Records newly-eliminated players (life at or below 0, or poison at or
   * above the lethal threshold), clears the record for anyone since restored
   * below both thresholds (e.g. via undo), and ends the game automatically
   * once only one player remains, per docs/concept.md step 6.
   */
  private checkEndConditions(): void {
    if (this.endedFlag) {
      return;
    }
    for (const player of this.playersList) {
      const eliminatedIndex = this.eliminationOrderList.findIndex((entry) => entry.playerId === player.id);
      if (this.isEliminated(player)) {
        if (eliminatedIndex === -1) {
          this.eliminationOrderList.push({ playerId: player.id, turnCount: this.turnState.turnCount });
          this.sound.play('eliminate');
        }
      } else if (eliminatedIndex !== -1) {
        this.eliminationOrderList.splice(eliminatedIndex, 1);
      }
    }
    const alive = this.playersList.filter((player) => !this.isEliminated(player));
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
    this.sound.play('gameEnd');
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    this.resize(width, height);
    ctx.clearRect(0, 0, width, height);

    this.drawZones(ctx);
    this.drawDragArrow(ctx);
    this.undoControl.draw(ctx, this.canUndo);
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

      if (seat === this.passTurnFlashSeatIndex) {
        this.drawPassTurnFlash(ctx, rect);
      }
    }
  }

  /** Brief white flash on a zone the moment its long-press commits the turn pass (issue #64), fading out over PASS_TURN_FLASH_DURATION_S. */
  private drawPassTurnFlash(ctx: CanvasRenderingContext2D, rect: ZoneRect): void {
    const progress = clamp(this.passTurnFlashTime / PASS_TURN_FLASH_DURATION_S, 0, 1);
    const alpha = (1 - progress) * 0.6;

    ctx.save();
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
  }

  /** Draws the live zone-to-zone drag arrow (issue #55), plus a target-zone highlight when the pointer is over a valid target. */
  private drawDragArrow(ctx: CanvasRenderingContext2D): void {
    const arrow = this.dragArrow;
    if (!arrow) {
      return;
    }

    if (arrow.targetPlayerId) {
      const targetSeat = this.playersList.findIndex((player) => player.id === arrow.targetPlayerId);
      const targetRect = this.zoneRects[targetSeat];
      if (targetRect) {
        this.drawDragTargetHighlight(ctx, targetRect, arrow.color);
      }
    }

    this.drawArrowShaft(ctx, arrow.originX, arrow.originY, arrow.headX, arrow.headY, arrow.color);
  }

  /** Bright glowing border marking the zone a live drag arrow is currently snapped to. */
  private drawDragTargetHighlight(ctx: CanvasRenderingContext2D, rect: ZoneRect, color: string): void {
    const shortSide = Math.min(this.canvasWidth, this.canvasHeight);
    const lineWidth = Math.max(4, shortSide * ARROW_TARGET_HIGHLIGHT_WIDTH_RATIO);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.shadowColor = color;
    ctx.shadowBlur = shortSide * 0.03;
    ctx.strokeRect(rect.x + lineWidth / 2, rect.y + lineWidth / 2, rect.width - lineWidth, rect.height - lineWidth);
    ctx.restore();
  }

  /**
   * Draws a shaft (quad) + arrowhead (triangle) from (x1, y1) to (x2, y2),
   * shaded with a gradient across the arrow's width (light -> color -> dark)
   * for a "3D" rounded look, using canvas path/gradient calls only.
   */
  private drawArrowShaft(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    if (length < 1) {
      return;
    }
    const ux = dx / length;
    const uy = dy / length;
    // Perpendicular unit vector: the axis the "3D" shading gradient runs across.
    const px = -uy;
    const py = ux;

    const shortSide = Math.min(this.canvasWidth, this.canvasHeight);
    const shaftHalfWidth = (shortSide * ARROW_SHAFT_WIDTH_RATIO) / 2;
    const headLength = Math.min(length, shortSide * ARROW_HEAD_LENGTH_RATIO);
    const headHalfWidth = (shortSide * ARROW_HEAD_WIDTH_RATIO) / 2;
    const shaftEndX = x2 - ux * headLength;
    const shaftEndY = y2 - uy * headLength;

    const gradient = ctx.createLinearGradient(x1 + px, y1 + py, x1 - px, y1 - py);
    gradient.addColorStop(0, lightenColor(color, 0.35));
    gradient.addColorStop(0.5, color);
    gradient.addColorStop(1, darkenColor(color, 0.4));

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = shortSide * 0.02;
    ctx.shadowOffsetY = shortSide * 0.006;
    ctx.fillStyle = gradient;

    ctx.beginPath();
    ctx.moveTo(x1 + px * shaftHalfWidth, y1 + py * shaftHalfWidth);
    ctx.lineTo(shaftEndX + px * shaftHalfWidth, shaftEndY + py * shaftHalfWidth);
    ctx.lineTo(shaftEndX - px * shaftHalfWidth, shaftEndY - py * shaftHalfWidth);
    ctx.lineTo(x1 - px * shaftHalfWidth, y1 - py * shaftHalfWidth);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(shaftEndX + px * headHalfWidth, shaftEndY + py * headHalfWidth);
    ctx.lineTo(shaftEndX - px * headHalfWidth, shaftEndY - py * headHalfWidth);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}
