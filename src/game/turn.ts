// Turn-tracking logic: which seat is active and how many full laps around
// the table ("turns") have completed. Pure and DOM-free so it stays
// unit-testable independent of rendering; src/game.ts wires it into the
// canvas via src/ui/controls.ts.

export interface TurnState {
  activeIndex: number;
  turnCount: number;
}

export function createTurnState(): TurnState {
  return { activeIndex: 0, turnCount: 0 };
}

// Table-like grid layout per docs/concept.md: always two rows (top row
// rotated 180° to face the opposite seat, bottom row upright), each sized to
// fill half the canvas height, split into this many equal-width columns.
// This is also src/game.ts's computeZoneRects layout table (seats are stored
// and rendered in this same row-major order) — it lives here because
// clockwiseSeatOrder below needs it to know which raw seat indices sit in
// the top vs. bottom row.
export const ROW_COUNTS_BY_PLAYER_COUNT: Record<number, [number, number]> = {
  3: [1, 2],
  4: [2, 2],
  // Issue #77: the fifth seat sits alone in its own full-width row (like the
  // 3-player lone top row) so its life total renders upright from its own
  // seated position, instead of sharing a row with another rotated seat.
  5: [1, 4],
  6: [3, 3],
};

function rowCountsFor(playerCount: number): [number, number] {
  return ROW_COUNTS_BY_PLAYER_COUNT[playerCount] ?? [Math.ceil(playerCount / 2), Math.floor(playerCount / 2)];
}

/**
 * Raw seat indices (row-major left-to-right, as computeZoneRects lays them
 * out) reordered into a clockwise loop around the table: top row
 * left-to-right, then bottom row right-to-left (issue #68) — e.g. for 4
 * players, raw seats [0, 1, 2, 3] (top-left, top-right, bottom-left,
 * bottom-right) become the clockwise loop [0, 1, 3, 2].
 */
export function clockwiseSeatOrder(playerCount: number): number[] {
  const [topCount] = rowCountsFor(playerCount);
  const top = Array.from({ length: topCount }, (_, i) => i);
  const bottom = Array.from({ length: playerCount - topCount }, (_, i) => playerCount - 1 - i);
  return [...top, ...bottom];
}

/** Returns the seat index after `currentIndex` in clockwise table order, wrapping from the last seat back to the first. */
export function nextPlayerIndex(currentIndex: number, playerCount: number): number {
  const order = clockwiseSeatOrder(playerCount);
  const position = order.indexOf(currentIndex);
  return order[(position + 1) % order.length];
}

/**
 * Advances the active player to the next seat in order. Increments
 * `turnCount` exactly when the active player wraps from the last seat back
 * to the first.
 */
export function advanceTurn(state: TurnState, playerCount: number): TurnState {
  const activeIndex = nextPlayerIndex(state.activeIndex, playerCount);
  const wrapped = activeIndex === 0;
  return {
    activeIndex,
    turnCount: state.turnCount + (wrapped ? 1 : 0),
  };
}
