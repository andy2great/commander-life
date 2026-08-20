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

/** Returns the seat index after `currentIndex`, wrapping from the last seat back to the first. */
export function nextPlayerIndex(currentIndex: number, playerCount: number): number {
  return (currentIndex + 1) % playerCount;
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
