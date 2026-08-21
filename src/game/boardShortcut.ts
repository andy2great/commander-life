// Board-wide damage shortcuts (issue #80): the center shortcut control next
// to UndoControl offers two group actions, scoped to the currently active
// player as the source of the effect. Free of DOM globals so it stays
// unit-testable; src/ui/boardShortcutMenu.ts is the DOM layer on top.

import { applyDamageDelta, applyHealDelta } from './life';
import type { Player, UndoAction, UndoStack } from './commanderDamage';
import type { SoundPlayer } from '../audio/soundPlayer';
import type { ScreenShakeTrigger } from './screenShake';
import type { ZoneEffectTrigger } from './zoneEffect';

export type BoardShortcutScope = 'opponents' | 'all';

export interface BoardShortcutOption {
  scope: BoardShortcutScope;
  label: string;
}

/** The only two board-wide shortcuts the center shortcut control offers. */
export const BOARD_SHORTCUT_OPTIONS: BoardShortcutOption[] = [
  { scope: 'opponents', label: 'Damage each opponent' },
  { scope: 'all', label: 'Damage all players' },
];

/**
 * Players affected by a board-wide shortcut, scoped to the currently active
 * player (`players[activeIndex]`) as the source of the effect: 'opponents'
 * excludes the active player, 'all' includes them.
 */
export function boardShortcutTargets(players: Player[], activeIndex: number, scope: BoardShortcutScope): Player[] {
  const active = players[activeIndex];
  return scope === 'all' ? players : players.filter((player) => player.id !== active.id);
}

/**
 * Applies `delta` to every player `boardShortcutTargets` returns for
 * `scope`: a positive `delta` (damage) via `applyDamageDelta`, a negative
 * `delta` (a board-wide heal, issue #95) via `applyHealDelta` — one call per
 * affected player. Groups the resulting per-player undo actions into a
 * single action pushed onto `undoStack`, so one undo tap reverts every
 * affected player at once rather than one undo entry per player. No-op for a
 * zero delta. `shake` (issue #88) and `zoneEffects` (issue #89) are
 * forwarded to each call, independently per affected zone, so e.g. "damage
 * all players" flashes every zone at once: `applyDamageDelta` triggers a red
 * flash plus shake for the damage case, `applyHealDelta` triggers a green
 * flash with no shake for the heal case.
 */
export function applyBoardShortcutDelta(
  players: Player[],
  activeIndex: number,
  scope: BoardShortcutScope,
  delta: number,
  undoStack: UndoStack,
  sound?: SoundPlayer,
  shake?: ScreenShakeTrigger,
  zoneEffects?: ZoneEffectTrigger,
): void {
  if (delta === 0) {
    return;
  }
  const targets = boardShortcutTargets(players, activeIndex, scope);
  const actions: UndoAction[] = [];
  const collector: UndoStack = {
    push: (action) => actions.push(action),
  };
  for (const target of targets) {
    if (delta > 0) {
      applyDamageDelta(target, delta, collector, undefined, shake, zoneEffects);
    } else {
      applyHealDelta(target, -delta, collector, undefined, zoneEffects);
    }
  }
  if (actions.length === 0) {
    return;
  }
  sound?.play(delta > 0 ? 'lifeDown' : 'lifeUp');
  undoStack.push({
    undo(): void {
      for (let i = actions.length - 1; i >= 0; i -= 1) {
        actions[i].undo();
      }
    },
  });
}
