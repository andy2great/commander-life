// Per-zone visual effect on every life/counter change (issue #89): a brief,
// action-type-colored flash on the affected player's zone, distinct from the
// active-zone pulsing border and turn-pass flash in src/game.ts. Trigger and
// expiry are tracked here, free of DOM/canvas globals, so they stay
// unit-testable independent of the actual drawing (done by Game.render).

export type ZoneEffectType = 'damage' | 'heal' | 'lifelink' | 'poison' | 'commander';

export interface ZoneEffect {
  type: ZoneEffectType;
  /** Seconds elapsed since triggerZoneEffect started this effect. */
  elapsed: number;
}

/** state[playerId] = the zone effect currently animating on that player's zone, if any. */
export type ZoneEffectState = Record<string, ZoneEffect>;

export const ZONE_EFFECT_DURATION_S = 0.4;

/**
 * Flash color per action type, reusing the docs/concept.md preset accent
 * colors (crimson, teal, amber, violet, lime, sky) so effects read as part
 * of the same visual language as player zones.
 */
export const ZONE_EFFECT_COLORS: Record<ZoneEffectType, string> = {
  damage: '#e11d48',
  heal: '#84cc16',
  lifelink: '#14b8a6',
  poison: '#8b5cf6',
  commander: '#f59e0b',
};

/**
 * Starts (or restarts, if one is already animating) a `type` flash on
 * `playerId`'s zone. Keyed per player so effects on different zones — e.g.
 * a board-wide "damage all players" shortcut — animate independently
 * without interfering with each other.
 */
export function triggerZoneEffect(state: ZoneEffectState, playerId: string, type: ZoneEffectType): void {
  state[playerId] = { type, elapsed: 0 };
}

/** Advances every active effect's elapsed time and removes any that have expired. */
export function updateZoneEffects(state: ZoneEffectState, dt: number): void {
  for (const playerId of Object.keys(state)) {
    const effect = state[playerId];
    effect.elapsed += dt;
    if (effect.elapsed >= ZONE_EFFECT_DURATION_S) {
      delete state[playerId];
    }
  }
}
