import { describe, expect, it, vi } from 'vitest';
import { attachTapAndLongPress, LONG_PRESS_MOVE_TOLERANCE_PX, LONG_PRESS_MS, type TapGestureHandlers } from './damagePanel';
import { Game } from '../game';

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

  it('never arms the long-press timer when onPressStart returns false, so a press held past the threshold still resolves as a plain tap (issue #123)', () => {
    vi.useFakeTimers();
    const element = new FakeElement();
    const handlers = attach(element, { onPressStart: vi.fn().mockReturnValue(false) });

    element.dispatch('pointerdown', press());
    vi.advanceTimersByTime(500);
    expect(handlers.onLongPress).not.toHaveBeenCalled();

    element.dispatch('pointerup', press());
    expect(handlers.onTap).toHaveBeenCalledTimes(1);
    expect(handlers.onPressEnd).toHaveBeenCalledTimes(1);
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

  it('resolves a committed long-press against the latest pointer position, not the stale press-start position (issue #220)', () => {
    vi.useFakeTimers();
    const element = new FakeElement();
    const onLongPress = vi.fn();
    attach(element, { onLongPress });

    element.dispatch('pointerdown', press(0, 0));
    // Small drift, well within the move tolerance, so the timer stays armed.
    element.dispatch('pointermove', press(LONG_PRESS_MOVE_TOLERANCE_PX - 2, 0));
    vi.advanceTimersByTime(LONG_PRESS_MS);

    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onLongPress.mock.calls[0][0]).toMatchObject({ clientX: LONG_PRESS_MOVE_TOLERANCE_PX - 2, clientY: 0 });
    vi.useRealTimers();
  });

  it('end-to-end: wired the same way main.ts wires Game, a press starting just outside the shared undo control that drifts onto it no longer passes the turn (issue #220)', () => {
    vi.useFakeTimers();
    const game = new Game();
    game.resize(400, 800);
    // Just outside the undo control's hit-circle (radius ~31.6px around
    // (200, 400) on this 400x800 canvas), but still inside seat 0's zone —
    // the active seat.
    const startX = 165;
    const startY = 399;
    expect(game.isOverUndoControl(startX, startY)).toBe(false);
    expect(game.onLongPress(startX, startY)).toBe(game.players[0].id);

    const element = new FakeElement();
    attachTapAndLongPress(element as unknown as HTMLElement, {
      onPressStart: (event) => {
        if (game.isOverUndoControl(event.clientX, event.clientY)) {
          return false;
        }
        game.beginTurnHold(event.clientX, event.clientY);
      },
      onMove: (event) => {
        game.updateTurnHold(event.clientX, event.clientY);
      },
      onTap: () => {},
      onLongPress: (event) => {
        game.passTurnFromZoneLongPress(event.clientX, event.clientY);
      },
      onPressEnd: () => {
        game.endTurnHold();
      },
    });

    element.dispatch('pointerdown', press(startX, startY));
    // Drift onto the undo control's disc — 9px, within the 10px move
    // tolerance so the long-press timer stays armed, but now squarely over
    // the control.
    const driftedX = startX + 9;
    expect(game.isOverUndoControl(driftedX, startY)).toBe(true);
    element.dispatch('pointermove', press(driftedX, startY));
    vi.advanceTimersByTime(LONG_PRESS_MS);

    expect(game.activeIndex).toBe(0);
    vi.useRealTimers();
  });
});
