// Board-wide damage shortcuts (issue #80): the center shortcut control next
// to UndoControl offers two group actions, scoped to the currently active
// player as the source of the effect. Free of DOM globals so it stays
// unit-testable; src/ui/boardShortcutMenu.ts is the DOM layer on top.

import { applyDamageDelta } from './life';
import type { Player, UndoAction, UndoStack } from './commanderDamage';
import type { SoundPlayer } from '../audio/soundPlayer';
import type { ScreenShakeTrigger } from './screenShake';
import type { ZoneEffectState } from './zoneEffect';

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
 * `scope`, via `applyDamageDelta` (one call per affected player). Groups the
 * resulting per-player undo actions into a single action pushed onto
 * `undoStack`, so one undo tap reverts every affected player at once rather
 * than one undo entry per player. No-op for a zero delta. `shake` (issue #88)
 * is forwarded to each `applyDamageDelta` call, which triggers it only for a
 * positive delta. Likewise, each affected player's zone gets its own
 * independent damage effect via `effects` (issue #89), keyed by player id so
 * simultaneous zones never clobber one another.
 */
export function applyBoardShortcutDelta(
  players: Player[],
  activeIndex: number,
  scope: BoardShortcutScope,
  delta: number,
  undoStack: UndoStack,
  sound?: SoundPlayer,
  shake?: ScreenShakeTrigger,
  effects?: ZoneEffectState,
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
    applyDamageDelta(target, delta, collector, undefined, shake, effects);
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
