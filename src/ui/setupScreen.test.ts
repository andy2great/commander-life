import { describe, expect, it, vi } from 'vitest';
import { attachHoldToRepeat, HOLD_REPEAT_INITIAL_DELAY_MS, HOLD_REPEAT_INTERVAL_STEP_MS } from './holdToRepeat';
import { clampPlayerCount, clampStartingLife, MAX_STARTING_LIFE, MIN_STARTING_LIFE, STARTING_LIFE_STEP } from './setupScreen';
import { MAX_PLAYER_COUNT, MIN_PLAYER_COUNT } from '../game';

// Same minimal addEventListener/removeEventListener stand-in holdToRepeat.test.ts
// uses, so the setup hub steppers' hold-to-repeat wiring (issue #232) can be
// unit-tested without a DOM (vitest here runs with environment: 'node').
class FakeElement {
  private readonly listeners = new Map<string, Set<(event: PointerEvent) => void>>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener as (event: PointerEvent) => void);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.get(type)?.delete(listener as (event: PointerEvent) => void);
  }

  dispatch(type: string, event: Partial<PointerEvent> = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ stopPropagation: () => {}, ...event } as PointerEvent);
    }
  }
}

/** Mirrors buildHubStepper's applyStep: mutate via the clamp fn, then re-read the clamped value. */
function makeStepper(clamp: (next: number) => number, step: number, initial: number) {
  let value = clamp(initial);
  const apply = (delta: 1 | -1): void => {
    value = clamp(value + delta * step);
  };
  return { apply, get value() { return value; } };
}

describe('setup hub Players stepper hold-to-repeat wiring (issue #232)', () => {
  it('a single tap applies exactly one increment, without waiting for the repeat delay', () => {
    vi.useFakeTimers();
    const stepper = makeStepper(clampPlayerCount, 1, 4);
    const button = new FakeElement();
    attachHoldToRepeat(button as unknown as HTMLElement, () => stepper.apply(1));

    button.dispatch('pointerdown');
    expect(stepper.value).toBe(5);

    button.dispatch('pointerup');
    vi.advanceTimersByTime(5000);
    expect(stepper.value).toBe(5);
    vi.useRealTimers();
  });

  it('going from the default 4 players to 8 takes one press-and-hold, not four separate taps', () => {
    vi.useFakeTimers();
    const stepper = makeStepper(clampPlayerCount, 1, 4);
    const button = new FakeElement();
    attachHoldToRepeat(button as unknown as HTMLElement, () => stepper.apply(1));

    button.dispatch('pointerdown');
    expect(stepper.value).toBe(5);

    // Accelerating repeats keep applying without any further pointerdown taps.
    let delay = HOLD_REPEAT_INITIAL_DELAY_MS;
    while (stepper.value < MAX_PLAYER_COUNT) {
      vi.advanceTimersByTime(delay);
      delay = Math.max(0, delay - HOLD_REPEAT_INTERVAL_STEP_MS);
    }

    expect(stepper.value).toBe(MAX_PLAYER_COUNT);
    expect(stepper.value).toBe(8);

    // Clamped at the max: further repeat ticks during the same hold don't overshoot.
    vi.advanceTimersByTime(2000);
    expect(stepper.value).toBe(MAX_PLAYER_COUNT);

    button.dispatch('pointerup');
    vi.useRealTimers();
  });

  it('going from 4 players down to the minimum clamps at MIN_PLAYER_COUNT', () => {
    vi.useFakeTimers();
    const stepper = makeStepper(clampPlayerCount, 1, 4);
    const button = new FakeElement();
    attachHoldToRepeat(button as unknown as HTMLElement, () => stepper.apply(-1));

    button.dispatch('pointerdown');
    vi.advanceTimersByTime(10000);
    button.dispatch('pointerup');

    expect(stepper.value).toBe(MIN_PLAYER_COUNT);
    vi.useRealTimers();
  });

  it('stops repeating immediately on pointerup, matching the attack-menu/board-shortcut steppers', () => {
    vi.useFakeTimers();
    const stepper = makeStepper(clampPlayerCount, 1, 4);
    const button = new FakeElement();
    attachHoldToRepeat(button as unknown as HTMLElement, () => stepper.apply(1));

    button.dispatch('pointerdown');
    vi.advanceTimersByTime(HOLD_REPEAT_INITIAL_DELAY_MS);
    const valueAtRelease = stepper.value;

    button.dispatch('pointerup');
    vi.advanceTimersByTime(5000);
    expect(stepper.value).toBe(valueAtRelease);
    vi.useRealTimers();
  });
});

describe('setup hub Starting life stepper hold-to-repeat wiring (issue #232)', () => {
  it('a single tap applies exactly one STARTING_LIFE_STEP increment', () => {
    vi.useFakeTimers();
    const stepper = makeStepper(clampStartingLife, STARTING_LIFE_STEP, 40);
    const button = new FakeElement();
    attachHoldToRepeat(button as unknown as HTMLElement, () => stepper.apply(1));

    button.dispatch('pointerdown');
    expect(stepper.value).toBe(45);

    button.dispatch('pointerup');
    vi.advanceTimersByTime(5000);
    expect(stepper.value).toBe(45);
    vi.useRealTimers();
  });

  it('holding the "-" button repeats in STARTING_LIFE_STEP decrements, floored at MIN_STARTING_LIFE', () => {
    vi.useFakeTimers();
    const stepper = makeStepper(clampStartingLife, STARTING_LIFE_STEP, 40);
    const button = new FakeElement();
    attachHoldToRepeat(button as unknown as HTMLElement, () => stepper.apply(-1));

    button.dispatch('pointerdown');
    vi.advanceTimersByTime(20000);
    button.dispatch('pointerup');

    expect(stepper.value).toBe(MIN_STARTING_LIFE);
    vi.useRealTimers();
  });

  it('holding the "+" button repeats in STARTING_LIFE_STEP increments, capped at MAX_STARTING_LIFE', () => {
    vi.useFakeTimers();
    const stepper = makeStepper(clampStartingLife, STARTING_LIFE_STEP, 40);
    const button = new FakeElement();
    attachHoldToRepeat(button as unknown as HTMLElement, () => stepper.apply(1));

    button.dispatch('pointerdown');
    vi.advanceTimersByTime(60000);
    button.dispatch('pointerup');

    expect(stepper.value).toBe(MAX_STARTING_LIFE);
    vi.useRealTimers();
  });
});
