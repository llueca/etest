import { comparePredictorRank, compareScoreRank, type RankInput } from "@btc/shared/domain";
import { describe, expect, it } from "vitest";
import { accuracyRankKey, scoreRankKey } from "./rank-keys.ts";

// Small deterministic generator so failures are reproducible.
function random(seed: number) {
  let state = seed;
  return (max: number) => {
    state = (state * 1_664_525 + 1_013_904_223) % 2 ** 32;
    return state % max;
  };
}

function generatePlayers(seed: number, count: number): RankInput[] {
  const next = random(seed);
  return Array.from({ length: count }, (_, i) => {
    const wins = next(12);
    const losses = next(12);
    // Mostly consistent scores, plus arbitrary ones so score ties and negatives are common.
    const score = next(2) === 0 ? wins - losses : next(9) - 4;
    return { score, wins, losses, createdAt: 1_700_000_000_000 + i * 1000 };
  });
}

const byKeyDescending = (key: (p: RankInput) => string) => (a: RankInput, b: RankInput) => {
  const [left, right] = [key(a), key(b)];
  return left < right ? 1 : left > right ? -1 : 0;
};

describe("leaderboard rank keys", () => {
  it.each([1, 2, 3, 4, 5])("score key order equals compareScoreRank (seed %i)", (seed) => {
    const players = generatePlayers(seed, 200);
    const byKey = [...players].sort(byKeyDescending(scoreRankKey));
    expect(byKey).toEqual([...players].sort(compareScoreRank));
  });

  it.each([1, 2, 3, 4, 5])("accuracy key order equals comparePredictorRank (seed %i)", (seed) => {
    const players = generatePlayers(seed, 200);
    const byKey = [...players].sort(byKeyDescending(accuracyRankKey));
    expect(byKey).toEqual([...players].sort(comparePredictorRank));
  });

  it("orders negative scores below zero and positive scores above it", () => {
    const at = (score: number) => ({ score, wins: 1, losses: 1, createdAt: 1 });
    expect(scoreRankKey(at(-3)) < scoreRankKey(at(-1))).toBe(true);
    expect(scoreRankKey(at(-1)) < scoreRankKey(at(0))).toBe(true);
    expect(scoreRankKey(at(0)) < scoreRankKey(at(7))).toBe(true);
  });

  it("gives equal exact fractions the same accuracy part regardless of games", () => {
    // 1-1 and 3-3 are both exactly 1/2 adjusted; only games and createdAt differ.
    const a = accuracyRankKey({ score: 0, wins: 1, losses: 1, createdAt: 5 });
    const b = accuracyRankKey({ score: 0, wins: 3, losses: 3, createdAt: 5 });
    expect(a.slice(0, 16)).toBe(b.slice(0, 16));
  });

  it("produces fixed-width keys", () => {
    const small = { score: -1, wins: 0, losses: 1, createdAt: 1 };
    const large = { score: 900_000, wins: 1_000_000, losses: 0, createdAt: 9_999_999_999_998 };
    expect(scoreRankKey(small)).toHaveLength(scoreRankKey(large).length);
    expect(accuracyRankKey(small)).toHaveLength(accuracyRankKey(large).length);
  });
});
