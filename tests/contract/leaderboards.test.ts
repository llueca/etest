import { runSettlementPass } from "@btc/server/settlement";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Stack } from "../harness/stack.ts";
import { startStack } from "../harness/stack.ts";
import {
  api,
  asObject,
  createPlayer,
  createPrediction,
  epochMs,
  expectNoPlayerId,
  expectSuccess,
} from "./helpers.ts";

interface RecordTarget {
  id: string;
  name: string;
  wins: number;
  losses: number;
}

async function makeTarget(
  stack: Stack,
  name: string,
  wins: number,
  losses: number,
): Promise<RecordTarget> {
  const player = await createPlayer(stack);
  const renamed = await api(stack, "/api/me", {
    method: "PATCH",
    token: player.id,
    json: { displayName: name },
  });
  expect(asObject(expectSuccess(renamed, 200).player).displayName).toBe(name);
  return { id: player.id, name, wins, losses };
}

/** Places one game for each listed player, then settles them all in one pass. */
async function settleRound(
  stack: Stack,
  targets: RecordTarget[],
  result: "won" | "lost",
): Promise<void> {
  if (targets.length === 0) return;
  stack.market.setPrice("67500.00");
  const predictions = await Promise.all(
    targets.map((target) => createPrediction(stack, target.id, result === "won" ? "up" : "down")),
  );
  stack.market.setPrice("67500.01");
  const dueAt = Math.max(...predictions.map((prediction) => epochMs(prediction.eligibleAt)));
  await runSettlementPass(new Date(dueAt));
}

async function recordResults(stack: Stack, targets: RecordTarget[]): Promise<void> {
  const winRounds = Math.max(0, ...targets.map((target) => target.wins));
  const lossRounds = Math.max(0, ...targets.map((target) => target.losses));
  for (let round = 0; round < winRounds; round++) {
    await settleRound(
      stack,
      targets.filter((target) => target.wins > round),
      "won",
    );
  }
  for (let round = 0; round < lossRounds; round++) {
    await settleRound(
      stack,
      targets.filter((target) => target.losses > round),
      "lost",
    );
  }
}

async function getBoards(stack: Stack, token?: string) {
  const response = await api(stack, "/api/leaderboards", token === undefined ? {} : { token });
  const body = expectSuccess(response, 200);
  expectNoPlayerId(body);
  return {
    score: asObject(body.score),
    predictor: asObject(body.predictor),
  };
}

function assertOnlyKeys(entry: unknown, expectedKeys: string[]) {
  expect(Object.keys(asObject(entry)).sort()).toEqual([...expectedKeys].sort());
}

