import {
  applyOutcome,
  comparePredictorRank,
  compareScoreRank,
  type Direction,
  deriveStats,
  evaluateSettlement,
  liveStatus,
  type PlayerStats,
  PREDICTION_WINDOW_MS,
  type PredictionTerms,
  parsePriceToCents,
  type RankInput,
  validateDisplayName,
} from "@btc/shared/domain";
import { describe, expect, it } from "vitest";

const eligibleAt = 60_000;

function prediction(direction: Direction, entryPriceCents = 100): PredictionTerms {
  return { direction, entryPriceCents, eligibleAt };
}

type NamedRank = RankInput & { name: string };

function rankedNames(
  players: readonly NamedRank[],
  comparator: (a: RankInput, b: RankInput) => number,
): string[] {
  return [...players].sort(comparator).map(({ name }) => name);
}

describe("prediction settlement", () => {
  it("uses a 60-second default and minimum prediction window", () => {
    expect(PREDICTION_WINDOW_MS).toBe(60_000);
  });

  it.each([
    { scenario: "UP with a favorable price", direction: "up" as const, priceCents: 101 },
    { scenario: "DOWN with a favorable price", direction: "down" as const, priceCents: 99 },
  ])("Matrix - not yet eligible: $scenario", ({ direction, priceCents }) => {
    expect(evaluateSettlement(prediction(direction), priceCents, eligibleAt - 1)).toBe("pending");
  });

  it("Winning price before 60 seconds does not settle at 59.999 seconds", () => {
    const predictionTerms = prediction("up", 6_750_000);
    expect(evaluateSettlement(predictionTerms, 6_760_000, predictionTerms.eligibleAt - 1)).toBe(
      "pending",
    );
  });

  it.each([
    { scenario: "UP above entry", direction: "up" as const, priceCents: 101, outcome: "won" },
    { scenario: "UP below entry", direction: "up" as const, priceCents: 99, outcome: "lost" },
    { scenario: "DOWN below entry", direction: "down" as const, priceCents: 99, outcome: "won" },
    { scenario: "DOWN above entry", direction: "down" as const, priceCents: 101, outcome: "lost" },
    { scenario: "UP at entry", direction: "up" as const, priceCents: 100, outcome: "pending" },
    { scenario: "DOWN at entry", direction: "down" as const, priceCents: 100, outcome: "pending" },
  ] as const)(
    "Business-rule matrix once eligible: $scenario",
    ({ direction, priceCents, outcome }) => {
      expect(evaluateSettlement(prediction(direction), priceCents, eligibleAt)).toBe(outcome);
    },
  );

  it("Settlement exactly at eligibleAt is allowed", () => {
    expect(evaluateSettlement(prediction("up"), 101, eligibleAt)).toBe("won");
  });

  it("Repeated ties then a one-cent move", () => {
    const predictionTerms = prediction("up", 6_750_000);
    expect(evaluateSettlement(predictionTerms, 6_750_000, eligibleAt)).toBe("pending");
    expect(evaluateSettlement(predictionTerms, 6_750_000, eligibleAt + 1_000)).toBe("pending");
    expect(evaluateSettlement(predictionTerms, 6_750_001, eligibleAt + 2_000)).toBe("won");
  });
});

describe("statistics and streaks", () => {
  it.each([
    {
      scenario: "score 0, wins 0, losses 0 + WIN",
      stats: { score: 0, wins: 0, losses: 0, currentStreak: 0, bestStreak: 0 },
      outcome: "won",
      expected: { score: 1, wins: 1, losses: 0, currentStreak: 1, bestStreak: 1 },
    },
    {
      scenario: "score 0, wins 0, losses 0 + LOSS",
      stats: { score: 0, wins: 0, losses: 0, currentStreak: 0, bestStreak: 0 },
      outcome: "lost",
      expected: { score: -1, wins: 0, losses: 1, currentStreak: 0, bestStreak: 0 },
    },
    {
      scenario: "current streak 2, best streak 4 + WIN",
      stats: { score: 5, wins: 5, losses: 0, currentStreak: 2, bestStreak: 4 },
      outcome: "won",
      expected: { score: 6, wins: 6, losses: 0, currentStreak: 3, bestStreak: 4 },
    },
    {
      scenario: "current streak 4, best streak 4 + WIN",
      stats: { score: 5, wins: 5, losses: 0, currentStreak: 4, bestStreak: 4 },
      outcome: "won",
      expected: { score: 6, wins: 6, losses: 0, currentStreak: 5, bestStreak: 5 },
    },
    {
      scenario: "current streak 4, best streak 6 + LOSS",
      stats: { score: 5, wins: 5, losses: 0, currentStreak: 4, bestStreak: 6 },
      outcome: "lost",
      expected: { score: 4, wins: 5, losses: 1, currentStreak: 0, bestStreak: 6 },
    },
  ] as const)("Statistics matrix: $scenario", ({ stats, outcome, expected }) => {
    expect(applyOutcome(stats, outcome)).toEqual(expected);
  });

  it("Winning streak progression keeps the best streak and resets only the current streak on loss", () => {
    let stats: PlayerStats = {
      score: 5,
      wins: 5,
      losses: 0,
      currentStreak: 2,
      bestStreak: 4,
    };

    stats = applyOutcome(stats, "won");
    expect(stats).toMatchObject({ currentStreak: 3, bestStreak: 4 });
    stats = applyOutcome(stats, "won");
    stats = applyOutcome(stats, "won");
    expect(stats).toMatchObject({ currentStreak: 5, bestStreak: 5 });
    stats = applyOutcome(stats, "lost");
    expect(stats).toMatchObject({ currentStreak: 0, bestStreak: 5 });
  });

  it("Score can go negative after consecutive losses", () => {
    const firstLoss = applyOutcome(
      { score: 0, wins: 0, losses: 0, currentStreak: 0, bestStreak: 0 },
      "lost",
    );
    expect(applyOutcome(firstLoss, "lost")).toMatchObject({ score: -2, losses: 2 });
  });

  it("Applying an outcome leaves the supplied statistics unchanged", () => {
    const before: PlayerStats = {
      score: 2,
      wins: 3,
      losses: 1,
      currentStreak: 2,
      bestStreak: 3,
    };
    const snapshot = { ...before };

    applyOutcome(before, "won");

    expect(before).toEqual(snapshot);
  });
});

