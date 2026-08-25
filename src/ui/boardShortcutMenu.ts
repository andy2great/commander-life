// Board-wide shortcut menu (issue #80): opened by tapping ShortcutControl at
// the shared center disc. Offers the two BOARD_SHORTCUT_OPTIONS, plus a
// third "End game" option (issue #117) that isn't a damage delta so it
// lives outside BOARD_SHORTCUT_OPTIONS/boardShortcut.ts.
//
// Issue #87: rather than one always-visible stepper+Apply row per option,
// the panel follows the AttackMenu pattern (issue #76, src/ui/attackMenu.ts)
// — a row of icon toggle buttons to pick which option applies, with a single
// shared +/- counter and Apply button revealed underneath only once a
// toggle is selected. Switching the selected toggle resets the counter back
// to 0.
//
// Issue #117: selecting "End game" instead reveals a list of the currently
// non-eliminated players; picking one reveals a "Confirm winner" button
// (the same select-then-confirm two-step shape as the toggle+Apply flow
// above), consistent with the #56 precedent that manually ending the game
// must never happen on a single tap.

import { BOARD_SHORTCUT_OPTIONS, applyBoardShortcutDelta, type BoardShortcutOption } from '../game/boardShortcut';
import type { Player, UndoStack } from '../game/commanderDamage';
import type { SoundPlayer } from '../audio/soundPlayer';
import type { ScreenShakeTrigger } from '../game/screenShake';
import type { ZoneEffectTrigger } from '../game/zoneEffect';
import type { StatsTrigger } from '../game/stats';
import { attachHoldToRepeat } from './holdToRepeat';
import { DISPLAY_FONT_STACK, injectDisplayFontFace } from './displayFont';

/**
 * One representative icon per `BOARD_SHORTCUT_OPTIONS` scope: crossed swords
 * for "damage each opponent" (multi-target), a burst for "damage all
 * players" (area effect). Inline SVG, code-drawn per the repo's no-external-
 * assets rule.
 */
const OPTION_ICONS: Record<BoardShortcutOption['scope'], string> = {
  opponents:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="4" y1="20" x2="20" y2="4"/><line x1="20" y1="20" x2="4" y2="4"/><line x1="6" y1="18" x2="9" y2="18"/><line x1="18" y1="18" x2="15" y2="18"/></svg>',
  all: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.5 7 7.5-2-4.5 5 4.5 5-7.5-2-2.5 7-2.5-7-7.5 2 4.5-5-4.5-5 7.5 2z"/></svg>',
};

/** Checkered-flag icon for the "End game" toggle (issue #117), vector-drawn like OPTION_ICONS. */
const END_GAME_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"/><path d="M5 4h14l-3 4 3 4H5"/></svg>';

