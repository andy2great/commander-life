// Zone-to-zone drag damage-type menu (issue #48): opened when a drag starts
// in one player's zone and releases in another's (see
// Game.resolveZoneDrag). Lets the dragging player pick which kind of
// damage to log — plain damage, commander damage (the directional,
// per-opponent counter), lifelink damage, heal, or poison (issue #71) —
// reusing the same state/undo plumbing the old per-row menu used.
//
// Issue #76: rather than one stepper row per damage type, the panel shows a
// single shared +/- counter with a row of toggle buttons above it to pick
// which type the counter currently applies to. `buildDamageTypeDefs` holds
// that selection logic (which types apply for a given attacker/target pair,
// what each toggle's counter should currently read, and what tapping +/-
// does) free of DOM globals so it stays unit-testable; `AttackMenu` is the
// thin DOM layer on top of it.
//
// Issue #233 (R26): `AttackMenuTypeMemory` remembers the last type explicitly
// selected per attacker/target (or self-target) pair, so reopening the menu
// for the same pair pre-selects it instead of resetting to the default
// order — also DOM-free so its remember/resolve logic is unit-testable.

import {
  applyCommanderDamageDelta,
  type CommanderDamageState,
  type Player,
  type UndoAction,
  type UndoStack,
} from '../game/commanderDamage';
import { applyDamageDelta, applyHealDelta, applyLifelinkDelta } from '../game/life';
import { applyPoisonDelta, type PoisonState } from '../game/poison';
import { applyEnergyDelta, type EnergyState } from '../game/energy';
import { applyExperienceDelta, type ExperienceState } from '../game/experience';
import { addCustomCounter, applyCustomCounterDelta, removeCustomCounter, type CustomCountersState } from '../game/customCounters';
import type { SoundPlayer } from '../audio/soundPlayer';
import type { ScreenShakeTrigger } from '../game/screenShake';
import type { ZoneEffectTrigger } from '../game/zoneEffect';
import type { StatsTrigger } from '../game/stats';
import { attachHoldToRepeat } from './holdToRepeat';
import { DISPLAY_FONT_STACK, injectDisplayFontFace } from './displayFont';

export type DamageTypeKey =
  | 'damage'
  | 'commander'
  | 'commander1'
  | 'commander2'
  | 'lifelink'
  | 'heal'
  | 'poison'
  | 'energy'
  | 'experience'
  | `custom:${string}`;

/** Accent color for every custom counter toggle (issue #171) — a neutral tone distinct from the player-accent-colored built-in types and from poison's purple, so custom counters read as visually distinct regardless of which player's zone they're in. */
export const CUSTOM_COUNTER_COLOR = '#6b7280';

export interface DamageTypeDef {
  key: DamageTypeKey;
  label: string;
  /** Accent color the toggle/counter should render for this type. */
  color: string;
  /** Current amount to show on the shared counter when this type is selected. */
  getValue(): number;
  /** Applies one +/- tap (±1) for this type via its `apply*Delta` helper. */
  apply(delta: 1 | -1): void;
  /** True for a custom counter (issue #171), which can be deleted from the menu unlike every built-in type. */
  removable?: boolean;
  /** Removes this custom counter entirely. Only set when `removable` is true. */
  onRemove?(): void;
}

/**
 * Builds the ordered list of damage types the shared counter can be toggled
 * to for a drag from `attacker`'s zone into `target`'s zone. `isSelfTarget`
 * (issue #70) omits commander damage and lifelink, since neither applies
 * against yourself.
 *
 * `damage`, `lifelink`, and `heal` are backed by a menu-local session count
 * (starting at 0, clamped so `-` can only undo taps made within this same
 * open menu) rather than persistent game state — matching the pre-#76
 * per-row behavior, since there is no persistent "total plain damage dealt"
 * counter in `damageState`/`poisonState` to show instead. `commander`,
 * `poison`, `energy`, and `experience` read/write the shared, persistent
 * `damageState`/`poisonState`/`energyState`/`experienceState`. `energy`
 * (issue #160) and `experience` (issue #161) are only offered for a
 * self-target pair — they're personal resources, not something
 * logged against an opponent.
 *
 * When `attacker.hasTwoCommanders` is set (issue #165), the single
 * `commander` toggle is replaced by two — `commander1` and `commander2` —
 * each reading/writing its own counter in `damageState[target.id][attacker.id]`
 * (index 0 or 1), so a two-commander attacker (Partner pair, or Commander +
 * Background) tracks lethal per individual commander rather than merged.
 *
 * When `isSelfTarget`, one additional toggle is appended per entry in
 * `customCountersState[target.id]` (issue #171) — free-form, player-named
 * counters for effects the built-in types don't cover. Unlike every other
 * type here, these are `removable` (deletable from the menu) and their
 * `apply` has no clamp, per applyCustomCounterDelta.
 */
