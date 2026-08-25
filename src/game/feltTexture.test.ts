import { describe, expect, it } from 'vitest';
import { drawFeltTexture, generateFeltTexture } from './feltTexture';

describe('generateFeltTexture', () => {
  it('is deterministic for a given size', () => {
    expect(generateFeltTexture(400, 800)).toEqual(generateFeltTexture(400, 800));
  });

  it('produces a different layout for a different size', () => {
    const a = generateFeltTexture(400, 800);
    const b = generateFeltTexture(400, 801);
    expect(a).not.toEqual(b);
  });

  it('keeps every fiber endpoint near the requested bounds (within one grid cell)', () => {
    const { lightFibers, darkFibers } = generateFeltTexture(120, 90);
    for (const fiber of [...lightFibers, ...darkFibers]) {
      expect(fiber.x1).toBeGreaterThanOrEqual(-30);
      expect(fiber.x2).toBeLessThanOrEqual(150);
      expect(fiber.y1).toBeGreaterThanOrEqual(-30);
      expect(fiber.y2).toBeLessThanOrEqual(120);
    }
  });

  it('produces at least one fiber in each bucket for a board-sized canvas', () => {
    const { lightFibers, darkFibers } = generateFeltTexture(400, 800);
    expect(lightFibers.length).toBeGreaterThan(0);
    expect(darkFibers.length).toBeGreaterThan(0);
  });

  it('scales fiber count with canvas area, for every board theme size', () => {
    const small = generateFeltTexture(200, 400);
    const large = generateFeltTexture(400, 800);
    const count = (t: ReturnType<typeof generateFeltTexture>) => t.lightFibers.length + t.darkFibers.length;
    expect(count(large)).toBeGreaterThan(count(small));
  });
});

describe('drawFeltTexture', () => {
  /** Records every strokeStyle assignment and stroke() call count, standing in for CanvasRenderingContext2D like game.test.ts's mocks. */
  function createRecordingCtx(): { ctx: CanvasRenderingContext2D; strokeStyles: unknown[]; strokeCalls: { count: number } } {
    const state: Record<string, unknown> = {};
    const strokeStyles: unknown[] = [];
    const strokeCalls = { count: 0 };
    const ctx = new Proxy(state, {
      get(target, prop: string) {
        if (prop === 'stroke') {
          return () => {
            strokeCalls.count += 1;
          };
        }
        if (prop in target) {
          return target[prop];
        }
        return () => {};
      },
      set(target, prop: string, value) {
        target[prop] = value;
        if (prop === 'strokeStyle') {
          strokeStyles.push(value);
        }
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, strokeStyles, strokeCalls };
  }

  it('batches each fiber bucket into exactly one stroke() call, regardless of fiber count', () => {
    const { ctx, strokeCalls } = createRecordingCtx();
    const texture = generateFeltTexture(400, 800);

    drawFeltTexture(ctx, texture, '#121016');

    expect(strokeCalls.count).toBe(2);
  });

  it('tints fibers lighter/darker relative to the given base color, staying subtle (low alpha)', () => {
    const { ctx, strokeStyles } = createRecordingCtx();
    const texture = generateFeltTexture(200, 400);

    drawFeltTexture(ctx, texture, '#0f2417');

    expect(strokeStyles).toHaveLength(2);
    strokeStyles.forEach((style) => {
      expect(style).toMatch(/^rgba\(\d+, \d+, \d+, 0\.\d+\)$/);
      const alpha = Number((style as string).match(/,\s*([\d.]+)\)$/)?.[1]);
      expect(alpha).toBeLessThanOrEqual(0.1);
    });
  });

  it('produces a different tint for each board theme background color', () => {
    const { ctx: ctxA, strokeStyles: stylesA } = createRecordingCtx();
    const { ctx: ctxB, strokeStyles: stylesB } = createRecordingCtx();
    const texture = generateFeltTexture(200, 400);

    drawFeltTexture(ctxA, texture, '#121016'); // midnight
    drawFeltTexture(ctxB, texture, '#2a0f14'); // crimson

    expect(stylesA).not.toEqual(stylesB);
  });
});
