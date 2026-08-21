import { describe, expect, it } from 'vitest';
import { triggerZoneEffect, updateZoneEffects, ZONE_EFFECT_DURATION_S, type ZoneEffectState } from './zoneEffect';

describe('triggerZoneEffect', () => {
  it('starts a zero-elapsed effect of the given type on the player', () => {
    const state: ZoneEffectState = {};

    triggerZoneEffect(state, 'p1', 'damage');

    expect(state.p1).toEqual({ type: 'damage', elapsed: 0 });
  });

  it('restarts the effect from zero if one is already animating on that zone', () => {
    const state: ZoneEffectState = {};

    triggerZoneEffect(state, 'p1', 'damage');
    updateZoneEffects(state, ZONE_EFFECT_DURATION_S / 2);
    triggerZoneEffect(state, 'p1', 'heal');

    expect(state.p1).toEqual({ type: 'heal', elapsed: 0 });
  });

  it('tracks effects on multiple zones independently', () => {
    const state: ZoneEffectState = {};

    triggerZoneEffect(state, 'p1', 'damage');
    triggerZoneEffect(state, 'p2', 'poison');
    triggerZoneEffect(state, 'p3', 'heal');

    expect(state).toEqual({
      p1: { type: 'damage', elapsed: 0 },
      p2: { type: 'poison', elapsed: 0 },
      p3: { type: 'heal', elapsed: 0 },
    });
  });
});

describe('updateZoneEffects', () => {
  it('advances elapsed time for an active effect', () => {
    const state: ZoneEffectState = {};
    triggerZoneEffect(state, 'p1', 'damage');

    updateZoneEffects(state, 0.1);

    expect(state.p1?.elapsed).toBeCloseTo(0.1);
  });

  it('removes an effect once it reaches its duration', () => {
    const state: ZoneEffectState = {};
    triggerZoneEffect(state, 'p1', 'damage');

    updateZoneEffects(state, ZONE_EFFECT_DURATION_S);

    expect(state.p1).toBeUndefined();
  });

  it('removes an effect that overshoots its duration in a single tick', () => {
    const state: ZoneEffectState = {};
    triggerZoneEffect(state, 'p1', 'damage');

    updateZoneEffects(state, ZONE_EFFECT_DURATION_S + 1);

    expect(state.p1).toBeUndefined();
  });

  it('updates and expires effects on multiple zones independently, without dropping any', () => {
    const state: ZoneEffectState = {};
    triggerZoneEffect(state, 'p1', 'damage');
    triggerZoneEffect(state, 'p2', 'heal');

    updateZoneEffects(state, ZONE_EFFECT_DURATION_S / 2);
    expect(state.p1).toBeDefined();
    expect(state.p2).toBeDefined();

    triggerZoneEffect(state, 'p3', 'poison');
    updateZoneEffects(state, ZONE_EFFECT_DURATION_S / 2);

    expect(state.p1).toBeUndefined();
    expect(state.p2).toBeUndefined();
    expect(state.p3).toBeDefined();
    expect(state.p3?.elapsed).toBeCloseTo(ZONE_EFFECT_DURATION_S / 2);
  });

  it('is a no-op on an empty state', () => {
    const state: ZoneEffectState = {};

    expect(() => updateZoneEffects(state, 0.5)).not.toThrow();
    expect(state).toEqual({});
  });
});