export function buildDamageTypeDefs(
  attacker: Player,
  target: Player,
  isSelfTarget: boolean,
  damageState: CommanderDamageState,
  poisonState: PoisonState,
  energyState: EnergyState,
  experienceState: ExperienceState,
  players: Player[],
  undoStack: UndoStack,
  sound?: SoundPlayer,
  shake?: ScreenShakeTrigger,
  zoneEffects?: ZoneEffectTrigger,
  stats?: StatsTrigger,
  customCountersState?: CustomCountersState,
): DamageTypeDef[] {
  const localCounts: Partial<Record<DamageTypeKey, number>> = {};
  const localType = (
    key: DamageTypeKey,
    label: string,
    color: string,
    onApply: (delta: 1 | -1) => void,
  ): DamageTypeDef => {
    localCounts[key] = 0;
    return {
      key,
      label,
      color,
      getValue: () => localCounts[key] ?? 0,
      apply: (delta) => {
        const count = localCounts[key] ?? 0;
        if (delta < 0 && count <= 0) {
          return;
        }
        localCounts[key] = count + delta;
        onApply(delta);
      },
    };
  };

  const types: DamageTypeDef[] = [
    localType('damage', 'Damage', target.color ?? '#948fa3', (delta) =>
      applyDamageDelta(target, delta, undoStack, sound, shake, zoneEffects, attacker.id, stats),
    ),
  ];

  if (!isSelfTarget) {
    const commanderType = (key: 'commander' | 'commander1' | 'commander2', label: string, index: number): DamageTypeDef => ({
      key,
      label,
      color: attacker.color ?? '#948fa3',
      getValue: () => damageState[target.id]?.[attacker.id]?.[index] ?? 0,
      apply: (delta) =>
        applyCommanderDamageDelta(
          damageState,
          players,
          target.id,
          attacker.id,
          index,
          delta,
          undoStack,
          sound,
          shake,
          zoneEffects,
          stats,
        ),
    });
    if (attacker.hasTwoCommanders) {
      types.push(commanderType('commander1', 'Commander damage (1)', 0));
      types.push(commanderType('commander2', 'Commander damage (2)', 1));
    } else {
      types.push(commanderType('commander', 'Commander damage', 0));
    }
    types.push(
      localType('lifelink', 'Lifelink damage', attacker.color ?? '#948fa3', (delta) =>
        applyLifelinkDelta(attacker, target, delta, undoStack, sound, shake, zoneEffects, stats),
      ),
    );
  }

  types.push(
    localType('heal', 'Heal', target.color ?? '#948fa3', (delta) =>
      applyHealDelta(target, delta, undoStack, sound, zoneEffects, stats),
    ),
  );

  types.push({
    key: 'poison',
    label: 'Poison',
    color: target.color ?? '#948fa3',
    getValue: () => poisonState[target.id] ?? 0,
    apply: (delta) => applyPoisonDelta(poisonState, target.id, delta, undoStack, shake, zoneEffects),
  });

  if (isSelfTarget) {
    types.push({
      key: 'energy',
      label: 'Energy',
      color: target.color ?? '#948fa3',
      getValue: () => energyState[target.id] ?? 0,
      apply: (delta) => applyEnergyDelta(energyState, target.id, delta, undoStack),
    });
    types.push({
      key: 'experience',
      label: 'Experience',
      color: target.color ?? '#948fa3',
      getValue: () => experienceState[target.id] ?? 0,
      apply: (delta) => applyExperienceDelta(experienceState, target.id, delta, undoStack),
    });

    const customCounters = customCountersState?.[target.id] ?? [];
    for (const counter of customCounters) {
      types.push({
        key: `custom:${counter.id}`,
        label: counter.name,
        color: CUSTOM_COUNTER_COLOR,
        getValue: () => counter.value,
        apply: (delta) => applyCustomCounterDelta(customCountersState!, target.id, counter.id, delta, undoStack),
        removable: true,
        onRemove: () => removeCustomCounter(customCountersState!, target.id, counter.id, undoStack),
      });
    }
  }

  return types;
}

