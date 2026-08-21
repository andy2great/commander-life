// Hold-to-repeat acceleration for +/- stepper buttons (issue #86): a
// pointerdown always applies one immediate step (preserving prior
// single-tap behavior), and holding past HOLD_REPEAT_INITIAL_DELAY_MS keeps
// applying steps on a schedule that shrinks every tick — down to
// HOLD_REPEAT_MIN_INTERVAL_MS — so a long hold accelerates. Used by both
// AttackMenu's and BoardShortcutMenu's +/- steppers.

/** Delay after the initial tap before auto-repeat kicks in. */
export const HOLD_REPEAT_INITIAL_DELAY_MS = 400;
/** Each repeat's interval shrinks by this much from the previous one... */
export const HOLD_REPEAT_INTERVAL_STEP_MS = 40;
/** ...down to this floor, so a long hold keeps accelerating but never spins unbounded. */
export const HOLD_REPEAT_MIN_INTERVAL_MS = 60;

/**
 * Attaches a hold-to-repeat gesture to `element`: pointerdown calls
 * `onRepeat()` once immediately (so a quick tap applies exactly one step),
 * then keeps calling it on an accelerating schedule until
 * pointerup/pointercancel/pointerleave. Returns a detach function.
 */
export function attachHoldToRepeat(element: HTMLElement, onRepeat: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancelTimer = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const scheduleNext = (delayMs: number): void => {
    timer = setTimeout(() => {
      onRepeat();
      scheduleNext(Math.max(HOLD_REPEAT_MIN_INTERVAL_MS, delayMs - HOLD_REPEAT_INTERVAL_STEP_MS));
    }, delayMs);
  };

  const onPointerDown = (event: PointerEvent): void => {
    event.stopPropagation();
    cancelTimer();
    onRepeat();
    scheduleNext(HOLD_REPEAT_INITIAL_DELAY_MS);
  };

  const onPressEnd = (): void => {
    cancelTimer();
  };

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointerup', onPressEnd);
  element.addEventListener('pointercancel', onPressEnd);
  element.addEventListener('pointerleave', onPressEnd);

  return () => {
    cancelTimer();
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointerup', onPressEnd);
    element.removeEventListener('pointercancel', onPressEnd);
    element.removeEventListener('pointerleave', onPressEnd);
  };
}