describe("derived statistics", () => {
  it("Statistics with no games has no raw accuracy and a neutral adjusted accuracy", () => {
    expect(deriveStats({ wins: 0, losses: 0 })).toEqual({
      gamesPlayed: 0,
      accuracy: null,
      adjustedAccuracy: 0.5,
    });
  });

  it.each([
    {
      scenario: "A (wins 1, losses 0)",
      wins: 1,
      losses: 0,
      gamesPlayed: 1,
      accuracy: 1,
      adjusted: 6 / 11,
    },
    {
      scenario: "B (wins 3, losses 0)",
      wins: 3,
      losses: 0,
      gamesPlayed: 3,
      accuracy: 1,
      adjusted: 8 / 13,
    },
    {
      scenario: "C (wins 6, losses 4)",
      wins: 6,
      losses: 4,
      gamesPlayed: 10,
      accuracy: 0.6,
      adjusted: 11 / 20,
    },
    {
      scenario: "D (wins 80, losses 20)",
      wins: 80,
      losses: 20,
      gamesPlayed: 100,
      accuracy: 0.8,
      adjusted: 85 / 110,
    },
  ])(
    "Adjusted accuracy examples: $scenario",
    ({ wins, losses, gamesPlayed, accuracy, adjusted }) => {
      const result = deriveStats({ wins, losses });
      expect(result.gamesPlayed).toBe(gamesPlayed);
      expect(result.accuracy).toBeCloseTo(accuracy, 12);
      expect(result.adjustedAccuracy).toBeCloseTo(adjusted, 12);
    },
  );
});