/**
 * Key identifying one damage-type "memory" slot (issue #233, R26). Cross-zone
 * attacker/target pairs are keyed by both ids, so a different pair (e.g.
 * A → C) never shares memory with A → B. Self-target menus are keyed by
 * player id under a distinct prefix, so a player's self-target memory is
 * tracked independently of any cross-zone pair involving that same player.
 */
export function attackMenuMemoryKey(fromId: string, toId: string, isSelfTarget: boolean): string {
  return isSelfTarget ? `self:${toId}` : `pair:${fromId}:${toId}`;
}

/**
 * Remembers which damage type was last explicitly selected for each
 * attacker/target (or self-target) pair (R26), so reopening the menu for the
 * same pair pre-selects that type instead of resetting to the default order.
 * `AttackMenu` owns one instance of this, and `main.ts` recreates the whole
 * `AttackMenu` on every "New Game" (see `startGame`), so this memory resets
 * along with it without needing any explicit clearing.
 */
export class AttackMenuTypeMemory {
  private readonly selections = new Map<string, DamageTypeKey>();

  /**
   * The type to pre-select for `key`: the remembered type if one exists and
   * is still among `types` (it may not be, e.g. a since-removed custom
   * counter), otherwise `types[0]` — `buildDamageTypeDefs`'s existing
   * default order.
   */
  resolveInitial(key: string, types: DamageTypeDef[]): DamageTypeDef {
    const remembered = this.selections.get(key);
    return types.find((type) => type.key === remembered) ?? types[0];
  }

  remember(key: string, type: DamageTypeDef): void {
    this.selections.set(key, type.key);
  }
}

export interface AttackMenuSession {
  /** Pass as the `undoStack` for `buildDamageTypeDefs` so every stepper tap made during this session is collected here instead of pushed straight onto the shared stack. */
  undoStack: UndoStack;
  /** Commits every action collected so far as one entry on the real undo stack (no-op if none were made). */
  commit(): void;
}

/**
 * Batches every stepper tap made while the attack/self-target menu is open
 * (issue #94) into a single undo entry, the same way `applyBoardShortcutDelta`
 * (issue #80) batches one "Apply" press's per-player changes. Taps across
 * different damage types within the same session all land in the same
 * collected list, in the order applied, so switching the selected type
 * mid-session doesn't lose or merge any type's pending change — undoing the
 * committed entry replays every sub-action's own `undo` in reverse order.
 */
export function createAttackMenuSession(undoStack: UndoStack): AttackMenuSession {
  let actions: UndoAction[] = [];
  return {
    undoStack: {
      push: (action) => actions.push(action),
    },
    commit(): void {
      if (actions.length === 0) {
        return;
      }
      const committed = actions;
      actions = [];
      undoStack.push({
        undo(): void {
          for (let i = committed.length - 1; i >= 0; i -= 1) {
            committed[i].undo();
          }
        },
      });
    },
  };
}

export interface AttackMenuOptions {
  /** Element the overlay is appended to (e.g. document.body). */
  root: HTMLElement;
  players: Player[];
  damageState: CommanderDamageState;
  poisonState: PoisonState;
  energyState: EnergyState;
  experienceState: ExperienceState;
  customCountersState: CustomCountersState;
  undoStack: UndoStack;
  sound?: SoundPlayer;
  shake?: ScreenShakeTrigger;
  zoneEffects?: ZoneEffectTrigger;
  stats?: StatsTrigger;
  /** Called with `true` when the overlay opens and `false` when it closes, so the caller (main.ts) can blur+dim the canvas board behind it (issue #204). */
  onOpenChange?: (open: boolean) => void;
}

