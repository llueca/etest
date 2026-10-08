import type { Direction, PlayerStats } from "@btc/shared/domain";

// One DynamoDB item per player (design D4). Every invariant is a single-item
// conditional write, so no locks or transactions are needed.

export interface ActivePrediction {
  id: string;
  direction: Direction;
  entryPriceCents: number;
  createdAt: number;
  eligibleAt: number;
}

export interface LastResult extends ActivePrediction {
  status: "won" | "lost";
  settlementPriceCents: number;
  settledAt: number;
  scoreBefore: number;
  scoreAfter: number;
}

export interface PlayerItem extends PlayerStats {
  playerId: string;
  displayName: string;
  createdAt: number;
  activePrediction?: ActivePrediction;
  lastResult?: LastResult;
}

/** API prices are USD numbers with 2 decimals; storage uses integer cents (design D5). */
export const usd = (cents: number) => cents / 100;
