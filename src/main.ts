import { computeOverlaySafeArea, Game, resolveOverlayViewportSize, type GameConfig } from './game';
import { isPortraitOrientation } from './game/orientation';
import { attachTapAndLongPress } from './ui/damagePanel';
import { AttackMenu } from './ui/attackMenu';
import { BoardShortcutMenu } from './ui/boardShortcutMenu';
import { RotatePrompt } from './ui/rotatePrompt';
import { SetupScreen } from './ui/setupScreen';
import { StatsScreen } from './ui/statsScreen';
import { WebAudioSoundPlayer } from './audio/webAudioSoundPlayer';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
canvas.style.display = 'none';
const sound = new WebAudioSoundPlayer();

// Best-effort orientation lock (issue #213, R15): the Screen Orientation
// API's `lock()` isn't in TypeScript's DOM lib yet, and it's unsupported (or
// rejects outside a fullscreen tab) on iOS Safari and elsewhere — wrapped so
// any of that fails silently and falls back to the rotate prompt below.
type LockableScreenOrientation = ScreenOrientation & { lock?: (orientation: string) => Promise<void> };
function lockLandscapeOrientationBestEffort(): void {
  try {
    (screen.orientation as LockableScreenOrientation | undefined)?.lock?.('landscape')?.catch(() => {});
  } catch {
    // Unsupported environment — the rotate prompt covers this case instead.
  }
}
lockLandscapeOrientationBestEffort();

// Rotate-to-landscape prompt (issue #213, R15): mounted once at the app
// root so it covers the setup screen, the live board, and the stats screen
// alike, rather than being tied to any one screen's lifecycle.
const rotatePrompt = new RotatePrompt({ root: document.body });
// The Game currently on screen, if any (null on the setup/stats screens);
// used only so the rotate prompt can pause/resume gameplay's turn timer.
let currentGame: Game | null = null;
// True only when the rotate prompt itself paused currentGame, so leaving
// portrait resumes it — without stomping a pause the player set manually.
let pausedByRotation = false;

function updateOrientation(): void {
  const portrait = isPortraitOrientation(window.innerWidth, window.innerHeight);
  if (portrait) {
    rotatePrompt.show();
    if (currentGame && !currentGame.paused) {
      currentGame.setPaused(true);
      pausedByRotation = true;
    }
  } else {
    rotatePrompt.hide();
    if (currentGame && pausedByRotation) {
      currentGame.setPaused(false);
    }
    pausedByRotation = false;
  }
}

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Drives the --overlay-max-h CSS var read by setupScreen/attackMenu/
  // statsScreen so they can't grow taller than the (possibly short,
  // landscape) viewport and bury the game behind them. See issue #45.
  // Prefers the visual viewport (issue #114) so overlays shrink above the
  // on-screen keyboard instead of sizing off the full layout viewport,
  // which would push a bottom-pinned button (e.g. the setup screen's
  // "Start Game" CTA) below the visible/tappable area.
  const { width, height } = resolveOverlayViewportSize(window.innerWidth, window.innerHeight, window.visualViewport);
  const { maxHeight } = computeOverlaySafeArea(width, height);
  document.documentElement.style.setProperty('--overlay-max-h', `${maxHeight}px`);

  updateOrientation();
}

window.addEventListener('resize', resize);
// iOS Safari doesn't fire `resize` on `window` when the on-screen keyboard
// opens/closes — only on `visualViewport` (issue #114).
window.visualViewport?.addEventListener('resize', resize);
// Belt-and-suspenders alongside the resize listener above (issue #213):
// some browsers fire `orientationchange` slightly ahead of `resize`, so the
// rotate prompt/pause reacts as soon as either fires.
window.addEventListener('orientationchange', resize);
resize();

// Detaches the previous game's listeners and animation loop, e.g. when
// "New Game" starts a fresh Game over the same canvas.
let cleanupGame: (() => void) | null = null;

