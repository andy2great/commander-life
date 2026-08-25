import { describe, expect, it } from 'vitest';
import {
  createZoneEffectState,
  DAMAGE_EFFECT_COLOR,
  getZoneEffect,
  HEAL_EFFECT_COLOR,
  triggerZoneEffect,
  updateZoneEffects,
  ZONE_EFFECT_DURATION_S,
} from './zoneEffect';

describe('createZoneEffectState', () => {
  it('starts with no active zone effects', () => {
    const state = createZoneEffectState();

    expect(getZoneEffect(state, 'p1')).toBeNull();
  });
});

describe('triggerZoneEffect', () => {
  it('starts a flash for the given player, type, and color', () => {
    const state = createZoneEffectState();

    triggerZoneEffect(state, 'p1', 'damage', DAMAGE_EFFECT_COLOR, -3);

    const effect = getZoneEffect(state, 'p1');
    expect(effect).not.toBeNull();
    expect(effect?.type).toBe('damage');
    expect(effect?.color).toBe(DAMAGE_EFFECT_COLOR);
    expect(effect?.progress).toBe(0);
  });

  it('includes the signed delta in the effect payload, for rendering the floating numeral (issue #202)', () => {
    const state = createZoneEffectState();

    triggerZoneEffect(state, 'p1', 'damage', DAMAGE_EFFECT_COLOR, -3);
    triggerZoneEffect(state, 'p2', 'heal', HEAL_EFFECT_COLOR, 2);

    expect(getZoneEffect(state, 'p1')?.delta).toBe(-3);
    expect(getZoneEffect(state, 'p2')?.delta).toBe(2);
  });

  it('leaves other players unaffected', () => {
    const state = createZoneEffectState();

    triggerZoneEffect(state, 'p1', 'damage', DAMAGE_EFFECT_COLOR, -3);

    expect(getZoneEffect(state, 'p2')).toBeNull();
  });

  it('renders independently per zone when multiple players are triggered at once (issue #89)', () => {
    const state = createZoneEffectState();

    triggerZoneEffect(state, 'p1', 'damage', DAMAGE_EFFECT_COLOR, -3);
    triggerZoneEffect(state, 'p2', 'heal', HEAL_EFFECT_COLOR, 2);

    expect(getZoneEffect(state, 'p1')?.type).toBe('damage');
    expect(getZoneEffect(state, 'p2')?.type).toBe('heal');
  });

  it('restarts the fade when triggered again before it expires', () => {
    const state = createZoneEffectState();
    triggerZoneEffect(state, 'p1', 'damage', DAMAGE_EFFECT_COLOR, -3);
    updateZoneEffects(state, ZONE_EFFECT_DURATION_S / 2);

    triggerZoneEffect(state, 'p1', 'heal', HEAL_EFFECT_COLOR, 2);

    const effect = getZoneEffect(state, 'p1');
    expect(effect?.type).toBe('heal');
    expect(effect?.progress).toBe(0);
  });
});

describe('updateZoneEffects', () => {
  it('advances progress toward 1 over time', () => {
    const state = createZoneEffectState();
    triggerZoneEffect(state, 'p1', 'damage', DAMAGE_EFFECT_COLOR, -3);

    updateZoneEffects(state, ZONE_EFFECT_DURATION_S / 2);

    const effect = getZoneEffect(state, 'p1');
    expect(effect?.progress).toBeGreaterThan(0);
    expect(effect?.progress).toBeLessThan(1);
  });

  it('clears the effect once its duration has fully elapsed', () => {
    const state = createZoneEffectState();
    triggerZoneEffect(state, 'p1', 'damage', DAMAGE_EFFECT_COLOR, -3);

    updateZoneEffects(state, ZONE_EFFECT_DURATION_S + 1);

    expect(getZoneEffect(state, 'p1')).toBeNull();
  });

  it('ages and expires each player zone independently', () => {
    const state = createZoneEffectState();
    triggerZoneEffect(state, 'p1', 'damage', DAMAGE_EFFECT_COLOR, -3);
    updateZoneEffects(state, ZONE_EFFECT_DURATION_S / 2);
    triggerZoneEffect(state, 'p2', 'heal', HEAL_EFFECT_COLOR, 2);

    updateZoneEffects(state, ZONE_EFFECT_DURATION_S / 2 + 0.01);

    expect(getZoneEffect(state, 'p1')).toBeNull();
    expect(getZoneEffect(state, 'p2')).not.toBeNull();
  });
});

describe('getZoneEffect', () => {
  it('is deterministic for a given state, independent of any canvas rendering', () => {
    const state = createZoneEffectState();
    triggerZoneEffect(state, 'p1', 'poison', '#a855f7', 2);
    updateZoneEffects(state, 0.1);

    expect(getZoneEffect(state, 'p1')).toEqual(getZoneEffect(state, 'p1'));
  });
});
