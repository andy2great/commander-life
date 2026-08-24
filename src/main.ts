import { computeOverlaySafeArea, Game, resolveOverlayViewportSize, type GameConfig } from './game';
import { attachTapAndLongPress } from './ui/damagePanel';
import { AttackMenu } from './ui/attackMenu';
import { BoardShortcutMenu } from './ui/boardShortcutMenu';
import { SetupScreen } from './ui/setupScreen';
import { StatsScreen } from './ui/statsScreen';
import { WebAudioSoundPlayer } from './audio/webAudioSoundPlayer';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
canvas.style.display = 'none';
const sound = new WebAudioSoundPlayer();

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
}

window.addEventListener('resize', resize);
// iOS Safari doesn't fire `resize` on `window` when the on-screen keyboard
// opens/closes — only on `visualViewport` (issue #114).
window.visualViewport?.addEventListener('resize', resize);
resize();

// Detaches the previous game's listeners and animation loop, e.g. when
// "New Game" starts a fresh Game over the same canvas.
let cleanupGame: (() => void) | null = null;

function startGame(config: GameConfig): void {
  cleanupGame?.();

  const game = new Game(config, sound);
  const attackMenu = new AttackMenu({
    root: document.body,
    players: game.players,
    damageState: game.damageState,
    poisonState: game.poisonState,
    energyState: game.energyState,
    experienceState: game.experienceState,
    undoStack: game.undoStack,
    sound,
    shake: game.shakeTrigger,
    zoneEffects: game.zoneEffectTrigger,
    stats: game.statsTrigger,
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
    getRingBearerId: () => game.ringBearerId,
    onAssignRingBearer: (playerId) => game.assignRingBearer(playerId),
  });

  canvas.style.display = 'block';

  const isOverUndoControl = (event: PointerEvent): boolean => game.isOverUndoControl(event.clientX, event.clientY);
  const isOverShortcutControl = (event: PointerEvent): boolean =>
    game.isOverShortcutControl(event.clientX, event.clientY);
  const isOverPauseControl = (event: PointerEvent): boolean => game.isOverPauseControl(event.clientX, event.clientY);
  const isOverMonarchBadge = (event: PointerEvent): boolean =>
    game.isOverMonarchBadge(event.clientX, event.clientY) !== null;

  // Tracks where the current press started so onTap (pointerup) can tell a
  // plain tap from a zone-to-zone drag: released in the same zone (or a
  // control) it's a tap, released in a different zone it's a drag-attack.
  let pressStart: { x: number; y: number } | null = null;

  const detachGesture = attachTapAndLongPress(canvas, {
    onPressStart: (event) => {
      if (isOverUndoControl(event) || isOverShortcutControl(event) || isOverPauseControl(event) || isOverMonarchBadge(event)) {
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
      const monarchPlayerId = game.isOverMonarchBadge(event.clientX, event.clientY);
      if (monarchPlayerId) {
        game.assignMonarchTo(monarchPlayerId);
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
