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
import type { SoundPlayer } from '../audio/soundPlayer';
import type { ScreenShakeTrigger } from '../game/screenShake';
import type { ZoneEffectTrigger } from '../game/zoneEffect';
import type { StatsTrigger } from '../game/stats';
import { attachHoldToRepeat } from './holdToRepeat';
import { DISPLAY_FONT_STACK, injectDisplayFontFace } from './displayFont';

export type DamageTypeKey = 'damage' | 'commander' | 'lifelink' | 'heal' | 'poison' | 'energy';

export interface DamageTypeDef {
  key: DamageTypeKey;
  label: string;
  /** Accent color the toggle/counter should render for this type. */
  color: string;
  /** Current amount to show on the shared counter when this type is selected. */
  getValue(): number;
  /** Applies one +/- tap (±1) for this type via its `apply*Delta` helper. */
  apply(delta: 1 | -1): void;
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
 * `poison`, and `energy` read/write the shared, persistent
 * `damageState`/`poisonState`/`energyState`. `energy` (issue #160) is only
 * offered for a self-target pair — it's a personal resource, not something
 * logged against an opponent.
 */
export function buildDamageTypeDefs(
  attacker: Player,
  target: Player,
  isSelfTarget: boolean,
  damageState: CommanderDamageState,
  poisonState: PoisonState,
  energyState: EnergyState,
  players: Player[],
  undoStack: UndoStack,
  sound?: SoundPlayer,
  shake?: ScreenShakeTrigger,
  zoneEffects?: ZoneEffectTrigger,
  stats?: StatsTrigger,
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
    types.push({
      key: 'commander',
      label: 'Commander damage',
      color: attacker.color ?? '#948fa3',
      getValue: () => damageState[target.id]?.[attacker.id] ?? 0,
      apply: (delta) =>
        applyCommanderDamageDelta(
          damageState,
          players,
          target.id,
          attacker.id,
          delta,
          undoStack,
          sound,
          shake,
          zoneEffects,
          stats,
        ),
    });
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
  }

  return types;
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
  undoStack: UndoStack;
  sound?: SoundPlayer;
  shake?: ScreenShakeTrigger;
  zoneEffects?: ZoneEffectTrigger;
  stats?: StatsTrigger;
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
    .cmdr-atk-toggle { box-sizing: border-box; flex: 1 1 auto; min-width: 84px; padding: 10px 12px; border-radius: 14px; border: 2px solid #2d2938; background: #241f2d; color: #948fa3; font-size: 12px; font-weight: 700; font-family: system-ui, sans-serif; transition: border-color 150ms ease, background 150ms ease, color 150ms ease; }
    .cmdr-atk-toggle.active { border-color: var(--toggle-color, #948fa3); color: #f5f3f7; background: #2d2938; box-shadow: 0 0 0 1px var(--toggle-color, #948fa3) inset; }
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
  private readonly undoStack: UndoStack;
  private readonly sound?: SoundPlayer;
  private readonly shake?: ScreenShakeTrigger;
  private readonly zoneEffects?: ZoneEffectTrigger;
  private readonly stats?: StatsTrigger;
  private overlay: HTMLElement | null = null;
  private holdToRepeatDetachFns: Array<() => void> = [];
  private session: AttackMenuSession | null = null;

  constructor(options: AttackMenuOptions) {
    this.root = options.root;
    this.players = options.players;
    this.damageState = options.damageState;
    this.poisonState = options.poisonState;
    this.energyState = options.energyState;
    this.undoStack = options.undoStack;
    this.sound = options.sound;
    this.shake = options.shake;
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
    const types = buildDamageTypeDefs(
      attacker,
      target,
      isSelfTarget,
      this.damageState,
      this.poisonState,
      this.energyState,
      this.players,
      this.session.undoStack,
      this.sound,
      this.shake,
      this.zoneEffects,
      this.stats,
    );
    panel.appendChild(this.buildTogglesAndCounter(types));

    overlay.appendChild(panel);
    this.root.appendChild(overlay);
    this.overlay = overlay;
  }

  close(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
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
    let active = types[0];

    const refreshValue = (): void => {
      valueEl.textContent = String(active.getValue());
    };

    const selectType = (type: DamageTypeDef): void => {
      active = type;
      counterRow.style.borderLeftColor = type.color;
      for (const [key, button] of toggleButtons) {
        button.classList.toggle('active', key === type.key);
      }
      refreshValue();
    };

    for (const type of types) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cmdr-atk-toggle';
      button.textContent = type.label;
      button.style.setProperty('--toggle-color', type.color);
      button.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        selectType(type);
      });
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

    selectType(types[0]);

    wrap.appendChild(toggleRow);
    wrap.appendChild(counterRow);
    return wrap;
  }
}
