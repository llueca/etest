import { randomInt, randomUUID } from "node:crypto";
import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { Context } from "../../context.ts";
import type { PlayerItem } from "../../db/player-item.ts";

const generateDisplayName = () => `Player-${String(randomInt(10_000)).padStart(4, "0")}`;

export async function createPlayer(ctx: Context, now: number): Promise<PlayerItem> {
  const player: PlayerItem = {
    playerId: randomUUID(),
    displayName: generateDisplayName(),
    createdAt: now,
    score: 0,
    wins: 0,
    losses: 0,
    currentStreak: 0,
    bestStreak: 0,
  };
  await ctx.db.send(
    new PutCommand({
      TableName: ctx.config.tableName,
      Item: player,
      ConditionExpression: "attribute_not_exists(playerId)",
    }),
  );
  return player;
}

/** Strongly consistent read: the player's own state is always current. */
export async function getPlayer(ctx: Context, playerId: string): Promise<PlayerItem | undefined> {
  const { Item } = await ctx.db.send(
    new GetCommand({ TableName: ctx.config.tableName, Key: { playerId }, ConsistentRead: true }),
  );
  return Item as PlayerItem | undefined;
}

/** Only the name changes: statistics and the active prediction are untouched. */
export async function renamePlayer(
  ctx: Context,
  playerId: string,
  displayName: string,
): Promise<PlayerItem> {
  const { Attributes } = await ctx.db.send(
    new UpdateCommand({
      TableName: ctx.config.tableName,
      Key: { playerId },
      UpdateExpression: "SET displayName = :displayName",
      ConditionExpression: "attribute_exists(playerId)",
      ExpressionAttributeValues: { ":displayName": displayName },
      ReturnValues: "ALL_NEW",
    }),
  );
  return Attributes as PlayerItem;
}
