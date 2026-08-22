// Pre-game setup screen: a DOM overlay (same pattern as damagePanel.ts) shown
// before the canvas game starts. Lets the host configure player count,
// starting life, names, and colors, per docs/mockups/01-menu.html. Only the
// canvas element itself is off-limits outside main.ts — this overlay is
// plain DOM, like the commander-damage panel.

import {
  DEFAULT_PLAYER_COUNT,
  DEFAULT_STARTING_LIFE,
  MAX_PLAYER_COUNT,
  MIN_PLAYER_COUNT,
  PLAYER_COLORS,
  type GameConfig,
  type PlayerConfig,
} from '../game';
import {
  clampStartingIndex,
  defaultNameForSeat,
  movePlayer,
  removePlayerAt,
  resolveDisplayValue,
  resolveSubmittedName,
} from '../game/playerRoster';
import { loadLastRoster, saveLastRoster, type PersistedRoster } from '../game/rosterStorage';
import { DISPLAY_FONT_STACK, injectDisplayFontFace } from './displayFont';

const STARTING_LIFE_STEP = 5;
const MIN_STARTING_LIFE = 5;
const MAX_STARTING_LIFE = 999;

/**
 * Per-player row control icons (issue #133), vector-drawn inline SVG per the
 * repo's no-external-assets rule — same `currentColor`/`stroke-width: 2.2`
 * conventions as the OPTION_ICONS/END_GAME_ICON/close-button icons in
 * boardShortcutMenu.ts, replacing the raw `⠿`/`▶`/`✕` unicode glyphs.
 */
const DRAG_HANDLE_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
const START_PLAYER_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const REMOVE_PLAYER_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="5" y1="19" x2="19" y2="5"/><line x1="5" y1="5" x2="19" y2="19"/></svg>';

/**
 * Flanks the setup-screen wordmark (issue #135), echoing the faceted "gem"
 * look already established by the player-color swatches (`gemBackground()`)
 * so the new title mark reads as part of the same foil/felt visual
 * language rather than a one-off decoration.
 */
const TITLE_GEM_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 L20 12 L12 22 L4 12 Z"/><path d="M12 2 L16.5 9 L7.5 9 Z" fill="#fff" opacity="0.4"/></svg>';

