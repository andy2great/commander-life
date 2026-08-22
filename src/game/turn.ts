// Turn-tracking logic: which seat is active and how many full laps around
// the table ("turns") have completed. Pure and DOM-free so it stays
// unit-testable independent of rendering; src/game.ts wires it into the
// canvas via src/ui/controls.ts.

export interface TurnState {
  activeIndex: number;
  turnCount: number;
  /** Seat the current lap began from — where `activeIndex` wrapping back to increments `turnCount` (issue #146). */
  startIndex: number;
}

/** `startIndex` (default 0) is which seat is active first — the host's "who starts first" pick on the setup screen (issue #126). */
export function createTurnState(startIndex = 0): TurnState {
  return { activeIndex: startIndex, turnCount: 0, startIndex };
}

// Table-like grid layout per docs/concept.md: always two rows (top row
// rotated 180° to face the opposite seat, bottom row upright), each sized to
// fill half the canvas height, split into this many equal-width columns.
// This is also src/game.ts's computeZoneRects layout table (seats are stored
// and rendered in this same row-major order) — it lives here because
// clockwiseSeatOrder below needs it to know which raw seat indices sit in
// the top vs. bottom row. 5 players is not a simple row grid (issue #81) and
// is special-cased directly in clockwiseSeatOrder below instead.
export const ROW_COUNTS_BY_PLAYER_COUNT: Record<number, [number, number]> = {
  3: [1, 2],
  4: [2, 2],
  6: [3, 3],
};

function rowCountsFor(playerCount: number): [number, number] {
  return ROW_COUNTS_BY_PLAYER_COUNT[playerCount] ?? [Math.ceil(playerCount / 2), Math.floor(playerCount / 2)];
}

/**
 * Raw seat indices (as computeZoneRects lays them out) reordered into a
 * clockwise loop around the table.
 *
 * For the row-grid counts (3, 4, 6): top row left-to-right, then bottom row
 * right-to-left (issue #68) — e.g. for 4 players, raw seats [0, 1, 2, 3]
 * (top-left, top-right, bottom-left, bottom-right) become the clockwise loop
 * [0, 1, 3, 2].
 *
 * For 5 players (issue #81), computeZoneRects lays out raw seats
 * [top-left, top-right, bottom-left, bottom-right, left]. Walking clockwise
 * from top-left: across the top row, down to bottom-right, back across the
 * bottom row, then up the left-edge seat — i.e. [0, 1, 3, 2, 4].
 */
export function clockwiseSeatOrder(playerCount: number): number[] {
  if (playerCount === 5) {
    return [0, 1, 3, 2, 4];
  }
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
 * `turnCount` exactly when the active player wraps back to the seat the
 * current lap started from (`state.startIndex`) — not raw seat 0 — so a lap
 * beginning at a non-default starting seat (issue #126) still counts a full
 * circuit of every player before incrementing (issue #146).
 */
export function advanceTurn(state: TurnState, playerCount: number): TurnState {
  const activeIndex = nextPlayerIndex(state.activeIndex, playerCount);
  const wrapped = activeIndex === state.startIndex;
  return {
    activeIndex,
    turnCount: state.turnCount + (wrapped ? 1 : 0),
    startIndex: state.startIndex,
  };
}
