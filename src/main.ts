import { Game, type GameConfig } from './game';
import { attachLongPress, DamagePanel } from './ui/damagePanel';
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
    undoStack: game.undoStack,
  });

  canvas.style.display = 'block';

  const onPointerDown = (event: PointerEvent): void => {
    game.onTap(event.clientX, event.clientY);
  };
  const onPointerUp = (): void => {
    game.onTapEnd();
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerUp);

  const detachLongPress = attachLongPress(canvas, (event) => {
    if (game.isOverControl(event.clientX, event.clientY)) {
      game.endGame();
      return;
    }
    const playerId = game.onLongPress(event.clientX, event.clientY);
    if (playerId) {
      damagePanel.open(playerId);
    }
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
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('pointerleave', onPointerUp);
    detachLongPress();
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