function startGame(config: GameConfig): void {
  cleanupGame?.();

  const game = new Game(config, sound);
  currentGame = game;
  // Rotate prompt may have shown before this game existed (e.g. still
  // portrait when "New Game"/setup finished) — re-check now there's a game
  // to actually pause (issue #213).
  updateOrientation();
  // Issue #204: blurs+dims the canvas board while a full-board overlay
  // (attack menu, board-wide shortcut menu) is open, removed immediately on
  // close. Only main.ts touches the canvas element, so each menu reports its
  // open/close state via `onOpenChange` rather than reaching for the canvas.
  const setBoardBlurred = (blurred: boolean): void => {
    canvas.classList.toggle('board-blurred', blurred);
  };

  const attackMenu = new AttackMenu({
    root: document.body,
    players: game.players,
    damageState: game.damageState,
    poisonState: game.poisonState,
    energyState: game.energyState,
    experienceState: game.experienceState,
    customCountersState: game.customCountersState,
    undoStack: game.undoStack,
    sound,
    shake: game.shakeTrigger,
    zoneEffects: game.zoneEffectTrigger,
    stats: game.statsTrigger,
    onOpenChange: setBoardBlurred,
  });
  const boardShortcutMenu = new BoardShortcutMenu({
    root: document.body,
    players: game.players,
    getActiveIndex: () => game.activeIndex,
    undoStack: game.undoStack,
    sound,
    shake: game.shakeTrigger,
    zoneEffects: game.zoneEffectTrigger,
    stats: game.statsTrigger,
    getAlivePlayers: () => game.alivePlayers,
    onEndGame: (winnerId) => game.endGameWithWinner(winnerId),
    onOpenChange: setBoardBlurred,
  });

  canvas.style.display = 'block';

  const isOverUndoControl = (event: PointerEvent): boolean => game.isOverUndoControl(event.clientX, event.clientY);
  const isOverShortcutControl = (event: PointerEvent): boolean =>
    game.isOverShortcutControl(event.clientX, event.clientY);
  const isOverPauseControl = (event: PointerEvent): boolean => game.isOverPauseControl(event.clientX, event.clientY);

  // Tracks where the current press started so onTap (pointerup) can tell a
  // plain tap from a zone-to-zone drag: released in the same zone (or a
  // control) it's a tap, released in a different zone it's a drag-attack.
  let pressStart: { x: number; y: number } | null = null;

  const detachGesture = attachTapAndLongPress(canvas, {
    onPressStart: (event) => {
      if (isOverUndoControl(event) || isOverShortcutControl(event) || isOverPauseControl(event)) {
        pressStart = null;
        // These controls are tap-only (no long-press behavior of their own),
        // so skip arming the long-press timer entirely — otherwise a tap
        // held past LONG_PRESS_MS (more likely for a less-confident tap near
        // the control's rim) resolves as a long-press, a no-op here, and the
        // control's onTap is silently suppressed (issue #123).
        return false;
      }
      pressStart = { x: event.clientX, y: event.clientY };
      game.beginDrag(event.clientX, event.clientY);
      game.beginTurnHold(event.clientX, event.clientY);
    },
    onMove: (event) => {
      game.updateDragPointer(event.clientX, event.clientY);
      game.updateTurnHold(event.clientX, event.clientY);
    },
    onTap: (event) => {
      if (isOverUndoControl(event) || isOverPauseControl(event)) {
        game.onTap(event.clientX, event.clientY);
        return;
      }
      if (isOverShortcutControl(event)) {
        if (!game.paused) {
          boardShortcutMenu.open();
        }
        return;
      }
      if (!pressStart) {
        return;
      }
      const drag = game.resolveZoneDrag(pressStart.x, pressStart.y, event.clientX, event.clientY);
      if (drag) {
        attackMenu.open(drag.fromPlayerId, drag.toPlayerId);
      }
    },
    onLongPress: (event) => {
      // Long-pressing the currently active player's zone passes the turn
      // (issue #64, replacing the removed center PassTurnControl); any other
      // zone, or a shared control, is a no-op inside passTurnFromZoneLongPress.
      game.passTurnFromZoneLongPress(event.clientX, event.clientY);
    },
    onPressEnd: () => {
      game.endDrag();
      game.endTurnHold();
      pressStart = null;
    },
  });

  let rafId = 0;
  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    game.update(dt);
    game.render(ctx, window.innerWidth, window.innerHeight);
    if (game.ended) {
      showStats();
      return;
    }
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  cleanupGame = (): void => {
    cancelAnimationFrame(rafId);
    detachGesture();
    attackMenu.close();
    boardShortcutMenu.close();
    canvas.style.display = 'none';
    if (currentGame === game) {
      currentGame = null;
      pausedByRotation = false;
    }
  };

  function showStats(): void {
    cleanupGame?.();
    cleanupGame = null;

    const stats = game.stats;
    if (!stats) {
      return;
    }
    new StatsScreen({
      root: document.body,
      players: game.players,
      stats,
      onNewGame: () => {
        new SetupScreen({ root: document.body, onStart: startGame, initialConfig: config }).show();
      },
    }).show();
  }
}

new SetupScreen({
  root: document.body,
  onStart: startGame,
}).show();
