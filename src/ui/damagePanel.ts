// Commander-damage sub-panel: a DOM overlay opened by long-pressing a player
// zone, listing every opponent with +/- commander-damage steppers. Kept
// separate from canvas zone rendering (owned by other tickets) — only the
// canvas element itself is off-limits outside main.ts.

import {
  applyCommanderDamageDelta,
  type CommanderDamageState,
  type Player,
  type UndoStack,
} from '../game/commanderDamage';
import { applyPoisonDelta, type PoisonState } from '../game/poison';
import type { SoundPlayer } from '../audio/soundPlayer';

export const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

export interface TapGestureHandlers {
  /**
   * Called synchronously on pointerdown, before tap vs long-press is known.
   * Optional: use it for effects that must bracket the whole press (e.g.
   * arming a continuous tap-and-hold ramp), paired with `onPressEnd`.
   */
  onPressStart?: (event: PointerEvent) => void;
  /** Called on pointerup when the press resolved as a short tap (the long-press timer never fired). */
  onTap: (event: PointerEvent) => void;
  /** Called after `durationMs` of a stationary pointerdown; suppresses the paired `onTap` for that press. */
  onLongPress: (event: PointerEvent) => void;
  /**
   * Called on pointerup/pointercancel/pointerleave, always — whether the
   * press resolved as a tap or a long-press. Pairs with `onPressStart`.
   */
  onPressEnd?: (event: PointerEvent) => void;
}

/**
 * Resolves each pointerdown as exactly one of a short tap or a long-press —
 * never both, unlike two independent listeners racing on the same
 * pointerdown. Returns a detach function.
 */
export function attachTapAndLongPress(
  element: HTMLElement,
  handlers: TapGestureHandlers,
  durationMs = LONG_PRESS_MS,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let startX = 0;
  let startY = 0;
  // Only ever set to true by the long-press timeout below; onPointerDown
  // resets it for every new press, so a stale true from a prior press can
  // never leak into this one.
  let longPressFired = false;

  const cancelTimer = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const onPointerDown = (event: PointerEvent): void => {
    startX = event.clientX;
    startY = event.clientY;
    longPressFired = false;
    cancelTimer();
    handlers.onPressStart?.(event);
    timer = setTimeout(() => {
      timer = undefined;
      longPressFired = true;
      handlers.onLongPress(event);
    }, durationMs);
  };

  const onPointerMove = (event: PointerEvent): void => {
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE_PX) {
      cancelTimer();
    }
  };

  const onPointerUp = (event: PointerEvent): void => {
    const wasLongPress = longPressFired;
    cancelTimer();
    longPressFired = false;
    if (!wasLongPress) {
      handlers.onTap(event);
    }
    handlers.onPressEnd?.(event);
  };

  const onPointerCancel = (event: PointerEvent): void => {
    cancelTimer();
    longPressFired = false;
    handlers.onPressEnd?.(event);
  };

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', onPointerCancel);
  element.addEventListener('pointerleave', onPointerCancel);

  return () => {
    cancelTimer();
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
    element.removeEventListener('pointercancel', onPointerCancel);
    element.removeEventListener('pointerleave', onPointerCancel);
  };
}

