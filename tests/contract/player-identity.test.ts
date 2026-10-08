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
  expectPlayerStats,
  expectSuccess,
  getMe,
} from "./helpers.ts";

describe("player identity HTTP contract", () => {
  let stack: Stack;

  beforeEach(async () => {
    stack = await startStack();
  });
  afterEach(async () => stack?.stop());

  it("creates players with default statistics, a Player-NNNN name and opaque unique identifiers", async () => {
    const first = await createPlayer(stack);
    const second = await createPlayer(stack);

    expect(first.id).not.toBe(second.id);
    expect(first.id).not.toContain(first.player.displayName as string);
    expect(second.id).not.toContain(second.player.displayName as string);
    for (const player of [first.player, second.player]) {
      expect(player.displayName).toMatch(/^Player-\d{4}$/);
      expectPlayerStats(player, {
        score: 0,
        wins: 0,
        losses: 0,
        gamesPlayed: 0,
        accuracy: null,
        adjustedAccuracy: 0.5,
        currentStreak: 0,
        bestStreak: 0,
      });
    }
  });

  it("restores the bearer player and rejects missing or unknown credentials", async () => {
    const player = await createPlayer(stack);
    const restored = await getMe(stack, player.id);
    expectPlayerStats(asObject(restored.player), { score: 0, wins: 0, losses: 0, gamesPlayed: 0 });
    expect(restored.activePrediction).toBeNull();
    expect(restored.lastResult).toBeNull();

    const unknown = await api(stack, "/api/me", { token: "unknown-opaque-player" });
    expect(unknown.status).toBe(401);
    expect(asObject(unknown.body.error).code).toBe("unauthorized");

    const missing = await api(stack, "/api/me");
    expect(missing.status).toBe(401);
    expect(asObject(missing.body.error).code).toBe("unauthorized");

    const unauthorizedRename = await api(stack, "/api/me", {
      method: "PATCH",
      json: { displayName: "Attempted rename" },
    });
    expect(unauthorizedRename.status).toBe(401);
    expect(asObject(unauthorizedRename.body.error).code).toBe("unauthorized");
  });

  it("trims valid names and rejects empty, whitespace-only, overlong and control-character names", async () => {
    const player = await createPlayer(stack);
    const trimmed = await api(stack, "/api/me", {
      method: "PATCH",
      token: player.id,
      json: { displayName: "  Dario  " },
    });
    const trimmedBody = expectSuccess(trimmed, 200);
    expect(asObject(trimmedBody.player).displayName).toBe("Dario");

    for (const displayName of ["", "   ", "x".repeat(25), "line\nbreak", "control\u0001char"]) {
      const rejected = await api(stack, "/api/me", {
        method: "PATCH",
        token: player.id,
        json: { displayName },
      });
      expect(rejected.status).toBe(400);
      const error = asObject(rejected.body.error);
      expect(error.code).toBe("validation_failed");
      expect(typeof error.message).toBe("string");
      expect((error.message as string).length).toBeGreaterThan(0);
      if (displayName.length === 25) expect(error.message).toMatch(/24|maximum|max/i);

      const unchanged = await getMe(stack, player.id);
      expect(asObject(unchanged.player).displayName).toBe("Dario");
    }

    const maximum = "m".repeat(24);
    const accepted = await api(stack, "/api/me", {
      method: "PATCH",
      token: player.id,
      json: { displayName: maximum },
    });
    expect(asObject(expectSuccess(accepted, 200).player).displayName).toBe(maximum);
  });

  it("allows duplicate display names", async () => {
    const first = await createPlayer(stack);
    const second = await createPlayer(stack);
    for (const player of [first, second]) {
      const renamed = await api(stack, "/api/me", {
        method: "PATCH",
        token: player.id,
        json: { displayName: "Shared name" },
      });
      expect(asObject(expectSuccess(renamed, 200).player).displayName).toBe("Shared name");
    }
  });

  it("preserves statistics and an active prediction when the player renames", async () => {
    const player = await createPlayer(stack);

    stack.market.setPrice("67500.00");
    const won = await createPrediction(stack, player.id, "up");
    stack.market.setPrice("67500.01");
    await runSettlementPass(new Date(epochMs(won.eligibleAt)));

    stack.market.setPrice("67501.00");
    const active = await createPrediction(stack, player.id, "down");
    const before = await getMe(stack, player.id);
    const rename = await api(stack, "/api/me", {
      method: "PATCH",
      token: player.id,
      json: { displayName: "Renamed player" },
    });
    expect(asObject(expectSuccess(rename, 200).player).displayName).toBe("Renamed player");

    const after = await getMe(stack, player.id);
    expectPlayerStats(asObject(after.player), {
      score: 1,
      wins: 1,
      losses: 0,
      gamesPlayed: 1,
      currentStreak: 1,
      bestStreak: 1,
    });
    expect(after.activePrediction).toEqual(active);
    expect(after.activePrediction).toEqual(before.activePrediction);
    expectNoPlayerId(after);
  });
});
