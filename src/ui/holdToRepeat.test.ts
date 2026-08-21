import { describe, expect, it, vi } from 'vitest';
import {
  attachHoldToRepeat,
  HOLD_REPEAT_INITIAL_DELAY_MS,
  HOLD_REPEAT_INTERVAL_STEP_MS,
  HOLD_REPEAT_MIN_INTERVAL_MS,
} from './holdToRepeat';

// Minimal addEventListener/removeEventListener stand-in so this gesture logic
// can be unit-tested without a DOM (vitest here runs with environment: 'node').
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

describe('attachHoldToRepeat', () => {
  it('applies exactly one step on a quick tap, without waiting for the repeat delay', () => {
    vi.useFakeTimers();
    const element = new FakeElement();
    const onRepeat = vi.fn();
    attachHoldToRepeat(element as unknown as HTMLElement, onRepeat);

    element.dispatch('pointerdown');
    expect(onRepeat).toHaveBeenCalledTimes(1);

    element.dispatch('pointerup');
    vi.advanceTimersByTime(5000);

    expect(onRepeat).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('keeps repeating while held, starting after the initial delay', () => {
    vi.useFakeTimers();
    const element = new FakeElement();
    const onRepeat = vi.fn();
    attachHoldToRepeat(element as unknown as HTMLElement, onRepeat);

    element.dispatch('pointerdown');
    expect(onRepeat).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(HOLD_REPEAT_INITIAL_DELAY_MS - 1);
    expect(onRepeat).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(onRepeat).toHaveBeenCalledTimes(2);

    element.dispatch('pointerup');
    vi.useRealTimers();
  });

  it('accelerates repeat intervals the longer the button is held, floored at the minimum interval', () => {
    vi.useFakeTimers();
    const element = new FakeElement();
    const onRepeat = vi.fn();
    attachHoldToRepeat(element as unknown as HTMLElement, onRepeat);

    element.dispatch('pointerdown');
    expect(onRepeat).toHaveBeenCalledTimes(1);

    // Repeat #2 fires after the initial delay.
    vi.advanceTimersByTime(HOLD_REPEAT_INITIAL_DELAY_MS);
    expect(onRepeat).toHaveBeenCalledTimes(2);

    // Repeat #3 fires sooner: the interval shrinks by the step each time.
    const secondInterval = HOLD_REPEAT_INITIAL_DELAY_MS - HOLD_REPEAT_INTERVAL_STEP_MS;
    vi.advanceTimersByTime(secondInterval - 1);
    expect(onRepeat).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(onRepeat).toHaveBeenCalledTimes(3);

    // Advancing well past the point where the interval would go below the
    // floor lands us in a steady state where every repeat is exactly
    // HOLD_REPEAT_MIN_INTERVAL_MS apart, never faster.
    vi.advanceTimersByTime(5000);
    onRepeat.mockClear();

    vi.advanceTimersByTime(HOLD_REPEAT_MIN_INTERVAL_MS - 1);
    expect(onRepeat).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onRepeat).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(HOLD_REPEAT_MIN_INTERVAL_MS - 1);
    expect(onRepeat).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(onRepeat).toHaveBeenCalledTimes(2);

    element.dispatch('pointerup');
    vi.useRealTimers();
  });

  it('stops repeating immediately on pointerup', () => {
    vi.useFakeTimers();
    const element = new FakeElement();
    const onRepeat = vi.fn();
    attachHoldToRepeat(element as unknown as HTMLElement, onRepeat);

    element.dispatch('pointerdown');
    vi.advanceTimersByTime(HOLD_REPEAT_INITIAL_DELAY_MS);
    expect(onRepeat).toHaveBeenCalledTimes(2);

    element.dispatch('pointerup');
    vi.advanceTimersByTime(5000);
    expect(onRepeat).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('stops repeating immediately on pointercancel', () => {
    vi.useFakeTimers();
    const element = new FakeElement();
    const onRepeat = vi.fn();
    attachHoldToRepeat(element as unknown as HTMLElement, onRepeat);

    element.dispatch('pointerdown');
    element.dispatch('pointercancel');
    vi.advanceTimersByTime(5000);
    expect(onRepeat).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('stops repeating immediately on pointerleave', () => {
    vi.useFakeTimers();
    const element = new FakeElement();
    const onRepeat = vi.fn();
    attachHoldToRepeat(element as unknown as HTMLElement, onRepeat);

    element.dispatch('pointerdown');
    element.dispatch('pointerleave');
    vi.advanceTimersByTime(5000);
    expect(onRepeat).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('applies exactly one step and does not schedule a repeat when precision mode is active', () => {
    vi.useFakeTimers();
    const element = new FakeElement();
    const onRepeat = vi.fn();
    attachHoldToRepeat(element as unknown as HTMLElement, onRepeat, () => true);

    element.dispatch('pointerdown');
    expect(onRepeat).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(HOLD_REPEAT_INITIAL_DELAY_MS);
    expect(onRepeat).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5000);
    expect(onRepeat).toHaveBeenCalledTimes(1);

    element.dispatch('pointerup');
    vi.useRealTimers();
  });

  it('re-checks precision mode on every pointerdown, so toggling it between presses works', () => {
    vi.useFakeTimers();
    const element = new FakeElement();
    const onRepeat = vi.fn();
    let precision = false;
    attachHoldToRepeat(element as unknown as HTMLElement, onRepeat, () => precision);

    element.dispatch('pointerdown');
    vi.advanceTimersByTime(HOLD_REPEAT_INITIAL_DELAY_MS);
    expect(onRepeat).toHaveBeenCalledTimes(2);
    element.dispatch('pointerup');

    precision = true;
    onRepeat.mockClear();
    element.dispatch('pointerdown');
    vi.advanceTimersByTime(HOLD_REPEAT_INITIAL_DELAY_MS);
    expect(onRepeat).toHaveBeenCalledTimes(1);
    element.dispatch('pointerup');

    vi.useRealTimers();
  });

  it('detaching stops any in-flight repeat and removes listeners', () => {
    vi.useFakeTimers();
    const element = new FakeElement();
    const onRepeat = vi.fn();
    const detach = attachHoldToRepeat(element as unknown as HTMLElement, onRepeat);

    element.dispatch('pointerdown');
    detach();
    vi.advanceTimersByTime(5000);
    expect(onRepeat).toHaveBeenCalledTimes(1);

    element.dispatch('pointerdown');
    expect(onRepeat).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
