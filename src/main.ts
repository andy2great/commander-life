import { Game, type GameConfig } from './game';
import { attachLongPress, DamagePanel } from './ui/damagePanel';
import { SetupScreen } from './ui/setupScreen';

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

function startGame(config: GameConfig): void {
  const game = new Game(config);
  const damagePanel = new DamagePanel({
    root: document.body,
    players: game.players,
    damageState: game.damageState,
    undoStack: game.undoStack,
  });

  canvas.style.display = 'block';

  canvas.addEventListener('pointerdown', (event) => {
    game.onTap(event.clientX, event.clientY);
  });
  canvas.addEventListener('pointerup', () => {
    game.onTapEnd();
  });
  canvas.addEventListener('pointercancel', () => {
    game.onTapEnd();
  });
  canvas.addEventListener('pointerleave', () => {
    game.onTapEnd();
  });

  attachLongPress(canvas, (event) => {
    const playerId = game.onLongPress(event.clientX, event.clientY);
    if (playerId) {
      damagePanel.open(playerId);
    }
  });

  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    game.update(dt);
    game.render(ctx, window.innerWidth, window.innerHeight);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

new SetupScreen({
  root: document.body,
  onStart: startGame,
}).show();
