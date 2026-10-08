import { deriveStats } from "@btc/shared/domain";
import type { PlayerItem } from "../../db/player-item.ts";

/** API representation (design D7): never includes the identifier. */
export function playerView(item: PlayerItem) {
  return {
    displayName: item.displayName,
    score: item.score,
    wins: item.wins,
    losses: item.losses,
    currentStreak: item.currentStreak,
    bestStreak: item.bestStreak,
    ...deriveStats(item),
  };
}
