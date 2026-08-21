// Plain life-total actions (issue #71): ordinary damage, lifelink damage, and
// healing, as distinct from the directional commander-damage counter
// (src/game/commanderDamage.ts) and poison (src/game/poison.ts). Free of DOM
// globals so it stays unit-testable.

import type { Player, UndoStack } from './commanderDamage';
import type { SoundPlayer } from '../audio/soundPlayer';

/**
 * Decreases `target`'s life by `delta`, without touching any commander-damage
 * counter. Pushes an undo action that reverts it onto `undoStack`. No-op if
 * `delta` is zero.
 */
export function applyDamageDelta(
  target: Player,
  delta: number,
  undoStack: UndoStack,
  sound?: SoundPlayer,
): void {
  if (delta === 0) {
    return;
  }
  target.life -= delta;
  sound?.play(delta > 0 ? 'lifeDown' : 'lifeUp');
  undoStack.push({
    undo(): void {
      target.life += delta;
    },
  });
}

/**
 * Increases `target`'s life by `delta` (healing). Pushes an undo action that
 * reverts it onto `undoStack`. No-op if `delta` is zero.
 */
export function applyHealDelta(
  target: Player,
  delta: number,
  undoStack: UndoStack,
  sound?: SoundPlayer,
): void {
  if (delta === 0) {
    return;
  }
  target.life += delta;
  sound?.play(delta > 0 ? 'lifeUp' : 'lifeDown');
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
 * `attacker` and `target` are the same player.
 */
export function applyLifelinkDelta(
  attacker: Player,
  target: Player,
  delta: number,
  undoStack: UndoStack,
  sound?: SoundPlayer,
): void {
  if (delta === 0 || attacker.id === target.id) {
    return;
  }
  target.life -= delta;
  attacker.life += delta;
  sound?.play(delta > 0 ? 'lifeDown' : 'lifeUp');
  undoStack.push({
    undo(): void {
      target.life += delta;
      attacker.life -= delta;
    },
  });
}
