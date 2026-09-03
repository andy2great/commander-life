// Tap/long-press gesture recognizer shared by every pointer-driven control
// (zone taps/holds, zone-to-zone drags, the shared center control). Kept
// free of any specific UI component — only the canvas element itself is
// off-limits outside main.ts.
//
// The commander-damage sub-panel this file used to also host was replaced
// by the zone-to-zone drag menu (src/ui/attackMenu.ts) in issue #48.

export const LONG_PRESS_MS = 500;
/** Also reused by Game.resolveZoneDrag (issue #70) to tell a same-zone tap from a same-zone self-target drag. */
export const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
/**
 * How long, after a turn-hold arms at LONG_PRESS_MS, the player has to
 * release and commit the turn pass before the hold resets to idle (issue
 * #229) — long enough to lift a finger deliberately, short enough that
 * resting a finger on your own zone while deciding what to do next won't
 * land inside it by accident.
 */
export const TURN_HOLD_CONFIRM_WINDOW_MS = 300;

export interface TapGestureHandlers {
  /**
   * Called synchronously on pointerdown, before tap vs long-press is known.
   * Optional: use it for effects that must bracket the whole press (e.g.
   * arming a continuous tap-and-hold ramp), paired with `onPressEnd`. Return
   * `false` to skip arming the long-press timer for this press (e.g. a press
   * starting on a tap-only shared control, per issue #123) — otherwise a
   * press held past `durationMs` resolves as a long-press and its `onTap` on
   * release is suppressed, even over a target with no long-press behavior.
   */
  onPressStart?: (event: PointerEvent) => void | boolean;
  /** Called on pointerup when the press resolved as a short tap (the long-press timer never fired). */
  onTap: (event: PointerEvent) => void;
  /** Called after `durationMs` of a stationary pointerdown; suppresses the paired `onTap` for that press. */
  onLongPress: (event: PointerEvent) => void;
  /**
   * Called on pointerup/pointercancel/pointerleave, always — whether the
   * press resolved as a tap or a long-press. Pairs with `onPressStart`.
   */
  onPressEnd?: (event: PointerEvent) => void;
  /** Called on every pointermove during a press (e.g. to update a live zone-to-zone drag arrow, issue #55). */
  onMove?: (event: PointerEvent) => void;
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
  // The most recently seen pointer event for the in-progress press, kept
  // fresh by onPointerMove. The long-press timeout below fires asynchronously,
  // well after the original pointerdown — resolving it against that stale
  // event let a press that starts just outside a control (arming the timer)
  // but drifts onto it within LONG_PRESS_MOVE_TOLERANCE_PX (not enough
  // movement to cancel the timer) still commit against the original
  // off-control point, even though the pointer now visually rests on the
  // control (issue #220). Resolving against the latest position instead
  // makes the commit see exactly where the pointer is now.
  let latestEvent: PointerEvent | null = null;

  const cancelTimer = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const onPointerDown = (event: PointerEvent): void => {
    startX = event.clientX;
    startY = event.clientY;
    latestEvent = event;
    longPressFired = false;
    cancelTimer();
    const shouldArmLongPress = handlers.onPressStart?.(event) !== false;
    if (shouldArmLongPress) {
      timer = setTimeout(() => {
        timer = undefined;
        longPressFired = true;
        handlers.onLongPress(latestEvent ?? event);
      }, durationMs);
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    latestEvent = event;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE_PX) {
      cancelTimer();
    }
    handlers.onMove?.(event);
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
