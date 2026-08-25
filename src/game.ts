// Core game logic. Keep this file free of DOM globals so it stays unit-testable;
// everything that touches the canvas element lives in main.ts.

import { advanceTurn, createTurnState, ROW_COUNTS_BY_PLAYER_COUNT, type TurnState } from './game/turn';
import { clampStartingIndex } from './game/playerRoster';
import {
  createCommanderDamageState,
  type CommanderDamageState,
  type Player,
  type UndoAction,
  type UndoStack,
} from './game/commanderDamage';
import { createPoisonState, POISON_LETHAL, type PoisonState } from './game/poison';
import { assignMonarch, createMonarchState, type MonarchState } from './game/monarch';
import { createEnergyState, type EnergyState } from './game/energy';
import { createExperienceState, type ExperienceState } from './game/experience';
import { assignRingBearer, createRingBearerState, type RingBearerState } from './game/ringBearer';
import { createStatsState, createStatsTrigger, type BiggestHit, type StatsState, type StatsTrigger } from './game/stats';
import {
  CONTROL_GAP_RATIO,
  PAUSE_RADIUS_RATIO,
  PauseControl,
  SHORTCUT_RADIUS_RATIO,
  ShortcutControl,
  UNDO_RADIUS_RATIO,
  UndoControl,
} from './ui/controls';
import { LONG_PRESS_MOVE_TOLERANCE_PX, LONG_PRESS_MS } from './ui/damagePanel';
import { NoopSoundPlayer, type SoundPlayer } from './audio/soundPlayer';
import {
  createScreenShakeState,
  ELIMINATION_SHAKE_TRAUMA,
  getScreenShakeOffset,
  triggerScreenShake,
  updateScreenShake,
  type ScreenShakeState,
  type ScreenShakeTrigger,
} from './game/screenShake';
import {
  createZoneEffectState,
  getZoneEffect,
  triggerZoneEffect,
  updateZoneEffects,
  type ZoneEffectRender,
  type ZoneEffectState,
  type ZoneEffectTrigger,
} from './game/zoneEffect';
import { DISPLAY_FONT_STACK } from './ui/displayFont';
import { defaultIconForSeat, DEFAULT_PLAYER_ICON, type PlayerIconId } from './game/playerIcons';
import { getBoardTheme } from './game/boardTheme';

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

// Zone-to-zone drag arrow (issue #55): drawn live from the origin zone to
// the pointer while a drag is in progress, so a Playgroup-style preview of
// the attacker/target pair is visible before resolveZoneDrag/AttackMenu.
// Sized relative to the shorter canvas dimension so it scales with the
// device/canvas size like the zone text does.
const ARROW_SHAFT_WIDTH_RATIO = 0.035;
const ARROW_HEAD_LENGTH_RATIO = 0.09;
const ARROW_HEAD_WIDTH_RATIO = 0.09;
const ARROW_TARGET_HIGHLIGHT_WIDTH_RATIO = 0.012;
// Elevation shadow (issue #69): a dedicated dark silhouette cast straight down
// (screen space) beneath the arrow, separate from the perpendicular light/dark
// shading gradient, so the arrow reads as floating above the table at any
// drag angle.
const ARROW_ELEVATION_OFFSET_RATIO = 0.035;
const ARROW_ELEVATION_BLUR_RATIO = 0.05;

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

