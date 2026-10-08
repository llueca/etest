import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Stack } from "../harness/stack.ts";
import { startStack } from "../harness/stack.ts";
import {
  api,
  asObject,
  createPlayer,
  epochMs,
  expectNoPlayerId,
  expectPlayerStats,
  expectSuccess,
  getMe,
} from "./helpers.ts";

describe("prediction HTTP contract", () => {
  let stack: Stack;

  beforeEach(async () => {
    stack = await startStack();
  });
  afterEach(async () => stack?.stop());

  it("creates a prediction from server price and time, ignoring client-supplied values", async () => {
    const player = await createPlayer(stack);
    stack.market.setPrice("67500.01");
    const response = await api(stack, "/api/me/predictions", {
      method: "POST",
      token: player.id,
      json: {
        direction: "up",
        entryPrice: 1,
        createdAt: "2000-01-01T00:00:00.000Z",
        eligibleAt: "2000-01-01T00:01:00.000Z",
      },
    });
    const body = expectSuccess(response, 201);
    expectNoPlayerId(body);
    const prediction = asObject(body.prediction);
    const serverTime = Date.parse(body.serverTime as string);
    const createdAt = epochMs(prediction.createdAt);
    const eligibleAt = epochMs(prediction.eligibleAt);

    expect(prediction.direction).toBe("up");
    expect(prediction.status).toBe("pending");
    expect(prediction.entryPrice).toBe(67500.01);
    expect(Number.isFinite(createdAt)).toBe(true);
    expect(Number.isFinite(eligibleAt)).toBe(true);
    expect(Math.abs(createdAt - serverTime)).toBeLessThan(5_000);
    expect(eligibleAt - createdAt).toBe(60_000);
    expect(createdAt).not.toBe(Date.parse("2000-01-01T00:00:00.000Z"));

    const me = await getMe(stack, player.id);
    expect(me.activePrediction).toEqual(prediction);
    expectPlayerStats(asObject(me.player), { score: 0, wins: 0, losses: 0, gamesPlayed: 0 });
  });

  it("rejects invalid or missing directions without creating a prediction", async () => {
    const player = await createPlayer(stack);
    const invalidRequests: { json?: unknown }[] = [
      { json: { direction: "sideways" } },
      { json: { direction: "UP" } },
      { json: {} },
      {},
    ];

    for (const request of invalidRequests) {
      const response = await api(stack, "/api/me/predictions", {
        method: "POST",
        token: player.id,
        ...request,
      });
      expect(response.status).toBe(400);
      expect(asObject(response.body.error).code).toBe("invalid_request");
      const me = await getMe(stack, player.id);
      expect(me.activePrediction).toBeNull();
      expectPlayerStats(asObject(me.player), { score: 0, gamesPlayed: 0 });
    }
  });

  it("requires a valid bearer before prediction creation", async () => {
    const missing = await api(stack, "/api/me/predictions", {
      method: "POST",
      json: { direction: "up" },
    });
    expect(missing.status).toBe(401);
    expect(asObject(missing.body.error).code).toBe("unauthorized");

    const unknown = await api(stack, "/api/me/predictions", {
      method: "POST",
      token: "unknown-opaque-player",
      json: { direction: "down" },
    });
    expect(unknown.status).toBe(401);
    expect(asObject(unknown.body.error).code).toBe("unauthorized");
  });

  it("rejects a second prediction and leaves the original active prediction unchanged", async () => {
    const player = await createPlayer(stack);
    stack.market.setPrice("67500.00");
    const first = await api(stack, "/api/me/predictions", {
      method: "POST",
      token: player.id,
      json: { direction: "up" },
    });
    const firstBody = expectSuccess(first, 201);
    const original = asObject(firstBody.prediction);

    const second = await api(stack, "/api/me/predictions", {
      method: "POST",
      token: player.id,
      json: { direction: "down" },
    });
    expect(second.status).toBe(409);
    expect(asObject(second.body.error).code).toBe("prediction_already_active");

    const me = await getMe(stack, player.id);
    expect(me.activePrediction).toEqual(original);
    expectPlayerStats(asObject(me.player), { score: 0, wins: 0, losses: 0 });
  });

  it("allows exactly one concurrent UP/DOWN creation for a player", async () => {
    const player = await createPlayer(stack);
    const responses = await Promise.all(
      (["up", "down"] as const).map((direction) =>
        api(stack, "/api/me/predictions", {
          method: "POST",
          token: player.id,
          json: { direction },
        }),
      ),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const success = responses.find((response) => response.status === 201);
    const conflict = responses.find((response) => response.status === 409);
    expect(success).toBeDefined();
    expect(conflict).toBeDefined();
    if (success) {
      expectSuccess(success, 201);
      expectNoPlayerId(success.body);
    }
    if (conflict) expect(asObject(conflict.body.error).code).toBe("prediction_already_active");

    const me = await getMe(stack, player.id);
    expect(asObject(me.activePrediction).direction).toMatch(/^(up|down)$/);
  });
});

describe("prediction price-provider failures", () => {
  let stack: Stack;

  beforeEach(async () => {
    stack = await startStack({ env: { MARKET_TIMEOUT_MS: "500" } });
  });
  afterEach(async () => {
    await stack?.market.update({ restFailure: "none", restDelayMs: 0 });
  });
  afterEach(async () => stack?.stop());

  it("returns retryable 503 without an active prediction when the market errors, then retries successfully", async () => {
    const player = await createPlayer(stack);
    await stack.market.update({ restFailure: "error" });
    const failed = await api(stack, "/api/me/predictions", {
      method: "POST",
      token: player.id,
      json: { direction: "up" },
    });
    expect(failed.status).toBe(503);
    expect(asObject(failed.body.error).code).toBe("price_unavailable");
    let me = await getMe(stack, player.id);
    expect(me.activePrediction).toBeNull();
    expectPlayerStats(asObject(me.player), { score: 0, gamesPlayed: 0 });

    await stack.market.update({ restFailure: "none" });
    const recovered = await api(stack, "/api/me/predictions", {
      method: "POST",
      token: player.id,
      json: { direction: "up" },
    });
    expectSuccess(recovered, 201);
    me = await getMe(stack, player.id);
    expect(me.activePrediction).not.toBeNull();
  });

  it("returns retryable 503 on market timeout without creating a prediction, then recovers", async () => {
    const player = await createPlayer(stack);
    await stack.market.update({ restDelayMs: 800 });
    const failed = await api(stack, "/api/me/predictions", {
      method: "POST",
      token: player.id,
      json: { direction: "down" },
    });
    expect(failed.status).toBe(503);
    expect(asObject(failed.body.error).code).toBe("price_unavailable");
    const me = await getMe(stack, player.id);
    expect(me.activePrediction).toBeNull();
    expectPlayerStats(asObject(me.player), { score: 0, gamesPlayed: 0 });

    await stack.market.update({ restDelayMs: 0 });
    const recovered = await api(stack, "/api/me/predictions", {
      method: "POST",
      token: player.id,
      json: { direction: "down" },
    });
    expectSuccess(recovered, 201);
  });
});