describe("leaderboard HTTP contract", () => {
  let stack: Stack;

  beforeEach(async () => {
    stack = await startStack();
  });
  afterEach(async () => stack?.stop());

  it("excludes new players, includes a first loss, and orders score ties by every specified tie-breaker", async () => {
    const fresh = await makeTarget(stack, "Fresh", 0, 0);
    const high = await makeTarget(stack, "High", 3, 0);
    const p = await makeTarget(stack, "P", 2, 0);
    const q = await makeTarget(stack, "Q", 4, 2);
    const mid = await makeTarget(stack, "Mid", 2, 1);
    const s = await makeTarget(stack, "S", 2, 2);
    const earlierTie = await makeTarget(stack, "Earlier", 1, 1);
    const laterTie = await makeTarget(stack, "Later", 1, 1);
    const firstLoss = await makeTarget(stack, "First loss", 0, 1);

    await recordResults(stack, [high, p, q, mid, s, earlierTie, laterTie, firstLoss]);
    const boards = await getBoards(stack, p.id);
    const scoreEntries = boards.score.entries as unknown[];

    expect(scoreEntries.map((entry) => asObject(entry).displayName)).toEqual([
      "High",
      "P",
      "Q",
      "Mid",
      "S",
      "Earlier",
      "Later",
      "First loss",
    ]);
    expect(scoreEntries.map((entry) => asObject(entry).position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(asObject(scoreEntries[1]).score).toBe(2);
    expect(asObject(scoreEntries[2]).score).toBe(2);
    expect(asObject(scoreEntries[1]).isCurrentPlayer).toBe(true);
    expect(asObject(scoreEntries[0]).isCurrentPlayer).toBe(false);
    expect(asObject(scoreEntries[7]).score).toBe(-1);
    expect(scoreEntries.some((entry) => asObject(entry).displayName === fresh.name)).toBe(false);
    for (const entry of scoreEntries) {
      assertOnlyKeys(entry, ["position", "displayName", "score", "isCurrentPlayer"]);
      expectNoPlayerId(entry);
    }

    const predictorEntries = boards.predictor.entries as unknown[];
    expect(predictorEntries.map((entry) => asObject(entry).displayName)).toEqual([
      "High",
      "P",
      "Q",
      "Mid",
      "S",
      "Earlier",
      "Later",
      "First loss",
    ]);
    expect(predictorEntries.map((entry) => asObject(entry).position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(asObject(predictorEntries[1]).isCurrentPlayer).toBe(true);
    expect(predictorEntries.some((entry) => asObject(entry).displayName === fresh.name)).toBe(
      false,
    );
    for (const entry of predictorEntries) {
      assertOnlyKeys(entry, [
        "position",
        "displayName",
        "adjustedAccuracy",
        "accuracy",
        "gamesPlayed",
        "isCurrentPlayer",
      ]);
      expectNoPlayerId(entry);
    }
  });

  it("orders predictor entries by adjusted accuracy and returns all D7 entry fields", async () => {
    // D is reduced from the 80-20 illustration to 8-2. It still ranks ahead
    // of B (3-0), while C (6-4) outranks A (1-0), preserving the evidence.
    const a = await makeTarget(stack, "A", 1, 0);
    const b = await makeTarget(stack, "B", 3, 0);
    const c = await makeTarget(stack, "C", 6, 4);
    const d = await makeTarget(stack, "D", 8, 2);
    await recordResults(stack, [a, b, c, d]);

    const boards = await getBoards(stack, a.id);
    const entries = boards.predictor.entries as unknown[];
    expect(entries.map((entry) => asObject(entry).displayName)).toEqual(["D", "B", "C", "A"]);
    expect(entries.map((entry) => asObject(entry).position)).toEqual([1, 2, 3, 4]);

    const byName = new Map(entries.map((entry) => [asObject(entry).displayName, asObject(entry)]));
    expect(byName.get("D")?.adjustedAccuracy).toBeCloseTo(13 / 20, 12);
    expect(byName.get("B")?.adjustedAccuracy).toBeCloseTo(8 / 13, 12);
    expect(byName.get("C")?.adjustedAccuracy).toBeCloseTo(11 / 20, 12);
    expect(byName.get("A")?.adjustedAccuracy).toBeCloseTo(6 / 11, 12);
    expect(byName.get("B")?.accuracy).toBe(1);
    expect(byName.get("C")?.accuracy).toBe(0.6);
    expect(byName.get("D")?.accuracy).toBe(0.8);
    expect(byName.get("A")?.gamesPlayed).toBe(1);
    expect(byName.get("B")?.gamesPlayed).toBe(3);
    expect(byName.get("C")?.gamesPlayed).toBe(10);
    expect(byName.get("D")?.gamesPlayed).toBe(10);
    expect(byName.get("A")?.isCurrentPlayer).toBe(true);
    for (const entry of entries) {
      assertOnlyKeys(entry, [
        "position",
        "displayName",
        "adjustedAccuracy",
        "accuracy",
        "gamesPlayed",
        "isCurrentPlayer",
      ]);
      expectNoPlayerId(entry);
    }

    const anonymous = await getBoards(stack);
    for (const entry of anonymous.predictor.entries as unknown[]) {
      expect(asObject(entry).isCurrentPlayer).toBe(false);
      assertOnlyKeys(entry, [
        "position",
        "displayName",
        "adjustedAccuracy",
        "accuracy",
        "gamesPlayed",
        "isCurrentPlayer",
      ]);
    }
  });
});

describe("configured leaderboard size", () => {
  let stack: Stack;

  beforeEach(async () => {
    stack = await startStack({ env: { LEADERBOARD_SIZE: "2" } });
  });
  afterEach(async () => stack?.stop());

  it("limits each board to the top entries with sequential positions", async () => {
    const one = await makeTarget(stack, "One", 1, 0);
    const two = await makeTarget(stack, "Two", 2, 0);
    const three = await makeTarget(stack, "Three", 3, 0);
    await recordResults(stack, [one, two, three]);

    const boards = await getBoards(stack, three.id);
    for (const board of [boards.score, boards.predictor]) {
      const entries = board.entries as unknown[];
      expect(entries).toHaveLength(2);
      expect(entries.map((entry) => asObject(entry).position)).toEqual([1, 2]);
      expectNoPlayerId(entries);
    }
    expect((boards.score.entries as unknown[]).map((entry) => asObject(entry).displayName)).toEqual(
      ["Three", "Two"],
    );
  });
});
