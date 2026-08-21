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
  type UndoStack,
} from '../game/commanderDamage';
import { applyDamageDelta, applyHealDelta, applyLifelinkDelta } from '../game/life';
import { applyPoisonDelta, type PoisonState } from '../game/poison';
import type { SoundPlayer } from '../audio/soundPlayer';
import type { ScreenShakeTrigger } from '../game/screenShake';
import { attachHoldToRepeat } from './holdToRepeat';

export type DamageTypeKey = 'damage' | 'commander' | 'lifelink' | 'heal' | 'poison';

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
 * counter in `damageState`/`poisonState` to show instead. `commander` and
 * `poison` read/write the shared, persistent `damageState`/`poisonState`.
 */
export function buildDamageTypeDefs(
  attacker: Player,
  target: Player,
  isSelfTarget: boolean,
  damageState: CommanderDamageState,
  poisonState: PoisonState,
  players: Player[],
  undoStack: UndoStack,
  sound?: SoundPlayer,
  shake?: ScreenShakeTrigger,
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
      applyDamageDelta(target, delta, undoStack, sound, shake),
    ),
  ];

  if (!isSelfTarget) {
    types.push({
      key: 'commander',
      label: 'Commander damage',
      color: attacker.color ?? '#948fa3',
      getValue: () => damageState[target.id]?.[attacker.id] ?? 0,
      apply: (delta) =>
        applyCommanderDamageDelta(damageState, players, target.id, attacker.id, delta, undoStack, sound, shake),
    });
    types.push(
      localType('lifelink', 'Lifelink damage', attacker.color ?? '#948fa3', (delta) =>
        applyLifelinkDelta(attacker, target, delta, undoStack, sound, shake),
      ),
    );
  }

  types.push(
    localType('heal', 'Heal', target.color ?? '#948fa3', (delta) =>
      applyHealDelta(target, delta, undoStack, sound),
    ),
  );

  types.push({
    key: 'poison',
    label: 'Poison',
    color: target.color ?? '#948fa3',
    getValue: () => poisonState[target.id] ?? 0,
    apply: (delta) => applyPoisonDelta(poisonState, target.id, delta, undoStack, shake),
  });

  return types;
}

export interface AttackMenuOptions {
  /** Element the overlay is appended to (e.g. document.body). */
  root: HTMLElement;
  players: Player[];
  damageState: CommanderDamageState;
  poisonState: PoisonState;
  undoStack: UndoStack;
  sound?: SoundPlayer;
  shake?: ScreenShakeTrigger;
}

let stylesInjected = false;
function injectStylesOnce(): void {
  if (stylesInjected) {
    return;
  }
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .cmdr-atk-overlay { position: fixed; inset: 0; background: rgba(8, 7, 12, 0.55); z-index: 30; display: flex; align-items: flex-end; }
    .cmdr-atk-panel { width: 100%; max-height: var(--overlay-max-h, 88vh); overflow-y: auto; background: #1b1822; border-radius: 24px 24px 0 0; padding: 20px; box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.5); }
    .cmdr-atk-head { display: flex; align-items: center; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid transparent; }
    .cmdr-atk-title { color: #f5f3f7; font-size: 16px; font-weight: 800; flex: 1; font-family: system-ui, sans-serif; }
    .cmdr-atk-close { width: 28px; height: 28px; border-radius: 50%; border: none; background: #241f2d; color: #948fa3; font-size: 14px; font-weight: 700; }
    .cmdr-atk-toggles { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .cmdr-atk-toggle { flex: 1 1 auto; min-width: 84px; padding: 10px 12px; border-radius: 14px; border: 2px solid #2d2938; background: #241f2d; color: #948fa3; font-size: 12px; font-weight: 700; font-family: system-ui, sans-serif; }
    .cmdr-atk-toggle.active { border-color: var(--toggle-color, #948fa3); color: #f5f3f7; background: #2d2938; }
    .cmdr-atk-row { display: flex; align-items: center; justify-content: center; background: #241f2d; border-radius: 20px; padding: 20px; border-left: 3px solid transparent; }
    .cmdr-atk-stepper { display: flex; align-items: center; gap: 16px; }
    .cmdr-atk-stepper button { width: 56px; height: 56px; border-radius: 50%; border: none; background: #2d2938; color: #f5f3f7; font-size: 24px; font-weight: 700; }
    .cmdr-atk-val { min-width: 44px; text-align: center; color: #fff; font-size: 30px; font-weight: 800; font-family: system-ui, sans-serif; }
  `;
  document.head.appendChild(style);
}

export class AttackMenu {
  private readonly root: HTMLElement;
  private readonly players: Player[];
  private readonly damageState: CommanderDamageState;
  private readonly poisonState: PoisonState;
  private readonly undoStack: UndoStack;
  private readonly sound?: SoundPlayer;
  private readonly shake?: ScreenShakeTrigger;
  private overlay: HTMLElement | null = null;
  private holdToRepeatDetachFns: Array<() => void> = [];

  constructor(options: AttackMenuOptions) {
    this.root = options.root;
    this.players = options.players;
    this.damageState = options.damageState;
    this.poisonState = options.poisonState;
    this.undoStack = options.undoStack;
    this.sound = options.sound;
    this.shake = options.shake;
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
    closeButton.textContent = '✕';
    closeButton.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      this.close();
    });
    head.appendChild(title);
    head.appendChild(closeButton);
    panel.appendChild(head);

    const types = buildDamageTypeDefs(
      attacker,
      target,
      isSelfTarget,
      this.damageState,
      this.poisonState,
      this.players,
      this.undoStack,
      this.sound,
      this.shake,
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
    minusButton.textContent = '−';
    this.holdToRepeatDetachFns.push(
      attachHoldToRepeat(minusButton, () => {
        active.apply(-1);
        refreshValue();
      }),
    );

    const plusButton = document.createElement('button');
    plusButton.type = 'button';
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
