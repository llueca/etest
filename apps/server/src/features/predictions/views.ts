import { type ActivePrediction, type LastResult, usd } from "../../db/player-item.ts";

// API representations (design D7).

export function predictionView(prediction: ActivePrediction) {
  return {
    id: prediction.id,
    direction: prediction.direction,
    entryPrice: usd(prediction.entryPriceCents),
    createdAt: prediction.createdAt,
    eligibleAt: prediction.eligibleAt,
    status: "pending" as const,
  };
}

export function lastResultView(result: LastResult) {
  return {
    id: result.id,
    direction: result.direction,
    entryPrice: usd(result.entryPriceCents),
    createdAt: result.createdAt,
    eligibleAt: result.eligibleAt,
    status: result.status,
    settlementPrice: usd(result.settlementPriceCents),
    settledAt: result.settledAt,
    scoreDelta: result.scoreAfter - result.scoreBefore,
    scoreBefore: result.scoreBefore,
    scoreAfter: result.scoreAfter,
  };
}
