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

const STARTING_LIFE_STEP = 5;
const MIN_STARTING_LIFE = 5;
const MAX_STARTING_LIFE = 999;

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
  const style = document.createElement('style');
  style.textContent = `
    .setup-screen { position: fixed; inset: 0; max-height: var(--overlay-max-h, 100vh); background: #121016; z-index: 20; display: flex; flex-direction: column; padding: 32px 20px 24px; gap: 18px; overflow-y: auto; font-family: system-ui, sans-serif; }
    .setup-title { margin: 0; font-size: 26px; font-weight: 800; color: #f5f3f7; text-align: center; }
    .setup-sub { margin: -8px 0 0; text-align: center; color: #948fa3; font-size: 13px; }
    .setup-card { background: #1b1822; border-radius: 18px; padding: 16px 18px; }
    .setup-row { display: flex; align-items: center; justify-content: space-between; }
    .setup-row + .setup-row { margin-top: 14px; }
    .setup-label { color: #f5f3f7; font-size: 15px; font-weight: 600; }
    .setup-label small { display: block; color: #948fa3; font-weight: 400; font-size: 11px; margin-top: 2px; }
    .setup-stepper { display: flex; align-items: center; gap: 14px; background: #211d29; border-radius: 14px; padding: 6px 10px; }
    .setup-stepper button { width: 32px; height: 32px; border-radius: 10px; border: none; background: #2d2938; color: #f5f3f7; font-size: 18px; font-weight: 700; }
    .setup-stepper .setup-val { min-width: 34px; text-align: center; color: #f5f3f7; font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .setup-players { display: flex; flex-direction: column; gap: 10px; }
    .setup-player-row { display: flex; align-items: center; gap: 12px; background: #211d29; border-radius: 14px; padding: 10px 12px; border-left: 3px solid transparent; }
    .setup-swatch { width: 30px; height: 30px; border-radius: 50%; flex: 0 0 auto; box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.25); }
    .setup-name-field { flex: 1; min-width: 0; color: #f5f3f7; font-size: 14px; font-weight: 600; background: transparent; border: none; outline: none; font-family: system-ui, sans-serif; }
    .setup-name-field::placeholder { color: #948fa3; font-weight: 400; }
    .setup-swatch-row { display: flex; gap: 8px; }
    .setup-mini-swatch { width: 18px; height: 18px; border-radius: 50%; border: none; padding: 0; }
    .setup-spacer { flex: 1; }
    .setup-cta { margin-top: auto; background: linear-gradient(135deg, #0091ff, #8e4ec6); color: #fff; border: none; border-radius: 18px; padding: 18px; font-size: 17px; font-weight: 800; letter-spacing: 0.4px; text-align: center; }
  `;
  document.head.appendChild(style);
}

export class SetupScreen {
  private readonly root: HTMLElement;
  private readonly onStartCallback: (config: GameConfig) => void;
  private overlay: HTMLElement | null = null;
  private playersContainer: HTMLElement | null = null;
  private playerCount = DEFAULT_PLAYER_COUNT;
  private startingLife = DEFAULT_STARTING_LIFE;
  private readonly players: PlayerConfig[] = Array.from({ length: MAX_PLAYER_COUNT }, (_, seat) => ({
    name: `Player ${seat + 1}`,
    color: PLAYER_COLORS[seat % PLAYER_COLORS.length],
  }));

  constructor(options: SetupScreenOptions) {
    this.root = options.root;
    this.onStartCallback = options.onStart;

    const initialConfig = options.initialConfig;
    if (initialConfig) {
      this.playerCount = clampPlayerCount(initialConfig.playerCount);
      this.startingLife = clampStartingLife(initialConfig.startingLife);
      initialConfig.players.forEach((player, seat) => {
        if (this.players[seat]) {
          this.players[seat] = { ...player };
        }
      });
    }
  }

  show(): void {
    injectStylesOnce();
    this.close();

    const overlay = document.createElement('div');
    overlay.className = 'setup-screen';

    const title = document.createElement('h1');
    title.className = 'setup-title';
    title.textContent = 'Commander Life';
    overlay.appendChild(title);

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

  private buildConfigCard(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'setup-card';
    card.appendChild(
      this.buildStepperRow('Players', '3 to 6 seats', () => String(this.playerCount), (delta) => {
        this.playerCount = clampPlayerCount(this.playerCount + delta);
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
    minusButton.textContent = '−';
    minusButton.addEventListener('pointerdown', () => {
      onChange(-1);
      valueEl.textContent = getValue();
    });

    const plusButton = document.createElement('button');
    plusButton.type = 'button';
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
    for (let seat = 0; seat < this.playerCount; seat += 1) {
      container.appendChild(this.buildPlayerRow(seat));
    }
  }

  private buildPlayerRow(seat: number): HTMLElement {
    const player = this.players[seat];
    const row = document.createElement('div');
    row.className = 'setup-player-row';
    row.style.borderLeftColor = player.color;

    const swatch = document.createElement('div');
    swatch.className = 'setup-swatch';
    swatch.style.background = player.color;

    const nameField = document.createElement('input');
    nameField.type = 'text';
    nameField.className = 'setup-name-field';
    nameField.placeholder = `Player ${seat + 1}`;
    nameField.value = player.name === `Player ${seat + 1}` ? '' : player.name;
    nameField.style.caretColor = player.color;
    nameField.addEventListener('input', () => {
      player.name = nameField.value.trim() || `Player ${seat + 1}`;
    });

    const swatchRow = document.createElement('div');
    swatchRow.className = 'setup-swatch-row';
    const selectSwatch = (mini: HTMLElement, color: string): void => {
      mini.style.boxShadow = `0 0 0 2px ${color}, 0 0 0 4px rgba(0, 0, 0, 0.35)`;
    };
    for (const color of PLAYER_COLORS) {
      const mini = document.createElement('button');
      mini.type = 'button';
      mini.className = 'setup-mini-swatch';
      mini.style.background = color;
      if (color === player.color) {
        selectSwatch(mini, color);
      }
      mini.addEventListener('pointerdown', () => {
        player.color = color;
        swatch.style.background = color;
        row.style.borderLeftColor = color;
        nameField.style.caretColor = color;
        for (const sibling of Array.from(swatchRow.children)) {
          (sibling as HTMLElement).style.boxShadow = '';
        }
        selectSwatch(mini, color);
      });
      swatchRow.appendChild(mini);
    }

    row.appendChild(swatch);
    row.appendChild(nameField);
    row.appendChild(swatchRow);
    return row;
  }

  private start(): void {
    this.onStartCallback({
      playerCount: this.playerCount,
      startingLife: this.startingLife,
      players: this.players.slice(0, this.playerCount),
    });
    this.close();
  }
}

function clampPlayerCount(count: number): number {
  return Math.min(MAX_PLAYER_COUNT, Math.max(MIN_PLAYER_COUNT, count));
}

function clampStartingLife(life: number): number {
  return Math.min(MAX_STARTING_LIFE, Math.max(MIN_STARTING_LIFE, life));
}
