import { describe, expect, it } from 'vitest';
import { drawSpaceScene, generateSpaceScene } from './spaceScene';

describe('generateSpaceScene', () => {
  it('is deterministic for a given size', () => {
    expect(generateSpaceScene(400, 800)).toEqual(generateSpaceScene(400, 800));
  });

  it('produces a different layout for a different size', () => {
    const a = generateSpaceScene(400, 800);
    const b = generateSpaceScene(400, 801);
    expect(a).not.toEqual(b);
  });

  it('keeps every star near the requested bounds (within one grid cell)', () => {
    const { stars } = generateSpaceScene(120, 90);
    for (const star of stars) {
      expect(star.x).toBeGreaterThanOrEqual(-40);
      expect(star.x).toBeLessThanOrEqual(160);
      expect(star.y).toBeGreaterThanOrEqual(-40);
      expect(star.y).toBeLessThanOrEqual(130);
    }
  });

  it('produces at least one star and a fixed set of nebula clouds for a board-sized canvas', () => {
    const { stars, clouds } = generateSpaceScene(400, 800);
    expect(stars.length).toBeGreaterThan(0);
    expect(clouds.length).toBeGreaterThan(0);
  });

  it('scales star count with canvas area, for every board theme size', () => {
    const small = generateSpaceScene(200, 400);
    const large = generateSpaceScene(400, 800);
    expect(large.stars.length).toBeGreaterThan(small.stars.length);
  });
});

describe('drawSpaceScene', () => {
  /** Records draw calls/fillStyle assignments, standing in for CanvasRenderingContext2D like game.test.ts's mocks. */
  function createRecordingCtx(): {
    ctx: CanvasRenderingContext2D;
    fillStyles: unknown[];
    arcCalls: Array<{ x: number; y: number; radius: number }>;
    gradientColorStops: Array<[number, string]>[];
  } {
    const state: Record<string, unknown> = {};
    const fillStyles: unknown[] = [];
    const arcCalls: Array<{ x: number; y: number; radius: number }> = [];
    const gradientColorStops: Array<[number, string]>[] = [];
    const ctx = new Proxy(state, {
      get(target, prop: string) {
        if (prop === 'arc') {
          return (x: number, y: number, radius: number) => arcCalls.push({ x, y, radius });
        }
        if (prop === 'createRadialGradient') {
          return () => {
            const stops: Array<[number, string]> = [];
            gradientColorStops.push(stops);
            return { addColorStop: (offset: number, color: string) => stops.push([offset, color]) };
          };
        }
        if (prop in target) {
          return target[prop];
        }
        return () => {};
      },
      set(target, prop: string, value) {
        target[prop] = value;
        if (prop === 'fillStyle') {
          fillStyles.push(value);
        }
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, fillStyles, arcCalls, gradientColorStops };
  }

  it('draws one radial gradient per nebula cloud, then one arc per star', () => {
    const scene = generateSpaceScene(400, 800);
    const { ctx, arcCalls, gradientColorStops } = createRecordingCtx();

    drawSpaceScene(ctx, scene, '#121016', 0);

    expect(gradientColorStops.length).toBe(scene.clouds.length);
    // One arc per cloud (the blob itself) plus one arc per star.
    expect(arcCalls.length).toBe(scene.clouds.length + scene.stars.length);
  });

  it('keeps nebula gradients subtle (low alpha) so they cannot reduce life/name legibility', () => {
    const scene = generateSpaceScene(200, 400);
    const { ctx, gradientColorStops } = createRecordingCtx();

    drawSpaceScene(ctx, scene, '#0f2417', 0);

    for (const stops of gradientColorStops) {
      for (const [, color] of stops) {
        const alpha = Number(color.match(/,\s*([\d.]+)\)$/)?.[1]);
        expect(alpha).toBeLessThanOrEqual(0.2);
      }
    }
  });

  it('tints nebula clouds relative to the active theme color, differently for each theme', () => {
    const scene = generateSpaceScene(200, 400);
    const a = createRecordingCtx();
    const b = createRecordingCtx();

    drawSpaceScene(a.ctx, scene, '#121016', 0); // midnight
    drawSpaceScene(b.ctx, scene, '#2a0f14', 0); // crimson

    expect(a.gradientColorStops).not.toEqual(b.gradientColorStops);
  });

  it('animates star alpha (twinkle) over time rather than rendering a static frame', () => {
    const scene = generateSpaceScene(200, 400);
    const a = createRecordingCtx();
    const b = createRecordingCtx();

    drawSpaceScene(a.ctx, scene, '#121016', 0);
    drawSpaceScene(b.ctx, scene, '#121016', 5);

    expect(a.fillStyles).not.toEqual(b.fillStyles);
  });

  it('animates star position (drift) over time rather than rendering a static frame', () => {
    const scene = generateSpaceScene(200, 400);
    const a = createRecordingCtx();
    const b = createRecordingCtx();

    drawSpaceScene(a.ctx, scene, '#121016', 0);
    drawSpaceScene(b.ctx, scene, '#121016', 5);

    expect(a.arcCalls).not.toEqual(b.arcCalls);
  });
});
