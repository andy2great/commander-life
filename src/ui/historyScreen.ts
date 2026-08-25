// Match history view (issue #166), reachable from the setup screen, listing
// past completed games most-recent-first. A DOM overlay bottom sheet, same
// pattern as attackMenu.ts/boardShortcutMenu.ts. Reads via
// src/game/matchHistory.ts, the same localStorage-backed mechanism
// src/ui/setupScreen.ts already uses for the player roster (rosterStorage.ts).

import { loadMatchHistory, type MatchHistoryEntry } from '../game/matchHistory';
import { DISPLAY_FONT_STACK, injectDisplayFontFace } from './displayFont';

export interface HistoryScreenOptions {
  /** Element the overlay is appended to (e.g. document.body). */
  root: HTMLElement;
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
    .cmdr-hist-overlay { position: fixed; inset: 0; background: rgba(8, 7, 12, 0.55); z-index: 30; display: flex; align-items: flex-end; }
    .cmdr-hist-panel { width: 100%; max-height: var(--overlay-max-h, 88vh); overflow-y: auto; background: linear-gradient(160deg, #211c29 0%, #1a1620 100%); border-radius: 24px 24px 0 0; padding: 20px; box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05); box-sizing: border-box; }
    .cmdr-hist-head { display: flex; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #2d2938; }
    .cmdr-hist-title { color: #f5f3f7; font-size: 18px; font-weight: 400; letter-spacing: 0.6px; text-transform: uppercase; flex: 1; font-family: ${DISPLAY_FONT_STACK}; }
    .cmdr-hist-close { box-sizing: border-box; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; border: none; background: #241f2d; color: #948fa3; transition: transform 100ms ease, filter 100ms ease; }
    .cmdr-hist-close:active { transform: scale(0.9); filter: brightness(1.2); }
    .cmdr-hist-close svg { width: 14px; height: 14px; }
    .cmdr-hist-empty { color: #948fa3; font-size: 13px; text-align: center; padding: 24px 8px; }
    .cmdr-hist-list { display: flex; flex-direction: column; gap: 10px; }
    .cmdr-hist-entry { background: #241f2d; border-radius: 16px; padding: 12px 14px; }
    .cmdr-hist-entry-date { color: #948fa3; font-size: 11px; font-weight: 600; }
    .cmdr-hist-entry-winner { color: #d7a54c; font-size: 15px; font-weight: 700; margin-top: 4px; }
    .cmdr-hist-entry-players { color: #f5f3f7; font-size: 12px; margin-top: 4px; }
  `;
  document.head.appendChild(style);
}

function formatPlayedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

export class HistoryScreen {
  private readonly root: HTMLElement;
  private overlay: HTMLElement | null = null;

  constructor(options: HistoryScreenOptions) {
    this.root = options.root;
  }

  show(): void {
    injectStylesOnce();
    this.close();

    const entries = loadMatchHistory(window.localStorage);

    const overlay = document.createElement('div');
    overlay.className = 'cmdr-hist-overlay';
    overlay.addEventListener('pointerdown', (event) => {
      if (event.target === overlay) {
        this.close();
      }
    });

    const panel = document.createElement('div');
    panel.className = 'cmdr-hist-panel';

    const head = document.createElement('div');
    head.className = 'cmdr-hist-head';
    const title = document.createElement('div');
    title.className = 'cmdr-hist-title';
    title.textContent = 'Match history';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'cmdr-hist-close';
    closeButton.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="5" y1="19" x2="19" y2="5"/><line x1="5" y1="5" x2="19" y2="19"/></svg>';
    closeButton.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      this.close();
    });
    head.appendChild(title);
    head.appendChild(closeButton);
    panel.appendChild(head);

    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'cmdr-hist-empty';
      empty.textContent = 'No games played yet.';
      panel.appendChild(empty);
    } else {
      panel.appendChild(this.buildList(entries));
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

  private buildList(entries: MatchHistoryEntry[]): HTMLElement {
    const list = document.createElement('div');
    list.className = 'cmdr-hist-list';

    for (const entry of entries) {
      const row = document.createElement('div');
      row.className = 'cmdr-hist-entry';

      const date = document.createElement('div');
      date.className = 'cmdr-hist-entry-date';
      date.textContent = formatPlayedAt(entry.playedAt);

      const winner = document.createElement('div');
      winner.className = 'cmdr-hist-entry-winner';
      winner.textContent = entry.winnerName ? `Winner: ${entry.winnerName}` : 'Draw';

      const players = document.createElement('div');
      players.className = 'cmdr-hist-entry-players';
      players.textContent = entry.players.join(', ');

      row.appendChild(date);
      row.appendChild(winner);
      row.appendChild(players);
      list.appendChild(row);
    }

    return list;
  }
}
