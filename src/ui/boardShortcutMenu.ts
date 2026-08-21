// Board-wide shortcut menu (issue #80): opened by tapping ShortcutControl at
// the shared center disc. Offers the two BOARD_SHORTCUT_OPTIONS, each with
// its own +/- stepper that builds up a menu-local amount (not yet applied to
// any life total); tapping a row's "Apply" confirms that amount via
// applyBoardShortcutDelta, which applies it to every affected player as one
// grouped undo entry, then closes the menu.

import { BOARD_SHORTCUT_OPTIONS, applyBoardShortcutDelta, type BoardShortcutOption } from '../game/boardShortcut';
import type { Player, UndoStack } from '../game/commanderDamage';
import type { SoundPlayer } from '../audio/soundPlayer';
import { attachHoldToRepeat } from './holdToRepeat';

export interface BoardShortcutMenuOptions {
  /** Element the overlay is appended to (e.g. document.body). */
  root: HTMLElement;
  players: Player[];
  /** Read live rather than snapshotted, since the active player can change (pass turn) while the menu is closed. */
  getActiveIndex: () => number;
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
    .cmdr-bsc-overlay { position: fixed; inset: 0; background: rgba(8, 7, 12, 0.55); z-index: 30; display: flex; align-items: flex-end; }
    .cmdr-bsc-panel { width: 100%; max-height: var(--overlay-max-h, 88vh); overflow-y: auto; background: #1b1822; border-radius: 24px 24px 0 0; padding: 20px; box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.5); }
    .cmdr-bsc-head { display: flex; align-items: center; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid #2d2938; }
    .cmdr-bsc-title { color: #f5f3f7; font-size: 16px; font-weight: 800; flex: 1; font-family: system-ui, sans-serif; }
    .cmdr-bsc-close { width: 28px; height: 28px; border-radius: 50%; border: none; background: #241f2d; color: #948fa3; font-size: 14px; font-weight: 700; }
    .cmdr-bsc-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #241f2d; border-radius: 20px; padding: 16px; margin-bottom: 12px; }
    .cmdr-bsc-label { color: #f5f3f7; font-size: 14px; font-weight: 700; font-family: system-ui, sans-serif; flex: 1; }
    .cmdr-bsc-stepper { display: flex; align-items: center; gap: 12px; }
    .cmdr-bsc-stepper button { width: 44px; height: 44px; border-radius: 50%; border: none; background: #2d2938; color: #f5f3f7; font-size: 20px; font-weight: 700; }
    .cmdr-bsc-val { min-width: 32px; text-align: center; color: #fff; font-size: 22px; font-weight: 800; font-family: system-ui, sans-serif; }
    .cmdr-bsc-apply { border-radius: 14px; border: none; padding: 10px 16px; background: #5b8cff; color: #fff; font-size: 13px; font-weight: 800; font-family: system-ui, sans-serif; }
  `;
  document.head.appendChild(style);
}

export class BoardShortcutMenu {
  private readonly root: HTMLElement;
  private readonly players: Player[];
  private readonly getActiveIndex: () => number;
  private readonly undoStack: UndoStack;
  private readonly sound?: SoundPlayer;
  private overlay: HTMLElement | null = null;
  private holdToRepeatDetachFns: Array<() => void> = [];

  constructor(options: BoardShortcutMenuOptions) {
    this.root = options.root;
    this.players = options.players;
    this.getActiveIndex = options.getActiveIndex;
    this.undoStack = options.undoStack;
    this.sound = options.sound;
  }

  get isOpen(): boolean {
    return this.overlay !== null;
  }

  open(): void {
    injectStylesOnce();
    this.close();

    const overlay = document.createElement('div');
    overlay.className = 'cmdr-bsc-overlay';
    overlay.addEventListener('pointerdown', (event) => {
      if (event.target === overlay) {
        this.close();
      }
    });

    const panel = document.createElement('div');
    panel.className = 'cmdr-bsc-panel';

    const head = document.createElement('div');
    head.className = 'cmdr-bsc-head';
    const title = document.createElement('div');
    title.className = 'cmdr-bsc-title';
    title.textContent = 'Board-wide shortcut';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'cmdr-bsc-close';
    closeButton.textContent = '✕';
    closeButton.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      this.close();
    });
    head.appendChild(title);
    head.appendChild(closeButton);
    panel.appendChild(head);

    for (const option of BOARD_SHORTCUT_OPTIONS) {
      panel.appendChild(this.buildOptionRow(option));
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
    for (const detach of this.holdToRepeatDetachFns) {
      detach();
    }
    this.holdToRepeatDetachFns = [];
  }

  private buildOptionRow(option: BoardShortcutOption): HTMLElement {
    let amount = 0;

    const row = document.createElement('div');
    row.className = 'cmdr-bsc-row';

    const label = document.createElement('div');
    label.className = 'cmdr-bsc-label';
    label.textContent = option.label;

    const valueEl = document.createElement('div');
    valueEl.className = 'cmdr-bsc-val';
    valueEl.textContent = '0';

    const minusButton = document.createElement('button');
    minusButton.type = 'button';
    minusButton.textContent = '−';
    this.holdToRepeatDetachFns.push(
      attachHoldToRepeat(minusButton, () => {
        amount -= 1;
        valueEl.textContent = String(amount);
      }),
    );

    const plusButton = document.createElement('button');
    plusButton.type = 'button';
    plusButton.textContent = '+';
    this.holdToRepeatDetachFns.push(
      attachHoldToRepeat(plusButton, () => {
        amount += 1;
        valueEl.textContent = String(amount);
      }),
    );

    const stepper = document.createElement('div');
    stepper.className = 'cmdr-bsc-stepper';
    stepper.appendChild(minusButton);
    stepper.appendChild(valueEl);
    stepper.appendChild(plusButton);

    const applyButton = document.createElement('button');
    applyButton.type = 'button';
    applyButton.className = 'cmdr-bsc-apply';
    applyButton.textContent = 'Apply';
    applyButton.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      applyBoardShortcutDelta(
        this.players,
        this.getActiveIndex(),
        option.scope,
        amount,
        this.undoStack,
        this.sound,
      );
      this.close();
    });

    row.appendChild(label);
    row.appendChild(stepper);
    row.appendChild(applyButton);
    return row;
  }
}
