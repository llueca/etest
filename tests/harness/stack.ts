import { randomUUID } from "node:crypto";
import {
  DeleteItemCommand,
  DeleteTableCommand,
  DynamoDBClient,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { type RunningServer, startDevServer } from "@btc/server/dev-server";
import { createPlayersTable } from "@btc/server/players-table";
import { type AppConfig, loadConfig } from "@btc/shared/config";
import { type StubMarket, startStubMarket } from "./stub-market.ts";

export const LOCAL_DYNAMODB_ENDPOINT = "http://127.0.0.1:8100";

export interface Stack {
  /** Origin of the local API (and SPA when `staticDir` was given), e.g. http://127.0.0.1:41234 */
  baseUrl: string;
  market: StubMarket;
  tableName: string;
  config: AppConfig;
  dynamo: DynamoDBClient;
  stop(): Promise<void>;
}

export interface StackOptions {
  /** Extra configuration (design D10 variable names), e.g. { NAME_MAX_LENGTH: "10" }. */
  env?: Record<string, string>;
  /** Fixed ports, used by the Playwright web server. Ephemeral by default. */
  port?: number;
  marketPort?: number;
  /** Built SPA to serve next to the API. */
  staticDir?: string;
  /** Run the settler loop in the server (Playwright stack); contract tests drive passes themselves. */
  runSettler?: boolean;
}

/**
 * Starts the full local stack through configuration only: a stub market, a
 * fresh DynamoDB Local table and the production server code. Process
 * environment variables are set while the stack runs, because
 * `runSettlementPass` and the app read their configuration from them.
 * Requires `pnpm db:up`.
 */
export async function startStack(options: StackOptions = {}): Promise<Stack> {
  const market = await startStubMarket({ port: options.marketPort });
  const tableName = `players-${randomUUID().slice(0, 8)}`;
  const env = {
    AWS_ACCESS_KEY_ID: "local",
    AWS_SECRET_ACCESS_KEY: "local",
    AWS_REGION: "eu-central-1",
    DYNAMODB_ENDPOINT: process.env.DYNAMODB_ENDPOINT ?? LOCAL_DYNAMODB_ENDPOINT,
    TABLE_NAME: tableName,
    MARKET_REST_URL: market.restUrl,
    MARKET_WS_URL: market.wsUrl,
    ...options.env,
  };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);

  const restore = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  const config = loadConfig(process.env);
  const dynamo = new DynamoDBClient({ endpoint: config.dynamodbEndpoint });
  // Lets Playwright tests start from an empty table: StubMarketControl.reset() triggers this.
  market.onReset = async () => {
    const { Items = [] } = await dynamo.send(
      new ScanCommand({ TableName: tableName, ProjectionExpression: "playerId" }),
    );
    await Promise.all(
      Items.map((Key) => dynamo.send(new DeleteItemCommand({ TableName: tableName, Key }))),
    );
  };
  let server: RunningServer | undefined;
  try {
    await createPlayersTable(dynamo, tableName);
    server = await startDevServer({
      port: options.port ?? 0,
      env: process.env,
      staticDir: options.staticDir,
      runSettler: options.runSettler,
    });
  } catch (error) {
    await market.close();
    restore();
    throw error;
  }

  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    market,
    tableName,
    config,
    dynamo,
    stop: async () => {
      await server?.close();
      await market.close();
      await dynamo.send(new DeleteTableCommand({ TableName: tableName })).catch(() => undefined);
      dynamo.destroy();
      restore();
    },
  };
}
