// One validated source for every operational setting (design D10).
// Invalid values fail fast instead of silently falling back to a default.

import { PREDICTION_WINDOW_MS } from "./domain.ts";

export interface AppConfig {
  nameMaxLength: number;
  leaderboardSize: number;
  marketProductId: string;
  marketRestUrl: string;
  marketWsUrl: string;
  marketTimeoutMs: number;
  settlementPollIntervalMs: number;
  staleThresholdMs: number;
  chartWindowSeconds: number;
  resolvePollIntervalMs: number;
  /** Time from creation to eligibility for new predictions. At least 60 (design D10). */
  predictionWindowSeconds: number;
  tableName: string;
  dynamodbEndpoint: string | undefined;
}

/** The subset delivered to the browser through config.json. */
export type WebConfig = Pick<
  AppConfig,
  | "nameMaxLength"
  | "marketProductId"
  | "marketWsUrl"
  | "staleThresholdMs"
  | "chartWindowSeconds"
  | "resolvePollIntervalMs"
  | "predictionWindowSeconds"
>;

type Env = Record<string, string | undefined>;

function positiveInt(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(raw)) throw new Error(`${name} must be a positive integer, got "${raw}"`);
  return Number(raw);
}

const MIN_PREDICTION_WINDOW_SECONDS = PREDICTION_WINDOW_MS / 1000;

/** The once-a-minute settler relies on predictions being created at least 60 s before eligibility. */
function predictionWindowSeconds(env: Env): number {
  const seconds = positiveInt(env, "PREDICTION_WINDOW_SECONDS", MIN_PREDICTION_WINDOW_SECONDS);
  if (seconds < MIN_PREDICTION_WINDOW_SECONDS) {
    throw new Error(
      `PREDICTION_WINDOW_SECONDS must be at least ${MIN_PREDICTION_WINDOW_SECONDS}, got "${seconds}"`,
    );
  }
  return seconds;
}

const MIN_CHART_WINDOW_SECONDS = 60;
const MAX_CHART_WINDOW_SECONDS = 600;

/** At least one whole 60 s prediction fits; at most 600 points are redrawn per frame (design D13). */
function chartWindowSeconds(env: Env): number {
  const seconds = positiveInt(env, "CHART_WINDOW_SECONDS", 120);
  if (seconds < MIN_CHART_WINDOW_SECONDS || seconds > MAX_CHART_WINDOW_SECONDS) {
    throw new Error(
      `CHART_WINDOW_SECONDS must be between ${MIN_CHART_WINDOW_SECONDS} and ${MAX_CHART_WINDOW_SECONDS}, got "${seconds}"`,
    );
  }
  return seconds;
}

function text(env: Env, name: string, fallback: string): string {
  const raw = env[name];
  if (raw === undefined) return fallback;
  if (raw.trim() === "") throw new Error(`${name} must not be empty`);
  return raw.trim();
}

function url(env: Env, name: string, fallback: string, protocols: string[]): string {
  const raw = text(env, name, fallback);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid URL, got "${raw}"`);
  }
  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`${name} must use ${protocols.join(" or ")}, got "${raw}"`);
  }
  return raw;
}

export function loadConfig(env: Env): AppConfig {
  return {
    nameMaxLength: positiveInt(env, "NAME_MAX_LENGTH", 24),
    leaderboardSize: positiveInt(env, "LEADERBOARD_SIZE", 10),
    marketProductId: text(env, "MARKET_PRODUCT_ID", "BTC-USD"),
    marketRestUrl: url(env, "MARKET_REST_URL", "https://api.exchange.coinbase.com", [
      "http:",
      "https:",
    ]),
    marketWsUrl: url(env, "MARKET_WS_URL", "wss://ws-feed.exchange.coinbase.com", ["ws:", "wss:"]),
    marketTimeoutMs: positiveInt(env, "MARKET_TIMEOUT_MS", 3000),
    settlementPollIntervalMs: positiveInt(env, "SETTLEMENT_POLL_INTERVAL_MS", 1000),
    staleThresholdMs: positiveInt(env, "STALE_THRESHOLD_MS", 10000),
    chartWindowSeconds: chartWindowSeconds(env),
    resolvePollIntervalMs: positiveInt(env, "RESOLVE_POLL_INTERVAL_MS", 2000),
    predictionWindowSeconds: predictionWindowSeconds(env),
    tableName: text(env, "TABLE_NAME", "players"),
    dynamodbEndpoint: env.DYNAMODB_ENDPOINT?.trim() || undefined,
  };
}

export function toWebConfig(config: AppConfig): WebConfig {
  return {
    nameMaxLength: config.nameMaxLength,
    marketProductId: config.marketProductId,
    marketWsUrl: config.marketWsUrl,
    staleThresholdMs: config.staleThresholdMs,
    chartWindowSeconds: config.chartWindowSeconds,
    resolvePollIntervalMs: config.resolvePollIntervalMs,
    predictionWindowSeconds: config.predictionWindowSeconds,
  };
}