/** Formats a seconds count as mm:ss for the active player's turn timer (issue #97). */
function formatMmSs(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
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

/**
 * Picks which viewport size `computeOverlaySafeArea` should size DOM
 * overlays against (issue #114): `window.innerWidth`/`innerHeight` (the
 * layout viewport) doesn't shrink when the on-screen keyboard opens on
 * mobile, so a bottom-pinned button like the setup screen's "Start Game"
 * CTA could be sized/positioned below the actually visible/tappable area.
 * `window.visualViewport`, when available, does shrink for the keyboard, so
 * it's preferred whenever present.
 */
export function resolveOverlayViewportSize(
  layoutWidth: number,
  layoutHeight: number,
  visualViewport: { width: number; height: number } | null | undefined,
): { width: number; height: number } {
  if (visualViewport) {
    return { width: visualViewport.width, height: visualViewport.height };
  }
  return { width: layoutWidth, height: layoutHeight };
}

export interface ZoneRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Clockwise rotation, in degrees, applied so this zone's contents read
   * upright from that seat's own position: 0 for bottom-row/upright seats,
   * 180 for top-row seats (facing the opposite end of the table), 90 for a
   * full-height left-edge seat (issue #81).
   */
  rotation: 0 | 90 | 180;
}

/**
 * Computes each seat's zone rect for the current canvas size, in the raw
 * seat-index order `clockwiseSeatOrder` (src/game/turn.ts) expects.
 *
 * Every player count except 5 lays out as a simple row grid (row-major,
 * left-to-right, top row rotated 180°). 5 players uses a distinct shape
 * (issue #81): 2 seats along the top edge, 2 along the bottom edge, and 1
 * full-height seat along the left edge — see computeFivePlayerZoneRects.
 */
export function computeZoneRects(playerCount: number, width: number, height: number): ZoneRect[] {
  if (playerCount === 5) {
    return computeFivePlayerZoneRects(width, height);
  }
  const rowCounts = ROW_COUNTS_BY_PLAYER_COUNT[playerCount] ?? [Math.ceil(playerCount / 2), Math.floor(playerCount / 2)];
  const rowHeight = height / rowCounts.length;
  const rects: ZoneRect[] = [];
  rowCounts.forEach((count, rowIndex) => {
    const y = rowIndex * rowHeight;
    const colWidth = width / count;
    const rotation = rowIndex === 0 ? 180 : 0;
    for (let col = 0; col < count; col += 1) {
      rects.push({ x: col * colWidth, y, width: colWidth, height: rowHeight, rotation });
    }
  });
  return rects;
}

/**
 * 5-player layout (issue #81, replacing #77's "1 lone seat on top + 4
 * upright below" shape): 2 seats along the top edge (rotated 180°), 2 along
 * the bottom edge (upright), and 1 full-height seat along the left edge
 * (rotated 90° so its life total reads upright from that seat's position).
 * The left seat's width matches the top/bottom columns' width, so all three
 * columns tile the canvas evenly. Raw seat order — top-left, top-right,
 * bottom-left, bottom-right, left — is what clockwiseSeatOrder(5) in
 * src/game/turn.ts reorders into a true clockwise loop.
 */
function computeFivePlayerZoneRects(width: number, height: number): ZoneRect[] {
  const leftWidth = width / 3;
  const colWidth = (width - leftWidth) / 2;
  const rowHeight = height / 2;
  return [
    { x: leftWidth, y: 0, width: colWidth, height: rowHeight, rotation: 180 },
    { x: leftWidth + colWidth, y: 0, width: colWidth, height: rowHeight, rotation: 180 },
    { x: leftWidth, y: rowHeight, width: colWidth, height: rowHeight, rotation: 0 },
    { x: leftWidth + colWidth, y: rowHeight, width: colWidth, height: rowHeight, rotation: 0 },
    { x: 0, y: 0, width: leftWidth, height, rotation: 90 },
  ];
}

export interface PlayerConfig {
  name: string;
  color: string;
  /** The code-drawn glyph chosen to identify this seat (issue #167), beyond accent color alone. */
  icon?: PlayerIconId;
  /** True when this player runs two commanders (Partner pair, or Commander + Background) rather than one (issue #165). */
  hasTwoCommanders?: boolean;
}

export interface GameConfig {
  playerCount: number;
  startingLife: number;
  players: PlayerConfig[];
  /** Seat that starts as the active player (issue #126); defaults to seat 0 when omitted or out of range. */
  startingIndex?: number;
  /** Selected board background theme id (issue #168), from game/boardTheme.ts; defaults to DEFAULT_BOARD_THEME_ID when omitted or unknown. */
  boardTheme?: string;
}

export interface EliminationEntry {
  playerId: string;
  turnCount: number;
}

export interface GameStats {
  /** Null when a board-wide effect eliminated every remaining player in the same action, per issue #84. */
  winnerId: string | null;
  durationS: number;
  /** Seconds each player spent as the active player, keyed by player id. */
  activeTimeS: Record<string, number>;
  eliminationOrder: EliminationEntry[];
  /** Total life lost per player, from plain damage, lifelink, and healing (issue #98). Keyed by player id. */
  lifeLost: Record<string, number>;
  /** Total life gained per player, from plain damage, lifelink, and healing (issue #98). Keyed by player id. */
  lifeGained: Record<string, number>;
  /** Total commander damage dealt per player (issue #98). Keyed by player id. */
  commanderDamageDealt: Record<string, number>;
  /** Total commander damage received per player (issue #98). Keyed by player id. */
  commanderDamageReceived: Record<string, number>;
  /** The single biggest hit of the match, or null if none landed (issue #98). */
  biggestHit: BiggestHit | null;
}

// Active zone's pulsing border: sine-driven width/opacity per docs/concept.md.
const PULSE_SPEED_RAD_S = 4;
const PULSE_MIN_WIDTH = 3;
const PULSE_MAX_WIDTH = 7;

// Brief flash on the active zone the moment a long-press commits the turn
// pass (issue #64) — distinct from, and layered on top of, the idle pulsing
// border above.
const PASS_TURN_FLASH_DURATION_S = 0.35;

// Turn-hold progress ring (issue #109): circular ring centered on the touch
// point, filling clockwise over the hold's LONG_PRESS_MS duration so a
// player can see — and interrupt, by releasing or dragging away — an
// in-progress turn pass before it commits and the flash above takes over.
const TURN_HOLD_RING_RADIUS_RATIO = 0.07;
const TURN_HOLD_RING_LINE_WIDTH_RATIO = 0.014;

// Ring-bearer badge (issue #163): a small disc, drawn above the life number
// like a lapel pin, marking the current holder's zone — sized/styled after
// the shared-disc controls (UndoControl et al., src/ui/controls.ts).
const RING_BEARER_BADGE_RADIUS_RATIO = 0.09;
const RING_BEARER_BADGE_COLOR = '#d7a54c';

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
  originX: number;
  originY: number;
  pointerX: number;
  pointerY: number;
}

/** Where a press started, tracked from `beginDrag` until the pointer crosses `LONG_PRESS_MOVE_TOLERANCE_PX` and the live arrow (`DragState`) activates. */
interface DragOrigin {
  fromPlayerId: string;
  x: number;
  y: number;
}

/** An in-progress turn-hold ring (issue #109), tracked from beginTurnHold until it's cancelled or the turn commits. */
interface TurnHoldState {
  originX: number;
  originY: number;
  elapsedS: number;
}

// Monarch badge (issue #162): a small crown control in the corner of each
// zone, tappable to reassign the Monarch designation to that player. Sized
// relative to the zone's own shorter side, like the life/name text, so it
// scales consistently across player counts/layouts.
const MONARCH_BADGE_RADIUS_RATIO = 0.09;
const MONARCH_BADGE_MARGIN_RATIO = 0.06;

interface MonarchBadgeLayout {
  playerId: string;
  x: number;
  y: number;
  radius: number;
}

/** Places one badge per zone in its top-right (screen-space) corner, sized/margined off that zone's own shorter side. */
function computeMonarchBadgeLayouts(zoneRects: ZoneRect[], playerIds: string[]): MonarchBadgeLayout[] {
  return zoneRects.map((rect, seat) => {
    const shortSide = Math.min(rect.width, rect.height);
    const radius = shortSide * MONARCH_BADGE_RADIUS_RATIO;
    const margin = shortSide * MONARCH_BADGE_MARGIN_RATIO;
    return {
      playerId: playerIds[seat],
      x: rect.x + rect.width - margin - radius,
      y: rect.y + margin + radius,
      radius,
    };
  });
}

