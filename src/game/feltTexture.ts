// Felt background texture (issue #203/R13): the board's base fill
// (boardBackgroundColor in game.ts) is a plain flat color with no texture,
// noise, or weave, so it reads as a flat computer-generated surface rather
// than the felt-table look the "Foil & Felt" identity intends
// (docs/design/visual-identity.md). This module generates a sparse grid of
// short, randomly angled "fiber" strokes that read as fine fabric grain when
// layered under the zones' own opaque fills, using canvas drawing code only
// (no external image/texture assets) per CLAUDE.md.
//
// The fiber layout only depends on the board's width/height, so game.ts
// caches one `FeltTexture` per canvas size and reuses it across frames
// instead of recomputing fiber positions every render() call. Each frame
// then costs exactly two stroke() calls (one per light/dark bucket) no
// matter how many fibers exist, keeping the per-frame draw cost independent
// of canvas size/fiber count.

/** One short line segment making up the felt grain. */
export interface FeltFiber {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A pre-generated felt fiber layout for a given board size, split into two buckets so drawFeltTexture can batch each into a single stroked path. */
export interface FeltTexture {
  lightFibers: FeltFiber[];
  darkFibers: FeltFiber[];
}

// Spacing between fibers and their length, in the same px units render()
// receives (CSS px — main.ts applies the devicePixelRatio scale via
// ctx.setTransform before calling render(), see main.ts's resize()). Tuned
// so the grain reads as fine fabric texture rather than a visible dot grid,
// while staying sparse enough for two batched stroke() calls to stay cheap.
const FELT_CELL_PX = 20;
const FELT_FIBER_LENGTH_PX = 5;

// Deterministic PRNG (mulberry32) so a given width/height always produces
// the same fiber layout, keeping generateFeltTexture pure/testable and
// letting game.ts safely reuse a cached texture across frames.
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generates a felt fiber grain sized for a `width` x `height` board (see module docs). Pure/deterministic for a given size. */
export function generateFeltTexture(width: number, height: number): FeltTexture {
  const rand = mulberry32(Math.round(width) * 374761393 + Math.round(height) * 668265263);
  const lightFibers: FeltFiber[] = [];
  const darkFibers: FeltFiber[] = [];

  for (let gy = 0; gy < height; gy += FELT_CELL_PX) {
    for (let gx = 0; gx < width; gx += FELT_CELL_PX) {
      const cx = gx + rand() * FELT_CELL_PX;
      const cy = gy + rand() * FELT_CELL_PX;
      const angle = rand() * Math.PI;
      const len = FELT_FIBER_LENGTH_PX * (0.6 + rand() * 0.8);
      const dx = (Math.cos(angle) * len) / 2;
      const dy = (Math.sin(angle) * len) / 2;
      const fiber: FeltFiber = { x1: cx - dx, y1: cy - dy, x2: cx + dx, y2: cy + dy };
      (rand() < 0.5 ? lightFibers : darkFibers).push(fiber);
    }
  }

  return { lightFibers, darkFibers };
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  return [
    parseInt(normalized.substring(0, 2), 16),
    parseInt(normalized.substring(2, 4), 16),
    parseInt(normalized.substring(4, 6), 16),
  ];
}

// Kept low enough that the grain never competes with the zones' own opaque
// fills (which cover all but the thin gutter/edge where this shows through)
// or the life-total/name text drawn on top of them (acceptance criteria).
const FELT_FIBER_ALPHA = 0.05;

/**
 * Draws a pre-generated felt fiber grain over the board's base fill. Tints
 * each fiber bucket lighter/darker relative to `baseColor` (the active
 * BOARD_THEMES entry's own backgroundColor) rather than a fixed hue, so the
 * grain reads correctly against every theme. Batches each bucket into one
 * beginPath/stroke pair, so this costs exactly two draw calls regardless of
 * fiber count.
 */
export function drawFeltTexture(ctx: CanvasRenderingContext2D, texture: FeltTexture, baseColor: string): void {
  const [r, g, b] = hexToRgb(baseColor);
  ctx.save();
  ctx.lineWidth = 1;

  ctx.strokeStyle = `rgba(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)}, ${FELT_FIBER_ALPHA})`;
  ctx.beginPath();
  for (const fiber of texture.lightFibers) {
    ctx.moveTo(fiber.x1, fiber.y1);
    ctx.lineTo(fiber.x2, fiber.y2);
  }
  ctx.stroke();

  ctx.strokeStyle = `rgba(${Math.max(0, r - 30)}, ${Math.max(0, g - 30)}, ${Math.max(0, b - 30)}, ${FELT_FIBER_ALPHA})`;
  ctx.beginPath();
  for (const fiber of texture.darkFibers) {
    ctx.moveTo(fiber.x1, fiber.y1);
    ctx.lineTo(fiber.x2, fiber.y2);
  }
  ctx.stroke();

  ctx.restore();
}
