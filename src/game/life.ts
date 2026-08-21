// Plain life-total actions (issue #71): ordinary damage, lifelink damage, and
// healing, as distinct from the directional commander-damage counter
// (src/game/commanderDamage.ts) and poison (src/game/poison.ts). Free of DOM
// globals so it stays unit-testable.

import type { Player, UndoStack } from './commanderDamage';
import type { SoundPlayer } from '../audio/soundPlayer';
import { DAMAGE_SHAKE_TRAUMA, type ScreenShakeTrigger } from './screenShake';
import { DAMAGE_EFFECT_COLOR, HEAL_EFFECT_COLOR, type ZoneEffectTrigger } from './zoneEffect';

/**
 * Decreases `target`'s life by `delta`, without touching any commander-damage
 * counter. Pushes an undo action that reverts it onto `undoStack`. No-op if
 * `delta` is zero. Triggers `shake` (issue #88) and `zoneEffects` (issue #89)
 * only for a positive delta — an actual damage tick, as opposed to correcting
 * a prior tap within the same menu session.
 */
export function applyDamageDelta(
  target: Player,
  delta: number,
  undoStack: UndoStack,
  sound?: SoundPlayer,
  shake?: ScreenShakeTrigger,
  zoneEffects?: ZoneEffectTrigger,
): void {
  if (delta === 0) {
    return;
  }
  target.life -= delta;
  sound?.play(delta > 0 ? 'lifeDown' : 'lifeUp');
  if (delta > 0) {
    shake?.trigger(DAMAGE_SHAKE_TRAUMA);
    zoneEffects?.trigger(target.id, 'damage', DAMAGE_EFFECT_COLOR);
  }
  undoStack.push({
    undo(): void {
      target.life += delta;
    },
  });
}

/**
 * Increases `target`'s life by `delta` (healing). Pushes an undo action that
 * reverts it onto `undoStack`. No-op if `delta` is zero. Triggers
 * `zoneEffects` (issue #89) only for a positive delta — an actual heal, as
 * opposed to correcting a prior tap within the same menu session.
 */
export function applyHealDelta(
  target: Player,
  delta: number,
  undoStack: UndoStack,
  sound?: SoundPlayer,
  zoneEffects?: ZoneEffectTrigger,
): void {
  if (delta === 0) {
    return;
  }
  target.life += delta;
  sound?.play(delta > 0 ? 'lifeUp' : 'lifeDown');
  if (delta > 0) {
    zoneEffects?.trigger(target.id, 'heal', HEAL_EFFECT_COLOR);
  }
  undoStack.push({
    undo(): void {
      target.life -= delta;
    },
  });
}

/**
 * Decreases `target`'s life by `delta` and increases `attacker`'s life by the
 * same amount, as one action (lifelink damage). Pushes a single undo action
 * that reverts both changes onto `undoStack`. No-op if `delta` is zero or
 * `attacker` and `target` are the same player. Triggers `shake` (issue #88)
 * only for a positive delta — the target is taking damage. Triggers
 * `zoneEffects` (issue #89) on both zones for a positive delta: a damage
 * flash on `target`, a heal flash on `attacker`.
 */
export function applyLifelinkDelta(
  attacker: Player,
  target: Player,
  delta: number,
  undoStack: UndoStack,
  sound?: SoundPlayer,
  shake?: ScreenShakeTrigger,
  zoneEffects?: ZoneEffectTrigger,
): void {
  if (delta === 0 || attacker.id === target.id) {
    return;
  }
  target.life -= delta;
  attacker.life += delta;
  sound?.play(delta > 0 ? 'lifeDown' : 'lifeUp');
  if (delta > 0) {
    shake?.trigger(DAMAGE_SHAKE_TRAUMA);
    zoneEffects?.trigger(target.id, 'damage', DAMAGE_EFFECT_COLOR);
    zoneEffects?.trigger(attacker.id, 'heal', HEAL_EFFECT_COLOR);
  }
  undoStack.push({
    undo(): void {
      target.life += delta;
      attacker.life -= delta;
    },
  });
}
