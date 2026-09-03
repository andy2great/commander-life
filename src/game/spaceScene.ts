// Cosmic board background (issue #222/R20): replaces the flat felt-fiber
// grain previously required by R13 (`feltTexture.ts`, #203) with an
// animated, code-drawn deep-space scene beneath the player zones — a
// starfield (stars of varying size/brightness that twinkle and drift) plus
// soft nebula-colored gradient clouds, evoking the Outer Wilds look
// stakeholders asked for, using canvas drawing code only (no external
// image/texture assets) per CLAUDE.md.
//
// Like the felt grain before it, star/cloud layout only depends on the
// board's width/height, so game.ts caches one `SpaceScene` per canvas size
// and reuses it across frames instead of recomputing positions every
// render() call; only the per-frame twinkle/drift math (driven by the
// game's existing `animTime` accumulator) changes frame to frame.

/** One star in the field. Position/size/phase are fixed; only the animated alpha/offset change per frame. */
export interface Star {
  x: number;
  y: number;
  radius: number;
  baseAlpha: number;
  twinkleSpeedRadS: number;
  twinklePhase: number;
  driftSpeedRadS: number;
  driftPhase: number;
  driftAmplitudePx: number;
}

/** One soft nebula gradient blob. `hueOffsetDeg` is fixed per cloud so drawSpaceScene can rotate it relative to the active theme's own hue. */
export interface NebulaCloud {
  x: number;
  y: number;
  radius: number;
  hueOffsetDeg: number;
}

export interface SpaceScene {
  stars: Star[];
  clouds: NebulaCloud[];
}

// Deterministic PRNG (mulberry32), same approach `feltTexture.ts` used, so a
// given width/height always produces the same scene layout, keeping
// generateSpaceScene pure/testable and letting game.ts safely reuse a cached
// scene across frames.
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Spacing between stars, in the same px units render() receives (CSS px —
// main.ts applies the devicePixelRatio scale via ctx.setTransform before
// calling render(), see main.ts's resize()). Tuned so a typical phone-sized
// board gets a few hundred stars — enough to read as a dense field without
// costing enough individual arc()/fill() calls to risk a frame-rate drop on
// a mid-range phone.
const STAR_CELL_PX = 34;
const STAR_MIN_RADIUS_PX = 0.4;
const STAR_MAX_RADIUS_PX = 1.6;

// Small enough that even a star at max drift amplitude never travels far
// enough to visibly pop between frames; sinusoidal (not linear+wrap) drift
// so positions stay bounded without ever needing to wrap around the canvas.
const STAR_DRIFT_MAX_PX = 3;

// Hue offsets (degrees) rotated from the active theme's own base hue, spread
// around the wheel so clouds read as distinct color blobs while all staying
// analogous/complementary to that theme — never an arbitrary fixed palette
// that would look identical regardless of theme.
const NEBULA_HUE_OFFSETS_DEG = [-55, -15, 30, 70];

/** Generates a space scene sized for a `width` x `height` board (see module docs). Pure/deterministic for a given size. */
export function generateSpaceScene(width: number, height: number): SpaceScene {
  const rand = mulberry32(Math.round(width) * 374761393 + Math.round(height) * 668265263);

  const stars: Star[] = [];
  for (let gy = 0; gy < height; gy += STAR_CELL_PX) {
    for (let gx = 0; gx < width; gx += STAR_CELL_PX) {
      stars.push({
        x: gx + rand() * STAR_CELL_PX,
        y: gy + rand() * STAR_CELL_PX,
        radius: STAR_MIN_RADIUS_PX + rand() * (STAR_MAX_RADIUS_PX - STAR_MIN_RADIUS_PX),
        baseAlpha: 0.3 + rand() * 0.7,
        twinkleSpeedRadS: 0.5 + rand() * 1.5,
        twinklePhase: rand() * Math.PI * 2,
        driftSpeedRadS: 0.15 + rand() * 0.35,
        driftPhase: rand() * Math.PI * 2,
        driftAmplitudePx: rand() * STAR_DRIFT_MAX_PX,
      });
    }
  }

  const clouds: NebulaCloud[] = NEBULA_HUE_OFFSETS_DEG.map((hueOffsetDeg) => ({
    x: rand() * width,
    y: rand() * height,
    radius: Math.min(width, height) * (0.35 + rand() * 0.35),
    hueOffsetDeg,
  }));

  return { stars, clouds };
}

function hexToHsl(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.substring(0, 2), 16) / 255;
  const g = parseInt(normalized.substring(2, 4), 16) / 255;
  const b = parseInt(normalized.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) {
    return [0, 0, l * 100];
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      break;
    case g:
      h = ((b - r) / d + 2) * 60;
      break;
    default:
      h = ((r - g) / d + 4) * 60;
  }
  return [h, s * 100, l * 100];
}

// Kept low enough that even at a cloud's own core the nebula tint never
// competes with the zones' own opaque fills or the life-total/name text
// drawn on top of them (acceptance criteria) — clouds only show through the
// same thin gutter the felt grain used to.
const NEBULA_CORE_ALPHA = 0.16;

/**
 * Draws the cached space scene: nebula clouds first (soft radial gradients,
 * hue-rotated from the active theme's own background color so the palette
 * stays harmonious with every BOARD_THEMES entry), then the starfield on
 * top, each star's alpha/offset animated from `animTimeS` (the game's
 * existing elapsed-seconds accumulator) so the scene twinkles and drifts
 * rather than sitting as a static frame.
 */
export function drawSpaceScene(ctx: CanvasRenderingContext2D, scene: SpaceScene, baseColor: string, animTimeS: number): void {
  const [baseHue] = hexToHsl(baseColor);
  ctx.save();

  for (const cloud of scene.clouds) {
    const hue = (baseHue + cloud.hueOffsetDeg + 360) % 360;
    const gradient = ctx.createRadialGradient(cloud.x, cloud.y, 0, cloud.x, cloud.y, cloud.radius);
    gradient.addColorStop(0, `hsla(${hue}, 65%, 46%, ${NEBULA_CORE_ALPHA})`);
    gradient.addColorStop(0.6, `hsla(${hue}, 60%, 40%, ${NEBULA_CORE_ALPHA * 0.4})`);
    gradient.addColorStop(1, `hsla(${hue}, 60%, 40%, 0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cloud.x, cloud.y, cloud.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const star of scene.stars) {
    // Twinkle: alpha oscillates but never fully vanishes, so stars read as
    // shimmering rather than blinking on/off.
    const twinkle = 0.55 + 0.45 * Math.sin(animTimeS * star.twinkleSpeedRadS + star.twinklePhase);
    const alpha = star.baseAlpha * twinkle;
    // Drift: a small bounded sinusoidal wander (not linear+wrap), so stars
    // never need to teleport back across the canvas between frames.
    const dx = Math.sin(animTimeS * star.driftSpeedRadS + star.driftPhase) * star.driftAmplitudePx;
    const dy = Math.cos(animTimeS * star.driftSpeedRadS + star.driftPhase) * star.driftAmplitudePx;

    ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(star.x + dx, star.y + dy, star.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