// Player icon badge (issue #167): a small disc in each zone's top-left
// (screen-space) corner — the mirror image of the Monarch badge's top-right
// corner — showing that seat's chosen vector glyph so players are
// recognizable beyond accent color alone (docs/concept.md). Purely
// decorative, unlike the Monarch badge: the icon is only ever changed from
// the setup screen, so there's no hit-testing for it here.
const PLAYER_ICON_BADGE_RADIUS_RATIO = 0.09;
const PLAYER_ICON_BADGE_MARGIN_RATIO = 0.06;

interface PlayerIconBadgeLayout {
  x: number;
  y: number;
  radius: number;
  icon: PlayerIconId;
  color: string;
}

/** Places one icon badge per zone in its top-left (screen-space) corner, sized/margined off that zone's own shorter side. */
function computePlayerIconBadgeLayouts(zoneRects: ZoneRect[], players: Player[]): PlayerIconBadgeLayout[] {
  return zoneRects.map((rect, seat) => {
    const shortSide = Math.min(rect.width, rect.height);
    const radius = shortSide * PLAYER_ICON_BADGE_RADIUS_RATIO;
    const margin = shortSide * PLAYER_ICON_BADGE_MARGIN_RATIO;
    const player = players[seat];
    return {
      x: rect.x + margin + radius,
      y: rect.y + margin + radius,
      radius,
      icon: player.icon ?? DEFAULT_PLAYER_ICON,
      color: player.color ?? PLAYER_COLORS[seat % PLAYER_COLORS.length],
    };
  });
}

/** Vector-drawn player icon glyphs (issue #167), matching the style of drawCrownGlyph — no icon fonts or bitmap images. */
function drawPlayerIconGlyph(ctx: CanvasRenderingContext2D, icon: PlayerIconId, cx: number, cy: number, radius: number): void {
  switch (icon) {
    case 'star':
      drawStarGlyph(ctx, cx, cy, radius);
      return;
    case 'shield':
      drawShieldGlyph(ctx, cx, cy, radius);
      return;
    case 'bolt':
      drawBoltGlyph(ctx, cx, cy, radius);
      return;
    case 'moon':
      drawMoonGlyph(ctx, cx, cy, radius);
      return;
    case 'flame':
      drawFlameGlyph(ctx, cx, cy, radius);
      return;
    case 'leaf':
      drawLeafGlyph(ctx, cx, cy, radius);
      return;
  }
}

function drawStarGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  const spikes = 5;
  const innerRadius = radius * 0.45;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i += 1) {
    const r = i % 2 === 0 ? radius : innerRadius;
    const angle = (Math.PI / spikes) * i - Math.PI / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();
}

function drawShieldGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  const w = radius * 0.85;
  const topY = cy - radius;
  const midY = cy;
  const bottomY = cy + radius;
  ctx.beginPath();
  ctx.moveTo(cx, topY);
  ctx.lineTo(cx + w, topY + radius * 0.25);
  ctx.lineTo(cx + w, midY);
  ctx.quadraticCurveTo(cx + w, bottomY - radius * 0.2, cx, bottomY);
  ctx.quadraticCurveTo(cx - w, bottomY - radius * 0.2, cx - w, midY);
  ctx.lineTo(cx - w, topY + radius * 0.25);
  ctx.closePath();
  ctx.fill();
}

function drawBoltGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.beginPath();
  ctx.moveTo(cx + radius * 0.15, cy - radius);
  ctx.lineTo(cx - radius * 0.55, cy + radius * 0.15);
  ctx.lineTo(cx - radius * 0.05, cy + radius * 0.15);
  ctx.lineTo(cx - radius * 0.15, cy + radius);
  ctx.lineTo(cx + radius * 0.55, cy - radius * 0.15);
  ctx.lineTo(cx + radius * 0.05, cy - radius * 0.15);
  ctx.closePath();
  ctx.fill();
}

function drawMoonGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(cx + radius * 0.5, cy - radius * 0.2, radius * 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFlameGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius);
  ctx.quadraticCurveTo(cx + radius * 0.9, cy - radius * 0.2, cx + radius * 0.35, cy + radius * 0.5);
  ctx.quadraticCurveTo(cx + radius * 0.5, cy + radius * 0.1, cx, cy + radius * 0.3);
  ctx.quadraticCurveTo(cx - radius * 0.5, cy + radius * 0.1, cx - radius * 0.35, cy + radius * 0.5);
  ctx.quadraticCurveTo(cx - radius * 0.9, cy - radius * 0.2, cx, cy - radius);
  ctx.closePath();
  ctx.fill();
}

function drawLeafGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius);
  ctx.quadraticCurveTo(cx + radius, cy - radius * 0.2, cx, cy + radius);
  ctx.quadraticCurveTo(cx - radius, cy - radius * 0.2, cx, cy - radius);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius * 0.6);
  ctx.lineTo(cx, cy + radius * 0.8);
  ctx.lineWidth = Math.max(radius * 0.12, 1);
  ctx.stroke();
}

/** Vector-drawn crown glyph (issue #162), matching the icon style of src/ui/controls.ts — no icon fonts or bitmap images. */
function drawCrownGlyph(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number): void {
  const w = radius * 0.9;
  const h = radius * 0.7;
  const baseY = centerY + h * 0.45;
  const topY = centerY - h * 0.55;
  const midY = centerY - h * 0.1;

  ctx.beginPath();
  ctx.moveTo(centerX - w, baseY);
  ctx.lineTo(centerX - w, midY);
  ctx.lineTo(centerX - w * 0.5, topY);
  ctx.lineTo(centerX, midY);
  ctx.lineTo(centerX + w * 0.5, topY);
  ctx.lineTo(centerX + w, midY);
  ctx.lineTo(centerX + w, baseY);
  ctx.closePath();
  ctx.fill();
}

