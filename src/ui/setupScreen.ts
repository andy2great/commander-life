// Pre-game setup mode (issue #148): a DOM overlay (same pattern as
// damagePanel.ts) shown before the canvas game starts, laid out with the
// same per-seat rotated zone grid the live board uses (computeZoneRects),
// instead of a full-screen vertical list. Every seat's zone shows that
// seat's editable name field and color-swatch picker directly, rotated to
// face that seat, so every player can configure their own zone from their
// own seat at the same time — see docs/concept.md's pass-around-the-table
// premise. A compact control hub at the shared center (mirroring the
// in-game undo disc's position) hosts the player-count/starting-life
// steppers and the "Start Game" CTA. Only the canvas element itself is
// off-limits outside main.ts — this overlay is plain DOM, like the
// commander-damage panel.

import {
  computeZoneRects,
  DEFAULT_PLAYER_COUNT,
  DEFAULT_STARTING_LIFE,
  MAX_PLAYER_COUNT,
  MIN_PLAYER_COUNT,
  PLAYER_COLORS,
  type GameConfig,
  type PlayerConfig,
  type ZoneRect,
} from '../game';
import {
  clampStartingIndex,
  defaultNameForSeat,
  removePlayerAt,
  resolveDisplayValue,
  resolveSubmittedName,
} from '../game/playerRoster';
import { loadLastRoster, saveLastRoster, type PersistedRoster } from '../game/rosterStorage';
import { DISPLAY_FONT_STACK, injectDisplayFontFace } from './displayFont';

const STARTING_LIFE_STEP = 5;
const MIN_STARTING_LIFE = 5;
const MAX_STARTING_LIFE = 999;
const BOARD_BACKGROUND_COLOR = '#121016';

