import { describe, expect, it } from "vitest";
import { loadConfig, toWebConfig } from "./config.ts";

describe("loadConfig", () => {
  it("applies the documented defaults when nothing is set", () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      nameMaxLength: 24,
      leaderboardSize: 10,
      marketProductId: "BTC-USD",
      marketRestUrl: "https://api.exchange.coinbase.com",
      marketWsUrl: "wss://ws-feed.exchange.coinbase.com",
      marketTimeoutMs: 3000,
      settlementPollIntervalMs: 1000,
      staleThresholdMs: 10000,
      chartWindowSeconds: 120,
      resolvePollIntervalMs: 2000,
      predictionWindowSeconds: 60,
      tableName: "players",
    });
    expect(config.dynamodbEndpoint).toBeUndefined();
  });

  it("reads overrides from the environment", () => {
    const config = loadConfig({
      NAME_MAX_LENGTH: "12",
      DYNAMODB_ENDPOINT: "http://localhost:8100",
    });
    expect(config.nameMaxLength).toBe(12);
    expect(config.dynamodbEndpoint).toBe("http://localhost:8100");
  });

  it.each([
    ["NAME_MAX_LENGTH", "0"],
    ["NAME_MAX_LENGTH", "abc"],
    ["LEADERBOARD_SIZE", "-1"],
    ["STALE_THRESHOLD_MS", "1.5"],
    ["MARKET_TIMEOUT_MS", ""],
    ["MARKET_REST_URL", "not a url"],
    ["MARKET_WS_URL", "https://example.com"],
    ["MARKET_PRODUCT_ID", "  "],
    ["PREDICTION_WINDOW_SECONDS", "59"],
    ["PREDICTION_WINDOW_SECONDS", "0"],
    ["PREDICTION_WINDOW_SECONDS", "90.5"],
    ["CHART_WINDOW_SECONDS", "59"],
    ["CHART_WINDOW_SECONDS", "601"],
  ])("rejects %s=%j", (name, value) => {
    expect(() => loadConfig({ [name]: value })).toThrow(name);
  });

  it("accepts a prediction window of 60 seconds or longer", () => {
    expect(loadConfig({ PREDICTION_WINDOW_SECONDS: "60" }).predictionWindowSeconds).toBe(60);
    expect(loadConfig({ PREDICTION_WINDOW_SECONDS: "90" }).predictionWindowSeconds).toBe(90);
  });

  it("explains the minimum when the prediction window is too short", () => {
    expect(() => loadConfig({ PREDICTION_WINDOW_SECONDS: "30" })).toThrow(/at least 60/);
  });

  it("accepts a chart window from 60 seconds to 10 minutes", () => {
    expect(loadConfig({ CHART_WINDOW_SECONDS: "60" }).chartWindowSeconds).toBe(60);
    expect(loadConfig({ CHART_WINDOW_SECONDS: "600" }).chartWindowSeconds).toBe(600);
  });

  it("explains the limits when the chart window is out of range", () => {
    expect(() => loadConfig({ CHART_WINDOW_SECONDS: "30" })).toThrow(/between 60 and 600/);
  });

  it("exposes only browser values in the web config", () => {
    expect(Object.keys(toWebConfig(loadConfig({}))).sort()).toEqual([
      "chartWindowSeconds",
      "marketProductId",
      "marketWsUrl",
      "nameMaxLength",
      "predictionWindowSeconds",
      "resolvePollIntervalMs",
      "staleThresholdMs",
    ]);
  });
});
