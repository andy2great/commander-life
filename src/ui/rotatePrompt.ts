// Rotate-to-landscape prompt (issue #213, R15): a full-board overlay shown
// whenever the viewport is in portrait orientation, steering players toward
// landscape as the app's primary orientation. Mounted once at the app root
// (main.ts) rather than per-screen, since it must cover the setup screen,
// the live board, and the stats screen alike. No dismiss control — it's
// driven purely by orientation state via show()/hide(), which main.ts calls
// on load and every resize/orientation-change event using the pure
// src/game/orientation.ts check.

import { DISPLAY_FONT_STACK, injectDisplayFontFace } from './displayFont';

export interface RotatePromptOptions {
  /** Element the overlay is appended to (e.g. document.body). */
  root: HTMLElement;
}

const ROTATE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="13" height="9" rx="1.5"/><path d="M19.5 9.5a4 4 0 0 1 0 5"/><path d="M19.5 9.5l2-.6M19.5 14.5l2 .6"/></svg>';

let stylesInjected = false;
function injectStylesOnce(): void {
  if (stylesInjected) {
    return;
  }
  stylesInjected = true;
  injectDisplayFontFace();
  const style = document.createElement('style');
  style.textContent = `
    .cmdr-rotate-overlay { position: fixed; inset: 0; background: #0c0a11; z-index: 1000; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; text-align: center; padding: 24px; box-sizing: border-box; touch-action: none; }
    .cmdr-rotate-icon { width: 72px; height: 72px; color: #d7a54c; animation: cmdr-rotate-spin 1.6s ease-in-out infinite; }
    .cmdr-rotate-text { color: #f5f3f7; font-size: 16px; font-weight: 400; letter-spacing: 0.6px; text-transform: uppercase; font-family: ${DISPLAY_FONT_STACK}; max-width: 260px; }
    @keyframes cmdr-rotate-spin {
      0%, 20% { transform: rotate(0deg); }
      50%, 70% { transform: rotate(-90deg); }
      100% { transform: rotate(-90deg); }
    }
  `;
  document.head.appendChild(style);
}

/** Full-board "rotate your device" overlay; blocks all pointer input to whatever is beneath it while shown (issue #213). */
export class RotatePrompt {
  private readonly root: HTMLElement;
  private overlay: HTMLElement | null = null;

  constructor(options: RotatePromptOptions) {
    this.root = options.root;
  }

  /** True while the prompt is currently shown. */
  get visible(): boolean {
    return this.overlay !== null;
  }

  /** Shows the prompt if not already shown. Idempotent. */
  show(): void {
    if (this.overlay) {
      return;
    }
    injectStylesOnce();

    const overlay = document.createElement('div');
    overlay.className = 'cmdr-rotate-overlay';

    const icon = document.createElement('div');
    icon.className = 'cmdr-rotate-icon';
    icon.innerHTML = ROTATE_ICON;

    const text = document.createElement('div');
    text.className = 'cmdr-rotate-text';
    text.textContent = 'Rotate your device to landscape';

    overlay.appendChild(icon);
    overlay.appendChild(text);
    this.root.appendChild(overlay);
    this.overlay = overlay;
  }

  /** Hides the prompt if shown. Idempotent. */
  hide(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }
}
