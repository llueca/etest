import { DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { loadConfig } from "@btc/shared/config";
import { createPlayersTable } from "../src/db/players-table.ts";

const config = loadConfig({ DYNAMODB_ENDPOINT: "http://127.0.0.1:8100", ...process.env });
const client = new DynamoDBClient({
  endpoint: config.dynamodbEndpoint,
  region: process.env.AWS_REGION ?? "eu-central-1",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});

await createPlayersTable(client, config.tableName);
const { Table } = await client.send(new DescribeTableCommand({ TableName: config.tableName }));
console.log(
  `table ${Table?.TableName}: ${Table?.TableStatus}, GSIs: ${Table?.GlobalSecondaryIndexes?.map((g) => g.IndexName).join(", ")}`,
);