describe("leaderboard ordering", () => {
  it("Score leaderboard orders by score descending", () => {
    expect(
      rankedNames(
        [
          { name: "Alice", score: 8, wins: 8, losses: 0, createdAt: 1 },
          { name: "Bob", score: 5, wins: 5, losses: 0, createdAt: 2 },
          { name: "Charlie", score: 9, wins: 9, losses: 0, createdAt: 3 },
        ],
        compareScoreRank,
      ),
    ).toEqual(["Charlie", "Alice", "Bob"]);
  });

  it("Score tie is broken by adjusted accuracy", () => {
    expect(
      rankedNames(
        [
          { name: "P", score: 2, wins: 2, losses: 0, createdAt: 2 },
          { name: "Q", score: 2, wins: 4, losses: 2, createdAt: 1 },
        ],
        compareScoreRank,
      ),
    ).toEqual(["P", "Q"]);
  });

  it("Score ties with equal adjusted accuracy are broken by games played", () => {
    expect(
      rankedNames(
        [
          { name: "fewer games", score: 0, wins: 1, losses: 1, createdAt: 1 },
          { name: "more games", score: 0, wins: 3, losses: 3, createdAt: 2 },
        ],
        compareScoreRank,
      ),
    ).toEqual(["more games", "fewer games"]);
  });

  it("Score ties through games are broken by earliest createdAt", () => {
    expect(
      rankedNames(
        [
          { name: "later", score: 0, wins: 2, losses: 2, createdAt: 20 },
          { name: "earlier", score: 0, wins: 2, losses: 2, createdAt: 10 },
        ],
        compareScoreRank,
      ),
    ).toEqual(["earlier", "later"]);
  });

  it("Predictor leaderboard orders by adjusted accuracy descending", () => {
    expect(
      rankedNames(
        [
          { name: "A", score: 1, wins: 1, losses: 0, createdAt: 1 },
          { name: "B", score: 3, wins: 3, losses: 0, createdAt: 2 },
          { name: "C", score: 2, wins: 6, losses: 4, createdAt: 3 },
          { name: "D", score: 60, wins: 80, losses: 20, createdAt: 4 },
        ],
        comparePredictorRank,
      ),
    ).toEqual(["D", "B", "C", "A"]);
  });

  it("Predictor ordering compares exact adjusted-accuracy fractions, not rounded values", () => {
    const lowerExactFraction = {
      name: "0 wins, 1 loss",
      score: -1,
      wins: 0,
      losses: 1,
      createdAt: 1,
    };
    const higherExactFraction = {
      name: "41 wins, 50 losses",
      score: -9,
      wins: 41,
      losses: 50,
      createdAt: 2,
    };

    expect((5 / 11).toFixed(3)).toBe((46 / 101).toFixed(3));
    expect(rankedNames([lowerExactFraction, higherExactFraction], comparePredictorRank)).toEqual([
      "41 wins, 50 losses",
      "0 wins, 1 loss",
    ]);
  });

  it("Predictor ties are broken by games played", () => {
    expect(
      rankedNames(
        [
          { name: "fewer games", score: 0, wins: 1, losses: 1, createdAt: 1 },
          { name: "more games", score: 0, wins: 3, losses: 3, createdAt: 2 },
        ],
        comparePredictorRank,
      ),
    ).toEqual(["more games", "fewer games"]);
  });

  it("Predictor ties through games are broken by earliest createdAt", () => {
    expect(
      rankedNames(
        [
          { name: "later", score: 1, wins: 1, losses: 0, createdAt: 20 },
          { name: "earlier", score: 1, wins: 1, losses: 0, createdAt: 10 },
        ],
        comparePredictorRank,
      ),
    ).toEqual(["earlier", "later"]);
  });
});

describe("display-name validation", () => {
  it("Surrounding whitespace is trimmed before validation", () => {
    expect(validateDisplayName("  Dario  ", 24)).toEqual({ ok: true, value: "Dario" });
  });

  it.each([
    { scenario: "Empty name is rejected", input: "" },
    { scenario: "Whitespace-only name is rejected", input: "   " },
  ])("$scenario", ({ input }) => {
    expect(validateDisplayName(input, 24).ok).toBe(false);
  });

  it("Name at the maximum length is accepted", () => {
    const name = "a".repeat(24);
    expect(validateDisplayName(name, 24)).toEqual({ ok: true, value: name });
  });

  it("Name longer than the maximum is rejected with a maximum-length reason", () => {
    const result = validateDisplayName("a".repeat(25), 24);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/max(?:imum)?/i);
      expect(result.reason).toContain("24");
    }
  });

  it.each([
    { character: "line break", input: "Dario\nM" },
    { character: "carriage return", input: "Dario\rM" },
    { character: "tab", input: "Dario\tM" },
    { character: "control character", input: "Dario\u0000M" },
  ])("Name containing a $character is rejected", ({ input }) => {
    expect(validateDisplayName(input, 24).ok).toBe(false);
  });
});

describe("live prediction status", () => {
  it.each([
    { direction: "up" as const, liveCents: 101, status: "winning" },
    { direction: "up" as const, liveCents: 99, status: "losing" },
    { direction: "up" as const, liveCents: 100, status: "tied" },
    { direction: "down" as const, liveCents: 99, status: "winning" },
    { direction: "down" as const, liveCents: 101, status: "losing" },
    { direction: "down" as const, liveCents: 100, status: "tied" },
  ] as const)(
    "$direction status at $liveCents cents is $status",
    ({ direction, liveCents, status }) => {
      expect(liveStatus(direction, 100, liveCents)).toBe(status);
    },
  );
});

describe("price parsing to cents", () => {
  it.each([
    { text: "67503.42", cents: 6_750_342 },
    { text: "67500", cents: 6_750_000 },
  ])("parses exact decimal $text", ({ text, cents }) => {
    expect(parsePriceToCents(text)).toBe(cents);
  });

  it.each([
    { text: "67500.004", cents: 6_750_000 },
    { text: "67500.005", cents: 6_750_001 },
    { text: "67500.006", cents: 6_750_001 },
  ])("rounds more than two decimals half-up: $text", ({ text, cents }) => {
    expect(parsePriceToCents(text)).toBe(cents);
  });

  it.each(["", "not-a-price", "NaN", "0", "0.00", "-1", "-67500.42"])(
    "returns null for invalid or non-positive price %j",
    (text) => {
      expect(parsePriceToCents(text)).toBeNull();
    },
  );
});
