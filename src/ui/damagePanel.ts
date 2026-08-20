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

const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

/** Fires `onLongPress` after `durationMs` of a stationary pointerdown. Returns a detach function. */
export function attachLongPress(
  element: HTMLElement,
  onLongPress: (event: PointerEvent) => void,
  durationMs = LONG_PRESS_MS,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let startX = 0;
  let startY = 0;

  const cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const onPointerDown = (event: PointerEvent): void => {
    startX = event.clientX;
    startY = event.clientY;
    cancel();
    timer = setTimeout(() => {
      timer = undefined;
      onLongPress(event);
    }, durationMs);
  };

  const onPointerMove = (event: PointerEvent): void => {
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE_PX) {
      cancel();
    }
  };

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', cancel);
  element.addEventListener('pointercancel', cancel);
  element.addEventListener('pointerleave', cancel);

  return () => {
    cancel();
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', cancel);
    element.removeEventListener('pointercancel', cancel);
    element.removeEventListener('pointerleave', cancel);
  };
}

export interface DamagePanelOptions {
  /** Element the overlay is appended to (e.g. document.body). */
  root: HTMLElement;
  players: Player[];
  damageState: CommanderDamageState;
  undoStack: UndoStack;
  /** Called after every commander-damage change, e.g. to repaint zone life totals. */
  onChange?: () => void;
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
    .cmdr-dmg-panel { width: 100%; background: #1b1822; border-radius: 24px 24px 0 0; padding: 20px; box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.5); }
    .cmdr-dmg-head { display: flex; align-items: center; margin-bottom: 16px; }
    .cmdr-dmg-title { color: #f5f3f7; font-size: 16px; font-weight: 800; flex: 1; font-family: system-ui, sans-serif; }
    .cmdr-dmg-close { width: 28px; height: 28px; border-radius: 50%; border: none; background: #241f2d; color: #948fa3; font-size: 14px; font-weight: 700; }
    .cmdr-dmg-row { display: flex; align-items: center; gap: 12px; background: #241f2d; border-radius: 16px; padding: 10px 12px; }
    .cmdr-dmg-row + .cmdr-dmg-row { margin-top: 10px; }
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
  private readonly undoStack: UndoStack;
  private readonly onChange?: () => void;
  private overlay: HTMLElement | null = null;

  constructor(options: DamagePanelOptions) {
    this.root = options.root;
    this.players = options.players;
    this.damageState = options.damageState;
    this.undoStack = options.undoStack;
    this.onChange = options.onChange;
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

    const head = document.createElement('div');
    head.className = 'cmdr-dmg-head';
    const title = document.createElement('div');
    title.className = 'cmdr-dmg-title';
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
    const row = document.createElement('div');
    row.className = 'cmdr-dmg-row';

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
    );
    this.onChange?.();
  }
}