export interface DamagePanelOptions {
  /** Element the overlay is appended to (e.g. document.body). */
  root: HTMLElement;
  players: Player[];
  damageState: CommanderDamageState;
  poisonState: PoisonState;
  undoStack: UndoStack;
  /** Called after every commander-damage or poison change, e.g. to repaint zone life totals. */
  onChange?: () => void;
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
    .cmdr-dmg-overlay { position: fixed; inset: 0; background: rgba(8, 7, 12, 0.55); z-index: 30; display: flex; align-items: flex-end; }
    .cmdr-dmg-panel { width: 100%; max-height: var(--overlay-max-h, 88vh); overflow-y: auto; background: #1b1822; border-radius: 24px 24px 0 0; padding: 20px; box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.5); }
    .cmdr-dmg-head { display: flex; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid transparent; }
    .cmdr-dmg-title { color: #f5f3f7; font-size: 16px; font-weight: 800; flex: 1; font-family: system-ui, sans-serif; }
    .cmdr-dmg-close { width: 28px; height: 28px; border-radius: 50%; border: none; background: #241f2d; color: #948fa3; font-size: 14px; font-weight: 700; }
    .cmdr-dmg-row { display: flex; align-items: center; gap: 12px; background: #241f2d; border-radius: 16px; padding: 10px 12px; border-left: 3px solid transparent; }
    .cmdr-dmg-row + .cmdr-dmg-row { margin-top: 10px; }
    .cmdr-dmg-dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; }
    .cmdr-dmg-name { flex: 1; color: #f5f3f7; font-size: 14px; font-weight: 700; font-family: system-ui, sans-serif; }
    .cmdr-dmg-stepper { display: flex; align-items: center; gap: 10px; }
    .cmdr-dmg-stepper button { width: 28px; height: 28px; border-radius: 9px; border: none; background: #2d2938; color: #f5f3f7; font-size: 16px; font-weight: 700; }
    .cmdr-dmg-val { min-width: 22px; text-align: center; color: #fff; font-size: 15px; font-weight: 800; font-family: system-ui, sans-serif; }
  `;
  document.head.appendChild(style);
}

export class DamagePanel {
  private readonly root: HTMLElement;
  private readonly players: Player[];
  private readonly damageState: CommanderDamageState;
  private readonly poisonState: PoisonState;
  private readonly undoStack: UndoStack;
  private readonly onChange?: () => void;
  private readonly sound?: SoundPlayer;
  private overlay: HTMLElement | null = null;

  constructor(options: DamagePanelOptions) {
    this.root = options.root;
    this.players = options.players;
    this.damageState = options.damageState;
    this.poisonState = options.poisonState;
    this.undoStack = options.undoStack;
    this.onChange = options.onChange;
    this.sound = options.sound;
  }

  get isOpen(): boolean {
    return this.overlay !== null;
  }

  open(targetId: string): void {
    injectStylesOnce();
    this.close();

    const target = this.players.find((player) => player.id === targetId);
    if (!target) {
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'cmdr-dmg-overlay';
    overlay.addEventListener('pointerdown', (event) => {
      if (event.target === overlay) {
        this.close();
      }
    });

    const panel = document.createElement('div');
    panel.className = 'cmdr-dmg-panel';

    const targetColor = target.color ?? '#948fa3';

    const head = document.createElement('div');
    head.className = 'cmdr-dmg-head';
    head.style.borderBottomColor = `${targetColor}55`;
    const title = document.createElement('div');
    title.className = 'cmdr-dmg-title';
    title.style.color = targetColor;
    title.textContent = `${target.name} — Commander Damage`;
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'cmdr-dmg-close';
    closeButton.textContent = '✕';
    closeButton.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      this.close();
    });
    head.appendChild(title);
    head.appendChild(closeButton);
    panel.appendChild(head);

    panel.appendChild(this.buildPoisonRow(target));

    for (const opponent of this.players) {
      if (opponent.id === targetId) {
        continue;
      }
      panel.appendChild(this.buildStepperRow(target, opponent));
    }

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

  private buildStepperRow(target: Player, opponent: Player): HTMLElement {
    const opponentColor = opponent.color ?? '#948fa3';

    const row = document.createElement('div');
    row.className = 'cmdr-dmg-row';
    row.style.borderLeftColor = opponentColor;

    const dot = document.createElement('div');
    dot.className = 'cmdr-dmg-dot';
    dot.style.background = opponentColor;

    const name = document.createElement('div');
    name.className = 'cmdr-dmg-name';
    name.textContent = `from ${opponent.name}`;

    const stepper = document.createElement('div');
    stepper.className = 'cmdr-dmg-stepper';

    const valueEl = document.createElement('div');
    valueEl.className = 'cmdr-dmg-val';
    const refresh = (): void => {
      valueEl.textContent = String(this.damageState[target.id]?.[opponent.id] ?? 0);
    };
    refresh();

    const minusButton = document.createElement('button');
    minusButton.type = 'button';
    minusButton.textContent = '−';
    minusButton.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      this.adjust(target, opponent, -1);
      refresh();
    });

    const plusButton = document.createElement('button');
    plusButton.type = 'button';
    plusButton.textContent = '+';
    plusButton.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      this.adjust(target, opponent, 1);
      refresh();
    });

    stepper.appendChild(minusButton);
    stepper.appendChild(valueEl);
    stepper.appendChild(plusButton);
    row.appendChild(dot);
    row.appendChild(name);
    row.appendChild(stepper);
    return row;
  }

  private adjust(target: Player, opponent: Player, delta: number): void {
    applyCommanderDamageDelta(
      this.damageState,
      this.players,
      target.id,
      opponent.id,
      delta,
      this.undoStack,
      this.sound,
    );
    this.onChange?.();
  }

  private buildPoisonRow(target: Player): HTMLElement {
    const row = document.createElement('div');
    row.className = 'cmdr-dmg-row';
    row.style.borderLeftColor = target.color ?? '#948fa3';

    const name = document.createElement('div');
    name.className = 'cmdr-dmg-name';
    name.textContent = 'Poison';

    const stepper = document.createElement('div');
    stepper.className = 'cmdr-dmg-stepper';

    const valueEl = document.createElement('div');
    valueEl.className = 'cmdr-dmg-val';
    const refresh = (): void => {
      valueEl.textContent = String(this.poisonState[target.id] ?? 0);
    };
    refresh();

    const minusButton = document.createElement('button');
    minusButton.type = 'button';
    minusButton.textContent = '−';
    minusButton.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      this.adjustPoison(target, -1);
      refresh();
    });

    const plusButton = document.createElement('button');
    plusButton.type = 'button';
    plusButton.textContent = '+';
    plusButton.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      this.adjustPoison(target, 1);
      refresh();
    });

    stepper.appendChild(minusButton);
    stepper.appendChild(valueEl);
    stepper.appendChild(plusButton);
    row.appendChild(name);
    row.appendChild(stepper);
    return row;
  }

  private adjustPoison(target: Player, delta: number): void {
    applyPoisonDelta(this.poisonState, target.id, delta, this.undoStack);
    this.onChange?.();
  }
}