export interface SetupScreenOptions {
  /** Element the overlay is appended to (e.g. document.body). */
  root: HTMLElement;
  onStart: (config: GameConfig) => void;
  /** Pre-fills the form with a previous game's configuration, e.g. for "New Game". */
  initialConfig?: GameConfig;
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
    .setup-screen { position: fixed; inset: 0; max-height: var(--overlay-max-h, 100vh); background: radial-gradient(ellipse 130% 60% at 12% -12%, #241b30 0%, rgba(18, 16, 22, 0) 55%), repeating-linear-gradient(125deg, rgba(255, 255, 255, 0.018) 0px, rgba(255, 255, 255, 0.018) 1px, transparent 1px, transparent 8px); background-color: #121016; z-index: 20; display: flex; flex-direction: column; padding: 32px 20px 24px; gap: 18px; overflow-y: auto; font-family: system-ui, sans-serif; }
    .setup-title { margin: 0; display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px; font-size: clamp(26px, 8vw, 34px); font-weight: 400; letter-spacing: 1.4px; text-transform: uppercase; text-align: center; font-family: ${DISPLAY_FONT_STACK}; }
    .setup-title-text { background: linear-gradient(135deg, #d7a54c, #e2673f); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .setup-title-gem { flex: 0 0 auto; width: 12px; height: 12px; color: #d7a54c; }
    .setup-title-rule { width: 40px; height: 3px; margin: 8px auto 0; border-radius: 2px; background: linear-gradient(135deg, #d7a54c, #e2673f); }
    .setup-sub { margin: 2px 0 0; text-align: center; color: #948fa3; font-size: 13px; }
    .setup-card { background: linear-gradient(160deg, #211c29 0%, #1a1620 100%); border-radius: 18px; padding: 16px 18px; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), inset 0 -1px 0 rgba(0, 0, 0, 0.4); }
    .setup-row { display: flex; flex-direction: column; gap: 10px; }
    .setup-row + .setup-row { margin-top: 18px; }
    .setup-label { color: #f5f3f7; font-size: 15px; font-weight: 600; }
    .setup-label small { display: block; color: #948fa3; font-weight: 400; font-size: 11px; margin-top: 2px; }
    .setup-stepper { position: relative; display: flex; align-items: stretch; gap: 6px; width: 100%; height: 64px; background: #211d29; border-radius: 16px; padding: 4px; }
    .setup-stepper button { box-sizing: border-box; flex: 1; border: none; border-radius: 12px; background: #2d2938; color: #f5f3f7; font-size: 26px; font-weight: 800; transition: transform 100ms ease, filter 100ms ease; }
    .setup-stepper button:active { transform: scale(0.96); filter: brightness(1.15); }
    .setup-stepper button.setup-minus { background: rgba(229, 72, 77, 0.16); color: #ff8a8f; }
    .setup-stepper button.setup-plus { background: rgba(34, 197, 148, 0.16); color: #4be3c4; }
    .setup-stepper .setup-val { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: none; min-width: 34px; text-align: center; color: #fff; font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; background: #17141d; padding: 6px 12px; border-radius: 10px; box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.3), inset 0 0 0 1px rgba(215, 165, 76, 0.25); }
    .setup-players { display: flex; flex-direction: column; gap: 10px; }
    .setup-player-row { display: flex; flex-direction: column; gap: 10px; background: #211d29; border-radius: 14px; padding: 10px 12px; border-left: 3px solid transparent; transition: border-color 150ms ease, box-shadow 150ms ease; }
    .setup-player-row-dragging { box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45); }
    .setup-player-row-main { display: flex; align-items: center; gap: 10px; }
    .setup-drag-handle { flex: 0 0 auto; width: 26px; height: 34px; display: flex; align-items: center; justify-content: center; color: #6a6478; line-height: 1; touch-action: none; user-select: none; }
    .setup-drag-handle svg { width: 20px; height: 20px; }
    .setup-swatch { width: 30px; height: 30px; border-radius: 50%; flex: 0 0 auto; box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.25); }
    .setup-name-field { flex: 1; min-width: 0; color: #f5f3f7; font-size: 14px; font-weight: 600; background: transparent; border: none; outline: none; font-family: system-ui, sans-serif; }
    .setup-name-field::placeholder { color: #948fa3; font-weight: 400; }
    .setup-start-btn { flex: 0 0 auto; width: 30px; height: 30px; border-radius: 50%; border: none; display: flex; align-items: center; justify-content: center; background: #2d2938; color: #6a6478; transition: transform 100ms ease, filter 100ms ease; }
    .setup-start-btn svg { width: 14px; height: 14px; }
    .setup-start-btn:active { transform: scale(0.9); }
    .setup-start-btn-active { background: rgba(215, 165, 76, 0.22); color: #d7a54c; box-shadow: 0 0 0 2px rgba(215, 165, 76, 0.4); }
    .setup-remove-btn { flex: 0 0 auto; width: 30px; height: 30px; border-radius: 50%; border: none; display: flex; align-items: center; justify-content: center; background: rgba(229, 72, 77, 0.14); color: #ff8a8f; transition: transform 100ms ease, filter 100ms ease; }
    .setup-remove-btn svg { width: 14px; height: 14px; }
    .setup-remove-btn:active { transform: scale(0.9); }
    .setup-remove-btn:disabled { opacity: 0.3; }
    .setup-swatch-row { display: flex; gap: 8px; padding-left: 36px; }
    .setup-mini-swatch { width: 18px; height: 18px; border-radius: 50%; border: none; padding: 0; transition: transform 100ms ease, box-shadow 150ms ease; }
    .setup-mini-swatch:active { transform: scale(0.85); }
    .setup-spacer { flex: 1; }
    .setup-cta { box-sizing: border-box; position: relative; overflow: hidden; margin-top: auto; background: linear-gradient(135deg, #d7a54c, #e2673f); color: #fff; border: none; clip-path: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px); padding: 18px; font-size: 17px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; text-align: center; transition: transform 100ms ease, filter 100ms ease; }
    .setup-cta:active { transform: scale(0.98); filter: brightness(1.08); }
    .setup-cta::after { content: ''; position: absolute; inset: 0; background: linear-gradient(120deg, transparent 30%, rgba(255, 255, 255, 0.35) 50%, transparent 70%); background-size: 220% 100%; animation: cmdr-shimmer 3.2s ease-in-out infinite; }
    @keyframes cmdr-shimmer { 0% { background-position: 160% 0; } 60%, 100% { background-position: -60% 0; } }
  `;
  document.head.appendChild(style);
}

export class SetupScreen {
  private readonly root: HTMLElement;
  private readonly onStartCallback: (config: GameConfig) => void;
  private overlay: HTMLElement | null = null;
  private playersContainer: HTMLElement | null = null;
  private playerCount: number;
  private startingLife: number;
  private players: PlayerConfig[];
  /** The player picked to start first, or null to default to seat 0 — a fresh per-game choice, never carried over from a previous game (issue #126). */
  private startingPlayer: PlayerConfig | null = null;
  /**
   * Players whose name field the host hasn't typed into, tracked by object
   * identity so the flag survives `movePlayer`/`removePlayerAt` reordering
   * the array — unlike comparing `player.name` against a freshly recomputed
   * positional default, which goes stale as soon as the index changes
   * (issue #140). See `resolveDisplayValue`/`resolveSubmittedName`.
   */
  private untouchedPlayers = new Set<PlayerConfig>();

  constructor(options: SetupScreenOptions) {
    this.root = options.root;
    this.onStartCallback = options.onStart;

    // A previous game's config (e.g. "New Game") takes priority; otherwise
    // fall back to the last roster persisted to localStorage, so names,
    // colors, and table order survive closing and reopening the app and
    // pre-fill the very first launch too, not just the in-game hop (issue #126).
    const source: PersistedRoster | undefined = options.initialConfig ?? loadLastRoster(window.localStorage) ?? undefined;
    if (source) {
      this.playerCount = clampPlayerCount(source.playerCount);
      this.startingLife = clampStartingLife(source.startingLife);
      this.players = source.players.slice(0, this.playerCount).map((player) => ({ ...player }));
      this.players.forEach((player, index) => {
        if (player.name === defaultNameForSeat(index)) {
          this.untouchedPlayers.add(player);
        }
      });
      while (this.players.length < this.playerCount) {
        this.players.push(this.createDefaultPlayer(this.players.length));
      }
    } else {
      this.playerCount = DEFAULT_PLAYER_COUNT;
      this.startingLife = DEFAULT_STARTING_LIFE;
      this.players = Array.from({ length: this.playerCount }, (_, seat) => this.createDefaultPlayer(seat));
    }
  }

  private createDefaultPlayer(seat: number): PlayerConfig {
    const player = defaultPlayer(seat);
    this.untouchedPlayers.add(player);
    return player;
  }

  show(): void {
    injectStylesOnce();
    this.close();

    const overlay = document.createElement('div');
    overlay.className = 'setup-screen';

    overlay.appendChild(this.buildTitleWordmark());

    const titleRule = document.createElement('div');
    titleRule.className = 'setup-title-rule';
    overlay.appendChild(titleRule);

    const sub = document.createElement('div');
    sub.className = 'setup-sub';
    sub.textContent = 'Setup your table';
    overlay.appendChild(sub);

    overlay.appendChild(this.buildConfigCard());

    const playersContainer = document.createElement('div');
    playersContainer.className = 'setup-players';
    overlay.appendChild(playersContainer);
    this.playersContainer = playersContainer;
    this.renderPlayerRows();

    const spacer = document.createElement('div');
    spacer.className = 'setup-spacer';
    overlay.appendChild(spacer);

    const cta = document.createElement('button');
    cta.type = 'button';
    cta.className = 'setup-cta';
    cta.textContent = 'Start Game';
    cta.addEventListener('pointerdown', () => this.start());
    overlay.appendChild(cta);

    this.root.appendChild(overlay);
    this.overlay = overlay;
  }

  close(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
      this.playersContainer = null;
    }
  }

  /**
   * The setup screen's wordmark (issue #135): a foil-gradient text fill —
   * the same "engraved plaque" treatment the visual-identity pass
   * (docs/design/visual-identity.md) already uses for hero names on the
   * stats screen — flanked by small vector gem ornaments, so the title
   * reads as a designed logotype rather than plain bold system-font text.
   * Still an `<h1>` for document structure; the accessible name comes from
   * `aria-label` since the visible text lives in a decorative gradient span.
   */
  private buildTitleWordmark(): HTMLElement {
    const title = document.createElement('h1');
    title.className = 'setup-title';
    title.setAttribute('aria-label', 'Commander Life');

    const leftGem = document.createElement('span');
    leftGem.className = 'setup-title-gem';
    leftGem.innerHTML = TITLE_GEM_ICON;
    leftGem.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.className = 'setup-title-text';
    text.textContent = 'Commander Life';
    text.setAttribute('aria-hidden', 'true');

    const rightGem = document.createElement('span');
    rightGem.className = 'setup-title-gem';
    rightGem.innerHTML = TITLE_GEM_ICON;
    rightGem.setAttribute('aria-hidden', 'true');

    title.appendChild(leftGem);
    title.appendChild(text);
    title.appendChild(rightGem);
    return title;
  }

  private buildConfigCard(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'setup-card';
    card.appendChild(
      this.buildStepperRow('Players', '3 to 6 seats', () => String(this.playerCount), (delta) => {
        const nextCount = clampPlayerCount(this.playerCount + delta);
        if (nextCount === this.playerCount) {
          return;
        }
        if (nextCount > this.playerCount) {
          this.players.push(this.createDefaultPlayer(this.players.length));
        } else {
          const [removed] = this.players.splice(this.players.length - 1, 1);
          if (removed === this.startingPlayer) {
            this.startingPlayer = null;
          }
        }
        this.playerCount = nextCount;
        this.renderPlayerRows();
      }),
    );
    card.appendChild(
      this.buildStepperRow('Starting life', 'Standard Commander is 40', () => String(this.startingLife), (delta) => {
        this.startingLife = clampStartingLife(this.startingLife + delta * STARTING_LIFE_STEP);
        this.refreshStartingLifeValue(card);
      }),
    );
    return card;
  }

  private buildStepperRow(
    label: string,
    hint: string,
    getValue: () => string,
    onChange: (delta: 1 | -1) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'setup-row';

    const labelEl = document.createElement('div');
    labelEl.className = 'setup-label';
    labelEl.textContent = label;
    const small = document.createElement('small');
    small.textContent = hint;
    labelEl.appendChild(small);

    const stepper = document.createElement('div');
    stepper.className = 'setup-stepper';

    const valueEl = document.createElement('div');
    valueEl.className = 'setup-val';
    valueEl.textContent = getValue();

    const minusButton = document.createElement('button');
    minusButton.type = 'button';
    minusButton.className = 'setup-minus';
    minusButton.textContent = '−';
    minusButton.addEventListener('pointerdown', () => {
      onChange(-1);
      valueEl.textContent = getValue();
    });

    const plusButton = document.createElement('button');
    plusButton.type = 'button';
    plusButton.className = 'setup-plus';
    plusButton.textContent = '+';
    plusButton.addEventListener('pointerdown', () => {
      onChange(1);
      valueEl.textContent = getValue();
    });

    stepper.appendChild(minusButton);
    stepper.appendChild(valueEl);
    stepper.appendChild(plusButton);
    row.appendChild(labelEl);
    row.appendChild(stepper);
    return row;
  }

  private refreshStartingLifeValue(card: HTMLElement): void {
    const valueEl = card.querySelectorAll('.setup-val')[1];
    if (valueEl) {
      valueEl.textContent = String(this.startingLife);
    }
  }

  private renderPlayerRows(): void {
    const container = this.playersContainer;
    if (!container) {
      return;
    }
    container.replaceChildren();
    this.players.forEach((player, index) => {
      container.appendChild(this.buildPlayerRow(player, index));
    });
  }

  private buildPlayerRow(player: PlayerConfig, index: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'setup-player-row';
    row.style.borderLeftColor = player.color;

    const main = document.createElement('div');
    main.className = 'setup-player-row-main';

    const handle = document.createElement('div');
    handle.className = 'setup-drag-handle';
    handle.innerHTML = DRAG_HANDLE_ICON;
    handle.setAttribute('aria-label', 'Drag to reorder');
    handle.addEventListener('pointerdown', (event) => this.beginRowDrag(row, handle, event));

    const swatch = document.createElement('div');
    swatch.className = 'setup-swatch';
    swatch.style.background = gemBackground(player.color);

    const defaultName = defaultNameForSeat(index);
    const nameField = document.createElement('input');
    nameField.type = 'text';
    nameField.className = 'setup-name-field';
    nameField.placeholder = defaultName;
    nameField.value = resolveDisplayValue(player, this.untouchedPlayers.has(player));
    nameField.style.caretColor = player.color;
    nameField.addEventListener('input', () => {
      this.untouchedPlayers.delete(player);
      player.name = nameField.value.trim() || defaultName;
    });

    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'setup-start-btn';
    startBtn.innerHTML = START_PLAYER_ICON;
    startBtn.title = 'Starts first';
    const isStarting = (this.startingPlayer ?? this.players[0]) === player;
    startBtn.classList.toggle('setup-start-btn-active', isStarting);
    startBtn.setAttribute('aria-pressed', String(isStarting));
    startBtn.addEventListener('pointerdown', () => {
      this.startingPlayer = player;
      this.renderPlayerRows();
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'setup-remove-btn';
    removeBtn.innerHTML = REMOVE_PLAYER_ICON;
    removeBtn.title = 'Remove player';
    removeBtn.disabled = this.players.length <= MIN_PLAYER_COUNT;
    removeBtn.addEventListener('pointerdown', () => {
      const removeIndex = this.players.indexOf(player);
      const next = removePlayerAt(this.players, removeIndex);
      if (next === this.players) {
        return;
      }
      if (player === this.startingPlayer) {
        this.startingPlayer = null;
      }
      this.players = next;
      this.playerCount = this.players.length;
      this.renderPlayerRows();
    });

    main.appendChild(handle);
    main.appendChild(swatch);
    main.appendChild(nameField);
    main.appendChild(startBtn);
    main.appendChild(removeBtn);

    const swatchRow = document.createElement('div');
    swatchRow.className = 'setup-swatch-row';
    const selectSwatch = (mini: HTMLElement, color: string): void => {
      mini.style.boxShadow = `0 0 0 2px ${color}, 0 0 0 4px rgba(0, 0, 0, 0.35)`;
    };
    for (const color of PLAYER_COLORS) {
      const mini = document.createElement('button');
      mini.type = 'button';
      mini.className = 'setup-mini-swatch';
      mini.style.background = gemBackground(color);
      if (color === player.color) {
        selectSwatch(mini, color);
      }
      mini.addEventListener('pointerdown', () => {
        player.color = color;
        swatch.style.background = gemBackground(color);
        row.style.borderLeftColor = color;
        nameField.style.caretColor = color;
        for (const sibling of Array.from(swatchRow.children)) {
          (sibling as HTMLElement).style.boxShadow = '';
        }
        selectSwatch(mini, color);
      });
      swatchRow.appendChild(mini);
    }

    row.appendChild(main);
    row.appendChild(swatchRow);
    return row;
  }

  /**
   * Touch-drag reorder (issue #126): the pressed row follows the pointer's
   * row position live via DOM insertBefore (kept alive across moves so
   * pointer capture on `handle` isn't lost), while `this.players` is
   * reordered in lockstep via the pure movePlayer() helper. A full
   * renderPlayerRows() on release normalizes placeholders/handlers once the
   * drag (and any mid-drag pointer capture concerns) is over.
   */
  private beginRowDrag(row: HTMLElement, handle: HTMLElement, event: PointerEvent): void {
    const container = this.playersContainer;
    if (!container) {
      return;
    }
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    row.classList.add('setup-player-row-dragging');

    const onMove = (moveEvent: PointerEvent): void => {
      const rows = Array.from(container.children) as HTMLElement[];
      const fromIndex = rows.indexOf(row);
      const overIndex = rows.findIndex((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return moveEvent.clientY >= rect.top && moveEvent.clientY < rect.bottom;
      });
      if (fromIndex === -1 || overIndex === -1 || overIndex === fromIndex) {
        return;
      }
      this.players = movePlayer(this.players, fromIndex, overIndex);
      if (overIndex < fromIndex) {
        container.insertBefore(row, rows[overIndex]);
      } else {
        container.insertBefore(row, rows[overIndex].nextSibling);
      }
    };

    const endDrag = (): void => {
      handle.releasePointerCapture(event.pointerId);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', endDrag);
      handle.removeEventListener('pointercancel', endDrag);
      this.renderPlayerRows();
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
  }

  private start(): void {
    const startingIndex = clampStartingIndex(
      this.startingPlayer ? this.players.indexOf(this.startingPlayer) : 0,
      this.players.length,
    );
    const config: GameConfig = {
      playerCount: this.playerCount,
      startingLife: this.startingLife,
      players: this.players.map((player, index) => ({
        ...player,
        name: resolveSubmittedName(player, index, this.untouchedPlayers.has(player)),
      })),
      startingIndex,
    };
    saveLastRoster(window.localStorage, config);
    this.onStartCallback(config);
    this.close();
  }
}

function defaultPlayer(seat: number): PlayerConfig {
  return { name: `Player ${seat + 1}`, color: PLAYER_COLORS[seat % PLAYER_COLORS.length] };
}

/** A soft top-left highlight over the flat accent color, so swatches read as a gem/foil chip rather than a flat dot — echoes concept.md's radial-gradient player zone fill. */
function gemBackground(color: string): string {
  return `radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.45), transparent 55%), ${color}`;
}

function clampPlayerCount(count: number): number {
  return Math.min(MAX_PLAYER_COUNT, Math.max(MIN_PLAYER_COUNT, count));
}

function clampStartingLife(life: number): number {
  return Math.min(MAX_STARTING_LIFE, Math.max(MIN_STARTING_LIFE, life));
}
