// Per-zone visual effect on every life/counter change (issue #89): a brief,
// per-player-zone colored flash confirming a damage/heal/poison/commander-
// damage action landed, distinct from the whole-board screen-shake (issue
// #88, src/game/screenShake.ts) and the turn-pass flash (src/game.ts).
// Keyed by player id so board-wide actions affecting several zones at once
// (e.g. a "damage all players" shortcut) render independently per zone. Free
// of DOM globals so it stays unit-testable; Game.drawZones (src/game.ts) is
// the only place that paints it.

export type ZoneEffectType = 'damage' | 'heal' | 'poison' | 'commanderDamage';

interface ActiveZoneEffect {
  type: ZoneEffectType;
  color: string;
  elapsedS: number;
}

/** state[playerId] = that zone's current flash, or undefined when idle. */
export type ZoneEffectState = Record<string, ActiveZoneEffect | undefined>;

export interface ZoneEffectTrigger {
  /** Starts (or restarts) `playerId`'s zone flash as `type`, rendered in `color`. */
  trigger(playerId: string, type: ZoneEffectType, color: string): void;
}

/** Flash color for a plain or commander damage tick — red. */
export const DAMAGE_EFFECT_COLOR = '#ef4444';
/** Flash color for a heal tick (including the attacker's side of lifelink) — green. */
export const HEAL_EFFECT_COLOR = '#22c55e';
/** Flash color for a poison tick — purple. */
export const POISON_EFFECT_COLOR = '#a855f7';

/** How long a zone flash stays visible before fully fading, in seconds. */
export const ZONE_EFFECT_DURATION_S = 0.4;

export function createZoneEffectState(): ZoneEffectState {
  return {};
}

/** Starts (or restarts, resetting its fade) `playerId`'s zone flash. Call once per landed action. */
export function triggerZoneEffect(state: ZoneEffectState, playerId: string, type: ZoneEffectType, color: string): void {
  state[playerId] = { type, color, elapsedS: 0 };
}

/** Ages every active zone flash and clears any that have fully faded. Call once per frame from Game.update(). */
export function updateZoneEffects(state: ZoneEffectState, dt: number): void {
  for (const playerId of Object.keys(state)) {
    const effect = state[playerId];
    if (!effect) {
      continue;
    }
    effect.elapsedS += dt;
    if (effect.elapsedS >= ZONE_EFFECT_DURATION_S) {
      delete state[playerId];
    }
  }
}

export interface ZoneEffectRender {
  type: ZoneEffectType;
  color: string;
  /** 0 (just triggered) to 1 (fully faded); callers fade opacity by (1 - progress). */
  progress: number;
}

/** `playerId`'s current flash for rendering, or null when idle. Independent of any canvas drawing. */
export function getZoneEffect(state: ZoneEffectState, playerId: string): ZoneEffectRender | null {
  const effect = state[playerId];
  if (!effect) {
    return null;
  }
  return { type: effect.type, color: effect.color, progress: Math.min(1, effect.elapsedS / ZONE_EFFECT_DURATION_S) };
}
