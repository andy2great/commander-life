// Pre-game randomizer (issue #164): rolls a die or flips a coin to
// pre-select who starts. Kept free of DOM/animation, like playerRoster.ts,
// so the roll math is unit-testable on its own — src/ui/setupScreen.ts owns
// the animated reveal and the "host still confirms via Start Game" flow.

/** Rolls a fair die with `sides` faces (1..sides inclusive). `rng` defaults to Math.random and is injectable for deterministic tests. */
export function rollDie(sides: number, rng: () => number = Math.random): number {
  return Math.floor(rng() * sides) + 1;
}

/** Flips a fair coin. `rng` defaults to Math.random and is injectable for deterministic tests. */
export function flipCoin(rng: () => number = Math.random): 'heads' | 'tails' {
  return rng() < 0.5 ? 'heads' : 'tails';
}

/**
 * Rolls to pick a starting seat among `playerCount` players (0-indexed): a
 * coin flip for exactly 2 players (heads = seat 0, tails = seat 1),
 * otherwise a die sized to the table (1..playerCount, face N picks seat
 * N - 1) so every seat has an exactly equal chance regardless of table size.
 */
export function rollForStartingSeat(playerCount: number, rng: () => number = Math.random): number {
  if (playerCount === 2) {
    return flipCoin(rng) === 'heads' ? 0 : 1;
  }
  return rollDie(playerCount, rng) - 1;
}
