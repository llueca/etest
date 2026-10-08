import { runSettlementPass } from "@btc/server/settlement";
import { afterEach, describe, expect, it } from "vitest";
import type { Stack } from "../harness/stack.ts";
import { startStack } from "../harness/stack.ts";
import { asObject, createPlayer, createPrediction, epochMs, getMe } from "./helpers.ts";

describe("prediction window contract", () => {
  let stack: Stack | undefined;

  afterEach(async () => {
    await stack?.stop();
    stack = undefined;
  });

  it("uses a 90-second window and settles only at that eligibility time", async () => {
    stack = await startStack({ env: { PREDICTION_WINDOW_SECONDS: "90" } });
    const player = await createPlayer(stack);
    stack.market.setPrice("67500.00");
    const prediction = await createPrediction(stack, player.id, "up");
    const createdAt = epochMs(prediction.createdAt);
    const expectedEligibleAt = createdAt + 90_000;

    expect.soft(epochMs(prediction.eligibleAt) - createdAt).toBe(90_000);

    stack.market.setPrice("67500.01");
    await runSettlementPass(new Date(expectedEligibleAt - 1));
    const beforeEligibility = await getMe(stack, player.id);
    expect.soft(beforeEligibility.activePrediction).toEqual(prediction);
    expect.soft(beforeEligibility.lastResult).toBeNull();

    await runSettlementPass(new Date(expectedEligibleAt));
    const atEligibility = await getMe(stack, player.id);
    expect.soft(atEligibility.activePrediction).toBeNull();
    expect.soft(asObject(atEligibility.lastResult).status).toBe("won");
  });

  it("defaults to 60 seconds when the prediction window is unset", async () => {
    const previousWindow = process.env.PREDICTION_WINDOW_SECONDS;
    delete process.env.PREDICTION_WINDOW_SECONDS;
    try {
      stack = await startStack();
      const player = await createPlayer(stack);
      const prediction = await createPrediction(stack, player.id, "down");

      expect(epochMs(prediction.eligibleAt) - epochMs(prediction.createdAt)).toBe(60_000);
    } finally {
      await stack?.stop();
      stack = undefined;
      if (previousWindow === undefined) delete process.env.PREDICTION_WINDOW_SECONDS;
      else process.env.PREDICTION_WINDOW_SECONDS = previousWindow;
    }
  });

  it("keeps an existing prediction's eligibility when the setting changes", async () => {
    stack = await startStack({ env: { PREDICTION_WINDOW_SECONDS: "90" } });
    const player = await createPlayer(stack);
    stack.market.setPrice("67500.00");
    const prediction = await createPrediction(stack, player.id, "up");
    const createdAt = epochMs(prediction.createdAt);
    const eligibleAt = epochMs(prediction.eligibleAt);
    const previousWindow = process.env.PREDICTION_WINDOW_SECONDS;

    try {
      process.env.PREDICTION_WINDOW_SECONDS = "60";
      stack.market.setPrice("67500.01");
      await runSettlementPass(new Date(createdAt + 60_000));
      const beforeEligibility = await getMe(stack, player.id);
      expect.soft(beforeEligibility.activePrediction).toEqual(prediction);
      expect.soft(beforeEligibility.lastResult).toBeNull();

      await runSettlementPass(new Date(eligibleAt));
      const atEligibility = await getMe(stack, player.id);
      expect.soft(atEligibility.activePrediction).toBeNull();
      expect.soft(asObject(atEligibility.lastResult).status).toBe("won");
    } finally {
      if (previousWindow === undefined) delete process.env.PREDICTION_WINDOW_SECONDS;
      else process.env.PREDICTION_WINDOW_SECONDS = previousWindow;
    }
  });

  it("rejects a configured prediction window below 60 seconds", async () => {
    let invalidStack: Stack | undefined;
    try {
      const result = await startStack({ env: { PREDICTION_WINDOW_SECONDS: "59" } }).then(
        (started) => {
          invalidStack = started;
          return { outcome: "resolved" as const };
        },
        (error: unknown) => ({ outcome: "rejected" as const, error }),
      );
      expect(result.outcome).toBe("rejected");
      if (result.outcome === "rejected") {
        expect(String(result.error)).toMatch(/PREDICTION_WINDOW_SECONDS|prediction window/i);
      }
    } finally {
      await invalidStack?.stop();
    }
  });
});