let stylesInjected = false;
function injectStylesOnce(): void {
  if (stylesInjected) {
    return;
  }
  stylesInjected = true;
  injectDisplayFontFace();
  const style = document.createElement('style');
  style.textContent = `
    .cmdr-atk-overlay { position: fixed; inset: 0; background: rgba(8, 7, 12, 0.55); z-index: 30; display: flex; align-items: flex-end; }
    .cmdr-atk-panel { width: 100%; max-height: var(--overlay-max-h, 88vh); overflow-y: auto; background: linear-gradient(160deg, #211c29 0%, #1a1620 100%); border-radius: 24px 24px 0 0; padding: 20px; box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05); }
    .cmdr-atk-head { display: flex; align-items: center; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid transparent; }
    .cmdr-atk-title { color: #f5f3f7; font-size: 18px; font-weight: 400; letter-spacing: 0.6px; text-transform: uppercase; flex: 1; font-family: ${DISPLAY_FONT_STACK}; }
    .cmdr-atk-close { box-sizing: border-box; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; border: none; background: #241f2d; color: #948fa3; transition: transform 100ms ease, filter 100ms ease; }
    .cmdr-atk-close:active { transform: scale(0.9); filter: brightness(1.2); }
    .cmdr-atk-close svg { width: 14px; height: 14px; }
    .cmdr-atk-toggles { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .cmdr-atk-toggle { box-sizing: border-box; position: relative; flex: 1 1 auto; min-width: 84px; padding: 10px 12px; border-radius: 14px; border: 2px solid #2d2938; background: #241f2d; color: #948fa3; font-size: 12px; font-weight: 700; font-family: system-ui, sans-serif; transition: border-color 150ms ease, background 150ms ease, color 150ms ease; }
    .cmdr-atk-toggle.active { border-color: var(--toggle-color, #948fa3); color: #f5f3f7; background: #2d2938; box-shadow: 0 0 0 1px var(--toggle-color, #948fa3) inset; }
    .cmdr-atk-toggle-removable { padding-right: 26px; }
    .cmdr-atk-toggle-remove { box-sizing: border-box; position: absolute; top: 4px; right: 4px; display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: rgba(229, 72, 77, 0.25); color: #ff8a8f; font-size: 12px; line-height: 1; }
    .cmdr-atk-custom-add { display: flex; gap: 8px; margin-top: 4px; }
    .cmdr-atk-custom-input { box-sizing: border-box; flex: 1; padding: 12px 14px; border-radius: 14px; border: 2px solid #2d2938; background: #241f2d; color: #f5f3f7; font-size: 14px; font-family: system-ui, sans-serif; }
    .cmdr-atk-custom-add-btn { box-sizing: border-box; padding: 12px 16px; border-radius: 14px; border: none; background: #2d2938; color: #f5f3f7; font-size: 12px; font-weight: 700; font-family: system-ui, sans-serif; transition: transform 100ms ease, filter 100ms ease; }
    .cmdr-atk-custom-add-btn:active { transform: scale(0.96); filter: brightness(1.15); }
    .cmdr-atk-row { display: flex; align-items: stretch; background: #241f2d; border-radius: 20px; padding: 10px; border-left: 3px solid transparent; transition: border-color 150ms ease; }
    .cmdr-atk-stepper { position: relative; display: flex; align-items: stretch; gap: 6px; width: 100%; height: 84px; }
    .cmdr-atk-stepper button { box-sizing: border-box; flex: 1; border: none; border-radius: 16px; background: #2d2938; color: #f5f3f7; font-size: 32px; font-weight: 800; transition: transform 100ms ease, filter 100ms ease; }
    .cmdr-atk-stepper button:active { transform: scale(0.96); filter: brightness(1.15); }
    .cmdr-atk-stepper button.cmdr-atk-minus { background: rgba(229, 72, 77, 0.16); color: #ff8a8f; }
    .cmdr-atk-stepper button.cmdr-atk-plus { background: rgba(34, 197, 148, 0.16); color: #4be3c4; }
    .cmdr-atk-val { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: none; min-width: 44px; text-align: center; color: #f0c98a; font-size: 30px; font-weight: 400; font-variant-numeric: tabular-nums; font-family: ${DISPLAY_FONT_STACK}; background: #1b1822; padding: 6px 14px; border-radius: 14px; box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(215, 165, 76, 0.25); }
  `;
  document.head.appendChild(style);
}

export class AttackMenu {
  private readonly root: HTMLElement;
  private readonly players: Player[];
  private readonly damageState: CommanderDamageState;
  private readonly poisonState: PoisonState;
  private readonly energyState: EnergyState;
  private readonly experienceState: ExperienceState;
  private readonly customCountersState: CustomCountersState;
  private readonly undoStack: UndoStack;
  private readonly sound?: SoundPlayer;
  private readonly shake?: ScreenShakeTrigger;
  private readonly zoneEffects?: ZoneEffectTrigger;
  private readonly stats?: StatsTrigger;
  private readonly onOpenChange?: (open: boolean) => void;
  private overlay: HTMLElement | null = null;
  private holdToRepeatDetachFns: Array<() => void> = [];
  private session: AttackMenuSession | null = null;
  private readonly typeMemory = new AttackMenuTypeMemory();
  private currentMemoryKey = '';