/** Live preview of a zone-to-zone drag (issue #55), previewing what resolveZoneDrag would resolve if released now. */
export interface DragArrowState {
  fromPlayerId: string;
  /** The exact point where the press started (beginDrag's origin), not the zone's center. */
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
  private turnState: TurnState;
  private readonly undoControl = new UndoControl();
  private readonly shortcutControl = new ShortcutControl();
  private readonly pauseControl = new PauseControl();
  private readonly playersList: Player[];
  private readonly damage: CommanderDamageState;
  private readonly poison: PoisonState;
  private readonly energy: EnergyState;
  private readonly experience: ExperienceState;
  private readonly ringBearer: RingBearerState = createRingBearerState();
  private readonly sound: SoundPlayer;
  private readonly stack = new ArrayUndoStack();
  private readonly monarch: MonarchState = createMonarchState();
  private zoneRects: ZoneRect[] = [];
  private monarchBadges: MonarchBadgeLayout[] = [];
  private playerIconBadges: PlayerIconBadgeLayout[] = [];
  private canvasWidth = 0;
  private canvasHeight = 0;
  private animTime = 0;
  private dragState: DragState | null = null;
  private dragOrigin: DragOrigin | null = null;
  private passTurnFlashSeatIndex: number | null = null;
  private passTurnFlashTime = 0;
  private turnHoldState: TurnHoldState | null = null;
  private readonly shakeState: ScreenShakeState = createScreenShakeState();
  private readonly shakeTriggerObj: ScreenShakeTrigger = {
    trigger: (intensity) => triggerScreenShake(this.shakeState, intensity),
  };
  private readonly zoneEffectState: ZoneEffectState = createZoneEffectState();
  private readonly zoneEffectTriggerObj: ZoneEffectTrigger = {
    trigger: (playerId, type, color) => triggerZoneEffect(this.zoneEffectState, playerId, type, color),
  };
  private readonly activeTimeList: number[];
  private readonly eliminationOrderList: EliminationEntry[] = [];
  private readonly statsState: StatsState;
  private readonly statsTriggerObj: StatsTrigger;
  private endedFlag = false;
  private winnerId: string | null = null;
  private durationS = 0;
  private pausedFlag = false;
  private turnTimerElapsedS = 0;
  private readonly boardBackgroundColor: string;

