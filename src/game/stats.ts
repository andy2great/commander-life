// Per-match damage/life stats aggregation (issue #98): plain damage, lifelink,
// healing, and commander-damage actions all report through this trigger so
// Game can expose life-lost/gained totals, commander-damage dealt/received
// totals, and the single biggest hit for the end-game stats screen (see
// docs/concept.md's "Scoring / impact stats" section). Free of DOM globals so
// it stays unit-testable. Totals accumulate across the whole match and, like
// activeTimeS in src/game.ts, are never reverted by undo — they're a
// historical record of what happened, not the current (correctable) game
// state.

export interface BiggestHit {
  attackerId: string;
  amount: number;
  /** Set only when this hit was commander damage, per docs/concept.md. */
  targetId: string | null;
}

export interface StatsState {
  lifeLost: Record<string, number>;
  lifeGained: Record<string, number>;
  commanderDamageDealt: Record<string, number>;
  commanderDamageReceived: Record<string, number>;
  biggestHit: BiggestHit | null;
}

export function createStatsState(playerIds: string[]): StatsState {
  const zeroed = (): Record<string, number> => {
    const record: Record<string, number> = {};
    for (const id of playerIds) {
      record[id] = 0;
    }
    return record;
  };
  return {
    lifeLost: zeroed(),
    lifeGained: zeroed(),
    commanderDamageDealt: zeroed(),
    commanderDamageReceived: zeroed(),
    biggestHit: null,
  };
}

export interface StatsTrigger {
  /**
   * Records a plain-damage/lifelink/heal life change for `playerId` (positive
   * = life gained, negative = life lost). Callers only report an actual,
   * committed change — not a same-session correction (matching the existing
   * shake/zoneEffects gating in life.ts).
   */
  recordLifeChange(playerId: string, delta: number): void;
  /**
   * Records a "hit" (plain damage, lifelink, or commander damage) as a
   * candidate for the biggest-hit stat. `targetId` is set only for commander
   * damage, per docs/concept.md.
   */
  recordHit(attackerId: string, amount: number, targetId?: string): void;
  /** Records commander damage dealt by `fromId` and received by `targetId`. */
  recordCommanderDamage(fromId: string, targetId: string, amount: number): void;
}

export function createStatsTrigger(state: StatsState): StatsTrigger {
  return {
    recordLifeChange(playerId, delta) {
      if (delta > 0) {
        state.lifeGained[playerId] = (state.lifeGained[playerId] ?? 0) + delta;
      } else if (delta < 0) {
        state.lifeLost[playerId] = (state.lifeLost[playerId] ?? 0) - delta;
      }
    },
    recordHit(attackerId, amount, targetId) {
      if (amount <= 0) {
        return;
      }
      if (!state.biggestHit || amount > state.biggestHit.amount) {
        state.biggestHit = { attackerId, amount, targetId: targetId ?? null };
      }
    },
    recordCommanderDamage(fromId, targetId, amount) {
      state.commanderDamageDealt[fromId] = (state.commanderDamageDealt[fromId] ?? 0) + amount;
      state.commanderDamageReceived[targetId] = (state.commanderDamageReceived[targetId] ?? 0) + amount;
    },
  };
}
