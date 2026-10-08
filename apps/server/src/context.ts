import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { type AppConfig, loadConfig } from "@btc/shared/config";

export interface Context {
  config: AppConfig;
  db: DynamoDBDocumentClient;
}

/** Validates configuration (failing fast) and opens the DynamoDB client. */
export function createContext(env: Record<string, string | undefined> = process.env): Context {
  const config = loadConfig(env);
  const client = new DynamoDBClient({ endpoint: config.dynamodbEndpoint });
  const db = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
  return { config, db };
}
