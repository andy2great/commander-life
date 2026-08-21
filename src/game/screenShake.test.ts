import { describe, expect, it } from 'vitest';
import {
  createScreenShakeState,
  DAMAGE_SHAKE_TRAUMA,
  ELIMINATION_SHAKE_TRAUMA,
  getScreenShakeOffset,
  triggerScreenShake,
  updateScreenShake,
} from './screenShake';

describe('createScreenShakeState', () => {
  it('starts with zero trauma', () => {
    expect(createScreenShakeState()).toEqual({ trauma: 0 });
  });
});

describe('triggerScreenShake', () => {
  it('raises trauma to the given intensity', () => {
    const state = createScreenShakeState();

    triggerScreenShake(state, DAMAGE_SHAKE_TRAUMA);

    expect(state.trauma).toBe(DAMAGE_SHAKE_TRAUMA);
  });

  it('never lowers trauma below what a very recent, stronger trigger already set', () => {
    const state = createScreenShakeState();
    triggerScreenShake(state, ELIMINATION_SHAKE_TRAUMA);

    triggerScreenShake(state, DAMAGE_SHAKE_TRAUMA);

    expect(state.trauma).toBe(ELIMINATION_SHAKE_TRAUMA);
  });

  it('raises trauma again once a later, stronger trigger arrives', () => {
    const state = createScreenShakeState();
    triggerScreenShake(state, DAMAGE_SHAKE_TRAUMA);

    triggerScreenShake(state, ELIMINATION_SHAKE_TRAUMA);

    expect(state.trauma).toBe(ELIMINATION_SHAKE_TRAUMA);
  });

  it('clamps trauma to 1 even if a caller passes a larger intensity', () => {
    const state = createScreenShakeState();

    triggerScreenShake(state, 5);

    expect(state.trauma).toBe(1);
  });
});

describe('updateScreenShake', () => {
  it('decays trauma over time', () => {
    const state = createScreenShakeState();
    triggerScreenShake(state, 1);

    updateScreenShake(state, 0.1);

    expect(state.trauma).toBeGreaterThan(0);
    expect(state.trauma).toBeLessThan(1);
  });

  it('never decays below zero', () => {
    const state = createScreenShakeState();
    triggerScreenShake(state, DAMAGE_SHAKE_TRAUMA);

    updateScreenShake(state, 10);

    expect(state.trauma).toBe(0);
  });

  it('a stronger trigger (elimination) takes longer to fully decay than a routine damage tick', () => {
    const damageState = createScreenShakeState();
    triggerScreenShake(damageState, DAMAGE_SHAKE_TRAUMA);
    const eliminationState = createScreenShakeState();
    triggerScreenShake(eliminationState, ELIMINATION_SHAKE_TRAUMA);

    updateScreenShake(damageState, 0.3);
    updateScreenShake(eliminationState, 0.3);

    expect(damageState.trauma).toBe(0);
    expect(eliminationState.trauma).toBeGreaterThan(0);
  });
});

describe('getScreenShakeOffset', () => {
  it('is zero when there is no trauma', () => {
    const state = createScreenShakeState();

    expect(getScreenShakeOffset(state, 1.23)).toEqual({ x: 0, y: 0 });
  });

  it('is non-zero once trauma is triggered', () => {
    const state = createScreenShakeState();
    triggerScreenShake(state, DAMAGE_SHAKE_TRAUMA);

    const offset = getScreenShakeOffset(state, 1.23);

    expect(offset.x !== 0 || offset.y !== 0).toBe(true);
  });

  it('is deterministic for a given state and seed, independent of any canvas rendering', () => {
    const state = createScreenShakeState();
    triggerScreenShake(state, DAMAGE_SHAKE_TRAUMA);

    expect(getScreenShakeOffset(state, 2)).toEqual(getScreenShakeOffset(state, 2));
  });

  it('a stronger trauma produces a larger offset magnitude than a routine damage tick at the same seed', () => {
    const damageState = createScreenShakeState();
    triggerScreenShake(damageState, DAMAGE_SHAKE_TRAUMA);
    const eliminationState = createScreenShakeState();
    triggerScreenShake(eliminationState, ELIMINATION_SHAKE_TRAUMA);

    const damageOffset = getScreenShakeOffset(damageState, 0.5);
    const eliminationOffset = getScreenShakeOffset(eliminationState, 0.5);

    expect(Math.hypot(eliminationOffset.x, eliminationOffset.y)).toBeGreaterThan(
      Math.hypot(damageOffset.x, damageOffset.y),
    );
  });
});
