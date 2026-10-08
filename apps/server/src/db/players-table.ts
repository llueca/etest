import {
  CreateTableCommand,
  DescribeTableCommand,
  type DynamoDBClient,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";

const LEADERBOARD_PROJECTION = {
  ProjectionType: "INCLUDE" as const,
  NonKeyAttributes: ["displayName", "score", "wins", "losses", "createdAt"],
};

/** The `players` table and its sparse GSIs (design D4). Terraform defines the same shape for AWS. */
export async function createPlayersTable(client: DynamoDBClient, tableName: string): Promise<void> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return;
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) throw error;
  }
  await client.send(
    new CreateTableCommand({
      TableName: tableName,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "playerId", AttributeType: "S" },
        { AttributeName: "pendingKey", AttributeType: "S" },
        { AttributeName: "pendingEligibleAt", AttributeType: "N" },
        { AttributeName: "lbKey", AttributeType: "S" },
        { AttributeName: "scoreRankKey", AttributeType: "S" },
        { AttributeName: "accuracyRankKey", AttributeType: "S" },
      ],
      KeySchema: [{ AttributeName: "playerId", KeyType: "HASH" }],
      GlobalSecondaryIndexes: [
        {
          IndexName: "pending",
          KeySchema: [
            { AttributeName: "pendingKey", KeyType: "HASH" },
            { AttributeName: "pendingEligibleAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "KEYS_ONLY" },
        },
        {
          IndexName: "score-lb",
          KeySchema: [
            { AttributeName: "lbKey", KeyType: "HASH" },
            { AttributeName: "scoreRankKey", KeyType: "RANGE" },
          ],
          Projection: LEADERBOARD_PROJECTION,
        },
        {
          IndexName: "accuracy-lb",
          KeySchema: [
            { AttributeName: "lbKey", KeyType: "HASH" },
            { AttributeName: "accuracyRankKey", KeyType: "RANGE" },
          ],
          Projection: LEADERBOARD_PROJECTION,
        },
      ],
    }),
  );
}
