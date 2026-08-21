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
    .setup-screen { position: fixed; inset: 0; max-height: var(--overlay-max-h, 100vh); background: radial-gradient(ellipse 140% 60% at 50% -10%, #211a2c 0%, #121016 55%); z-index: 20; display: flex; flex-direction: column; padding: 32px 20px 24px; gap: 18px; overflow-y: auto; font-family: system-ui, sans-serif; }
    .setup-title { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase; color: #f5f3f7; text-align: center; }
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
    .setup-player-row { display: flex; align-items: center; gap: 12px; background: #211d29; border-radius: 14px; padding: 10px 12px; border-left: 3px solid transparent; transition: border-color 150ms ease; }
    .setup-swatch { width: 30px; height: 30px; border-radius: 50%; flex: 0 0 auto; box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.25); }
    .setup-name-field { flex: 1; min-width: 0; color: #f5f3f7; font-size: 14px; font-weight: 600; background: transparent; border: none; outline: none; font-family: system-ui, sans-serif; }
    .setup-name-field::placeholder { color: #948fa3; font-weight: 400; }
    .setup-swatch-row { display: flex; gap: 8px; }
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
    swatch.style.background = gemBackground(player.color);

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
