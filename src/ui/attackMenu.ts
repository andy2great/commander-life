// Zone-to-zone drag damage-type menu (issue #48): opened when a drag starts
// in one player's zone and releases in another's (see
// Game.resolveZoneDrag). Lets the dragging player pick which kind of
// damage to log — plain damage, commander damage (the directional,
// per-opponent counter), lifelink damage, heal, or poison (issue #71) —
// reusing the same state/undo plumbing the old long-press sub-panel used.

import {
  applyCommanderDamageDelta,
  type CommanderDamageState,
  type Player,
  type UndoStack,
} from '../game/commanderDamage';
import { applyDamageDelta, applyHealDelta, applyLifelinkDelta } from '../game/life';
import { applyPoisonDelta, type PoisonState } from '../game/poison';
import type { SoundPlayer } from '../audio/soundPlayer';

export interface AttackMenuOptions {
  /** Element the overlay is appended to (e.g. document.body). */
  root: HTMLElement;
  players: Player[];
  damageState: CommanderDamageState;
  poisonState: PoisonState;
  undoStack: UndoStack;
  sound?: SoundPlayer;
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
    .cmdr-atk-row { display: flex; align-items: center; gap: 16px; background: #241f2d; border-radius: 20px; padding: 20px; border-left: 3px solid transparent; }
    .cmdr-atk-row + .cmdr-atk-row { margin-top: 16px; }
    .cmdr-atk-name { flex: 1; color: #f5f3f7; font-size: 15px; font-weight: 700; font-family: system-ui, sans-serif; }
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
  private overlay: HTMLElement | null = null;

  constructor(options: AttackMenuOptions) {
    this.root = options.root;
    this.players = options.players;
    this.damageState = options.damageState;
    this.poisonState = options.poisonState;
    this.undoStack = options.undoStack;
    this.sound = options.sound;
  }

  get isOpen(): boolean {
    return this.overlay !== null;
  }

  /**
   * Opens the damage-type menu for a drag from `fromId`'s zone into `toId`'s
   * zone. `fromId === toId` (issue #70) opens a self-target menu instead:
   * the commander-damage and lifelink rows are omitted (both are meaningless
   * against yourself, and applyCommanderDamageDelta/applyLifelinkDelta
   * no-op for a self pair anyway), and the title shows the player's name
   * once with a "(self)" label instead of the usual attacker → target pair.
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

    panel.appendChild(this.buildDamageRow(target));
    if (!isSelfTarget) {
      panel.appendChild(this.buildCommanderDamageRow(attacker, target));
      panel.appendChild(this.buildLifelinkRow(attacker, target));
    }
    panel.appendChild(this.buildHealRow(target));
    panel.appendChild(this.buildPoisonRow(target));

    overlay.appendChild(panel);
    this.root.appendChild(overlay);
    this.overlay = overlay;
  }

  close(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  private buildCommanderDamageRow(attacker: Player, target: Player): HTMLElement {
    const row = document.createElement('div');
    row.className = 'cmdr-atk-row';
    row.style.borderLeftColor = attacker.color ?? '#948fa3';

    const name = document.createElement('div');
    name.className = 'cmdr-atk-name';
    name.textContent = 'Commander damage';

    const stepper = document.createElement('div');
    stepper.className = 'cmdr-atk-stepper';

    const valueEl = document.createElement('div');
    valueEl.className = 'cmdr-atk-val';
    const refresh = (): void => {
      valueEl.textContent = String(this.damageState[target.id]?.[attacker.id] ?? 0);
    };
    refresh();

    const minusButton = document.createElement('button');
    minusButton.type = 'button';
    minusButton.textContent = '−';
    minusButton.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      applyCommanderDamageDelta(this.damageState, this.players, target.id, attacker.id, -1, this.undoStack, this.sound);
      refresh();
    });

    const plusButton = document.createElement('button');
    plusButton.type = 'button';
    plusButton.textContent = '+';
    plusButton.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      applyCommanderDamageDelta(this.damageState, this.players, target.id, attacker.id, 1, this.undoStack, this.sound);
      refresh();
    });

    stepper.appendChild(minusButton);
    stepper.appendChild(valueEl);
    stepper.appendChild(plusButton);
    row.appendChild(name);
    row.appendChild(stepper);
    return row;
  }

  private buildDamageRow(target: Player): HTMLElement {
    return this.buildLocalStepperRow('Damage', target.color ?? '#948fa3', (delta) => {
      applyDamageDelta(target, delta, this.undoStack, this.sound);
    });
  }

  private buildLifelinkRow(attacker: Player, target: Player): HTMLElement {
    return this.buildLocalStepperRow('Lifelink damage', attacker.color ?? '#948fa3', (delta) => {
      applyLifelinkDelta(attacker, target, delta, this.undoStack, this.sound);
    });
  }

  private buildHealRow(target: Player): HTMLElement {
    return this.buildLocalStepperRow('Heal', target.color ?? '#948fa3', (delta) => {
      applyHealDelta(target, delta, this.undoStack, this.sound);
    });
  }

  /**
   * Builds a stepper row backed by a menu-local session counter (rather than
   * shared game state, unlike the commander-damage/poison rows), clamped at
   * zero so the minus button can only undo taps made within this same open
   * menu. `onApply` receives ±1 and is responsible for applying that delta
   * (and pushing the matching undo action) via the relevant `game/life`
   * helper.
   */
  private buildLocalStepperRow(label: string, borderColor: string, onApply: (delta: 1 | -1) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'cmdr-atk-row';
    row.style.borderLeftColor = borderColor;

    const name = document.createElement('div');
    name.className = 'cmdr-atk-name';
    name.textContent = label;

    const stepper = document.createElement('div');
    stepper.className = 'cmdr-atk-stepper';

    const valueEl = document.createElement('div');
    valueEl.className = 'cmdr-atk-val';
    let count = 0;
    const refresh = (): void => {
      valueEl.textContent = String(count);
    };
    refresh();

    const minusButton = document.createElement('button');
    minusButton.type = 'button';
    minusButton.textContent = '−';
    minusButton.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      if (count <= 0) {
        return;
      }
      count -= 1;
      onApply(-1);
      refresh();
    });

    const plusButton = document.createElement('button');
    plusButton.type = 'button';
    plusButton.textContent = '+';
    plusButton.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      count += 1;
      onApply(1);
      refresh();
    });

    stepper.appendChild(minusButton);
    stepper.appendChild(valueEl);
    stepper.appendChild(plusButton);
    row.appendChild(name);
    row.appendChild(stepper);
    return row;
  }

  private buildPoisonRow(target: Player): HTMLElement {
    const row = document.createElement('div');
    row.className = 'cmdr-atk-row';
    row.style.borderLeftColor = target.color ?? '#948fa3';

    const name = document.createElement('div');
    name.className = 'cmdr-atk-name';
    name.textContent = 'Poison';

    const stepper = document.createElement('div');
    stepper.className = 'cmdr-atk-stepper';

    const valueEl = document.createElement('div');
    valueEl.className = 'cmdr-atk-val';
    const refresh = (): void => {
      valueEl.textContent = String(this.poisonState[target.id] ?? 0);
    };
    refresh();

    const minusButton = document.createElement('button');
    minusButton.type = 'button';
    minusButton.textContent = '−';
    minusButton.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      applyPoisonDelta(this.poisonState, target.id, -1, this.undoStack);
      refresh();
    });

    const plusButton = document.createElement('button');
    plusButton.type = 'button';
    plusButton.textContent = '+';
    plusButton.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      applyPoisonDelta(this.poisonState, target.id, 1, this.undoStack);
      refresh();
    });

    stepper.appendChild(minusButton);
    stepper.appendChild(valueEl);
    stepper.appendChild(plusButton);
    row.appendChild(name);
    row.appendChild(stepper);
    return row;
  }
}
