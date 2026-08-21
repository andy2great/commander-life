// Canvas-wide screen-shake effect on impactful damage actions (issue #88).
// A trauma-based shake: trigger() raises trauma (clamped to 1), update()
// decays it at a constant rate, and getOffset() derives a render-only pixel
// offset from it. Free of DOM globals so it stays unit-testable — Game.render
// (src/game.ts) is the only place that applies the offset to the canvas, and
// only for drawing: it never feeds into hit-testing/touch coordinates.

export interface ScreenShakeState {
  trauma: number;
}

export interface ScreenShakeTrigger {
  /** Raises trauma to at least `intensity` (0-1); never reduces an already-higher trauma from a very recent trigger. */
  trigger(intensity: number): void;
}

/** Trauma for a routine damage tick: plain/commander/lifelink damage, or a poison increase. */
export const DAMAGE_SHAKE_TRAUMA = 0.4;
/** Trauma for a player being eliminated — stronger and, via the shared decay rate, longer than a routine damage tick. */
export const ELIMINATION_SHAKE_TRAUMA = 1;

// Trauma decays linearly to 0 at this rate per second, so a single trigger
// intensity drives both how hard the shake reads and how long it lasts,
// without separate duration bookkeeping.
const TRAUMA_DECAY_PER_S = 2.5;
// Offset scales with trauma^2 (the standard "trauma" shake curve) so a small
// trauma barely shows and only a strong trigger reaches the full offset.
const TRAUMA_OFFSET_POWER = 2;
const MAX_OFFSET_PX = 16;
// Distinct, non-harmonic frequencies per axis so the shake reads as a jitter
// rather than a straight-line oscillation.
const OFFSET_FREQUENCY_X = 31;
const OFFSET_FREQUENCY_Y = 23;

export function createScreenShakeState(): ScreenShakeState {
  return { trauma: 0 };
}

/** Raises `state`'s trauma to `intensity`, clamped to [0, 1]. A lower intensity than the current trauma is a no-op. */
export function triggerScreenShake(state: ScreenShakeState, intensity: number): void {
  state.trauma = Math.min(1, Math.max(state.trauma, intensity));
}

/** Decays `state`'s trauma toward 0 at a constant rate. Call once per frame from Game.update(). */
export function updateScreenShake(state: ScreenShakeState, dt: number): void {
  state.trauma = Math.max(0, state.trauma - TRAUMA_DECAY_PER_S * dt);
}

/**
 * Render-only pixel offset for the current trauma, derived from `seed` (the
 * game's running animation clock) rather than randomness so the result stays
 * deterministic and testable. Callers translate the canvas by this offset for
 * drawing only — it must never feed into hit-testing.
 */
export function getScreenShakeOffset(state: ScreenShakeState, seed: number): { x: number; y: number } {
  if (state.trauma <= 0) {
    return { x: 0, y: 0 };
  }
  const magnitude = state.trauma ** TRAUMA_OFFSET_POWER * MAX_OFFSET_PX;
  return {
    x: magnitude * Math.sin(seed * OFFSET_FREQUENCY_X),
    y: magnitude * Math.cos(seed * OFFSET_FREQUENCY_Y),
  };
}
