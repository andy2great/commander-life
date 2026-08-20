import { computeOverlaySafeArea, Game, type GameConfig } from './game';
import { attachTapAndLongPress, DamagePanel } from './ui/damagePanel';
import { SetupScreen } from './ui/setupScreen';
import { StatsScreen } from './ui/statsScreen';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
canvas.style.display = 'none';

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Drives the --overlay-max-h CSS var read by setupScreen/damagePanel/
  // statsScreen so they can't grow taller than the (possibly short,
  // landscape) viewport and bury the game behind them. See issue #45.
  const { maxHeight } = computeOverlaySafeArea(window.innerWidth, window.innerHeight);
  document.documentElement.style.setProperty('--overlay-max-h', `${maxHeight}px`);
}

window.addEventListener('resize', resize);
resize();

// Detaches the previous game's listeners and animation loop, e.g. when
// "New Game" starts a fresh Game over the same canvas.
let cleanupGame: (() => void) | null = null;

function startGame(config: GameConfig): void {
  cleanupGame?.();

  const game = new Game(config);
  const damagePanel = new DamagePanel({
    root: document.body,
    players: game.players,
    damageState: game.damageState,
    poisonState: game.poisonState,
    undoStack: game.undoStack,
  });

  canvas.style.display = 'block';

  const isOverAnyControl = (event: PointerEvent): boolean =>
    game.isOverControl(event.clientX, event.clientY) || game.isOverUndoControl(event.clientX, event.clientY);

  const detachGesture = attachTapAndLongPress(canvas, {
    onPressStart: (event) => {
      // Zone taps apply on pointerdown so a held press can ramp across
      // animation frames; a later long-press reverts this via cancelTap().
      // Control taps stay deferred to onTap (pointerup) since they never
      // ramp, which also keeps a long-press from passing the turn early.
      if (!isOverAnyControl(event)) {
        game.onTap(event.clientX, event.clientY);
      }
    },
    onTap: (event) => {
      if (isOverAnyControl(event)) {
        game.onTap(event.clientX, event.clientY);
      }
    },
    onLongPress: (event) => {
      if (game.isOverControl(event.clientX, event.clientY)) {
        game.endGame();
        return;
      }
      game.cancelTap();
      const playerId = game.onLongPress(event.clientX, event.clientY);
      if (playerId) {
        damagePanel.open(playerId);
      }
    },
    onPressEnd: () => {
      game.onTapEnd();
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
    damagePanel.close();
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
