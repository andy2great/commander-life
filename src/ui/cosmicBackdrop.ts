// Shared DOM-screen cosmic backdrop (issue #223/R21): mounts a full-viewport
// `<canvas>` behind a DOM overlay screen (setupScreen.ts, statsScreen.ts) and
// animates the same starfield/nebula scene the live board draws beneath its
// player zones (`../game/spaceScene.ts`, issue #222/R20), so every screen the
// player sees shares one dynamic cosmic visual language instead of each
// reverting to a flat/static CSS gradient the moment they leave the board.
// This is the only place outside main.ts that creates a `<canvas>` element —
// CLAUDE.md's "only main.ts touches the canvas element" rule is about the
// single shared `#game` board canvas declared there, not decorative canvases
// a DOM overlay owns entirely for its own lifetime.
//
// Mounted once per screen `show()` (not rebuilt on every render(), which
// would restart the twinkle/drift animation and cached star layout on every
// keystroke/roll-tick re-render) and torn down on `close()`, mirroring the
// resize-listener lifecycle setupScreen.ts already manages for itself.

import { drawSpaceScene, generateSpaceScene, type SpaceScene } from '../game/spaceScene';

export interface CosmicBackdrop {
  readonly canvas: HTMLCanvasElement;
  /** Re-tints the scene (e.g. setup screen's board-theme picker) without restarting the animation or regenerating the star/cloud layout. */
  setBaseColor(color: string): void;
  /** Stops the animation loop and removes the canvas. Safe to call once. */
  destroy(): void;
}

/**
 * Mounts a full-viewport, fixed-position canvas as `container`'s first
 * child (so DOM content painted after it in source order stacks on top,
 * same as the live board's scene-then-zones draw order) and starts an
 * animation loop drawing the cosmic scene into it, sized to `container`.
 */
export function mountCosmicBackdrop(container: HTMLElement, className: string, initialBaseColor: string): CosmicBackdrop {
  const canvas = document.createElement('canvas');
  canvas.className = className;
  container.insertBefore(canvas, container.firstChild);

  const ctx = canvas.getContext('2d');
  let baseColor = initialBaseColor;
  let scene: SpaceScene | null = null;
  let sceneWidth = 0;
  let sceneHeight = 0;
  let destroyed = false;
  let animStartMs: number | null = null;

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (width !== sceneWidth || height !== sceneHeight) {
      scene = generateSpaceScene(width, height);
      sceneWidth = width;
      sceneHeight = height;
    }
  }

  function frame(nowMs: number): void {
    if (destroyed) {
      return;
    }
    if (animStartMs === null) {
      animStartMs = nowMs;
    }
    if (ctx && scene) {
      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, sceneWidth, sceneHeight);
      drawSpaceScene(ctx, scene, baseColor, (nowMs - animStartMs) / 1000);
    }
    requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(frame);

  return {
    canvas,
    setBaseColor(color: string): void {
      baseColor = color;
    },
    destroy(): void {
      destroyed = true;
      window.removeEventListener('resize', resize);
      canvas.remove();
    },
  };
}
