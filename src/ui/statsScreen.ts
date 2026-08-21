// End-game stats screen: a DOM overlay (same pattern as setupScreen.ts and
// damagePanel.ts) shown when the game ends, per docs/mockups/04-gameover.html
// and docs/concept.md step 6. Only the canvas element itself is off-limits
// outside main.ts — this overlay is plain DOM, like the other screens.

import type { GameStats } from '../game';
import type { Player } from '../game/commanderDamage';
import { DISPLAY_FONT_STACK, injectDisplayFontFace } from './displayFont';

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
  injectDisplayFontFace();
  const style = document.createElement('style');
  style.textContent = `
    .stats-screen { position: fixed; inset: 0; max-height: var(--overlay-max-h, 100vh); background: radial-gradient(ellipse 140% 60% at 50% -10%, #211a2c 0%, #121016 55%); z-index: 40; display: flex; flex-direction: column; padding: 32px 20px 24px; gap: 14px; overflow-y: auto; font-family: system-ui, sans-serif; }
    .stats-winner-card { position: relative; background: linear-gradient(135deg, rgba(215,165,76,.18), rgba(226,103,63,.14)); border: 1px solid rgba(215,165,76,.4); clip-path: polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px); padding: 16px; text-align: center; }
    .stats-winner-tag { color: #d7a54c; font-size: 11px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; }
    .stats-winner-name { background: linear-gradient(135deg, #d7a54c, #e2673f); -webkit-background-clip: text; background-clip: text; color: transparent; font-size: 32px; font-weight: 400; margin-top: 4px; font-family: ${DISPLAY_FONT_STACK}; }
    .stats-winner-sub { color: #948fa3; font-size: 12px; margin-top: 4px; }
    .stats-card { background: linear-gradient(160deg, #211c29 0%, #1a1620 100%); border-radius: 18px; padding: 14px 16px; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), inset 0 -1px 0 rgba(0, 0, 0, 0.4); }
    .stats-card h3 { margin: 0 0 12px; padding-bottom: 8px; color: #f5f3f7; font-size: 14px; font-weight: 400; letter-spacing: 1px; text-transform: uppercase; border-bottom: 1px solid #2d2938; font-family: ${DISPLAY_FONT_STACK}; }
    .stats-bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .stats-bar-row:last-child { margin-bottom: 0; }
    .stats-bar-label { width: 64px; color: #948fa3; font-size: 11px; font-weight: 600; flex: 0 0 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .stats-bar-track { flex: 1; height: 14px; background: #211d29; border-radius: 7px; overflow: hidden; box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.4); }
    .stats-bar-fill { height: 100%; border-radius: 7px; transition: width 200ms ease; }
    .stats-bar-pct { width: 34px; text-align: right; color: #fff; font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; flex: 0 0 auto; }
    .stats-elim-list { display: flex; flex-direction: column; gap: 8px; }
    .stats-elim-row { display: flex; align-items: center; gap: 10px; }
    .stats-elim-rank { width: 20px; height: 20px; border-radius: 50%; background: #211d29; color: #d7a54c; font-size: 10px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; box-shadow: inset 0 0 0 1px rgba(215, 165, 76, 0.35); }
    .stats-elim-dot { width: 12px; height: 12px; border-radius: 50%; flex: 0 0 auto; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25); }
    .stats-elim-name { flex: 1; color: #f5f3f7; font-size: 13px; font-weight: 600; }
    .stats-elim-turn { color: #948fa3; font-size: 11px; font-variant-numeric: tabular-nums; }
    .stats-hit-card { position: relative; background: linear-gradient(135deg, rgba(226,103,63,.2), rgba(215,165,76,.12)); border: 1px solid rgba(226,103,63,.4); clip-path: polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px); padding: 16px; text-align: center; }
    .stats-hit-tag { color: #e2673f; font-size: 11px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; }
    .stats-hit-name { color: #fff; font-size: 32px; font-weight: 400; margin-top: 4px; font-family: ${DISPLAY_FONT_STACK}; }
    .stats-hit-sub { color: #948fa3; font-size: 12px; margin-top: 4px; }
    .stats-cta { box-sizing: border-box; position: relative; overflow: hidden; margin-top: auto; background: linear-gradient(135deg, #d7a54c, #e2673f); color: #fff; border: none; clip-path: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px); padding: 18px; font-size: 17px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; text-align: center; transition: transform 100ms ease, filter 100ms ease; }
    .stats-cta:active { transform: scale(0.98); filter: brightness(1.08); }
    .stats-cta::after { content: ''; position: absolute; inset: 0; background: linear-gradient(120deg, transparent 30%, rgba(255, 255, 255, 0.35) 50%, transparent 70%); background-size: 220% 100%; animation: cmdr-shimmer 3.2s ease-in-out infinite; }
    @keyframes cmdr-shimmer { 0% { background-position: 160% 0; } 60%, 100% { background-position: -60% 0; } }
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
    overlay.appendChild(this.buildStatBarCard('Life lost', this.stats.lifeLost));
    overlay.appendChild(this.buildStatBarCard('Life gained', this.stats.lifeGained));
    overlay.appendChild(this.buildStatBarCard('Commander damage dealt', this.stats.commanderDamageDealt));
    overlay.appendChild(this.buildStatBarCard('Commander damage received', this.stats.commanderDamageReceived));

    if (this.stats.biggestHit) {
      overlay.appendChild(this.buildBiggestHitCard());
    }

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
    const winner = this.stats.winnerId ? this.findPlayer(this.stats.winnerId) : undefined;
    const winnerColor = winner?.color;

    const card = document.createElement('div');
    card.className = 'stats-winner-card';
    if (winnerColor) {
      card.style.background = `linear-gradient(135deg, ${winnerColor}2e, ${winnerColor}14)`;
      card.style.borderColor = `${winnerColor}66`;
    }

    const tag = document.createElement('div');
    tag.className = 'stats-winner-tag';
    tag.textContent = this.stats.winnerId ? 'Winner' : 'Draw';
    card.appendChild(tag);

    const name = document.createElement('div');
    name.className = 'stats-winner-name';
    name.style.color = winnerColor ?? '#fff';
    name.textContent = this.stats.winnerId ? winner?.name ?? 'Unknown' : 'No survivors';
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
      const barColor = player.color ?? '#f5f3f7';
      const fill = document.createElement('div');
      fill.className = 'stats-bar-fill';
      fill.style.width = `${pct}%`;
      fill.style.background = barColor;
      fill.style.boxShadow = `0 0 6px ${barColor}88`;
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

  /**
   * A per-player horizontal bar chart card (issue #98) for one of the
   * match-total stats (life lost/gained, commander damage dealt/received),
   * styled the same as buildActiveTimeCard's bars but scaled to the largest
   * value among the players — there's no natural whole to show a percentage
   * of, unlike time-as-active-player.
   */
  private buildStatBarCard(title: string, values: Record<string, number>): HTMLElement {
    const card = document.createElement('div');
    card.className = 'stats-card';

    const heading = document.createElement('h3');
    heading.textContent = title;
    card.appendChild(heading);

    const maxValue = Math.max(1, ...this.players.map((player) => values[player.id] ?? 0));

    for (const player of this.players) {
      const value = values[player.id] ?? 0;
      const pct = Math.round((value / maxValue) * 100);

      const row = document.createElement('div');
      row.className = 'stats-bar-row';

      const label = document.createElement('div');
      label.className = 'stats-bar-label';
      label.textContent = player.name;

      const track = document.createElement('div');
      track.className = 'stats-bar-track';
      const barColor = player.color ?? '#f5f3f7';
      const fill = document.createElement('div');
      fill.className = 'stats-bar-fill';
      fill.style.width = `${pct}%`;
      fill.style.background = barColor;
      fill.style.boxShadow = `0 0 6px ${barColor}88`;
      track.appendChild(fill);

      const valueLabel = document.createElement('div');
      valueLabel.className = 'stats-bar-pct';
      valueLabel.textContent = String(value);

      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(valueLabel);
      card.appendChild(row);
    }

    return card;
  }

  /** Highlighted card (issue #98) for the match's single biggest hit, styled like buildWinnerCard. Only appended when a hit landed. */
  private buildBiggestHitCard(): HTMLElement {
    const hit = this.stats.biggestHit as NonNullable<GameStats['biggestHit']>;
    const attacker = this.findPlayer(hit.attackerId);
    const target = hit.targetId ? this.findPlayer(hit.targetId) : undefined;
    const color = attacker?.color;

    const card = document.createElement('div');
    card.className = 'stats-hit-card';
    if (color) {
      card.style.background = `linear-gradient(135deg, ${color}2e, ${color}14)`;
      card.style.borderColor = `${color}66`;
    }

    const tag = document.createElement('div');
    tag.className = 'stats-hit-tag';
    tag.textContent = 'Biggest hit';
    card.appendChild(tag);

    const name = document.createElement('div');
    name.className = 'stats-hit-name';
    name.style.color = color ?? '#fff';
    name.textContent = `${attacker?.name ?? 'Unknown'} — ${hit.amount}`;
    card.appendChild(name);

    if (target) {
      const sub = document.createElement('div');
      sub.className = 'stats-hit-sub';
      sub.textContent = `Commander damage to ${target.name}`;
      card.appendChild(sub);
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
