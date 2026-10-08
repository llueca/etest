import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { Context } from "../../context.ts";

export interface RankedPlayer {
  playerId: string;
  displayName: string;
  score: number;
  wins: number;
  losses: number;
  createdAt: number;
}

/** Top players of a leaderboard index, best first (sparse: only players with settled games). */
export async function topPlayers(
  ctx: Context,
  indexName: "score-lb" | "accuracy-lb",
): Promise<RankedPlayer[]> {
  const { Items } = await ctx.db.send(
    new QueryCommand({
      TableName: ctx.config.tableName,
      IndexName: indexName,
      KeyConditionExpression: "lbKey = :lb",
      ExpressionAttributeValues: { ":lb": "LB" },
      ScanIndexForward: false,
      Limit: ctx.config.leaderboardSize,
    }),
  );
  return (Items ?? []) as RankedPlayer[];
}