const START_PLAYER_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const REMOVE_PLAYER_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="5" y1="19" x2="19" y2="5"/><line x1="5" y1="5" x2="19" y2="19"/></svg>';

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
    .setup-board { position: fixed; inset: 0; background: ${BOARD_BACKGROUND_COLOR}; z-index: 20; overflow: hidden; font-family: system-ui, sans-serif; }
    .setup-zone { position: absolute; box-sizing: border-box; border: 1px solid rgba(255, 255, 255, 0.12); }
    .setup-zone-content { position: absolute; top: 50%; left: 50%; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 10px; }
    .setup-zone-swatches { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
    .setup-zone-mini-swatch { width: 20px; height: 20px; border-radius: 50%; border: none; padding: 0; flex: 0 0 auto; transition: transform 100ms ease, box-shadow 150ms ease; }
    .setup-zone-mini-swatch:active { transform: scale(0.85); }
    .setup-zone-name-row { display: flex; align-items: center; gap: 6px; max-width: 100%; }
    .setup-zone-name { min-width: 0; width: min(160px, 100%); color: #f5f3f7; font-size: 15px; font-weight: 700; text-align: center; background: rgba(0, 0, 0, 0.25); border: none; border-radius: 8px; padding: 6px 8px; outline: none; font-family: system-ui, sans-serif; }
    .setup-zone-name::placeholder { color: rgba(245, 243, 247, 0.55); font-weight: 400; }
    .setup-zone-start-btn { box-sizing: border-box; flex: 0 0 auto; width: 44px; height: 44px; border-radius: 50%; border: none; padding: 0; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.25); color: rgba(245, 243, 247, 0.55); }
    .setup-zone-start-btn svg { width: 20px; height: 20px; }
    .setup-zone-start-btn-active { background: rgba(215, 165, 76, 0.35); color: #d7a54c; box-shadow: 0 0 0 2px rgba(215, 165, 76, 0.5); }
    .setup-zone-remove-btn { box-sizing: border-box; flex: 0 0 auto; width: 44px; height: 44px; margin-left: 6px; border-radius: 50%; border: none; padding: 0; display: flex; align-items: center; justify-content: center; background: rgba(229, 72, 77, 0.18); color: #ff8a8f; }
    .setup-zone-remove-btn svg { width: 18px; height: 18px; }
    .setup-zone-remove-btn:disabled { opacity: 0.3; }
    .setup-hub { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 2; width: min(240px, 78vw); box-sizing: border-box; background: linear-gradient(160deg, #211c29 0%, #1a1620 100%); border-radius: 18px; padding: 14px 16px; display: flex; flex-direction: column; align-items: stretch; gap: 10px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.05); }
    .setup-hub-title { margin: 0; text-align: center; font-size: 15px; font-weight: 400; letter-spacing: 1px; text-transform: uppercase; font-family: ${DISPLAY_FONT_STACK}; background: linear-gradient(135deg, #d7a54c, #e2673f); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .setup-hub-stepper-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .setup-hub-stepper-label { color: #948fa3; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; }
    .setup-hub-stepper { display: flex; align-items: center; gap: 6px; }
    .setup-hub-stepper button { box-sizing: border-box; width: 44px; height: 44px; border: none; border-radius: 10px; background: #2d2938; color: #f5f3f7; font-size: 17px; font-weight: 800; }
    .setup-hub-stepper button:active { transform: scale(0.94); }
    .setup-hub-stepper button.setup-hub-minus { background: rgba(229, 72, 77, 0.16); color: #ff8a8f; }
    .setup-hub-stepper button.setup-hub-plus { background: rgba(34, 197, 148, 0.16); color: #4be3c4; }
    .setup-hub-stepper-val { min-width: 26px; text-align: center; color: #fff; font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; }
    .setup-hub-cta { box-sizing: border-box; margin-top: 4px; background: linear-gradient(135deg, #d7a54c, #e2673f); color: #fff; border: none; border-radius: 10px; padding: 12px; font-size: 14px; font-weight: 800; letter-spacing: 0.6px; text-transform: uppercase; }
    .setup-hub-cta:active { transform: scale(0.98); }
  `;
  document.head.appendChild(style);
}

export class SetupScreen {
  private readonly root: HTMLElement;
  private readonly onStartCallback: (config: GameConfig) => void;
  private overlay: HTMLElement | null = null;
  private playerCount: number;
  private startingLife: number;
  private players: PlayerConfig[];
  /** The player picked to start first, or null to default to seat 0 — a fresh per-game choice, never carried over from a previous game (issue #126). */
  private startingPlayer: PlayerConfig | null = null;
  /**
   * Players whose name field the host hasn't typed into, tracked by object
   * identity so the flag survives the player-count stepper adding/removing
   * seats — unlike comparing `player.name` against a freshly recomputed
   * positional default, which goes stale as soon as the index changes
   * (issue #140). See `resolveDisplayValue`/`resolveSubmittedName`.
   */
  private untouchedPlayers = new Set<PlayerConfig>();
  private resizeHandler: (() => void) | null = null;

  constructor(options: SetupScreenOptions) {
    this.root = options.root;
    this.onStartCallback = options.onStart;

    // A previous game's config (e.g. "New Game") takes priority; otherwise
    // fall back to the last roster persisted to localStorage, so names,
    // colors, and player count survive closing and reopening the app and
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
    overlay.className = 'setup-board';
    this.root.appendChild(overlay);
    this.overlay = overlay;

    this.render();

    // Skips the resize-triggered re-render while a zone's field has focus:
    // `render()` rebuilds the whole overlay via `replaceChildren()`, which
    // would destroy and recreate the focused `<input>` mid-keystroke. On
    // iOS Safari the on-screen keyboard opening/closing fires `resize` only
    // on `visualViewport` (issue #114); on Android it commonly fires on
    // `window` too. Either way, a destructive re-render here would drop
    // focus, closing the keyboard right after it opened. A real
    // orientation/size change while a field is focused is picked up on the
    // next resize after the field blurs.
    this.resizeHandler = () => {
      if (this.overlay && document.activeElement && this.overlay.contains(document.activeElement)) {
        return;
      }
      this.render();
    };
    window.addEventListener('resize', this.resizeHandler);
    window.visualViewport?.addEventListener('resize', this.resizeHandler);
  }

  close(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      window.visualViewport?.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
  }

  private render(): void {
    const overlay = this.overlay;
    if (!overlay) {
      return;
    }
    overlay.replaceChildren();

    const rects = computeZoneRects(this.playerCount, window.innerWidth, window.innerHeight);
    this.players.forEach((player, index) => {
      overlay.appendChild(this.buildZone(player, index, rects[index]));
    });

    overlay.appendChild(this.buildHub());
  }

  private buildZone(player: PlayerConfig, index: number, rect: ZoneRect): HTMLElement {
    const zone = document.createElement('div');
    zone.className = 'setup-zone';
    zone.style.left = `${rect.x}px`;
    zone.style.top = `${rect.y}px`;
    zone.style.width = `${rect.width}px`;
    zone.style.height = `${rect.height}px`;
    zone.style.background = `radial-gradient(circle at 50% 50%, ${player.color} 0%, ${BOARD_BACKGROUND_COLOR} 75%)`;

    const rotated90 = rect.rotation === 90;
    const contentWidth = rotated90 ? rect.height : rect.width;
    const contentHeight = rotated90 ? rect.width : rect.height;

    const content = document.createElement('div');
    content.className = 'setup-zone-content';
    content.style.width = `${Math.max(contentWidth - 20, 0)}px`;
    content.style.height = `${Math.max(contentHeight - 20, 0)}px`;
    content.style.transform = `translate(-50%, -50%) rotate(${rect.rotation}deg)`;

    const nameRow = document.createElement('div');
    nameRow.className = 'setup-zone-name-row';

    const defaultName = defaultNameForSeat(index);
    const nameField = document.createElement('input');
    nameField.type = 'text';
    nameField.className = 'setup-zone-name';
    nameField.placeholder = defaultName;
    nameField.value = resolveDisplayValue(player, this.untouchedPlayers.has(player));
    nameField.style.caretColor = player.color;
    nameField.addEventListener('input', () => {
      this.untouchedPlayers.delete(player);
      player.name = nameField.value.trim() || defaultName;
    });

    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'setup-zone-start-btn';
    startBtn.innerHTML = START_PLAYER_ICON;
    startBtn.title = 'Starts first';
    const isStarting = (this.startingPlayer ?? this.players[0]) === player;
    startBtn.classList.toggle('setup-zone-start-btn-active', isStarting);
    startBtn.setAttribute('aria-pressed', String(isStarting));
    startBtn.addEventListener('pointerdown', () => {
      this.startingPlayer = player;
      this.render();
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'setup-zone-remove-btn';
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
      this.render();
    });

    nameRow.appendChild(nameField);
    nameRow.appendChild(startBtn);
    nameRow.appendChild(removeBtn);

    const swatchRow = document.createElement('div');
    swatchRow.className = 'setup-zone-swatches';
    const selectSwatch = (mini: HTMLElement, color: string): void => {
      mini.style.boxShadow = `0 0 0 2px ${color}, 0 0 0 4px rgba(0, 0, 0, 0.35)`;
    };
    for (const color of PLAYER_COLORS) {
      const mini = document.createElement('button');
      mini.type = 'button';
      mini.className = 'setup-zone-mini-swatch';
      mini.style.background = color;
      if (color === player.color) {
        selectSwatch(mini, color);
      }
      mini.addEventListener('pointerdown', () => {
        player.color = color;
        zone.style.background = `radial-gradient(circle at 50% 50%, ${color} 0%, ${BOARD_BACKGROUND_COLOR} 75%)`;
        nameField.style.caretColor = color;
        for (const sibling of Array.from(swatchRow.children)) {
          (sibling as HTMLElement).style.boxShadow = '';
        }
        selectSwatch(mini, color);
      });
      swatchRow.appendChild(mini);
    }

    content.appendChild(nameRow);
    content.appendChild(swatchRow);
    zone.appendChild(content);
    return zone;
  }

  /**
   * The two table-wide settings — "Players" and "Starting life" — live here
   * on the shared center hub rather than per-zone, since they apply to the
   * whole table rather than one seat (issue #149). This is also where the
   * board's shared center control hosts undo/shortcut/pause during play, so
   * setup mode keeps everything on the one page the on-board layout (#148)
   * introduced instead of a separate screen.
   */
  private buildHub(): HTMLElement {
    const hub = document.createElement('div');
    hub.className = 'setup-hub';

    const title = document.createElement('h1');
    title.className = 'setup-hub-title';
    title.textContent = 'Commander Life';
    hub.appendChild(title);

    hub.appendChild(
      this.buildHubStepper('Players', () => String(this.playerCount), (delta) => {
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
        this.render();
      }),
    );

    hub.appendChild(
      this.buildHubStepper('Starting life', () => String(this.startingLife), (delta) => {
        this.startingLife = clampStartingLife(this.startingLife + delta * STARTING_LIFE_STEP);
        this.render();
      }),
    );

    // The "Start Game" action lives here on the shared center hub, alongside
    // the table-wide steppers, rather than as a separate full-width CTA
    // pinned below a scrolling list (issue #150). `start()` persists the
    // roster via rosterStorage and hands the config to onStartCallback,
    // which flips the canvas on in place while this DOM overlay closes —
    // no full-screen overlay swap, since the zone layout underneath already
    // matches the live board.
    const cta = document.createElement('button');
    cta.type = 'button';
    cta.className = 'setup-hub-cta';
    cta.textContent = 'Start Game';
    cta.addEventListener('pointerdown', () => this.start());
    hub.appendChild(cta);

    return hub;
  }

  private buildHubStepper(label: string, getValue: () => string, onChange: (delta: 1 | -1) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'setup-hub-stepper-row';

    const labelEl = document.createElement('div');
    labelEl.className = 'setup-hub-stepper-label';
    labelEl.textContent = label;

    const stepper = document.createElement('div');
    stepper.className = 'setup-hub-stepper';

    const minusButton = document.createElement('button');
    minusButton.type = 'button';
    minusButton.className = 'setup-hub-minus';
    minusButton.textContent = '−';
    minusButton.addEventListener('pointerdown', () => onChange(-1));

    const valueEl = document.createElement('div');
    valueEl.className = 'setup-hub-stepper-val';
    valueEl.textContent = getValue();

    const plusButton = document.createElement('button');
    plusButton.type = 'button';
    plusButton.className = 'setup-hub-plus';
    plusButton.textContent = '+';
    plusButton.addEventListener('pointerdown', () => onChange(1));

    stepper.appendChild(minusButton);
    stepper.appendChild(valueEl);
    stepper.appendChild(plusButton);
    row.appendChild(labelEl);
    row.appendChild(stepper);
    return row;
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

function clampPlayerCount(count: number): number {
  return Math.min(MAX_PLAYER_COUNT, Math.max(MIN_PLAYER_COUNT, count));
}

function clampStartingLife(life: number): number {
  return Math.min(MAX_STARTING_LIFE, Math.max(MIN_STARTING_LIFE, life));
}
