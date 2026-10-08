import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { applyOutcome, evaluateSettlement } from "@btc/shared/domain";
import { type Context, createContext } from "../../context.ts";
import type { LastResult } from "../../db/player-item.ts";
import { fetchPriceCents, MarketUnavailableError } from "../../market/price.ts";
import { accuracyRankKey, scoreRankKey } from "../leaderboards/rank-keys.ts";
import { getPlayer } from "../players/store.ts";

const log = (entry: Record<string, unknown>) => console.log(JSON.stringify(entry));

/** Ids of players whose prediction is eligible at `now` (sparse `pending` index). */
async function findDuePlayers(ctx: Context, now: number): Promise<string[]> {
  const ids: string[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await ctx.db.send(
      new QueryCommand({
        TableName: ctx.config.tableName,
        IndexName: "pending",
        KeyConditionExpression: "pendingKey = :pending AND pendingEligibleAt <= :now",
        ExpressionAttributeValues: { ":pending": "PENDING", ":now": now },
        ExclusiveStartKey: startKey,
      }),
    );
    for (const item of page.Items ?? []) ids.push(item.playerId as string);
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return ids;
}

/** True if any prediction is pending that becomes eligible before `timestamp`. */
export async function hasPendingBefore(ctx: Context, timestamp: number): Promise<boolean> {
  const { Items } = await ctx.db.send(
    new QueryCommand({
      TableName: ctx.config.tableName,
      IndexName: "pending",
      KeyConditionExpression: "pendingKey = :pending AND pendingEligibleAt < :timestamp",
      ExpressionAttributeValues: { ":pending": "PENDING", ":timestamp": timestamp },
      Limit: 1,
    }),
  );
  return (Items?.length ?? 0) > 0;
}

/**
 * Settles one player's prediction at `priceCents`. The write is conditional on the
 * prediction id, so repeated or concurrent attempts change nothing after the first.
 */
async function settlePlayer(ctx: Context, playerId: string, priceCents: number, now: number) {
  const player = await getPlayer(ctx, playerId);
  const prediction = player?.activePrediction;
  if (!player || !prediction) return;

  const outcome = evaluateSettlement(prediction, priceCents, now);
  if (outcome === "pending") return;

  const stats = applyOutcome(player, outcome);
  const lastResult: LastResult = {
    ...prediction,
    status: outcome,
    settlementPriceCents: priceCents,
    settledAt: now,
    scoreBefore: player.score,
    scoreAfter: stats.score,
  };
  const ranking = { ...stats, createdAt: player.createdAt };
  try {
    await ctx.db.send(
      new UpdateCommand({
        TableName: ctx.config.tableName,
        Key: { playerId },
        UpdateExpression:
          "SET score = :score, wins = :wins, losses = :losses, currentStreak = :currentStreak, " +
          "bestStreak = :bestStreak, lastResult = :lastResult, lbKey = :lb, " +
          "scoreRankKey = :scoreRankKey, accuracyRankKey = :accuracyRankKey " +
          "REMOVE activePrediction, pendingKey, pendingEligibleAt",
        ConditionExpression: "activePrediction.id = :predictionId",
        ExpressionAttributeValues: {
          ":score": stats.score,
          ":wins": stats.wins,
          ":losses": stats.losses,
          ":currentStreak": stats.currentStreak,
          ":bestStreak": stats.bestStreak,
          ":lastResult": lastResult,
          ":lb": "LB",
          ":scoreRankKey": scoreRankKey(ranking),
          ":accuracyRankKey": accuracyRankKey(ranking),
          ":predictionId": prediction.id,
        },
      }),
    );
    log({ event: "settled", predictionId: prediction.id, outcome, priceCents });
  } catch (error) {
    // Someone else settled it first: exactly-once holds, nothing to do.
    if (!(error instanceof ConditionalCheckFailedException)) throw error;
  }
}

/**
 * One settlement pass (design D8): fetches a single authoritative price and settles
 * every due prediction with it. If no price is available, predictions stay pending
 * and the next pass tries again.
 */
export async function runSettlementPass(now: Date, ctx: Context = createContext()): Promise<void> {
  const due = await findDuePlayers(ctx, now.getTime());
  if (due.length === 0) return;

  let priceCents: number;
  try {
    priceCents = await fetchPriceCents(ctx.config);
  } catch (error) {
    if (!(error instanceof MarketUnavailableError)) throw error;
    log({ event: "price_unavailable", due: due.length, message: error.message });
    return;
  }
  await Promise.all(due.map((id) => settlePlayer(ctx, id, priceCents, now.getTime())));
}