  constructor(config?: GameConfig, sound: SoundPlayer = new NoopSoundPlayer()) {
    this.sound = sound;
    this.boardBackgroundColor = getBoardTheme(config?.boardTheme).backgroundColor;
    this.playerCount = clamp(config?.playerCount ?? DEFAULT_PLAYER_COUNT, MIN_PLAYER_COUNT, MAX_PLAYER_COUNT);
    this.turnState = createTurnState(clampStartingIndex(config?.startingIndex ?? 0, this.playerCount));
    const startingLife = config?.startingLife ?? DEFAULT_STARTING_LIFE;
    this.playersList = Array.from({ length: this.playerCount }, (_, seat) => {
      const preset = config?.players[seat];
      return {
        id: `p${seat + 1}`,
        name: preset?.name || `Player ${seat + 1}`,
        life: startingLife,
        color: preset?.color || PLAYER_COLORS[seat % PLAYER_COLORS.length],
        icon: preset?.icon || defaultIconForSeat(seat),
        hasTwoCommanders: preset?.hasTwoCommanders,
      };
    });
    this.damage = createCommanderDamageState(this.playersList);
    this.poison = createPoisonState(this.playersList.map((player) => player.id));
    this.energy = createEnergyState(this.playersList.map((player) => player.id));
    this.experience = createExperienceState(this.playersList.map((player) => player.id));
    this.activeTimeList = new Array(this.playerCount).fill(0);
    this.statsState = createStatsState(this.playersList.map((player) => player.id));
    this.statsTriggerObj = createStatsTrigger(this.statsState);
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

  get energyState(): EnergyState {
    return this.energy;
  }

  get experienceState(): ExperienceState {
    return this.experience;
  }

  /** The current Ring-bearer's player id, or null when no one holds it (issue #163). */
  get ringBearerId(): string | null {
    return this.ringBearer.holderId;
  }

  /** Assigns the Ring-bearer badge to `playerId`, reassigning it away from any previous holder (issue #163). */
  assignRingBearer(playerId: string): void {
    assignRingBearer(this.ringBearer, playerId, this.stack);
  }

  get undoStack(): UndoStack {
    return this.stack;
  }

  /** The id of the player currently holding the Monarch (issue #162), or null if no one does. */
  get monarchHolderId(): string | null {
    return this.monarch.holderId;
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
    if (!this.endedFlag) {
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
      lifeLost: { ...this.statsState.lifeLost },
      lifeGained: { ...this.statsState.lifeGained },
      commanderDamageDealt: { ...this.statsState.commanderDamageDealt },
      commanderDamageReceived: { ...this.statsState.commanderDamageReceived },
      biggestHit: this.statsState.biggestHit ? { ...this.statsState.biggestHit } : null,
    };
  }

  /** True when (x, y) — in the same coordinate space passed to resize — is over the shared center undo control. */
  isOverUndoControl(x: number, y: number): boolean {
    return this.undoControl.containsPoint(x, y);
  }

  /** True when (x, y) — in the same coordinate space passed to resize — is over the shared center shortcut control (issue #80). */
  isOverShortcutControl(x: number, y: number): boolean {
    return this.shortcutControl.containsPoint(x, y);
  }

  /** True when (x, y) — in the same coordinate space passed to resize — is over the shared center pause control (issue #97). */
  isOverPauseControl(x: number, y: number): boolean {
    return this.pauseControl.containsPoint(x, y);
  }

  /** True while the game is paused (issue #97): the turn timer and match duration are frozen and gameplay inputs are disabled. */
  get paused(): boolean {
    return this.pausedFlag;
  }

  /** Seconds since the active player became active, frozen while paused; resets to 0 each time the turn passes. */
  get turnTimerS(): number {
    return this.turnTimerElapsedS;
  }

  /** Toggles pause: freezes/resumes the turn timer, match duration, and gameplay inputs (issue #97). */
  togglePause(): void {
    this.pausedFlag = !this.pausedFlag;
  }

  /** The seat currently playing the turn-pass flash animation (issue #64), or null. */
  get passTurnFlashSeat(): number | null {
    return this.passTurnFlashSeatIndex;
  }

  /** The in-progress turn-hold ring's touch point and fill progress (0-1), or null when no hold is in progress (issue #109). Exposed for tests independent of canvas rendering. */
  get turnHoldRing(): { x: number; y: number; progress: number } | null {
    if (!this.turnHoldState) {
      return null;
    }
    return {
      x: this.turnHoldState.originX,
      y: this.turnHoldState.originY,
      progress: clamp(this.turnHoldState.elapsedS / (LONG_PRESS_MS / 1000), 0, 1),
    };
  }

  /** Triggers the canvas-wide screen-shake (issue #88); passed to UI menus so damage/poison actions can shake on impact. */
  get shakeTrigger(): ScreenShakeTrigger {
    return this.shakeTriggerObj;
  }

  /** Current screen-shake trauma (0-1), decaying every update(); exposed for tests independent of canvas rendering. */
  get shakeTrauma(): number {
    return this.shakeState.trauma;
  }

  /** Triggers a per-zone visual effect (issue #89); passed to UI menus so damage/heal/poison/commander actions flash the affected zone(s). */
  get zoneEffectTrigger(): ZoneEffectTrigger {
    return this.zoneEffectTriggerObj;
  }

  /** `playerId`'s current zone flash, or null when idle; exposed for tests independent of canvas rendering. */
  zoneEffectFor(playerId: string): ZoneEffectRender | null {
    return getZoneEffect(this.zoneEffectState, playerId);
  }

  /** Records life/commander-damage stats (issue #98); passed to UI menus so damage/heal/lifelink/commander actions accumulate the end-game stats totals. */
  get statsTrigger(): StatsTrigger {
    return this.statsTriggerObj;
  }

  /** Reverts the most recent life or commander-damage change. No-op if nothing to undo. */
  undo(): void {
    this.stack.undo();
  }

  /** The id of the player whose Monarch badge (issue #162) is at (x, y) — in the same coordinate space passed to resize — or null if none. Every player's badge is tappable at any time, whether or not they currently hold it. */
  isOverMonarchBadge(x: number, y: number): string | null {
    const hit = this.monarchBadges.find((badge) => Math.hypot(x - badge.x, y - badge.y) <= badge.radius);
    return hit ? hit.playerId : null;
  }

  /** Reassigns the Monarch (issue #162) to `playerId`, pushing an undo action onto the shared undo stack. No-op while paused, or if `playerId` already holds it. */
  assignMonarchTo(playerId: string): void {
    if (this.pausedFlag) {
      return;
    }
    assignMonarch(this.monarch, playerId, this.stack);
  }

  update(dt: number): void {
    if (this.endedFlag) {
      return;
    }
    if (this.pausedFlag) {
      return;
    }
    this.checkEndConditions();
    if (this.endedFlag) {
      return;
    }

    this.animTime += dt;
    this.turnTimerElapsedS += dt;
    this.activeTimeList[this.turnState.activeIndex] += dt;
    updateScreenShake(this.shakeState, dt);
    updateZoneEffects(this.zoneEffectState, dt);

    if (this.passTurnFlashSeatIndex !== null) {
      this.passTurnFlashTime += dt;
      if (this.passTurnFlashTime >= PASS_TURN_FLASH_DURATION_S) {
        this.passTurnFlashSeatIndex = null;
      }
    }

    if (this.turnHoldState) {
      this.turnHoldState.elapsedS += dt;
    }
  }

  /** Recomputes zone and control placement for the current canvas size. Also called by render(). */
  resize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.zoneRects = computeZoneRects(this.playerCount, width, height);
    this.monarchBadges = computeMonarchBadgeLayouts(
      this.zoneRects,
      this.playersList.map((player) => player.id),
    );
    this.playerIconBadges = computePlayerIconBadgeLayouts(this.zoneRects, this.playersList);
    // The top/bottom rows always fill half the canvas height each, so
    // height / 2 is exactly the boundary between them for every player
    // count. The 5-player left seat (issue #81) spans full height, so its
    // center y also falls on height / 2 — but its center x (leftWidth / 2)
    // is far enough from the control's centerX (width / 2) that the disc
    // still doesn't sit on that zone's own center point.
    const controlCenterY = height / 2;
    this.undoControl.reflow(width, height, controlCenterY);

    // ShortcutControl (issue #80) and PauseControl (issue #97) sit just
    // clear of UndoControl's hit-circle, on opposite sides, rather than
    // sharing its centerX, so all three stay independently tappable without
    // overlapping (#38's touch-target sizing applies to all of them).
    const shortSide = Math.min(width, height);
    const undoRadius = shortSide * UNDO_RADIUS_RATIO;
    const shortcutRadius = shortSide * SHORTCUT_RADIUS_RATIO;
    const pauseRadius = shortSide * PAUSE_RADIUS_RATIO;
    const gap = shortSide * CONTROL_GAP_RATIO;
    const shortcutCenterX = width / 2 + undoRadius + gap + shortcutRadius;
    const pauseCenterX = width / 2 - undoRadius - gap - pauseRadius;
    this.shortcutControl.reflow(width, height, shortcutCenterX, controlCenterY);
    this.pauseControl.reflow(width, height, pauseCenterX, controlCenterY);
  }

