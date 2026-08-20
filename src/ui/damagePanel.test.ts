import { describe, expect, it, vi } from 'vitest';
import { attachTapAndLongPress, type TapGestureHandlers } from './damagePanel';

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

  dispatch(type: string, event: Partial<PointerEvent>): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as PointerEvent);
    }
  }
}

function press(clientX = 0, clientY = 0): Partial<PointerEvent> {
  return { clientX, clientY };
}

function attach(element: FakeElement, overrides: Partial<TapGestureHandlers> = {}) {
  const handlers = {
    onPressStart: vi.fn(),
    onTap: vi.fn(),
    onLongPress: vi.fn(),
    onPressEnd: vi.fn(),
    ...overrides,
  };
  attachTapAndLongPress(element as unknown as HTMLElement, handlers);
  return handlers;
}

describe('attachTapAndLongPress', () => {
  it('brackets a short tap with onPressStart then onTap + onPressEnd, never firing onLongPress', () => {
    vi.useFakeTimers();
    const element = new FakeElement();
    const handlers = attach(element);

    element.dispatch('pointerdown', press());
    expect(handlers.onPressStart).toHaveBeenCalledTimes(1);
    expect(handlers.onTap).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    element.dispatch('pointerup', press());

    expect(handlers.onTap).toHaveBeenCalledTimes(1);
    expect(handlers.onPressEnd).toHaveBeenCalledTimes(1);
    expect(handlers.onLongPress).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('fires onLongPress after the threshold, several animation-frame-equivalent ticks after onPressStart, and suppresses onTap', () => {
    vi.useFakeTimers();
    const element = new FakeElement();
    const handlers = attach(element);

    element.dispatch('pointerdown', press());
    vi.advanceTimersByTime(500);

    expect(handlers.onLongPress).toHaveBeenCalledTimes(1);
    expect(handlers.onTap).not.toHaveBeenCalled();
    expect(handlers.onPressEnd).not.toHaveBeenCalled();

    element.dispatch('pointerup', press());
    expect(handlers.onTap).not.toHaveBeenCalled();
    expect(handlers.onPressEnd).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('calls onPressEnd but never onTap or onLongPress on pointercancel/pointerleave', () => {
    vi.useFakeTimers();
    const element = new FakeElement();
    const handlers = attach(element);

    element.dispatch('pointerdown', press());
    element.dispatch('pointercancel', press());

    expect(handlers.onTap).not.toHaveBeenCalled();
    expect(handlers.onLongPress).not.toHaveBeenCalled();
    expect(handlers.onPressEnd).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(500);
    expect(handlers.onLongPress).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('cancels the long-press timer when the pointer moves past the tolerance', () => {
    vi.useFakeTimers();
    const element = new FakeElement();
    const handlers = attach(element);

    element.dispatch('pointerdown', press(0, 0));
    element.dispatch('pointermove', press(20, 0));
    vi.advanceTimersByTime(500);
    expect(handlers.onLongPress).not.toHaveBeenCalled();

    element.dispatch('pointerup', press(20, 0));
    expect(handlers.onTap).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
