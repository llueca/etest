import { randomUUID } from "node:crypto";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { Direction } from "@btc/shared/domain";
import type { Context } from "../../context.ts";
import type { ActivePrediction } from "../../db/player-item.ts";

export class PredictionAlreadyActiveError extends Error {}

/**
 * Atomically starts a prediction; exactly one of any racing requests succeeds.
 * `eligibleAt` is fixed now, so later configuration changes never move it.
 */
export async function startPrediction(
  ctx: Context,
  playerId: string,
  direction: Direction,
  entryPriceCents: number,
  now: number,
  windowMs: number,
): Promise<ActivePrediction> {
  const prediction: ActivePrediction = {
    id: randomUUID(),
    direction,
    entryPriceCents,
    createdAt: now,
    eligibleAt: now + windowMs,
  };
  try {
    await ctx.db.send(
      new UpdateCommand({
        TableName: ctx.config.tableName,
        Key: { playerId },
        UpdateExpression:
          "SET activePrediction = :prediction, pendingKey = :pending, pendingEligibleAt = :eligibleAt",
        ConditionExpression:
          "attribute_exists(playerId) AND attribute_not_exists(activePrediction)",
        ExpressionAttributeValues: {
          ":prediction": prediction,
          ":pending": "PENDING",
          ":eligibleAt": prediction.eligibleAt,
        },
      }),
    );
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) throw new PredictionAlreadyActiveError();
    throw error;
  }
  return prediction;
}
