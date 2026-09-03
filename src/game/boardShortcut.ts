// Board-wide damage shortcuts (issue #80): the center shortcut control next
// to UndoControl offers two group actions, scoped to the currently active
// player as the source of the effect. Free of DOM globals so it stays
// unit-testable; src/ui/boardShortcutMenu.ts is the DOM layer on top.

import { applyDamageDelta, applyHealDelta } from './life';
import type { Player, UndoAction, UndoStack } from './commanderDamage';
import type { SoundPlayer } from '../audio/soundPlayer';
import type { ScreenShakeTrigger } from './screenShake';
import type { ZoneEffectTrigger } from './zoneEffect';
import type { StatsTrigger } from './stats';

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
 * flash with no shake for the heal case. `stats` (issue #98) is likewise
 * forwarded, with the active player (the effect's source) attributed as the
 * attacker for the damage case's life-lost/biggest-hit stats.
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
  stats?: StatsTrigger,
): void {
  if (delta === 0) {
    return;
  }
  const active = players[activeIndex];
  const targets = boardShortcutTargets(players, activeIndex, scope);
  const actions: UndoAction[] = [];
  const collector: UndoStack = {
    push: (action) => actions.push(action),
  };
  for (const target of targets) {
    if (delta > 0) {
      applyDamageDelta(target, delta, collector, undefined, shake, zoneEffects, active.id, stats);
    } else {
      applyHealDelta(target, -delta, collector, undefined, zoneEffects, stats);
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

export interface BoardShortcutSession {
  /** Selects which option the shared stepper currently targets, resetting the pending amount to 0 (matches the pre-#230 "switching toggles resets the counter" behavior). */
  select(option: BoardShortcutOption): void;
  /** Clears the pending selection (e.g. switching to the "End game" toggle), so a later `commit()` no-ops until an option is selected again. */
  deselect(): void;
  /** Adjusts the pending amount by one stepper tap. No-op if no option is selected. */
  step(delta: 1 | -1): void;
  /** Current pending amount for the selected option (0 if none selected). */
  getAmount(): number;
  /** True once an option is selected, so callers can reveal/hide the stepper+Apply row. */
  hasSelection(): boolean;
}

/**
 * Batches the board shortcut menu's toggle selection and shared +/- counter
 * into a single commit, applied via `applyBoardShortcutDelta` regardless of
 * how the menu closes (issue #230: backdrop tap, X, or an explicit Apply tap
 * must all commit the pending value, matching AttackMenu's
 * commit-on-any-dismissal model instead of discarding it unless Apply was
 * tapped). No-op if no option was ever selected, or the pending amount is
 * still 0 (nothing was stepped).
 */
export function createBoardShortcutSession(
  players: Player[],
  getActiveIndex: () => number,
  undoStack: UndoStack,
  sound?: SoundPlayer,
  shake?: ScreenShakeTrigger,
  zoneEffects?: ZoneEffectTrigger,
  stats?: StatsTrigger,
): BoardShortcutSession & { commit(): void } {
  let selected: BoardShortcutOption | null = null;
  let amount = 0;
  return {
    select(option: BoardShortcutOption): void {
      selected = option;
      amount = 0;
    },
    deselect(): void {
      selected = null;
      amount = 0;
    },
    step(delta: 1 | -1): void {
      if (!selected) {
        return;
      }
      amount += delta;
    },
    getAmount: () => amount,
    hasSelection: () => selected !== null,
    commit(): void {
      if (!selected) {
        return;
      }
      applyBoardShortcutDelta(players, getActiveIndex(), selected.scope, amount, undoStack, sound, shake, zoneEffects, stats);
      selected = null;
      amount = 0;
    },
  };
}
