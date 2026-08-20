import { computeOverlaySafeArea, Game, type GameConfig } from './game';
import { attachTapAndLongPress } from './ui/damagePanel';
import { AttackMenu } from './ui/attackMenu';
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

  const game = new Game(config, sound);
  const attackMenu = new AttackMenu({
    root: document.body,
    players: game.players,
    damageState: game.damageState,
    poisonState: game.poisonState,
    undoStack: game.undoStack,
    sound,
  });

  canvas.style.display = 'block';

  const isOverAnyControl = (event: PointerEvent): boolean =>
    game.isOverControl(event.clientX, event.clientY) ||
    game.isOverUndoControl(event.clientX, event.clientY) ||
    game.isOverEndControl(event.clientX, event.clientY);

  // Tracks where the current press started so onTap (pointerup) can tell a
  // plain tap from a zone-to-zone drag: released in the same zone (or a
  // control) it's a tap, released in a different zone it's a drag-attack.
  let pressStart: { x: number; y: number } | null = null;

  const detachGesture = attachTapAndLongPress(canvas, {
    onPressStart: (event) => {
      // Zone taps apply on pointerdown so a held press can ramp across
      // animation frames; a drag or long-press reverts this via
      // cancelTap(). Control taps stay deferred to onTap (pointerup) since
      // they never ramp, which also keeps a long-press from passing the
      // turn early.
      if (isOverAnyControl(event)) {
        pressStart = null;
        return;
      }
      pressStart = { x: event.clientX, y: event.clientY };
      game.onTap(event.clientX, event.clientY);
    },
    onTap: (event) => {
      if (isOverAnyControl(event)) {
        game.onTap(event.clientX, event.clientY);
        return;
      }
      if (!pressStart) {
        return;
      }
      const drag = game.resolveZoneDrag(pressStart.x, pressStart.y, event.clientX, event.clientY);
      if (drag) {
        game.cancelTap();
        attackMenu.open(drag.fromPlayerId, drag.toPlayerId);
      }
    },
    onLongPress: (event) => {
      if (game.isOverControl(event.clientX, event.clientY)) {
        game.passTurn();
      }
      // Zone long-presses now just continue the tap-and-hold ramp already
      // armed by onPressStart — commander-damage/poison assignment moved to
      // the zone-to-zone drag gesture handled by onTap above.
    },
    onPressEnd: () => {
      game.onTapEnd();
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
