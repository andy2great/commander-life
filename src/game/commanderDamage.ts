// Commander-damage sync logic. Keeps per-opponent commander-damage counters and
// each player's total life in sync, and records a matching undo action on the
// shared undo stack. Free of DOM globals so it stays unit-testable.

import type { SoundPlayer } from '../audio/soundPlayer';
import { DAMAGE_SHAKE_TRAUMA, type ScreenShakeTrigger } from './screenShake';
import { DAMAGE_EFFECT_COLOR, type ZoneEffectTrigger } from './zoneEffect';
import type { StatsTrigger } from './stats';

export interface Player {
  id: string;
  name: string;
  life: number;
  color?: string;
  /**
   * True when this player runs two commanders (a Partner pair, or a
   * Commander + Background) rather than one (issue #165). Commander damage
   * dealt by a two-commander player is then tracked as two separate
   * per-opponent counters instead of one merged counter, matching how
   * Playgroup tracks lethal (21+) per individual commander.
   */
  hasTwoCommanders?: boolean;
}

/**
 * state[targetId][fromOpponentId] = commander damage targetId has taken from
 * fromOpponentId, one entry per commander fromOpponentId controls: length 1
 * for a single-commander opponent, length 2 (one counter per commander) for
 * a two-commander opponent (issue #165).
 */
export type CommanderDamageState = Record<string, Record<string, number[]>>;

export interface UndoAction {
  undo(): void;
}

export interface UndoStack {
  push(action: UndoAction): void;
}

export function createCommanderDamageState(players: Player[]): CommanderDamageState {
  const state: CommanderDamageState = {};
  for (const player of players) {
    state[player.id] = {};
    for (const other of players) {
      if (other.id !== player.id) {
        state[player.id][other.id] = other.hasTwoCommanders ? [0, 0] : [0];
      }
    }
  }
  return state;
}

/**
 * Adjusts the commander damage `targetId` has taken from `fromId`'s
 * `commanderIndex`-th commander (0 for a single-commander player, 0 or 1 for
 * a two-commander player — issue #165) by `delta` (clamped at zero) and
 * applies the same delta to `targetId`'s life, since commander damage is
 * also regular damage. Pushes an undo action that reverts both changes onto
 * `undoStack`. Plays a distinct increment/decrement cue on `sound`, if
 * given, only when the clamped change actually applies. Triggers `shake`
 * (issue #88) only when the clamped change is an increase — an actual
 * damage tick. Triggers `zoneEffects` (issue #89) on `targetId`'s zone under
 * the same condition, colored with the attacking `fromId` player's own
 * accent color where set (falling back to the plain damage color
 * otherwise), so the flash reads as "damage from that commander". Records
 * the applied amount on `stats` (issue #98) as commander damage dealt by
 * `fromId`/received by `targetId`, and as a biggest-hit candidate
 * attributed to `fromId` with `targetId` set, under the same condition.
 */
export function applyCommanderDamageDelta(
  state: CommanderDamageState,
  players: Player[],
  targetId: string,
  fromId: string,
  commanderIndex: number,
  delta: number,
  undoStack: UndoStack,
  sound?: SoundPlayer,
  shake?: ScreenShakeTrigger,
  zoneEffects?: ZoneEffectTrigger,
  stats?: StatsTrigger,
): void {
  if (targetId === fromId || delta === 0) {
    return;
  }
  const target = players.find((player) => player.id === targetId);
  if (!target) {
    return;
  }

  const targetDamage = state[targetId] ?? (state[targetId] = {});
  const counters = targetDamage[fromId] ?? (targetDamage[fromId] = []);
  const before = counters[commanderIndex] ?? 0;
  const after = Math.max(0, before + delta);
  const applied = after - before;
  if (applied === 0) {
    return;
  }

  counters[commanderIndex] = after;
  target.life -= applied;
  sound?.play(applied > 0 ? 'commanderDamageUp' : 'commanderDamageDown');
  if (applied > 0) {
    shake?.trigger(DAMAGE_SHAKE_TRAUMA);
    const attacker = players.find((player) => player.id === fromId);
    zoneEffects?.trigger(targetId, 'commanderDamage', attacker?.color ?? DAMAGE_EFFECT_COLOR, -applied);
    stats?.recordCommanderDamage(fromId, targetId, applied);
    stats?.recordHit(fromId, applied, targetId);
  }

  undoStack.push({
    undo(): void {
      counters[commanderIndex] = before;
      target.life += applied;
    },
  });
}
