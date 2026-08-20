// End-game stats screen: a DOM overlay (same pattern as setupScreen.ts and
// damagePanel.ts) shown when the game ends, per docs/mockups/04-gameover.html
// and docs/concept.md step 6. Only the canvas element itself is off-limits
// outside main.ts — this overlay is plain DOM, like the other screens.

import type { GameStats } from '../game';
import type { Player } from '../game/commanderDamage';

export interface StatsScreenOptions {
  /** Element the overlay is appended to (e.g. document.body). */
  root: HTMLElement;
  players: Player[];
  stats: GameStats;
  onNewGame: () => void;
}

let stylesInjected = false;
function injectStylesOnce(): void {
  if (stylesInjected) {
    return;
  }
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .stats-screen { position: fixed; inset: 0; background: #121016; z-index: 40; display: flex; flex-direction: column; padding: 32px 20px 24px; gap: 14px; overflow-y: auto; font-family: system-ui, sans-serif; }
    .stats-winner-card { background: linear-gradient(135deg, rgba(245,165,36,.18), rgba(142,78,198,.14)); border: 1px solid rgba(245,165,36,.4); border-radius: 20px; padding: 16px; text-align: center; }
    .stats-winner-tag { color: #f5a524; font-size: 11px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; }
    .stats-winner-name { color: #fff; font-size: 26px; font-weight: 800; margin-top: 4px; }
    .stats-winner-sub { color: #948fa3; font-size: 12px; margin-top: 4px; }
    .stats-card { background: #1b1822; border-radius: 18px; padding: 14px 16px; }
    .stats-card h3 { margin: 0 0 10px; color: #f5f3f7; font-size: 13px; font-weight: 700; letter-spacing: .3px; }
    .stats-bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .stats-bar-row:last-child { margin-bottom: 0; }
    .stats-bar-label { width: 64px; color: #948fa3; font-size: 11px; font-weight: 600; flex: 0 0 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .stats-bar-track { flex: 1; height: 14px; background: #211d29; border-radius: 7px; overflow: hidden; }
    .stats-bar-fill { height: 100%; border-radius: 7px; }
    .stats-bar-pct { width: 34px; text-align: right; color: #fff; font-size: 11px; font-weight: 700; flex: 0 0 auto; }
    .stats-elim-list { display: flex; flex-direction: column; gap: 8px; }
    .stats-elim-row { display: flex; align-items: center; gap: 10px; }
    .stats-elim-rank { width: 20px; height: 20px; border-radius: 50%; background: #211d29; color: #948fa3; font-size: 10px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; }
    .stats-elim-dot { width: 12px; height: 12px; border-radius: 50%; flex: 0 0 auto; }
    .stats-elim-name { flex: 1; color: #f5f3f7; font-size: 13px; font-weight: 600; }
    .stats-elim-turn { color: #948fa3; font-size: 11px; }
    .stats-cta { margin-top: auto; background: linear-gradient(135deg, #0091ff, #8e4ec6); color: #fff; border: none; border-radius: 18px; padding: 18px; font-size: 17px; font-weight: 800; letter-spacing: 0.4px; text-align: center; }
  `;
  document.head.appendChild(style);
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

export class StatsScreen {
  private readonly root: HTMLElement;
  private readonly players: Player[];
  private readonly stats: GameStats;
  private readonly onNewGameCallback: () => void;
  private overlay: HTMLElement | null = null;

  constructor(options: StatsScreenOptions) {
    this.root = options.root;
    this.players = options.players;
    this.stats = options.stats;
    this.onNewGameCallback = options.onNewGame;
  }

  show(): void {
    injectStylesOnce();
    this.close();

    const overlay = document.createElement('div');
    overlay.className = 'stats-screen';

    overlay.appendChild(this.buildWinnerCard());
    overlay.appendChild(this.buildActiveTimeCard());

    const eliminated = this.stats.eliminationOrder;
    if (eliminated.length > 0) {
      overlay.appendChild(this.buildEliminationCard());
    }

    const cta = document.createElement('button');
    cta.type = 'button';
    cta.className = 'stats-cta';
    cta.textContent = 'New Game';
    cta.addEventListener('pointerdown', () => {
      this.close();
      this.onNewGameCallback();
    });
    overlay.appendChild(cta);

    this.root.appendChild(overlay);
    this.overlay = overlay;
  }

  close(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  private findPlayer(playerId: string): Player | undefined {
    return this.players.find((player) => player.id === playerId);
  }

  private buildWinnerCard(): HTMLElement {
    const winner = this.findPlayer(this.stats.winnerId);

    const card = document.createElement('div');
    card.className = 'stats-winner-card';

    const tag = document.createElement('div');
    tag.className = 'stats-winner-tag';
    tag.textContent = 'Winner';
    card.appendChild(tag);

    const name = document.createElement('div');
    name.className = 'stats-winner-name';
    name.textContent = winner?.name ?? 'Unknown';
    card.appendChild(name);

    const sub = document.createElement('div');
    sub.className = 'stats-winner-sub';
    sub.textContent = `${formatDuration(this.stats.durationS)} match duration`;
    card.appendChild(sub);

    return card;
  }

  private buildActiveTimeCard(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'stats-card';

    const heading = document.createElement('h3');
    heading.textContent = 'Time as active player';
    card.appendChild(heading);

    const total = this.stats.durationS;
    for (const player of this.players) {
      const activeS = this.stats.activeTimeS[player.id] ?? 0;
      const pct = total > 0 ? Math.round((activeS / total) * 100) : 0;

      const row = document.createElement('div');
      row.className = 'stats-bar-row';

      const label = document.createElement('div');
      label.className = 'stats-bar-label';
      label.textContent = player.name;

      const track = document.createElement('div');
      track.className = 'stats-bar-track';
      const fill = document.createElement('div');
      fill.className = 'stats-bar-fill';
      fill.style.width = `${pct}%`;
      fill.style.background = player.color ?? '#f5f3f7';
      track.appendChild(fill);

      const pctLabel = document.createElement('div');
      pctLabel.className = 'stats-bar-pct';
      pctLabel.textContent = `${pct}%`;

      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(pctLabel);
      card.appendChild(row);
    }

    return card;
  }

  private buildEliminationCard(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'stats-card';

    const heading = document.createElement('h3');
    heading.textContent = 'Elimination order';
    card.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'stats-elim-list';

    this.stats.eliminationOrder.forEach((entry, index) => {
      const player = this.findPlayer(entry.playerId);

      const row = document.createElement('div');
      row.className = 'stats-elim-row';

      const rank = document.createElement('div');
      rank.className = 'stats-elim-rank';
      rank.textContent = String(index + 1);

      const dot = document.createElement('div');
      dot.className = 'stats-elim-dot';
      dot.style.background = player?.color ?? '#948fa3';

      const name = document.createElement('div');
      name.className = 'stats-elim-name';
      name.textContent = player?.name ?? 'Unknown';

      const turn = document.createElement('div');
      turn.className = 'stats-elim-turn';
      turn.textContent = `Turn ${entry.turnCount}`;

      row.appendChild(rank);
      row.appendChild(dot);
      row.appendChild(name);
      row.appendChild(turn);
      list.appendChild(row);
    });

    card.appendChild(list);
    return card;
  }
}