  onTap(x: number, y: number): void {
    if (this.pauseControl.containsPoint(x, y)) {
      this.togglePause();
      return;
    }
    if (this.undoControl.containsPoint(x, y)) {
      if (this.pausedFlag) {
        return;
      }
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
    const previousTurnTimerS = this.turnTimerElapsedS;
    this.turnState = advanceTurn(this.turnState, this.playerCount);
    this.turnTimerElapsedS = 0;
    this.sound.play('turnPass');
    this.stack.push({
      undo: (): void => {
        this.turnState = previousTurnState;
        this.turnTimerElapsedS = previousTurnTimerS;
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
    if (this.pausedFlag) {
      return;
    }
    const playerId = this.onLongPress(x, y);
    const activeSeat = this.turnState.activeIndex;
    if (playerId === null || playerId !== this.playersList[activeSeat].id) {
      return;
    }
    // The hold ring's job ends the instant the turn commits — the existing
    // flash (below) takes over from here (issue #109).
    this.turnHoldState = null;
    this.passTurnFlashSeatIndex = activeSeat;
    this.passTurnFlashTime = 0;
    this.passTurn();
  }

  /**
   * Starts the turn-hold progress ring (issue #109), e.g. from main.ts's
   * onPressStart, when the press lands inside the currently active player's
   * own zone — the same target passTurnFromZoneLongPress requires to commit.
   * No-op (ring stays hidden) for any other press location, or while paused.
   */
  beginTurnHold(x: number, y: number): void {
    if (this.pausedFlag) {
      this.turnHoldState = null;
      return;
    }
    const playerId = this.onLongPress(x, y);
    const activeSeat = this.turnState.activeIndex;
    this.turnHoldState =
      playerId !== null && playerId === this.playersList[activeSeat].id ? { originX: x, originY: y, elapsedS: 0 } : null;
  }

  /**
   * Cancels the turn-hold ring once the pointer has moved past the same
   * LONG_PRESS_MOVE_TOLERANCE_PX threshold that already cancels the
   * long-press itself (issue #109). Call from main.ts's onMove.
   */
  updateTurnHold(x: number, y: number): void {
    if (!this.turnHoldState) {
      return;
    }
    if (Math.hypot(x - this.turnHoldState.originX, y - this.turnHoldState.originY) > LONG_PRESS_MOVE_TOLERANCE_PX) {
      this.turnHoldState = null;
    }
  }

  /**
   * Cancels the turn-hold ring, e.g. from main.ts's onPressEnd. No-op if the
   * hold already completed — passTurnFromZoneLongPress clears it as soon as
   * the turn commits, before the matching pointerup fires (issue #109).
   */
  endTurnHold(): void {
    this.turnHoldState = null;
  }

  /**
   * Returns the id of the player zone under (x, y), or null over a shared
   * control or outside any zone. Used both to target a long-press and, by
   * resolveZoneDrag() below, to resolve either end of a zone-to-zone drag.
   */
  onLongPress(x: number, y: number): string | null {
    if (
      this.undoControl.containsPoint(x, y) ||
      this.shortcutControl.containsPoint(x, y) ||
      this.pauseControl.containsPoint(x, y) ||
      this.isOverMonarchBadge(x, y) !== null
    ) {
      return null;
    }
    return this.playerIdAt(x, y);
  }

  /**
   * Resolves a zone-to-zone drag gesture: `from`/`to` are the pointer-down
   * and pointer-up positions, in the same coordinate space as resize().
   * Returns the attacking and target player ids when the press started in
   * one player's zone and released in a different player's zone, or a
   * self-target pair (both ids equal) when it started and released in the
   * *same* zone after moving past LONG_PRESS_MOVE_TOLERANCE_PX (issue #70)
   * — this is what lets a player log self-damage/healing/poison. Returns
   * null for a same-zone press that never moved past that threshold (a
   * plain tap, which does nothing), when either end is outside every zone,
   * or when either end is over a shared control. Never itself changes any
   * life or damage total — the caller applies the confirmed damage via
   * applyCommanderDamageDelta/applyPoisonDelta once the dragging player
   * picks a damage type.
   */
  resolveZoneDrag(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ): { fromPlayerId: string; toPlayerId: string } | null {
    if (this.pausedFlag) {
      return null;
    }
    const fromPlayerId = this.onLongPress(fromX, fromY);
    const toPlayerId = this.onLongPress(toX, toY);
    if (!fromPlayerId || !toPlayerId) {
      return null;
    }
    if (fromPlayerId === toPlayerId && Math.hypot(toX - fromX, toY - fromY) <= LONG_PRESS_MOVE_TOLERANCE_PX) {
      return null;
    }
    return { fromPlayerId, toPlayerId };
  }

  /**
   * Records where a press started, e.g. from main.ts's onPressStart. The
   * live drag arrow doesn't activate yet — it only appears once
   * updateDragPointer sees the pointer cross LONG_PRESS_MOVE_TOLERANCE_PX
   * away from this origin (issue #106), so a plain tap never shows it.
   * No-op — clears any prior origin/drag — if (x, y) isn't inside a player
   * zone (uses the same onLongPress rules resolveZoneDrag's `from` end
   * does, so a press starting over a shared control never shows an arrow).
   */
  beginDrag(x: number, y: number): void {
    this.dragState = null;
    if (this.pausedFlag) {
      this.dragOrigin = null;
      return;
    }
    const fromPlayerId = this.onLongPress(x, y);
    this.dragOrigin = fromPlayerId ? { fromPlayerId, x, y } : null;
  }

  /**
   * Updates the live drag arrow's pointer end, e.g. from main.ts's
   * pointermove. Once a drag is active, tracks the pointer as before. If no
   * drag is active yet, activates one the moment the pointer moves past
   * LONG_PRESS_MOVE_TOLERANCE_PX from the beginDrag origin; no-op if
   * beginDrag was never called (or started outside a zone).
   */
  updateDragPointer(x: number, y: number): void {
    if (this.dragState) {
      this.dragState.pointerX = x;
      this.dragState.pointerY = y;
      return;
    }
    if (!this.dragOrigin) {
      return;
    }
    if (Math.hypot(x - this.dragOrigin.x, y - this.dragOrigin.y) <= LONG_PRESS_MOVE_TOLERANCE_PX) {
      return;
    }
    this.dragState = {
      fromPlayerId: this.dragOrigin.fromPlayerId,
      originX: this.dragOrigin.x,
      originY: this.dragOrigin.y,
      pointerX: x,
      pointerY: y,
    };
  }

  /** Clears the live drag arrow (and any pending origin). Call on pointerup/pointercancel/pointerleave so it disappears immediately, whether or not the drag resolved into an opened menu. */
  endDrag(): void {
    this.dragState = null;
    this.dragOrigin = null;
  }

  /** Live drag-arrow geometry/state for render(), or null when no zone-to-zone drag is in progress. */
  get dragArrow(): DragArrowState | null {
    if (!this.dragState) {
      return null;
    }
    const { fromPlayerId, originX, originY, pointerX, pointerY } = this.dragState;
    const fromSeat = this.playersList.findIndex((player) => player.id === fromPlayerId);
    if (fromSeat === -1) {
      return null;
    }
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

  /** Non-eliminated players — the pool of valid winners for the manual "End game" board shortcut (issue #117). */
  get alivePlayers(): Player[] {
    return this.playersList.filter((player) => !this.isEliminated(player));
  }

  /**
   * Manually ends the game with `winnerId` as the winner (issue #117's
   * board-wide "End game" shortcut), recording them as the "last player
   * standing" winner per docs/concept.md — the same winner field the
   * automatic elimination path (checkEndConditions/finishGame) sets. The
   * confirmation step required before ending lives in the UI layer
   * (BoardShortcutMenu), mirroring the #56 precedent for the now-removed
   * EndGameControl. No-op once the game has already ended, or if `winnerId`
   * isn't currently in alivePlayers.
   */
  endGameWithWinner(winnerId: string): void {
    if (this.endedFlag) {
      return;
    }
    const winner = this.alivePlayers.find((player) => player.id === winnerId);
    if (!winner) {
      return;
    }
    this.finishGame(winnerId);
  }

  /**
   * Records newly-eliminated players (life at or below 0, or poison at or
   * above the lethal threshold), clears the record for anyone since restored
   * below both thresholds (e.g. via undo), and ends the game automatically
   * once at most one player remains, per docs/concept.md step 6. A board-wide
   * effect (issue #80) can eliminate every remaining player in the same
   * action; that ends the game with no winner rather than softlocking.
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
          triggerScreenShake(this.shakeState, ELIMINATION_SHAKE_TRAUMA);
        }
      } else if (eliminatedIndex !== -1) {
        this.eliminationOrderList.splice(eliminatedIndex, 1);
      }
    }
    const alive = this.playersList.filter((player) => !this.isEliminated(player));
    if (alive.length <= 1) {
      this.finishGame(alive.length === 1 ? alive[0].id : null);
    }
  }

  private finishGame(winnerId: string | null): void {
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

    // Screen-shake (issue #88) only offsets what's drawn below, via ctx
    // translate — resize() above already recomputed zoneRects/controls from
    // the untranslated width/height, so hit-testing (onLongPress,
    // resolveZoneDrag, isOverUndoControl, ...) never sees this offset.
    const shakeOffset = getScreenShakeOffset(this.shakeState, this.animTime);
    ctx.save();
    ctx.translate(shakeOffset.x, shakeOffset.y);

    this.drawZones(ctx);
    this.drawDragArrow(ctx);
    this.drawTurnHoldRing(ctx);
    this.undoControl.draw(ctx, this.canUndo);
    this.shortcutControl.draw(ctx);
    this.pauseControl.draw(ctx, this.pausedFlag);

    ctx.restore();

    if (this.pausedFlag) {
      this.drawPauseOverlay(ctx, width, height);
      // Redraw on top of the overlay (issue #125) so the resume affordance
      // stays clearly visible instead of being dimmed/covered by it.
      this.pauseControl.draw(ctx, this.pausedFlag);
    }
  }

  /** Unambiguous full-canvas overlay shown while paused (issue #97), drawn outside the screen-shake translate so it never jitters. */
  private drawPauseOverlay(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.save();
    ctx.fillStyle = 'rgba(10, 9, 14, 0.72)';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#f5f3f7';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `400 32px ${DISPLAY_FONT_STACK}`;
    ctx.fillText('PAUSED', width / 2, height / 2);
    ctx.restore();
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
      gradient.addColorStop(1, this.boardBackgroundColor);
      ctx.fillStyle = gradient;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

      ctx.save();
      ctx.translate(cx, cy);
      if (rect.rotation !== 0) {
        ctx.rotate((rect.rotation * Math.PI) / 180);
      }

      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.textAlign = 'center';

      const lifeFontSize = Math.round(shortSide * 0.5);
      ctx.font = `400 ${lifeFontSize}px ${DISPLAY_FONT_STACK}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(String(player.life), 0, 0);

      const nameFontSize = Math.round(shortSide * 0.14);
      ctx.font = `600 ${nameFontSize}px system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(player.name, 0, lifeFontSize / 2 + 4);

      if (isActive) {
        const timerFontSize = Math.round(shortSide * 0.1);
        ctx.font = `400 ${timerFontSize}px ${DISPLAY_FONT_STACK}`;
        ctx.fillText(formatMmSs(this.turnTimerElapsedS), 0, lifeFontSize / 2 + 4 + nameFontSize + 4);
      }

      if (player.id === this.ringBearer.holderId) {
        const badgeRadius = shortSide * RING_BEARER_BADGE_RADIUS_RATIO;
        this.drawRingBearerBadge(ctx, badgeRadius, 0, -(lifeFontSize / 2 + badgeRadius + shortSide * 0.05));
      }

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

      const zoneEffect = getZoneEffect(this.zoneEffectState, player.id);
      if (zoneEffect) {
        this.drawZoneEffect(ctx, rect, zoneEffect);
      }

      this.drawMonarchBadge(ctx, this.monarchBadges[seat], player.id === this.monarch.holderId);
      this.drawPlayerIconBadge(ctx, this.playerIconBadges[seat]);
    }
  }

  /** The Monarch badge (issue #162): gold and full-opacity for the current holder, dim otherwise — every badge stays tappable regardless. */
  private drawMonarchBadge(ctx: CanvasRenderingContext2D, badge: MonarchBadgeLayout, isHolder: boolean): void {
    const { x, y, radius } = badge;

    ctx.save();
    ctx.globalAlpha = isHolder ? 1 : 0.4;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = isHolder ? 'rgba(215, 165, 76, 0.9)' : 'rgba(20, 18, 28, 0.75)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = isHolder ? '#f0c98a' : '#f5f3f7';
    ctx.stroke();

    ctx.fillStyle = isHolder ? '#1b1822' : '#f5f3f7';
    drawCrownGlyph(ctx, x, y, radius * 0.55);

    ctx.restore();
  }

  /** The player icon badge (issue #167): dark disc bordered in the seat's accent color, hosting that seat's chosen vector glyph. Always visible, unlike the Monarch badge — it's not tappable/reassignable in-game. */
  private drawPlayerIconBadge(ctx: CanvasRenderingContext2D, badge: PlayerIconBadgeLayout): void {
    const { x, y, radius, icon, color } = badge;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20, 18, 28, 0.75)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.fillStyle = '#f5f3f7';
    ctx.strokeStyle = '#f5f3f7';
    drawPlayerIconGlyph(ctx, icon, x, y, radius * 0.55);

    ctx.restore();
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

  /**
   * Brief colored flash on a zone confirming a life/counter change landed
   * (issue #89), fading out over ZONE_EFFECT_DURATION_S. `effect.color`
   * varies per action type (see src/game/zoneEffect.ts) so damage, heal,
   * poison, and commander damage read as visually distinct.
   */
  private drawZoneEffect(ctx: CanvasRenderingContext2D, rect: ZoneRect, effect: ZoneEffectRender): void {
    const alpha = (1 - effect.progress) * 0.55;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = effect.color;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
  }

  /**
   * Draws the Ring-bearer badge (issue #163): a small gold-ringed disc,
   * matching the shared-disc controls' look (dark fill + colored stroke),
   * centered at (x, y) in the zone's own (already-rotated) coordinate space
   * so it reads upright from that seat.
   */
  private drawRingBearerBadge(ctx: CanvasRenderingContext2D, radius: number, x: number, y: number): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20, 18, 28, 0.85)';
    ctx.fill();
    ctx.lineWidth = Math.max(radius * 0.3, 1.5);
    ctx.strokeStyle = RING_BEARER_BADGE_COLOR;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.55, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(radius * 0.16, 1);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draws the turn-hold progress ring (issue #109): a circular ring centered
   * on the touch point that fills clockwise as the hold approaches
   * LONG_PRESS_MS. Drawn only while turnHoldRing is non-null — beginTurnHold/
   * updateTurnHold/endTurnHold/passTurnFromZoneLongPress all keep that in
   * sync with the hold's lifecycle, so there's nothing further to gate here.
   */
  private drawTurnHoldRing(ctx: CanvasRenderingContext2D): void {
    const ring = this.turnHoldRing;
    if (!ring) {
      return;
    }
    const shortSide = Math.min(this.canvasWidth, this.canvasHeight);
    const radius = shortSide * TURN_HOLD_RING_RADIUS_RATIO;
    const lineWidth = shortSide * TURN_HOLD_RING_LINE_WIDTH_RATIO;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ring.progress);
    ctx.stroke();
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

    const traceArrowPath = (offsetX: number, offsetY: number): void => {
      ctx.beginPath();
      ctx.moveTo(x1 + px * shaftHalfWidth + offsetX, y1 + py * shaftHalfWidth + offsetY);
      ctx.lineTo(shaftEndX + px * shaftHalfWidth + offsetX, shaftEndY + py * shaftHalfWidth + offsetY);
      ctx.lineTo(shaftEndX - px * shaftHalfWidth + offsetX, shaftEndY - py * shaftHalfWidth + offsetY);
      ctx.lineTo(x1 - px * shaftHalfWidth + offsetX, y1 - py * shaftHalfWidth + offsetY);
      ctx.closePath();
      ctx.moveTo(x2 + offsetX, y2 + offsetY);
      ctx.lineTo(shaftEndX + px * headHalfWidth + offsetX, shaftEndY + py * headHalfWidth + offsetY);
      ctx.lineTo(shaftEndX - px * headHalfWidth + offsetX, shaftEndY - py * headHalfWidth + offsetY);
      ctx.closePath();
    };

    // Elevation shadow: a soft dark silhouette of the arrow, offset straight
    // down in screen space (never rotated with the drag angle) and blurred
    // more heavily than the shaft's own shading, cast "onto the table" to
    // sell the floating/3D-elevated look.
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = shortSide * ARROW_ELEVATION_BLUR_RATIO;
    traceArrowPath(0, shortSide * ARROW_ELEVATION_OFFSET_RATIO);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = shortSide * 0.015;
    ctx.shadowOffsetY = shortSide * 0.004;
    ctx.fillStyle = gradient;
    traceArrowPath(0, 0);
    ctx.fill();
    ctx.restore();
  }
}
