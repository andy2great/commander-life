// Tap/long-press gesture recognizer shared by every pointer-driven control
// (zone taps/holds, zone-to-zone drags, the shared center control). Kept
// free of any specific UI component — only the canvas element itself is
// off-limits outside main.ts.
//
// The commander-damage sub-panel this file used to also host was replaced
// by the zone-to-zone drag menu (src/ui/attackMenu.ts) in issue #48.

export const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

export interface TapGestureHandlers {
  /**
   * Called synchronously on pointerdown, before tap vs long-press is known.
   * Optional: use it for effects that must bracket the whole press (e.g.
   * arming a continuous tap-and-hold ramp), paired with `onPressEnd`.
   */
  onPressStart?: (event: PointerEvent) => void;
  /** Called on pointerup when the press resolved as a short tap (the long-press timer never fired). */
  onTap: (event: PointerEvent) => void;
  /** Called after `durationMs` of a stationary pointerdown; suppresses the paired `onTap` for that press. */
  onLongPress: (event: PointerEvent) => void;
  /**
   * Called on pointerup/pointercancel/pointerleave, always — whether the
   * press resolved as a tap or a long-press. Pairs with `onPressStart`.
   */
  onPressEnd?: (event: PointerEvent) => void;
}

/**
 * Resolves each pointerdown as exactly one of a short tap or a long-press —
 * never both, unlike two independent listeners racing on the same
 * pointerdown. Returns a detach function.
 */
export function attachTapAndLongPress(
  element: HTMLElement,
  handlers: TapGestureHandlers,
  durationMs = LONG_PRESS_MS,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let startX = 0;
  let startY = 0;
  // Only ever set to true by the long-press timeout below; onPointerDown
  // resets it for every new press, so a stale true from a prior press can
  // never leak into this one.
  let longPressFired = false;

  const cancelTimer = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const onPointerDown = (event: PointerEvent): void => {
    startX = event.clientX;
    startY = event.clientY;
    longPressFired = false;
    cancelTimer();
    handlers.onPressStart?.(event);
    timer = setTimeout(() => {
      timer = undefined;
      longPressFired = true;
      handlers.onLongPress(event);
    }, durationMs);
  };

  const onPointerMove = (event: PointerEvent): void => {
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE_PX) {
      cancelTimer();
    }
  };

  const onPointerUp = (event: PointerEvent): void => {
    const wasLongPress = longPressFired;
    cancelTimer();
    longPressFired = false;
    if (!wasLongPress) {
      handlers.onTap(event);
    }
    handlers.onPressEnd?.(event);
  };

  const onPointerCancel = (event: PointerEvent): void => {
    cancelTimer();
    longPressFired = false;
    handlers.onPressEnd?.(event);
  };

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', onPointerCancel);
  element.addEventListener('pointerleave', onPointerCancel);

  return () => {
    cancelTimer();
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
    element.removeEventListener('pointercancel', onPointerCancel);
    element.removeEventListener('pointerleave', onPointerCancel);
  };
}
