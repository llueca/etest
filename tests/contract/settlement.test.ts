import { runSettlementPass } from "@btc/server/settlement";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Stack } from "../harness/stack.ts";
import { startStack } from "../harness/stack.ts";
import {
  asObject,
  createPlayer,
  createPrediction,
  epochMs,
  expectNoPlayerId,
  expectPlayerStats,
  getMe,
} from "./helpers.ts";

describe("settlement pass contract", () => {
  let stack: Stack;

  beforeEach(async () => {
    stack = await startStack();
  });
  afterEach(async () => stack?.stop());

  it("runs an empty settlement pass without failing", async () => {
    await expect(runSettlementPass(new Date())).resolves.toBeUndefined();
  });

  it("does not settle at 59.999 seconds, but settles at exactly eligibleAt", async () => {
    const player = await createPlayer(stack);
    stack.market.setPrice("67500.00");
    const prediction = await createPrediction(stack, player.id, "up");
    const eligibleAt = epochMs(prediction.eligibleAt);

    stack.market.setPrice("67500.01");
    await runSettlementPass(new Date(eligibleAt - 1));
    let me = await getMe(stack, player.id);
    expect(me.activePrediction).toEqual(prediction);
    expect(me.lastResult).toBeNull();
    expectPlayerStats(asObject(me.player), { score: 0, wins: 0, losses: 0 });

    await runSettlementPass(new Date(eligibleAt));
    me = await getMe(stack, player.id);
    expect(me.activePrediction).toBeNull();
    expect(asObject(me.lastResult).status).toBe("won");
    expectPlayerStats(asObject(me.player), { score: 1, wins: 1, losses: 0 });
  });

  it("settles wins and losses for both directions using the pass price", async () => {
    const cases = [
      { direction: "up" as const, price: "67500.01", status: "won", score: 1 },
      { direction: "up" as const, price: "67499.99", status: "lost", score: -1 },
      { direction: "down" as const, price: "67499.99", status: "won", score: 1 },
      { direction: "down" as const, price: "67500.01", status: "lost", score: -1 },
    ];

    for (const result of cases) {
      const player = await createPlayer(stack);
      stack.market.setPrice("67500.00");
      const prediction = await createPrediction(stack, player.id, result.direction);
      stack.market.setPrice(result.price);
      await runSettlementPass(new Date(epochMs(prediction.eligibleAt)));

      const me = await getMe(stack, player.id);
      expect(me.activePrediction).toBeNull();
      expect(asObject(me.lastResult).status).toBe(result.status);
      expect(asObject(me.lastResult).settlementPrice).toBe(Number(result.price));
      expectPlayerStats(asObject(me.player), {
        score: result.score,
        wins: result.status === "won" ? 1 : 0,
        losses: result.status === "lost" ? 1 : 0,
      });
    }
  });

  it("keeps repeated price ties pending until a one-cent move settles the prediction", async () => {
    const player = await createPlayer(stack);
    stack.market.setPrice("67500.00");
    const prediction = await createPrediction(stack, player.id, "up");
    const eligibleAt = epochMs(prediction.eligibleAt);

    await runSettlementPass(new Date(eligibleAt));
    await runSettlementPass(new Date(eligibleAt + 1_000));
    let me = await getMe(stack, player.id);
    expect(me.activePrediction).toEqual(prediction);
    expect(me.lastResult).toBeNull();
    expectPlayerStats(asObject(me.player), { score: 0, wins: 0, losses: 0 });

    stack.market.setPrice("67500.01");
    await runSettlementPass(new Date(eligibleAt + 2_000));
    me = await getMe(stack, player.id);
    expect(me.activePrediction).toBeNull();
    expect(asObject(me.lastResult).status).toBe("won");
    expect(asObject(me.lastResult).settlementPrice).toBe(67500.01);
    expectPlayerStats(asObject(me.player), { score: 1, wins: 1, losses: 0 });
  });

  it("leaves an eligible prediction pending during a provider outage and settles after recovery", async () => {
    const player = await createPlayer(stack);
    stack.market.setPrice("67500.00");
    const prediction = await createPrediction(stack, player.id, "up");
    const eligibleAt = epochMs(prediction.eligibleAt);

    await stack.market.update({ restFailure: "error" });
    await runSettlementPass(new Date(eligibleAt));
    let me = await getMe(stack, player.id);
    expect(me.activePrediction).toEqual(prediction);
    expect(me.lastResult).toBeNull();
    expectPlayerStats(asObject(me.player), { score: 0, wins: 0, losses: 0 });

    await stack.market.update({ restFailure: "none" });
    stack.market.setPrice("67500.01");
    await runSettlementPass(new Date(eligibleAt + 1_000));
    me = await getMe(stack, player.id);
    expect(me.activePrediction).toBeNull();
    expect(asObject(me.lastResult).status).toBe("won");
    expectPlayerStats(asObject(me.player), { score: 1, wins: 1, losses: 0 });
  });

  it("applies settlement once across repeated and concurrent passes", async () => {
    const repeated = await createPlayer(stack);
    stack.market.setPrice("67500.00");
    const firstPrediction = await createPrediction(stack, repeated.id, "up");
    const eligibleAt = epochMs(firstPrediction.eligibleAt);
    stack.market.setPrice("67500.01");
    await runSettlementPass(new Date(eligibleAt));
    const firstResult = (await getMe(stack, repeated.id)).lastResult;

    stack.market.setPrice("67400.00");
    await runSettlementPass(new Date(eligibleAt + 60_000));
    const afterRepeat = await getMe(stack, repeated.id);
    expect(afterRepeat.lastResult).toEqual(firstResult);
    expectPlayerStats(asObject(afterRepeat.player), { score: 1, wins: 1, losses: 0 });

    const concurrent = await createPlayer(stack);
    stack.market.setPrice("67500.00");
    const secondPrediction = await createPrediction(stack, concurrent.id, "up");
    const concurrentDueAt = new Date(epochMs(secondPrediction.eligibleAt));
    stack.market.setPrice("67500.01");
    await Promise.all([runSettlementPass(concurrentDueAt), runSettlementPass(concurrentDueAt)]);
    const afterConcurrent = await getMe(stack, concurrent.id);
    expect(asObject(afterConcurrent.lastResult).status).toBe("won");
    expectPlayerStats(asObject(afterConcurrent.player), { score: 1, wins: 1, losses: 0 });
  });

  it("records complete lastResult details, the pass price, and permits another prediction", async () => {
    const player = await createPlayer(stack);
    stack.market.setPrice("67500.00");
    const prediction = await createPrediction(stack, player.id, "up");
    const eligibleAt = epochMs(prediction.eligibleAt);
    stack.market.setPrice("67540.00");
    await runSettlementPass(new Date(eligibleAt));

    // A later return-time price must not replace the price observed by the pass.
    stack.market.setPrice("66000.00");
    const me = await getMe(stack, player.id);
    const result = asObject(me.lastResult);
    expect(me.activePrediction).toBeNull();
    expect(result.direction).toBe("up");
    expect(result.entryPrice).toBe(67500);
    expect(result.status).toBe("won");
    expect(result.settlementPrice).toBe(67540);
    expect(epochMs(result.settledAt)).toBeGreaterThanOrEqual(eligibleAt);
    expect(result.scoreBefore).toBe(0);
    expect(result.scoreAfter).toBe(1);
    expect(result.scoreDelta).toBe(1);
    expectPlayerStats(asObject(me.player), { score: 1, wins: 1, losses: 0 });
    expectNoPlayerId(me);

    const next = await createPrediction(stack, player.id, "down");
    expect(next.direction).toBe("down");
    expect((await getMe(stack, player.id)).activePrediction).toEqual(next);
  });

  it("tracks streak progression, resets current streak on loss, and allows negative scores", async () => {
    const streakPlayer = await createPlayer(stack);
    for (let index = 0; index < 3; index++) {
      stack.market.setPrice("67500.00");
      const prediction = await createPrediction(stack, streakPlayer.id, "up");
      stack.market.setPrice("67500.01");
      await runSettlementPass(new Date(epochMs(prediction.eligibleAt)));
    }
    let me = await getMe(stack, streakPlayer.id);
    expectPlayerStats(asObject(me.player), {
      score: 3,
      wins: 3,
      losses: 0,
      currentStreak: 3,
      bestStreak: 3,
    });

    stack.market.setPrice("67500.00");
    const loss = await createPrediction(stack, streakPlayer.id, "up");
    stack.market.setPrice("67499.99");
    await runSettlementPass(new Date(epochMs(loss.eligibleAt)));
    me = await getMe(stack, streakPlayer.id);
    expectPlayerStats(asObject(me.player), {
      score: 2,
      wins: 3,
      losses: 1,
      currentStreak: 0,
      bestStreak: 3,
    });

    const negativePlayer = await createPlayer(stack);
    for (let index = 0; index < 2; index++) {
      stack.market.setPrice("67500.00");
      const prediction = await createPrediction(stack, negativePlayer.id, "up");
      stack.market.setPrice("67499.99");
      await runSettlementPass(new Date(epochMs(prediction.eligibleAt)));
    }
    me = await getMe(stack, negativePlayer.id);
    expectPlayerStats(asObject(me.player), {
      score: -2,
      wins: 0,
      losses: 2,
      currentStreak: 0,
      bestStreak: 0,
    });
  });
});