  constructor(options: AttackMenuOptions) {
    this.root = options.root;
    this.players = options.players;
    this.damageState = options.damageState;
    this.poisonState = options.poisonState;
    this.energyState = options.energyState;
    this.experienceState = options.experienceState;
    this.customCountersState = options.customCountersState;
    this.undoStack = options.undoStack;
    this.sound = options.sound;
    this.shake = options.shake;
    this.onOpenChange = options.onOpenChange;
    this.zoneEffects = options.zoneEffects;
    this.stats = options.stats;
  }

  get isOpen(): boolean {
    return this.overlay !== null;
  }

  /**
   * Opens the damage-type menu for a drag from `fromId`'s zone into `toId`'s
   * zone. `fromId === toId` (issue #70) opens a self-target menu instead:
   * commander damage and lifelink are omitted from the toggle row (see
   * `buildDamageTypeDefs`), and the title shows the player's name once with
   * a "(self)" label instead of the usual attacker → target pair.
   */
  open(fromId: string, toId: string): void {
    injectStylesOnce();
    this.close();

    const attacker = this.players.find((player) => player.id === fromId);
    const target = this.players.find((player) => player.id === toId);
    if (!attacker || !target) {
      return;
    }
    const isSelfTarget = fromId === toId;
    this.currentMemoryKey = attackMenuMemoryKey(fromId, toId, isSelfTarget);

    const overlay = document.createElement('div');
    overlay.className = 'cmdr-atk-overlay';
    overlay.addEventListener('pointerdown', (event) => {
      if (event.target === overlay) {
        this.close();
      }
    });

    const panel = document.createElement('div');
    panel.className = 'cmdr-atk-panel';

    const targetColor = target.color ?? '#948fa3';

    const head = document.createElement('div');
    head.className = 'cmdr-atk-head';
    head.style.borderBottomColor = `${targetColor}55`;
    const title = document.createElement('div');
    title.className = 'cmdr-atk-title';
    title.style.color = targetColor;
    title.textContent = isSelfTarget ? `${target.name} (self)` : `${attacker.name} → ${target.name}`;
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'cmdr-atk-close';
    closeButton.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="5" y1="19" x2="19" y2="5"/><line x1="5" y1="5" x2="19" y2="19"/></svg>';
    closeButton.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      this.close();
    });
    head.appendChild(title);
    head.appendChild(closeButton);
    panel.appendChild(head);

    this.session = createAttackMenuSession(this.undoStack);
    const body = document.createElement('div');
    panel.appendChild(body);
    this.renderBody(body, attacker, target, isSelfTarget);

    overlay.appendChild(panel);
    this.root.appendChild(overlay);
    this.overlay = overlay;
    this.onOpenChange?.(true);
  }

  /**
   * (Re)builds the toggle row + shared counter — and, for a self-target menu,
   * the "add a custom counter" row (issue #171) — inside `body`. Called once
   * from `open()`, and again whenever a custom counter is added or removed,
   * since the set of toggles changes and `buildTogglesAndCounter` builds them
   * fresh each time rather than patching the existing DOM in place.
   */
  private renderBody(body: HTMLElement, attacker: Player, target: Player, isSelfTarget: boolean): void {
    body.innerHTML = '';
    for (const detach of this.holdToRepeatDetachFns) {
      detach();
    }
    this.holdToRepeatDetachFns = [];

    const refresh = (): void => this.renderBody(body, attacker, target, isSelfTarget);

    const types = buildDamageTypeDefs(
      attacker,
      target,
      isSelfTarget,
      this.damageState,
      this.poisonState,
      this.energyState,
      this.experienceState,
      this.players,
      this.session!.undoStack,
      this.sound,
      this.shake,
      this.zoneEffects,
      this.stats,
      this.customCountersState,
    );
    // A custom counter's removal changes the toggle set, so re-render the
    // whole body once it's removed, on top of the removal itself.
    for (const type of types) {
      if (type.removable && type.onRemove) {
        const removeCounter = type.onRemove;
        type.onRemove = () => {
          removeCounter();
          refresh();
        };
      }
    }
    body.appendChild(this.buildTogglesAndCounter(types));

    if (isSelfTarget) {
      body.appendChild(this.buildAddCustomCounterRow(target, refresh));
    }
  }

  close(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
      this.onOpenChange?.(false);
    }
    for (const detach of this.holdToRepeatDetachFns) {
      detach();
    }
    this.holdToRepeatDetachFns = [];
    if (this.session) {
      this.session.commit();
      this.session = null;
    }
  }

  /**
   * Builds the toggle row (one button per applicable `DamageTypeDef`) and
   * the single shared +/- counter beneath it. Selecting a toggle switches
   * which type's `getValue`/`apply` the counter reads from and writes to.
   */
  private buildTogglesAndCounter(types: DamageTypeDef[]): HTMLElement {
    const wrap = document.createElement('div');

    const toggleRow = document.createElement('div');
    toggleRow.className = 'cmdr-atk-toggles';

    const counterRow = document.createElement('div');
    counterRow.className = 'cmdr-atk-row';

    const valueEl = document.createElement('div');
    valueEl.className = 'cmdr-atk-val';

    const toggleButtons = new Map<DamageTypeKey, HTMLButtonElement>();
    let active = this.typeMemory.resolveInitial(this.currentMemoryKey, types);

    const refreshValue = (): void => {
      valueEl.textContent = String(active.getValue());
    };

    const selectType = (type: DamageTypeDef, remember: boolean): void => {
      active = type;
      counterRow.style.borderLeftColor = type.color;
      for (const [key, button] of toggleButtons) {
        button.classList.toggle('active', key === type.key);
      }
      refreshValue();
      if (remember) {
        this.typeMemory.remember(this.currentMemoryKey, type);
      }
    };

    for (const type of types) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cmdr-atk-toggle';
      button.style.setProperty('--toggle-color', type.color);
      button.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        selectType(type, true);
      });

      const labelEl = document.createElement('span');
      labelEl.textContent = type.label;
      button.appendChild(labelEl);

      if (type.removable) {
        button.classList.add('cmdr-atk-toggle-removable');
        const removeButton = document.createElement('span');
        removeButton.className = 'cmdr-atk-toggle-remove';
        removeButton.textContent = '×';
        removeButton.addEventListener('pointerdown', (event) => {
          event.stopPropagation();
          type.onRemove?.();
        });
        button.appendChild(removeButton);
      }

      toggleButtons.set(type.key, button);
      toggleRow.appendChild(button);
    }

    const minusButton = document.createElement('button');
    minusButton.type = 'button';
    minusButton.className = 'cmdr-atk-minus';
    minusButton.textContent = '−';
    this.holdToRepeatDetachFns.push(
      attachHoldToRepeat(minusButton, () => {
        active.apply(-1);
        refreshValue();
      }),
    );

    const plusButton = document.createElement('button');
    plusButton.type = 'button';
    plusButton.className = 'cmdr-atk-plus';
    plusButton.textContent = '+';
    this.holdToRepeatDetachFns.push(
      attachHoldToRepeat(plusButton, () => {
        active.apply(1);
        refreshValue();
      }),
    );

    const stepper = document.createElement('div');
    stepper.className = 'cmdr-atk-stepper';
    stepper.appendChild(minusButton);
    stepper.appendChild(valueEl);
    stepper.appendChild(plusButton);
    counterRow.appendChild(stepper);

    selectType(active, false);

    wrap.appendChild(toggleRow);
    wrap.appendChild(counterRow);
    return wrap;
  }

  /**
   * Builds the "add a custom counter" row (issue #171) shown beneath the
   * toggles/counter in a self-target menu: a name field plus an Add button
   * that creates a new counter for `target` and calls `onAdded` to rebuild
   * the panel with it included as a fresh toggle. A blank/whitespace-only
   * name is ignored.
   */
  private buildAddCustomCounterRow(target: Player, onAdded: () => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'cmdr-atk-custom-add';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'cmdr-atk-custom-input';
    input.placeholder = 'New counter name';
    input.maxLength = 24;

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'cmdr-atk-custom-add-btn';
    addButton.textContent = 'Add counter';

    const submit = (): void => {
      const name = input.value.trim();
      if (!name) {
        return;
      }
      addCustomCounter(this.customCountersState, target.id, name, this.session!.undoStack);
      onAdded();
    };

    addButton.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      submit();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });

    row.appendChild(input);
    row.appendChild(addButton);
    return row;
  }
}