export interface BoardShortcutMenuOptions {
  /** Element the overlay is appended to (e.g. document.body). */
  root: HTMLElement;
  players: Player[];
  /** Read live rather than snapshotted, since the active player can change (pass turn) while the menu is closed. */
  getActiveIndex: () => number;
  undoStack: UndoStack;
  sound?: SoundPlayer;
  shake?: ScreenShakeTrigger;
  zoneEffects?: ZoneEffectTrigger;
  stats?: StatsTrigger;
  /** Read live like getActiveIndex: the non-eliminated players "End game" lets the host pick a winner from (issue #117). */
  getAlivePlayers: () => Player[];
  /** Ends the game with the confirmed winner, once "End game" is selected and confirmed (issue #117). */
  onEndGame: (winnerId: string) => void;
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
    .cmdr-bsc-overlay { position: fixed; inset: 0; background: rgba(8, 7, 12, 0.55); z-index: 30; display: flex; align-items: flex-end; }
    .cmdr-bsc-panel { width: 100%; max-height: var(--overlay-max-h, 88vh); overflow-y: auto; background: linear-gradient(160deg, #211c29 0%, #1a1620 100%); border-radius: 24px 24px 0 0; padding: 20px; box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05); }
    .cmdr-bsc-head { display: flex; align-items: center; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid #2d2938; }
    .cmdr-bsc-title { color: #f5f3f7; font-size: 18px; font-weight: 400; letter-spacing: 0.6px; text-transform: uppercase; flex: 1; font-family: ${DISPLAY_FONT_STACK}; }
    .cmdr-bsc-close { box-sizing: border-box; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; border: none; background: #241f2d; color: #948fa3; transition: transform 100ms ease, filter 100ms ease; }
    .cmdr-bsc-close:active { transform: scale(0.9); filter: brightness(1.2); }
    .cmdr-bsc-close svg { width: 14px; height: 14px; }
    .cmdr-bsc-toggles { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .cmdr-bsc-toggle { box-sizing: border-box; flex: 1 1 auto; min-width: 84px; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 10px; border-radius: 14px; border: 2px solid #2d2938; background: #241f2d; color: #948fa3; font-size: 12px; font-weight: 700; font-family: system-ui, sans-serif; transition: border-color 150ms ease, background 150ms ease, color 150ms ease; }
    .cmdr-bsc-toggle svg { width: 26px; height: 26px; }
    .cmdr-bsc-toggle.active { border-color: #d7a54c; color: #f5f3f7; background: #2d2938; box-shadow: 0 0 0 1px #d7a54c inset; }
    .cmdr-bsc-row { display: flex; flex-direction: column; gap: 12px; background: #241f2d; border-radius: 20px; padding: 12px; }
    .cmdr-bsc-stepper { position: relative; display: flex; align-items: stretch; gap: 6px; width: 100%; height: 72px; }
    .cmdr-bsc-stepper button { box-sizing: border-box; flex: 1; border: none; border-radius: 16px; background: #2d2938; color: #f5f3f7; font-size: 28px; font-weight: 800; transition: transform 100ms ease, filter 100ms ease; }
    .cmdr-bsc-stepper button:active { transform: scale(0.96); filter: brightness(1.15); }
    .cmdr-bsc-stepper button.cmdr-bsc-minus { background: rgba(229, 72, 77, 0.16); color: #ff8a8f; }
    .cmdr-bsc-stepper button.cmdr-bsc-plus { background: rgba(34, 197, 148, 0.16); color: #4be3c4; }
    .cmdr-bsc-val { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: none; min-width: 32px; text-align: center; color: #f0c98a; font-size: 26px; font-weight: 400; font-variant-numeric: tabular-nums; font-family: ${DISPLAY_FONT_STACK}; background: #1b1822; padding: 6px 12px; border-radius: 12px; box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(215, 165, 76, 0.25); }
    .cmdr-bsc-apply { box-sizing: border-box; border-radius: 14px; border: none; padding: 14px 16px; width: 100%; background: linear-gradient(135deg, #d7a54c, #e2673f); color: #fff; font-size: 14px; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase; font-family: system-ui, sans-serif; transition: transform 100ms ease, filter 100ms ease; }
    .cmdr-bsc-apply:active { transform: scale(0.97); filter: brightness(1.08); }
    .cmdr-bsc-apply:disabled { opacity: 0.4; }
    .cmdr-bsc-endgame-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; max-height: 40vh; overflow-y: auto; }
    .cmdr-bsc-endgame-player { box-sizing: border-box; padding: 12px 14px; border-radius: 14px; border: 2px solid #2d2938; background: #241f2d; color: #f5f3f7; font-size: 14px; font-weight: 700; font-family: system-ui, sans-serif; text-align: left; transition: border-color 150ms ease, background 150ms ease; }
    .cmdr-bsc-endgame-player.active { border-color: var(--player-color, #d7a54c); background: #2d2938; box-shadow: 0 0 0 1px var(--player-color, #d7a54c) inset; }
  `;
  document.head.appendChild(style);
}

export class BoardShortcutMenu {
  private readonly root: HTMLElement;
  private readonly players: Player[];
  private readonly getActiveIndex: () => number;
  private readonly undoStack: UndoStack;
  private readonly sound?: SoundPlayer;
  private readonly shake?: ScreenShakeTrigger;
  private readonly zoneEffects?: ZoneEffectTrigger;
  private readonly stats?: StatsTrigger;
  private readonly getAlivePlayers: () => Player[];
  private readonly onEndGame: (winnerId: string) => void;
  private overlay: HTMLElement | null = null;
  private holdToRepeatDetachFns: Array<() => void> = [];

  constructor(options: BoardShortcutMenuOptions) {
    this.root = options.root;
    this.players = options.players;
    this.getActiveIndex = options.getActiveIndex;
    this.undoStack = options.undoStack;
    this.sound = options.sound;
    this.shake = options.shake;
    this.zoneEffects = options.zoneEffects;
    this.stats = options.stats;
    this.getAlivePlayers = options.getAlivePlayers;
    this.onEndGame = options.onEndGame;
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
    closeButton.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="5" y1="19" x2="19" y2="5"/><line x1="5" y1="5" x2="19" y2="19"/></svg>';
    closeButton.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      this.close();
    });
    head.appendChild(title);
    head.appendChild(closeButton);
    panel.appendChild(head);

    panel.appendChild(this.buildOptionsPanel());

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
   * Builds the toggle row (one icon button per `BOARD_SHORTCUT_OPTIONS`
   * entry, plus an "End game" (issue #117) toggle) and the mutually-
   * exclusive panels beneath it: the shared +/- counter + Apply row for a
   * damage option, or the winner-picker + confirm panel for "End game" —
   * both hidden until their toggle is selected. Selecting a toggle resets
   * whichever panel it reveals and switches which one is shown.
   */
  private buildOptionsPanel(): HTMLElement {
    const wrap = document.createElement('div');

    const toggleRow = document.createElement('div');
    toggleRow.className = 'cmdr-bsc-toggles';

    const counterRow = document.createElement('div');
    counterRow.className = 'cmdr-bsc-row';
    counterRow.style.display = 'none';

    const valueEl = document.createElement('div');
    valueEl.className = 'cmdr-bsc-val';
    valueEl.textContent = '0';

    const { panel: endGamePanel, reset: resetEndGamePanel } = this.buildEndGamePanel();
    endGamePanel.style.display = 'none';

    const toggleButtons = new Map<BoardShortcutOption['scope'] | 'endGame', HTMLButtonElement>();
    let selected: BoardShortcutOption | null = null;
    let amount = 0;

    const activateToggle = (key: BoardShortcutOption['scope'] | 'endGame'): void => {
      for (const [scope, button] of toggleButtons) {
        button.classList.toggle('active', scope === key);
      }
    };

    const selectOption = (option: BoardShortcutOption): void => {
      selected = option;
      amount = 0;
      valueEl.textContent = '0';
      counterRow.style.display = 'flex';
      endGamePanel.style.display = 'none';
      activateToggle(option.scope);
    };

    const selectEndGame = (): void => {
      selected = null;
      counterRow.style.display = 'none';
      endGamePanel.style.display = 'flex';
      resetEndGamePanel();
      activateToggle('endGame');
    };

    for (const option of BOARD_SHORTCUT_OPTIONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cmdr-bsc-toggle';
      button.innerHTML = `${OPTION_ICONS[option.scope]}<span>${option.label}</span>`;
      button.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        selectOption(option);
      });
      toggleButtons.set(option.scope, button);
      toggleRow.appendChild(button);
    }

    const endGameButton = document.createElement('button');
    endGameButton.type = 'button';
    endGameButton.className = 'cmdr-bsc-toggle';
    endGameButton.innerHTML = `${END_GAME_ICON}<span>End game</span>`;
    endGameButton.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      selectEndGame();
    });
    toggleButtons.set('endGame', endGameButton);
    toggleRow.appendChild(endGameButton);

    const minusButton = document.createElement('button');
    minusButton.type = 'button';
    minusButton.className = 'cmdr-bsc-minus';
    minusButton.textContent = '−';
    this.holdToRepeatDetachFns.push(
      attachHoldToRepeat(minusButton, () => {
        amount -= 1;
        valueEl.textContent = String(amount);
      }),
    );

    const plusButton = document.createElement('button');
    plusButton.type = 'button';
    plusButton.className = 'cmdr-bsc-plus';
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
      if (!selected) {
        return;
      }
      applyBoardShortcutDelta(
        this.players,
        this.getActiveIndex(),
        selected.scope,
        amount,
        this.undoStack,
        this.sound,
        this.shake,
        this.zoneEffects,
        this.stats,
      );
      this.close();
    });

    counterRow.appendChild(stepper);
    counterRow.appendChild(applyButton);

    wrap.appendChild(toggleRow);
    wrap.appendChild(counterRow);
    wrap.appendChild(endGamePanel);
    return wrap;
  }

  /**
   * Builds the "End game" panel (issue #117): a button per currently
   * non-eliminated player, and a Confirm button that stays disabled until
   * one is picked — the deliberate second step required before the game
   * actually ends, per the #56 precedent. Returns `reset` alongside the
   * panel so `selectEndGame` can clear any previous pick (and re-read
   * `getAlivePlayers`) each time the toggle is selected, since who's alive
   * can differ between opens of this menu.
   */
  private buildEndGamePanel(): { panel: HTMLElement; reset: () => void } {
    const panel = document.createElement('div');
    panel.className = 'cmdr-bsc-row';

    const list = document.createElement('div');
    list.className = 'cmdr-bsc-endgame-list';

    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'cmdr-bsc-apply';
    confirmButton.textContent = 'Confirm winner';
    confirmButton.disabled = true;
    confirmButton.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      if (!pickedId) {
        return;
      }
      this.onEndGame(pickedId);
      this.close();
    });

    const playerButtons = new Map<string, HTMLButtonElement>();
    let pickedId: string | null = null;

    const reset = (): void => {
      pickedId = null;
      confirmButton.disabled = true;
      confirmButton.textContent = 'Confirm winner';
      list.innerHTML = '';
      playerButtons.clear();
      for (const player of this.getAlivePlayers()) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cmdr-bsc-endgame-player';
        button.style.setProperty('--player-color', player.color ?? '#948fa3');
        button.textContent = player.name;
        button.addEventListener('pointerdown', (event) => {
          event.stopPropagation();
          pickedId = player.id;
          confirmButton.disabled = false;
          confirmButton.textContent = `Confirm: ${player.name} wins`;
          for (const [id, btn] of playerButtons) {
            btn.classList.toggle('active', id === player.id);
          }
        });
        playerButtons.set(player.id, button);
        list.appendChild(button);
      }
    };

    panel.appendChild(list);
    panel.appendChild(confirmButton);
    return { panel, reset };
  }
}
